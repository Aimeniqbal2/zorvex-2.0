"""
platform_core/models.py

Platform Foundation models:
- ModuleDefinition   — global catalogue of available feature modules
- CompanyModule      — per-company activation of modules
- Branch             — physical branch locations per company
- Warehouse          — warehouse/stock locations per company/branch

Note: Company.business_type is added via migration (companies app),
keeping the Company model in its canonical home.
"""
import uuid
from django.db import models
from django.conf import settings
from erp_core.models import TenantManager


# ---------------------------------------------------------------------------
# Module Category choices
# ---------------------------------------------------------------------------
class ModuleCategory(models.TextChoices):
    CORE        = 'core',         'Core'
    FINANCE     = 'finance',      'Finance'
    OPERATIONS  = 'operations',   'Operations'
    HR          = 'hr',           'Human Resources'
    ANALYTICS   = 'analytics',    'Analytics & Reports'
    INDUSTRY    = 'industry',     'Industry Vertical'
    AUTOMATION  = 'automation',   'Automation'
    SECURITY    = 'security',     'Security'
    DOCUMENTS   = 'documents',    'Documents'


# ---------------------------------------------------------------------------
# Business Type choices (kept as choices for stability; can become a model later)
# ---------------------------------------------------------------------------
class BusinessType(models.TextChoices):
    MOBILE               = 'mobile',               'Mobile Repair Shop'
    SECURITY             = 'security',             'Security Services'
    RETAIL               = 'retail',               'Retail'
    WHOLESALE            = 'wholesale',            'Wholesale'
    RESTAURANT           = 'restaurant',           'Restaurant / Food'
    HOTEL                = 'hotel',                'Hotel / Hospitality'
    HOSPITAL             = 'hospital',             'Hospital'
    CLINIC               = 'clinic',               'Clinic'
    PHARMACY             = 'pharmacy',             'Pharmacy'
    SCHOOL               = 'school',               'School / Education'
    MANUFACTURING        = 'manufacturing',        'Manufacturing'
    CONSTRUCTION         = 'construction',         'Construction'
    LOGISTICS            = 'logistics',            'Logistics / Transport'
    REAL_ESTATE          = 'real_estate',          'Real Estate'
    AUTOMOTIVE           = 'automotive',           'Automotive'
    BEAUTY               = 'beauty',               'Beauty / Salon'
    GYM                  = 'gym',                  'Gym / Fitness'
    AGRICULTURE          = 'agriculture',          'Agriculture'
    NGO                  = 'ngo',                  'NGO / Non-Profit'
    PROFESSIONAL_SERVICES = 'professional_services', 'Professional Services'
    OTHER                = 'other',                'Other'


# ---------------------------------------------------------------------------
# ModuleDefinition — global catalogue; NOT tenant-scoped
# ---------------------------------------------------------------------------
class ModuleDefinition(models.Model):
    """
    Describes a feature module available on the Zorvex platform.
    These records are managed by the platform owner (superadmin).
    They are NOT tenant-scoped (no company FK / BaseModel).
    """
    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code        = models.CharField(max_length=60, unique=True, db_index=True,
                                   help_text='Machine-readable unique identifier, e.g. "sales", "pos"')
    name        = models.CharField(max_length=120)
    description = models.TextField(blank=True, default='')
    category    = models.CharField(max_length=30, choices=ModuleCategory.choices,
                                   default=ModuleCategory.CORE)
    version     = models.CharField(max_length=20, default='1.0.0')
    icon        = models.CharField(max_length=60, blank=True, default='',
                                   help_text='Icon identifier / class name, e.g. "fas fa-shopping-cart"')
    is_core     = models.BooleanField(default=False,
                                      help_text='Core modules cannot be disabled by tenants.')
    is_active   = models.BooleanField(default=True,
                                      help_text='Inactive modules are hidden from tenant module list.')
    config_schema = models.JSONField(
        default=dict, blank=True,
        help_text='JSON Schema describing per-company configuration options for this module.'
    )
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['category', 'name']
        verbose_name        = 'Module Definition'
        verbose_name_plural = 'Module Definitions'

    def __str__(self):
        return f'{self.name} ({self.code}) v{self.version}'


# ---------------------------------------------------------------------------
# CompanyModule — per-tenant activation record
# ---------------------------------------------------------------------------
class CompanyModule(models.Model):
    """
    Links a Company to a ModuleDefinition, recording whether the module
    is enabled and any per-company configuration overrides.

    Deliberately does NOT inherit BaseModel to avoid the circular FK problem
    (BaseModel already has a company FK; we manage isolation manually here).
    """
    id              = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company         = models.ForeignKey(
        'companies.Company',
        on_delete=models.CASCADE,
        related_name='company_modules',
        db_index=True,
    )
    module          = models.ForeignKey(
        ModuleDefinition,
        on_delete=models.CASCADE,
        related_name='company_modules',
        db_index=True,
    )
    enabled         = models.BooleanField(default=True)
    configuration   = models.JSONField(
        default=dict, blank=True,
        help_text='Per-company configuration values for this module.'
    )
    activated_at    = models.DateTimeField(null=True, blank=True)
    deactivated_at  = models.DateTimeField(null=True, blank=True)
    created_at      = models.DateTimeField(auto_now_add=True)
    updated_at      = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together     = [('company', 'module')]
        verbose_name        = 'Company Module'
        verbose_name_plural = 'Company Modules'
        ordering            = ['company', 'module__name']

    def __str__(self):
        status = 'enabled' if self.enabled else 'disabled'
        return f'{self.company.name} - {self.module.name} ({status})'


# ---------------------------------------------------------------------------
# UserModuleAccess — explicitly granted modules per user for CUSTOM access
# ---------------------------------------------------------------------------
class UserModuleAccess(models.Model):
    """
    Explicitly tracks which modules a user has access to, assuming their
    User.access_mode == 'CUSTOM'. If a module is removed from the company,
    this record remains, but effective access will evaluate to False dynamically.
    """
    id      = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user    = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='custom_module_access',
        db_index=True
    )
    module  = models.ForeignKey(
        ModuleDefinition,
        on_delete=models.CASCADE,
        related_name='user_module_access',
        db_index=True
    )
    enabled = models.BooleanField(default=True)
    
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [('user', 'module')]
        verbose_name = 'User Module Access'
        verbose_name_plural = 'User Module Access'

    def __str__(self):
        return f"{self.user.username} -> {self.module.code} ({'enabled' if self.enabled else 'disabled'})"


# ---------------------------------------------------------------------------
# Branch — physical branch locations belonging to a Company
# ---------------------------------------------------------------------------
class BranchManager(models.Manager):
    """Scopes queries to the current thread's company when available."""
    def get_queryset(self):
        from erp_core.middleware import get_current_company
        qs = super().get_queryset().filter(is_deleted=False)
        company_id = get_current_company()
        if company_id:
            return qs.filter(company_id=company_id)
        return qs


class Branch(models.Model):
    """
    A physical branch / location belonging to a Company.
    Not derived from BaseModel (Company model is not either) but uses
    a similar pattern with manual tenant isolation.
    """
    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company     = models.ForeignKey(
        'companies.Company',
        on_delete=models.CASCADE,
        related_name='branches',
        db_index=True,
    )
    name        = models.CharField(max_length=150)
    code        = models.CharField(max_length=30, blank=True, default='',
                                   help_text='Short alphanumeric code, e.g. "LHR-01"')
    address     = models.TextField(blank=True, default='')
    phone       = models.CharField(max_length=30, blank=True, default='')
    email       = models.EmailField(blank=True, default='')
    manager     = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='managed_branches',
    )
    is_active   = models.BooleanField(default=True)
    is_deleted  = models.BooleanField(default=False, db_index=True)
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)

    objects     = BranchManager()
    all_objects = models.Manager()   # unfiltered, for admin/migrations

    class Meta:
        verbose_name        = 'Branch'
        verbose_name_plural = 'Branches'
        unique_together     = [('company', 'code')]   # codes unique per company
        ordering            = ['company', 'name']

    def __str__(self):
        return f'{self.company.name} — {self.name}'


# ---------------------------------------------------------------------------
# Warehouse — stock location, optionally under a Branch
# ---------------------------------------------------------------------------
class WarehouseManager(models.Manager):
    """Scopes queries to the current thread's company when available."""
    def get_queryset(self):
        from erp_core.middleware import get_current_company
        qs = super().get_queryset().filter(is_deleted=False)
        company_id = get_current_company()
        if company_id:
            return qs.filter(company_id=company_id)
        return qs


class Warehouse(models.Model):
    """
    A warehouse / stock room belonging to a Company, optionally linked to a Branch.
    """
    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company     = models.ForeignKey(
        'companies.Company',
        on_delete=models.CASCADE,
        related_name='warehouses',
        db_index=True,
    )
    branch      = models.ForeignKey(
        Branch,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='warehouses',
    )
    name        = models.CharField(max_length=150)
    code        = models.CharField(max_length=30, blank=True, default='',
                                   help_text='Short code, e.g. "WH-01"')
    address     = models.TextField(blank=True, default='')
    is_default  = models.BooleanField(default=False, help_text='Primary warehouse for the company')
    is_active   = models.BooleanField(default=True)
    is_deleted  = models.BooleanField(default=False, db_index=True)
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)

    objects     = WarehouseManager()
    all_objects = models.Manager()   # unfiltered

    class Meta:
        verbose_name        = 'Warehouse'
        verbose_name_plural = 'Warehouses'
        unique_together     = [('company', 'code')]
        ordering            = ['company', 'name']

    def save(self, *args, **kwargs):
        if self.is_default:
            # If this is set as default, unset any existing default for this company
            Warehouse.objects.filter(company=self.company, is_default=True).exclude(pk=self.pk).update(is_default=False)
        super().save(*args, **kwargs)

    def __str__(self):
        branch_str = f' @ {self.branch.name}' if self.branch_id else ''
        return f'{self.company.name} — {self.name}{branch_str}'
