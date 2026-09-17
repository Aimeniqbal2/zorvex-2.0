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
        # Must pop explicitly before DRF simplejwt's parent super().validate() complains about extra unexpected fields
        remember_me = attrs.pop('remember_me', False)
        
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
