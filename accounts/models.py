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

    def get_by_natural_key(self, username):
        """
        Authentication must NEVER be restricted by a tenant or cross-company context.
        Seamlessly authenticates users via:
        1. Exact username match
        2. Case-insensitive username match (e.g. Abcd, Abc_admin, ABCD)
        3. Email address match (case-insensitive, e.g. client@company.com)
        4. Stripped leading/trailing whitespace
        """
        if not username:
            raise self.model.DoesNotExist("Username or email was not provided.")

        clean_user = str(username).strip()

        # 1. Exact username match
        user = self.model._base_manager.filter(**{self.model.USERNAME_FIELD: clean_user}).first()
        if user:
            return user

        # 2. Case-insensitive username match
        user = self.model._base_manager.filter(**{f"{self.model.USERNAME_FIELD}__iexact": clean_user}).first()
        if user:
            return user

        # 3. Case-insensitive email match
        user = self.model._base_manager.filter(email__iexact=clean_user).first()
        if user:
            return user

        raise self.model.DoesNotExist(f"User with identifier '{clean_user}' does not exist.")


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

    ACCESS_MODE_CHOICES = (
        ('FULL_COMPANY', 'Full Company Access'),
        ('CUSTOM', 'Custom Access'),
    )
    access_mode = models.CharField(max_length=20, choices=ACCESS_MODE_CHOICES, default='FULL_COMPANY')

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
