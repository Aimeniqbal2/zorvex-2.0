from django.core.exceptions import ValidationError

class CRMBridgeValidationMixin:
    """
    Mixin to enforce that any model referencing a CRMEntity belongs to the same company.
    """
    def clean(self):
        if hasattr(super(), 'clean'):
            super().clean()
            
        crm_entity = getattr(self, 'crm_entity', None)
        if crm_entity and hasattr(self, 'company_id') and self.company_id != crm_entity.company_id:
            raise ValidationError({'crm_entity': 'Cross-company CRM entity linking is not allowed.'})
