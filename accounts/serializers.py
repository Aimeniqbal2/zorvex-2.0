from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from .models import User

class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Integrates Employee role boundaries and physical tracking data natively into JWT matrix."""
    remember_me = serializers.BooleanField(default=False, required=False, write_only=True)

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token['role'] = user.role
        token['company_id'] = str(user.company_id) if user.company_id else None
        
        emp = getattr(user, 'employee_profile_new', None)
        token['employee_id'] = str(emp.id) if emp else None

        if getattr(user, 'company', None):
            token['company_name'] = user.company.name
            token['company_logo'] = user.company.logo.url if user.company.logo else None
            token['business_type'] = user.company.business_type
        else:
            token['company_name'] = "Zorvex ERP"
            token['company_logo'] = None
            token['business_type'] = None
            
        return token

    def validate(self, attrs):
        from rest_framework.exceptions import AuthenticationFailed
        # Must pop explicitly before DRF simplejwt's parent super().validate() complains about extra unexpected fields
        remember_me = attrs.pop('remember_me', False)

        raw_username = attrs.get(self.username_field, '')
        raw_password = attrs.get('password', '')
        clean_identifier = str(raw_username).strip()
        attrs[self.username_field] = clean_identifier

        # Clear diagnostics so users understand why authentication failed instead of a cryptic generic error
        try:
            target_user = User.objects.get_by_natural_key(clean_identifier)
        except User.DoesNotExist:
            raise AuthenticationFailed("No user account was found with this username or email.")

        if not target_user.is_active:
            raise AuthenticationFailed("This account has been deactivated. Please contact your company administrator.")

        if target_user.company and not target_user.company.is_active:
            raise AuthenticationFailed("Your company account is currently deactivated. Please contact Zorvex support.")

        if not target_user.check_password(raw_password):
            raise AuthenticationFailed("Invalid password. Please check your credentials and try again.")

        data = super().validate(attrs)
        
        if remember_me:
            from datetime import timedelta
            # Gain raw access to the JWT primitive object bound to self.user
            refresh = self.get_token(self.user)
            refresh.set_exp(lifetime=timedelta(days=30))
            data['refresh'] = str(refresh)
            data['access'] = str(refresh.access_token)
            
        return data

from platform_core.models import UserModuleAccess, ModuleDefinition, CompanyModule

class UserSerializer(serializers.ModelSerializer):
    custom_modules = serializers.ListField(
        child=serializers.CharField(), 
        write_only=True, 
        required=False
    )
    user_modules = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = User
        fields = '__all__'
        extra_kwargs = {
            'password': {'write_only': True}
        }
        
    def get_user_modules(self, obj):
        if obj.access_mode == 'CUSTOM':
            return list(obj.custom_module_access.filter(enabled=True).values_list('module__code', flat=True))
        return []
        
    def create(self, validated_data):
        custom_modules = validated_data.pop('custom_modules', [])
        user = User(**validated_data)
        if 'password' in validated_data:
            user.set_password(validated_data['password'])
        user.save()
        self._sync_custom_modules(user, custom_modules)
        return user

    def update(self, instance, validated_data):
        custom_modules = validated_data.pop('custom_modules', None)
        if 'password' in validated_data:
            instance.set_password(validated_data.pop('password'))
        
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        
        if custom_modules is not None:
            self._sync_custom_modules(instance, custom_modules)
        return instance

    def _sync_custom_modules(self, user, custom_modules):
        if user.access_mode != 'CUSTOM':
            return
            
        # Clear existing
        UserModuleAccess.objects.filter(user=user).delete()
        
        # Only grant modules that are actually enabled for the company
        if not user.company_id:
            return
            
        company_enabled = set(
            CompanyModule.objects.filter(company_id=user.company_id, enabled=True)
            .values_list('module__code', flat=True)
        )
        
        valid_modules = [m for m in custom_modules if m in company_enabled]
        if not valid_modules:
            return
            
        mods = ModuleDefinition.objects.filter(code__in=valid_modules)
        UserModuleAccess.objects.bulk_create([
            UserModuleAccess(user=user, module=mod, enabled=True)
            for mod in mods
        ])
