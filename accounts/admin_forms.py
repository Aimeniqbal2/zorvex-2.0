from django import forms
from django.contrib.auth.forms import UserChangeForm, UserCreationForm
from .models import User
from platform_core.models import UserModuleAccess, CompanyModule, ModuleDefinition

class CustomUserChangeForm(UserChangeForm):
    custom_modules = forms.MultipleChoiceField(
        required=False,
        widget=forms.CheckboxSelectMultiple,
        help_text="Select specific modules if Access Mode is CUSTOM."
    )

    class Meta:
        model = User
        fields = '__all__'

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        company_id = None
        data = kwargs.get('data') or (args[0] if len(args) > 0 else None)
        if data and data.get('company'):
            company_id = data.get('company')
        elif self.instance and self.instance.pk and getattr(self.instance, 'company_id', None):
            company_id = self.instance.company_id

        if company_id:
            company_modules = CompanyModule.objects.filter(
                company_id=company_id, enabled=True
            )
            choices = [(cm.module.code, cm.module.name) for cm in company_modules]
            self.fields['custom_modules'].choices = choices
        else:
            self.fields['custom_modules'].choices = []

        if self.instance and self.instance.pk:
            # Set initial custom modules
            initial_modules = UserModuleAccess.objects.filter(
                user=self.instance, enabled=True
            ).values_list('module__code', flat=True)
            self.fields['custom_modules'].initial = list(initial_modules)

    def save(self, commit=True):
        user = super().save(commit=False)
        
        def save_custom_modules():
            custom_modules = self.cleaned_data.get('custom_modules', [])
            if user.access_mode == 'CUSTOM' and user.company:
                valid_company_modules = set(
                    CompanyModule.objects.filter(
                        company=user.company, enabled=True
                    ).values_list('module__code', flat=True)
                )
                granted_codes = [m for m in custom_modules if m in valid_company_modules]
                
                UserModuleAccess.objects.filter(user=user).update(enabled=False)
                for code in granted_codes:
                    mod = ModuleDefinition.objects.get(code=code)
                    UserModuleAccess.objects.update_or_create(
                        user=user, module=mod,
                        defaults={'enabled': True}
                    )
            else:
                UserModuleAccess.objects.filter(user=user).update(enabled=False)

        if commit:
            user.save()
            self.save_m2m()
            save_custom_modules()
        else:
            old_save_m2m = self.save_m2m
            def new_save_m2m():
                old_save_m2m()
                save_custom_modules()
            self.save_m2m = new_save_m2m

        return user


class CustomUserCreationForm(UserCreationForm):
    custom_modules = forms.MultipleChoiceField(
        required=False,
        widget=forms.CheckboxSelectMultiple,
        help_text="Select specific modules if Access Mode is CUSTOM."
    )

    class Meta(UserCreationForm.Meta):
        model = User
        fields = ('username', 'email', 'company', 'access_mode', 'role')

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        company_id = None
        data = kwargs.get('data') or (args[0] if len(args) > 0 else None)
        if data and data.get('company'):
            company_id = data.get('company')
            
        if company_id:
            company_modules = CompanyModule.objects.filter(
                company_id=company_id, enabled=True
            )
            choices = [(cm.module.code, cm.module.name) for cm in company_modules]
            self.fields['custom_modules'].choices = choices
        else:
            self.fields['custom_modules'].choices = []

    def save(self, commit=True):
        user = super().save(commit=False)
        
        def save_custom_modules():
            custom_modules = self.cleaned_data.get('custom_modules', [])
            if user.access_mode == 'CUSTOM' and user.company:
                valid_company_modules = set(
                    CompanyModule.objects.filter(
                        company=user.company, enabled=True
                    ).values_list('module__code', flat=True)
                )
                granted_codes = [m for m in custom_modules if m in valid_company_modules]
                for code in granted_codes:
                    mod = ModuleDefinition.objects.get(code=code)
                    UserModuleAccess.objects.update_or_create(
                        user=user, module=mod,
                        defaults={'enabled': True}
                    )

        if commit:
            user.save()
            self.save_m2m()
            save_custom_modules()
        else:
            old_save_m2m = getattr(self, 'save_m2m', None)
            def new_save_m2m():
                if old_save_m2m:
                    old_save_m2m()
                save_custom_modules()
            self.save_m2m = new_save_m2m

        return user
