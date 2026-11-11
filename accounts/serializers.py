from django.contrib.auth.password_validation import validate_password
from django.core import exceptions as django_exceptions
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from .models import User

class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Integrates Employee role boundaries and physical tracking data natively into JWT matrix."""
    remember_me = serializers.BooleanField(default=False, required=False, write_only=True)

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token['username'] = user.username
        token['email'] = user.email or ''
        token['full_name'] = user.get_full_name() or user.username
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


class UserProfileSerializer(serializers.ModelSerializer):
    """Strict read-only full user profile representation for authenticated /me/ queries."""
    full_name = serializers.SerializerMethodField()
    role_display = serializers.CharField(source='get_role_display', read_only=True)
    access_mode_display = serializers.CharField(source='get_access_mode_display', read_only=True)
    company_role_name = serializers.SerializerMethodField()
    company_role_code = serializers.SerializerMethodField()
    company_id = serializers.SerializerMethodField()
    company_name = serializers.SerializerMethodField()
    company_domain = serializers.SerializerMethodField()
    company_phone = serializers.SerializerMethodField()
    company_address = serializers.SerializerMethodField()
    company_tax_id = serializers.SerializerMethodField()
    company_logo = serializers.SerializerMethodField()
    business_type = serializers.SerializerMethodField()
    allowed_modules = serializers.SerializerMethodField()
    employee_profile = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            'id', 'username', 'email', 'first_name', 'last_name', 'full_name',
            'role', 'role_display', 'company_role_name', 'company_role_code',
            'access_mode', 'access_mode_display', 'allowed_modules',
            'company_id', 'company_name', 'company_domain', 'company_phone',
            'company_address', 'company_tax_id', 'company_logo', 'business_type',
            'is_active', 'is_staff', 'is_superuser', 'date_joined', 'last_login',
            'employee_profile',
        )
        read_only_fields = fields

    def get_full_name(self, obj):
        return obj.get_full_name() or obj.username

    def get_company_role_name(self, obj):
        return obj.company_role.name if getattr(obj, 'company_role', None) else None

    def get_company_role_code(self, obj):
        return obj.company_role.code if getattr(obj, 'company_role', None) else None

    def get_company_id(self, obj):
        return str(obj.company_id) if obj.company_id else None

    def get_company_name(self, obj):
        return obj.company.name if getattr(obj, 'company', None) else 'Zorvex ERP'

    def get_company_domain(self, obj):
        return obj.company.domain if getattr(obj, 'company', None) else ''

    def get_company_phone(self, obj):
        return obj.company.phone if getattr(obj, 'company', None) else ''

    def get_company_address(self, obj):
        return obj.company.address if getattr(obj, 'company', None) else ''

    def get_company_tax_id(self, obj):
        return obj.company.tax_id if getattr(obj, 'company', None) else ''

    def get_company_logo(self, obj):
        try:
            comp = getattr(obj, 'company', None)
            if comp and getattr(comp, 'logo', None) and getattr(comp.logo, 'name', ''):
                return comp.logo.url
        except Exception:
            pass
        return None

    def get_business_type(self, obj):
        return obj.company.business_type if getattr(obj, 'company', None) else None

    def get_allowed_modules(self, obj):
        try:
            if obj.is_superuser:
                return ['ALL (Super Admin)']
            if obj.access_mode == 'CUSTOM':
                return list(obj.custom_module_access.filter(enabled=True).values_list('module__name', flat=True))
            if obj.company_id:
                return list(
                    CompanyModule.objects.filter(company_id=obj.company_id, enabled=True)
                    .values_list('module__name', flat=True)
                )
        except Exception:
            pass
        return []

    def get_employee_profile(self, obj):
        try:
            emp = getattr(obj, 'employee_profile_new', None)
        except Exception:
            emp = None
        if not emp or getattr(emp, 'is_deleted', False):
            return None
        photo_url = None
        try:
            if getattr(emp, 'photograph', None) and getattr(emp.photograph, 'name', ''):
                photo_url = emp.photograph.url
        except Exception:
            photo_url = None
        return {
            'id': str(emp.id),
            'employee_code': emp.display_code,
            'full_name': emp.full_name,
            'email': emp.email or '',
            'phone': emp.phone or emp.telephone_number or '',
            'department_name': emp.department.name if getattr(emp, 'department', None) else '',
            'designation_name': emp.designation.name if getattr(emp, 'designation', None) else '',
            'position_name': emp.position.name if getattr(emp, 'position', None) else '',
            'branch_name': emp.branch.name if getattr(emp, 'branch', None) else '',
            'hire_date': emp.hire_date.isoformat() if emp.hire_date else None,
            'employment_status': emp.employment_status or '',
            'city': emp.city or '',
            'cnic_number': emp.cnic_number or '',
            'current_address': emp.current_address or '',
            'photograph_url': photo_url,
        }


class VerifyPasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(
        required=True, allow_blank=False, trim_whitespace=False, write_only=True,
        error_messages={'required': 'Current password is required.', 'blank': 'Current password cannot be empty.'}
    )

    def to_internal_value(self, data):
        if isinstance(data, dict) and 'old_password' not in data and 'current_password' in data:
            data = {**data, 'old_password': data['current_password']}
        return super().to_internal_value(data)

    def validate_old_password(self, value):
        user = self.context['request'].user
        if not user.check_password(value):
            raise serializers.ValidationError('Current password is incorrect. Please enter your right password.')
        return value


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(
        required=True, allow_blank=False, trim_whitespace=False, write_only=True,
        error_messages={'required': 'Current password is required.', 'blank': 'Current password cannot be empty.'}
    )
    new_password = serializers.CharField(
        required=True, allow_blank=False, trim_whitespace=False, write_only=True,
        error_messages={'required': 'New password is required.', 'blank': 'New password cannot be empty.'}
    )
    confirm_password = serializers.CharField(
        required=True, allow_blank=False, trim_whitespace=False, write_only=True,
        error_messages={'required': 'Please confirm your new password.', 'blank': 'Confirm password cannot be empty.'}
    )

    def to_internal_value(self, data):
        if isinstance(data, dict) and 'old_password' not in data and 'current_password' in data:
            data = {**data, 'old_password': data['current_password']}
        return super().to_internal_value(data)

    def validate(self, attrs):
        user = self.context['request'].user
        old_pw = attrs.get('old_password', '')
        new_pw = attrs.get('new_password', '')
        confirm_pw = attrs.get('confirm_password', '')

        if not user.check_password(old_pw):
            raise serializers.ValidationError({'old_password': ['Current password is incorrect. Please enter your right password.']})

        if new_pw != confirm_pw:
            raise serializers.ValidationError({'confirm_password': ['New password and confirm password do not match.']})

        if new_pw == old_pw:
            raise serializers.ValidationError({'new_password': ['New password must be different from your current password.']})

        try:
            validate_password(new_pw, user=user)
        except django_exceptions.ValidationError as exc:
            raise serializers.ValidationError({'new_password': list(exc.messages)})

        return attrs
