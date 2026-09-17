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

admin.site.register(User, CustomUserAdmin)
