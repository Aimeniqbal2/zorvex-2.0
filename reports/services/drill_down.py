"""
reports/services/drill_down.py

Phase 8E-2C — Financial Drill-Down Infrastructure
Provides drill-down access from aggregated reports back to the authoritative 
JournalEntryLine level with strict tenant isolation.
"""
from finance.models import JournalEntryLine
from reports.services.base import BaseReportingService

class FinancialDrillDownService(BaseReportingService):
    def get_drill_down_transactions(
        self,
        journal_entry_id=None,
        journal_entry_line_id=None,
        account_id=None,
        crm_entity_id=None,
        cost_center_id=None,
        profit_center_id=None,
        source_module=None,
        source_document_type=None,
        source_document_id=None,
        date_from=None,
        date_to=None
    ):
        """
        Retrieves POSTED JournalEntryLines filtered by the provided dimensions.
        STRICTLY enforces company_id isolation before any other logic.
        """
        qs = JournalEntryLine.objects.filter(
            company_id=self.company_id,
            journal_entry__status='POSTED',
            is_deleted=False
        ).select_related(
            'account', 'journal_entry', 'currency', 'crm_entity', 'cost_center', 'profit_center'
        )

        if journal_entry_id:
            qs = qs.filter(journal_entry_id=journal_entry_id)
        if journal_entry_line_id:
            qs = qs.filter(id=journal_entry_line_id)
        if account_id:
            qs = qs.filter(account_id=account_id)
        if crm_entity_id:
            qs = qs.filter(crm_entity_id=crm_entity_id)
        if cost_center_id:
            qs = qs.filter(cost_center_id=cost_center_id)
        if profit_center_id:
            qs = qs.filter(profit_center_id=profit_center_id)
            
        if source_module:
            qs = qs.filter(journal_entry__source_module=source_module)
        if source_document_type:
            qs = qs.filter(journal_entry__source_document_type=source_document_type)
        if source_document_id:
            qs = qs.filter(journal_entry__source_document_id=source_document_id)
            
        if date_from:
            qs = qs.filter(journal_entry__entry_date__gte=date_from)
        if date_to:
            qs = qs.filter(journal_entry__entry_date__lte=date_to)

        return qs.order_by('-journal_entry__entry_date', 'id')
