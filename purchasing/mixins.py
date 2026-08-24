from django.core.exceptions import ValidationError


class ProcurementBridgeValidationMixin:
    """
    Mixin to validate procurement bridge fields and prevent cross-company references.
    """
    def clean(self):
        super().clean()
        company_id = getattr(self, 'company_id', None)
        
        procurement_document = getattr(self, 'procurement_document', None)
        if procurement_document and company_id:
            if procurement_document.company_id != company_id:
                raise ValidationError({'procurement_document': 'Procurement document belongs to a different company.'})

        procurement_line = getattr(self, 'procurement_line', None)
        if procurement_line and company_id:
            if procurement_line.company_id != company_id:
                raise ValidationError({'procurement_line': 'Procurement line belongs to a different company.'})
            if procurement_document and procurement_line.document_id != procurement_document.id:
                raise ValidationError({'procurement_line': 'Procurement line does not belong to the associated procurement document.'})

        crm_entity = getattr(self, 'crm_entity', None)
        if crm_entity and company_id:
            if crm_entity.company_id != company_id:
                raise ValidationError({'crm_entity': 'CRM entity belongs to a different company.'})

        item = getattr(self, 'item', None)
        if item and company_id:
            if item.company_id != company_id:
                raise ValidationError({'item': 'Item belongs to a different company.'})

        warehouse = getattr(self, 'warehouse', None)
        if warehouse and company_id:
            if warehouse.company_id != company_id:
                raise ValidationError({'warehouse': 'Warehouse belongs to a different company.'})
