import uuid
from django.db import models
from erp_core.middleware import get_current_company


class TenantQuerySet(models.QuerySet):
    """QuerySet that automatically filters by the current thread's company if defined."""
    def filter_tenant(self):
        company_id = get_current_company()
        if company_id:
            return self.filter(company_id=company_id)
        return self


class TenantManager(models.Manager):
    """
    Manager to globally apply tenant + soft-delete filtering.
    - Filters company_id from request thread.
    - Excludes is_deleted=True records from all queryset results.
    """
    def get_queryset(self):
        queryset = TenantQuerySet(self.model, using=self._db)
        # Always exclude soft-deleted records
        queryset = queryset.filter(is_deleted=False)
        # Apply tenant isolation
        company_id = get_current_company()
        if company_id:
            return queryset.filter(company_id=company_id)
        return queryset


class BaseModel(models.Model):
    """
    Abstract base model providing:
    - UUID primary key
    - Company foreign key (multi-tenant isolation)
    - Audit timestamps (created_at, updated_at)
    - Soft-delete flag (is_deleted) — use destroy() on viewsets, never hard-delete
    - TenantManager that auto-filters by company + is_deleted=False
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey(
        'companies.Company',
        on_delete=models.CASCADE,
        related_name="%(app_label)s_%(class)s_related",
        db_index=True
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    is_deleted = models.BooleanField(default=False, db_index=True)

    objects = TenantManager()

    class Meta:
        abstract = True


class DocumentSequence(BaseModel):
    """
    Enterprise-safe numbering mechanism for generic documents.
    Provides transaction-safe, concurrency-safe, gap-less sequence numbers.
    """
    document_type = models.CharField(max_length=50, help_text="e.g. JOURNAL, PO, INVOICE")
    prefix = models.CharField(max_length=50, help_text="e.g. GEN-20260806")
    current_number = models.PositiveIntegerField(default=0)

    class Meta(BaseModel.Meta):
        app_label = 'platform_core'
        constraints = [
            models.UniqueConstraint(fields=['company', 'document_type', 'prefix'], name='unique_company_doc_seq')
        ]

    @classmethod
    def get_next_number(cls, company, document_type, prefix):
        from django.db import transaction
        with transaction.atomic():
            seq, created = cls.objects.select_for_update().get_or_create(
                company=company,
                document_type=document_type,
                prefix=prefix,
                defaults={'current_number': 0}
            )
            seq.current_number += 1
            seq.save(update_fields=['current_number'])
            return f"{prefix}-{seq.current_number}"
