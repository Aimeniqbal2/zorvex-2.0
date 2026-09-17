from django.db import models
from django.conf import settings
from erp_core.models import BaseModel
from erp_core.encryption import EncryptedCharField
from crm.models import CRMAttachment


class SenderIdentity(BaseModel):
    """
    Tenant email sender configuration.

    Verification semantics:
        USABLE         — System Default sender; platform-level SMTP; usable without
                         tenant configuration; NOT tenant-verified.
        VERIFIED       — Tenant SMTP credentials were successfully validated
                         by an explicit test-connection check.
        UNVERIFIED     — Tenant SMTP credentials exist but have NOT been validated yet.
        DISABLED       — Administratively disabled; cannot be used for delivery.

    Never label a sender as VERIFIED merely because a record was created.
    """
    VERIFICATION_STATUS_CHOICES = (
        ('USABLE', 'Usable (System Default)'),
        ('UNVERIFIED', 'Unverified'),
        ('VERIFIED', 'SMTP Verified'),
        ('DISABLED', 'Disabled'),
    )

    PROVIDER_TYPE_CHOICES = (
        ('SMTP', 'SMTP'),
        ('SYSTEM_DEFAULT', 'System Default'),
    )

    name = models.CharField(max_length=255, help_text="Sender Display Name")
    email_address = models.EmailField(help_text="Sender Email Address")
    reply_to = models.EmailField(blank=True, null=True)

    provider_type = models.CharField(max_length=50, choices=PROVIDER_TYPE_CHOICES, default='SMTP')
    verification_status = models.CharField(
        max_length=20,
        choices=VERIFICATION_STATUS_CHOICES,
        default='UNVERIFIED',
        help_text=(
            "USABLE=system default, VERIFIED=tenant SMTP validated, "
            "UNVERIFIED=credentials not yet validated, DISABLED=cannot send."
        )
    )
    is_active = models.BooleanField(default=True)
    is_default = models.BooleanField(default=False)

    # Provider settings (SMTP) — password is stored encrypted at rest
    smtp_host = models.CharField(max_length=255, blank=True, null=True)
    smtp_port = models.IntegerField(blank=True, null=True)
    smtp_username = models.CharField(max_length=255, blank=True, null=True)

    # Encrypted at rest via Fernet (erp_core.encryption.EncryptedCharField).
    # max_length=512 accommodates Fernet overhead (~88 bytes) for passwords up to 424 bytes.
    # Decrypted ONLY inside EmailDeliveryService when building the SMTP connection.
    smtp_password = EncryptedCharField(max_length=512, blank=True, null=True)

    smtp_use_tls = models.BooleanField(default=True)

    class Meta:
        verbose_name_plural = "Sender Identities"
        unique_together = ('company', 'email_address')

    def clean(self):
        super().clean()
        if self.provider_type == 'SYSTEM_DEFAULT':
            if self.verification_status not in ['USABLE', 'DISABLED']:
                self.verification_status = 'USABLE'
        elif self.provider_type == 'SMTP':
            if self.verification_status == 'USABLE':
                self.verification_status = 'UNVERIFIED'

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.name} <{self.email_address}>"

    @property
    def is_usable(self) -> bool:
        """Return True if this sender can be used to deliver email."""
        if not self.is_active:
            return False
        if self.verification_status == 'DISABLED':
            return False
        if self.provider_type == 'SYSTEM_DEFAULT':
            return True  # Platform-level; always available when active
        # Tenant SMTP: must be VERIFIED
        return self.verification_status == 'VERIFIED'


class EmailTemplate(BaseModel):
    code = models.CharField(max_length=100, db_index=True)
    name = models.CharField(max_length=255)
    subject = models.CharField(max_length=255)
    body_html = models.TextField(blank=True)
    body_text = models.TextField(blank=True)
    template_type = models.CharField(max_length=100, blank=True)
    is_active = models.BooleanField(default=True)
    is_default = models.BooleanField(default=False)

    class Meta:
        unique_together = ('company', 'code')

    def __str__(self):
        return self.name


class OutboundEmail(BaseModel):
    STATUS_CHOICES = (
        ('DRAFT', 'Draft'),
        ('QUEUED', 'Queued'),
        ('SENDING', 'Sending'),
        ('SENT', 'Sent'),
        ('FAILED', 'Failed'),
    )

    sender_identity = models.ForeignKey(SenderIdentity, on_delete=models.RESTRICT, related_name='outbound_emails')
    to = models.TextField(help_text="Comma separated email addresses")
    cc = models.TextField(blank=True, null=True)
    bcc = models.TextField(blank=True, null=True)

    subject = models.CharField(max_length=255)
    body_html = models.TextField(blank=True)
    body_text = models.TextField(blank=True)

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='DRAFT')
    provider_message_id = models.CharField(max_length=255, blank=True, null=True)
    error_message = models.TextField(blank=True, null=True)
    sent_at = models.DateTimeField(blank=True, null=True)

    # Generic domain context — allows linking without coupling to a specific module.
    # For Security proposals: context_type='security_proposal', context_id=<proposal.id>
    context_type = models.CharField(max_length=100, blank=True, null=True, help_text="e.g. security_proposal")
    context_id = models.CharField(max_length=100, blank=True, null=True)
    # When the email is linked to a specific version (e.g. ProposalVersion), record it here.
    # This ensures historical accuracy — the version that was sent is always retrievable.
    context_version_id = models.CharField(
        max_length=100, blank=True, null=True,
        help_text="ID of the specific version linked to this email (e.g. ProposalVersion.id)"
    )

    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)

    def __str__(self):
        return f"Email {self.subject} to {self.to} ({self.status})"


class OutboundEmailAttachment(BaseModel):
    outbound_email = models.ForeignKey(OutboundEmail, on_delete=models.CASCADE, related_name='attachments')
    crm_attachment = models.ForeignKey(CRMAttachment, on_delete=models.SET_NULL, null=True, blank=True)
    file = models.FileField(upload_to='communications/attachments/%Y/%m/%d/', blank=True, null=True)
    filename = models.CharField(max_length=255)
    content_type = models.CharField(max_length=100, blank=True, null=True)

    def __str__(self):
        return self.filename


class UserEmailSignature(BaseModel):
    """
    User email signature for personalizing outbound communications.
    Supports both Text/Rich Text and Uploaded Signature Image formats.
    """
    SIGNATURE_TYPE_CHOICES = (
        ('TEXT', 'Text / Rich Text'),
        ('IMAGE', 'Signature Image'),
    )

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='email_signatures')
    name = models.CharField(max_length=100, default='My Signature')
    signature_type = models.CharField(max_length=20, choices=SIGNATURE_TYPE_CHOICES, default='TEXT')
    text_content = models.TextField(blank=True, default='', help_text="HTML or rich text signature")
    image = models.ImageField(upload_to='communications/signatures/%Y/%m/', blank=True, null=True)
    is_default = models.BooleanField(default=False)

    class Meta:
        ordering = ['-is_default', 'name']

    def save(self, *args, **kwargs):
        if self.is_default:
            # Unset default on other signatures of the same user
            UserEmailSignature.objects.filter(
                user=self.user,
                company=self.company,
                is_default=True
            ).exclude(pk=self.pk).update(is_default=False)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.user.username} - {self.name} ({self.signature_type})"

