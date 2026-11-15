from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from django.urls import path
from django.http import JsonResponse
from .models import User
from .admin_forms import CustomUserChangeForm, CustomUserCreationForm
from platform_core.models import CompanyModule
from industries.common.registry import get_all_industry_packages

class CustomUserAdmin(UserAdmin):
    """
    Extends the default Django UserAdmin to securely display and handle
    the custom 'company' and 'role' fields in the admin panel.
    """
    form = CustomUserChangeForm
    add_form = CustomUserCreationForm

    list_display = ('username', 'email', 'company', 'access_mode', 'is_staff')
    list_filter = ('company', 'access_mode', 'is_staff', 'is_superuser')
    search_fields = ('username', 'email')
    
    fieldsets = (
        (None, {'fields': ('username', 'password')}),
        ('Personal info', {'fields': ('first_name', 'last_name', 'email')}),
        ('Company & Access', {
            'fields': ('company', 'access_mode', 'custom_modules'),
            'description': 'Select FULL_COMPANY to grant all company modules. Select CUSTOM to explicitly grant modules.'
        }),
        ('Legacy / Advanced', {
            'fields': ('role', 'company_role'),
            'classes': ('collapse',),
            'description': 'These roles are legacy and should not control module authorization.'
        }),
        ('Permissions', {
            'fields': ('is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions'),
        }),
        ('Important dates', {'fields': ('last_login', 'date_joined')}),
    )

    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('username', 'email', 'password1', 'password2'),
        }),
        ('Company & Access', {
            'fields': ('company', 'access_mode', 'custom_modules'),
            'description': 'Select FULL_COMPANY to grant all company modules. Select CUSTOM to explicitly grant modules.'
        }),
        ('Legacy / Advanced', {
            'fields': ('role',),
            'classes': ('collapse',),
        }),
    )

    class Media:
        js = ('admin/js/user_module_access.js',)

    def get_urls(self):
        urls = super().get_urls()
        custom_urls = [
            path('api/company-modules/', self.admin_site.admin_view(self.company_modules_view), name='user_company_modules'),
        ]
        return custom_urls + urls

    def company_modules_view(self, request):
        company_id = request.GET.get('company_id')
        if not company_id:
            return JsonResponse({'modules': []})
        
        company_modules = CompanyModule.objects.filter(company_id=company_id, enabled=True)
        
        # Determine business type if we want to show industry labels
        # For simplicity, we just look for industry packages
        packages = get_all_industry_packages()
        security_pkg = next((p for p in packages if p.code == 'security'), None)
        
        modules_data = []
        for cm in company_modules:
            mod = cm.module
            label = mod.name
            # Map security capabilities if applicable
            if security_pkg and cm.company.business_type == 'security':
                cap = next((c for c in security_pkg.capabilities if c.engine == mod.code), None)
                if cap:
                    label = cap.label
            modules_data.append({'code': mod.code, 'name': label})
            
        return JsonResponse({'modules': modules_data})

    def get_queryset(self, request):
        if request.user.is_superuser:
            return self.model._base_manager.all()
        return super().get_queryset(request)

    def user_change_password(self, request, id, form_url=""):
        """
        Overrides the Django Admin password change view for users.
        Ensures immediate device-wide session and JWT token revocation.
        """
        response = super().user_change_password(request, id, form_url)
        # HTTP 302 redirect indicates the password change form was successfully saved
        if getattr(response, 'status_code', None) == 302:
            target_user = self.get_object(request, id)
            if target_user:
                from accounts.signals import revoke_user_sessions_and_tokens
                from django.contrib import messages
                curr_key = request.session.session_key if request.user.pk == target_user.pk else None
                revoked_count = revoke_user_sessions_and_tokens(target_user, current_session_key=curr_key)
                messages.info(
                    request,
                    f"🔒 Security Alert: All active sessions, mobile devices, and browser logins for user "
                    f"'{target_user.username}' have been terminated. The user must sign in using the new password."
                )
        return response

    def save_model(self, request, obj, form, change):
        """
        Detects if password or credentials were changed via the main user change form.
        """
        is_pwd_changed = change and ('password' in form.changed_data)
        super().save_model(request, obj, form, change)
        if is_pwd_changed:
            from accounts.signals import revoke_user_sessions_and_tokens
            from django.contrib import messages
            curr_key = request.session.session_key if request.user.pk == obj.pk else None
            revoke_user_sessions_and_tokens(obj, current_session_key=curr_key)
            messages.info(
                request,
                f"🔒 Security Alert: Password updated for user '{obj.username}'. "
                f"All active device sessions and tokens have been automatically revoked."
            )

admin.site.register(User, CustomUserAdmin)
