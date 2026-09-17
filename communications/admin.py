from django.contrib import admin
from django import forms
from .models import SenderIdentity, EmailTemplate, OutboundEmail, OutboundEmailAttachment


class SenderIdentityAdminForm(forms.ModelForm):
    # Use password widget so typing is obscured
    smtp_password = forms.CharField(
        widget=forms.PasswordInput(render_value=False),
        required=False,
        help_text="Enter a new SMTP password to update it. Leave blank to keep the existing encrypted password."
    )

    class Meta:
        model = SenderIdentity
        fields = '__all__'

    def clean_smtp_password(self):
        password = self.cleaned_data.get('smtp_password')
        if not password and self.instance and self.instance.pk:
            return self.instance.smtp_password
        return password

    def save(self, commit=True):
        instance = super().save(commit=False)
        new_password = self.cleaned_data.get('smtp_password')
        if new_password:
            instance.smtp_password = new_password
        if commit:
            instance.save()
        return instance


@admin.register(SenderIdentity)
class SenderIdentityAdmin(admin.ModelAdmin):
    form = SenderIdentityAdminForm
    list_display = ['name', 'email_address', 'provider_type', 'verification_status', 'is_active', 'is_default', 'has_password_configured']
    list_filter = ['provider_type', 'verification_status', 'is_active', 'is_default']
    search_fields = ['name', 'email_address', 'company__name']
    readonly_fields = ['created_at', 'updated_at']

    @admin.display(boolean=True, description="Password Set")
    def has_password_configured(self, obj):
        return bool(obj.smtp_password)


@admin.register(EmailTemplate)
class EmailTemplateAdmin(admin.ModelAdmin):
    list_display = ['code', 'name', 'subject', 'is_active', 'is_default', 'company']
    list_filter = ['is_active', 'is_default']
    search_fields = ['code', 'name', 'subject']


class OutboundEmailAttachmentInline(admin.TabularInline):
    model = OutboundEmailAttachment
    extra = 0


@admin.register(OutboundEmail)
class OutboundEmailAdmin(admin.ModelAdmin):
    list_display = ['subject', 'to', 'status', 'sender_identity', 'context_type', 'context_id', 'context_version_id', 'sent_at']
    list_filter = ['status', 'context_type']
    search_fields = ['subject', 'to', 'context_id', 'context_version_id']
    readonly_fields = ['sent_at', 'created_at', 'updated_at']
    inlines = [OutboundEmailAttachmentInline]
