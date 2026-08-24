import uuid
from django.db import models


# Business type choices — mirrored from platform_core.models.BusinessType.
# Kept here as a plain tuple to avoid a circular import between
# companies ↔ platform_core at model-load time.
BUSINESS_TYPE_CHOICES = [
    ('mobile',               'Mobile Repair Shop'),
    ('security',             'Security Services'),
    ('retail',               'Retail'),
    ('wholesale',            'Wholesale'),
    ('restaurant',           'Restaurant / Food'),
    ('hotel',                'Hotel / Hospitality'),
    ('hospital',             'Hospital'),
    ('clinic',               'Clinic'),
    ('pharmacy',             'Pharmacy'),
    ('school',               'School / Education'),
    ('manufacturing',        'Manufacturing'),
    ('construction',         'Construction'),
    ('logistics',            'Logistics / Transport'),
    ('real_estate',          'Real Estate'),
    ('automotive',           'Automotive'),
    ('beauty',               'Beauty / Salon'),
    ('gym',                  'Gym / Fitness'),
    ('agriculture',          'Agriculture'),
    ('ngo',                  'NGO / Non-Profit'),
    ('professional_services','Professional Services'),
    ('other',                'Other'),
]


class Company(models.Model):
    """
    The main tenant model representing a SaaS client organization.
    It deliberately does NOT inherit from BaseModel to avoid cyclical foreign-key issues.
    """
    id            = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name          = models.CharField(max_length=255)
    domain        = models.CharField(max_length=100, unique=True, null=True, blank=True)
    business_type = models.CharField(
        max_length=30,
        choices=BUSINESS_TYPE_CHOICES,
        default='other',
        db_index=True,
        help_text='The primary business vertical for this company.',
    )
    is_active     = models.BooleanField(default=True)
    
    # Branding Fields (Phase 8F-C2)
    logo          = models.ImageField(upload_to='company_logos/', null=True, blank=True)
    address       = models.TextField(blank=True, default='')
    phone         = models.CharField(max_length=50, blank=True, default='')
    tax_id        = models.CharField(max_length=100, blank=True, default='', help_text='Tax Identification Number / VAT')

    created_at    = models.DateTimeField(auto_now_add=True)
    updated_at    = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name
