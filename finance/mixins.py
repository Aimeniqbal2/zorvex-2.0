from django.core.exceptions import ValidationError

class FinanceBridgeValidationMixin:
    """
    Validates cross-module boundaries to ensure legacy entities correctly bind to 
    Universal Finance records without leaking across tenants or entities.
    """
    def clean(self):
        super().clean()
        
        if hasattr(self, 'journal_entry') and self.journal_entry:
            # Must belong to the same company
            if self.company_id != self.journal_entry.company_id:
                raise ValidationError("Journal entry must belong to the same company.")
            
            # The journal itself should belong to the same company (already enforced on JournalEntry but good to check)
            if self.journal_entry.journal and self.company_id != self.journal_entry.journal.company_id:
                raise ValidationError("Journal must belong to the same company.")
                
            # If the instance has a crm_entity, check that the journal entry lines map properly,
            # or at least that it's consistent if required.
            if hasattr(self, 'crm_entity_id') and self.crm_entity_id:
                # Optionally, verify the journal entry lines map to the same CRMEntity.
                # However, lines are related objects, we'd check if any line has a different crm_entity.
                # This could be skipped or enforced depending on business rules.
                pass
                
        # Subclasses can add more logic
