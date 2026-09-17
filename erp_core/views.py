from rest_framework import viewsets, status
from rest_framework.response import Response



class TenantModelViewSet(viewsets.ModelViewSet):
    """
    Base ViewSet for all tenant-specific models.
    - Automatically assigns the logged-in user's company on record creation.
    - Soft-deletes on destroy() — sets is_deleted=True instead of hard DELETE.
    - Read isolation handled by TenantManager + is_deleted filter globally.
    """
    def perform_create(self, serializer):
        from erp_core.middleware import get_current_company
        from rest_framework.exceptions import ValidationError
        company_id = get_current_company() or self.request.META.get('HTTP_X_COMPANY_ID') or getattr(self.request.user, 'company_id', None)
        if not company_id:
            raise ValidationError({"detail": "Company context is required for this operation."})
        serializer.save(company_id=company_id)

    def get_queryset(self):
        """
        Forces all queries to be scoped to the authenticated user's company.
        is_deleted=False is handled automatically by TenantManager.
        Superadmins must provide X-Company-ID to establish context.
        """
        qs = super().get_queryset()
        user = self.request.user
        if not user or not user.is_authenticated:
            return qs.none()

        from erp_core.middleware import get_current_company
        from rest_framework.exceptions import ValidationError
        company_id = get_current_company() or self.request.META.get('HTTP_X_COMPANY_ID') or getattr(self.request.user, 'company_id', None)
        if not company_id:
            raise ValidationError({"detail": "Company context is required for this operation."})

        return qs.filter(company_id=company_id)

    def destroy(self, request, *args, **kwargs):
        """
        Soft delete — sets is_deleted=True rather than issuing a SQL DELETE.
        Financial history (Sales, Ledger entries) remains intact for reporting.
        """
        instance = self.get_object()
        instance.is_deleted = True
        instance.save(update_fields=['is_deleted', 'updated_at'])
        return Response(
            {'status': 'deleted', 'id': str(instance.id)},
            status=status.HTTP_200_OK
        )
