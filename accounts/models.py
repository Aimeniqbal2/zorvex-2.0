import uuid
from django.db import models
from django.contrib.auth.models import AbstractUser, UserManager
from erp_core.middleware import get_current_company

class TenantUserManager(UserManager):
    """Overrides the default User manager to enforce physical multi-tenant data barriers."""
    def get_queryset(self):
        from django.db.models import Q
        queryset = super().get_queryset()
        company_id = get_current_company()
        if company_id:
            return queryset.filter(Q(company_id=company_id) | Q(is_superuser=True))
        return queryset

class User(AbstractUser):
    objects = TenantUserManager()
    """
    Custom user model for the entire SaaS application.
    Supports RBAC and assigns each user to a company (multi-tenancy).
    Superadmins won't strictly need a company_id.

    TECHNICIAN ROLES (v2):
      - hardware_technician: physical repairs, part injection, device diagnostics
      - software_technician: OS flashing, unlocking, software-level fixes
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey('companies.Company', on_delete=models.CASCADE, null=True, blank=True, related_name='users', db_index=True)

    ROLE_CHOICES = (
        ('super_admin',          'Super Admin'),
        ('admin',                'Company Admin'),
        ('manager',              'Manager'),
        ('hardware_technician',  'Hardware Technician'),
        ('software_technician',  'Software Technician'),
        ('cashier',              'Cashier'),
        ('staff',                'Staff'),
    )
    role = models.CharField(max_length=25, choices=ROLE_CHOICES, default='staff')
    company_role = models.ForeignKey('CompanyRole', on_delete=models.SET_NULL, null=True, blank=True, related_name='users', help_text="Configurable granular permissions role.")

    @property
    def is_technician(self):
        """Returns True if the user is any kind of technician."""
        return self.role in ('hardware_technician', 'software_technician')

    @property
    def is_admin_or_manager(self):
        return self.role in ('admin', 'manager', 'super_admin')

    class Meta:
        indexes = [
            models.Index(fields=['company', 'role']),
        ]

    def __str__(self):
        return f"{self.username} ({self.role}) - {self.company.name if self.company else 'SuperAdmin'}"

class CompanyRole(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey('companies.Company', on_delete=models.CASCADE, null=True, blank=True, related_name='roles', db_index=True)
    name = models.CharField(max_length=150)
    code = models.CharField(max_length=50, blank=True, help_text="Optional system code (e.g., 'CEO')")
    description = models.TextField(blank=True, default='')
    permissions = models.JSONField(default=list, blank=True, help_text="List of permission codes like 'security.site.manage'")
    is_system = models.BooleanField(default=False, help_text="System roles cannot be deleted by tenants.")
    is_active = models.BooleanField(default=True)
    priority = models.IntegerField(default=0, help_text="Order or weight of the role.")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [('company', 'name')]
        ordering = ['-priority', 'name']

    def __str__(self):
        comp = self.company.name if self.company else "System"
        return f"{self.name} ({comp})"
