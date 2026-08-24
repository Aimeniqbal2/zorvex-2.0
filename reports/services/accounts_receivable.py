import logging
from decimal import Decimal
from datetime import date
from django.db.models import Sum, F, Q, Case, When, DecimalField, Window, Value
from django.db.models.functions import Coalesce, Now, ExtractDay
from finance.models import JournalEntryLine, SalesAccountingConfiguration, ChartOfAccount
from billing.models import BillingAccountingConfiguration, ServiceInvoice, ServiceInvoiceStatus
from crm.models import CRMEntity

logger = logging.getLogger(__name__)

class BaseARService:
    def __init__(self, company_id):
        self.company_id = company_id

    def _get_ar_accounts(self):
        ar_account_ids = set()
        sales_config = SalesAccountingConfiguration.objects.filter(company_id=self.company_id, is_active=True).first()
        if sales_config and sales_config.accounts_receivable_account_id:
            ar_account_ids.add(sales_config.accounts_receivable_account_id)
            
        billing_config = BillingAccountingConfiguration.objects.filter(company_id=self.company_id, is_active=True).first()
        if billing_config and billing_config.accounts_receivable_account_id:
            ar_account_ids.add(billing_config.accounts_receivable_account_id)
            
        return list(ar_account_ids)


class CustomerBalanceService(BaseARService):
    """
    Computes Customer Balance from the GL (JournalEntryLine).
    Source of truth: Ledger.
    """
    def get_customer_balances(self, date_from=None, date_to=None, crm_entity_id=None):
        ar_accounts = self._get_ar_accounts()
        if not ar_accounts:
            return []

        qs = JournalEntryLine.objects.filter(
            company_id=self.company_id,
            account_id__in=ar_accounts,
            journal_entry__status='POSTED',
            is_deleted=False
        )

        if date_from:
            qs = qs.filter(journal_entry__entry_date__gte=date_from)
        if date_to:
            qs = qs.filter(journal_entry__entry_date__lte=date_to)
        if crm_entity_id:
            qs = qs.filter(crm_entity_id=crm_entity_id)

        # We must only group by crm_entity to calculate balance
        # Exclude lines without a CRM entity
        qs = qs.filter(crm_entity__isnull=False)

        balances = qs.values(
            'crm_entity_id', 
            'crm_entity__name', 
            'crm_entity__display_name'
        ).annotate(
            total_debit=Coalesce(Sum('debit'), Decimal('0.00')),
            total_credit=Coalesce(Sum('credit'), Decimal('0.00')),
            balance=Coalesce(Sum(F('debit') - F('credit'), output_field=DecimalField()), Decimal('0.00'))
        ).order_by('crm_entity__name')

        return balances


class CustomerStatementService(BaseARService):
    """
    Generates a detailed transaction-level statement for a single customer from the GL.
    """
    def get_customer_statement(self, crm_entity_id, date_from=None, date_to=None):
        # Validate customer
        try:
            customer = CRMEntity.objects.get(id=crm_entity_id, company_id=self.company_id)
        except CRMEntity.DoesNotExist:
            raise ValueError(f"CRMEntity {crm_entity_id} not found.")

        ar_accounts = self._get_ar_accounts()
        if not ar_accounts:
            return {
                'crm_entity_id': crm_entity_id,
                'customer_name': customer.display_name or customer.name,
                'opening_balance': Decimal('0.00'),
                'period_debit': Decimal('0.00'),
                'period_credit': Decimal('0.00'),
                'closing_balance': Decimal('0.00'),
                'transactions': []
            }

        # Opening Balance Logic (Prior to date_from)
        opening_balance = Decimal('0.00')
        if date_from:
            ob_qs = JournalEntryLine.objects.filter(
                company_id=self.company_id,
                account_id__in=ar_accounts,
                crm_entity_id=crm_entity_id,
                journal_entry__status='POSTED',
                journal_entry__entry_date__lt=date_from,
                is_deleted=False
            ).aggregate(
                bal=Coalesce(Sum(F('debit') - F('credit'), output_field=DecimalField()), Decimal('0.00'))
            )
            opening_balance = ob_qs['bal']

        # Period Transactions
        qs = JournalEntryLine.objects.filter(
            company_id=self.company_id,
            account_id__in=ar_accounts,
            crm_entity_id=crm_entity_id,
            journal_entry__status='POSTED',
            is_deleted=False
        ).select_related('journal_entry', 'journal_entry__journal')

        if date_from:
            qs = qs.filter(journal_entry__entry_date__gte=date_from)
        if date_to:
            qs = qs.filter(journal_entry__entry_date__lte=date_to)

        # Annotate net movement for window function
        qs = qs.annotate(
            movement=F('debit') - F('credit')
        )

        # Apply deterministic ordering for window function
        qs = qs.order_by(
            'journal_entry__entry_date', 
            'journal_entry__created_at', 
            'journal_entry_id', 
            'id'
        )

        # Compute running balance
        qs = qs.annotate(
            running_balance=Window(
                expression=Sum('movement'),
                order_by=[
                    F('journal_entry__entry_date').asc(),
                    F('journal_entry__created_at').asc(),
                    F('journal_entry_id').asc(),
                    F('id').asc()
                ]
            ) + Value(opening_balance, output_field=DecimalField())
        )

        # Period Totals
        period_agg = qs.aggregate(
            pd=Coalesce(Sum('debit'), Decimal('0.00')),
            pc=Coalesce(Sum('credit'), Decimal('0.00'))
        )
        period_debit = period_agg['pd']
        period_credit = period_agg['pc']
        closing_balance = opening_balance + period_debit - period_credit

        return {
            'crm_entity_id': str(customer.id),
            'customer_name': customer.display_name or customer.name,
            'opening_balance': opening_balance,
            'period_debit': period_debit,
            'period_credit': period_credit,
            'closing_balance': closing_balance,
            'transactions': qs
        }


class ARAgingService:
    """
    Computes AR Aging strictly based on ServiceInvoice.
    """
    def __init__(self, company_id):
        self.company_id = company_id

    def get_ar_aging(self, crm_entity_id=None, date_to=None):
        """
        date_to: the as-of date for aging calculations. Defaults to today.
        """
        as_of_date = date_to or date.today()

        qs = ServiceInvoice.objects.filter(
            company_id=self.company_id,
            status=ServiceInvoiceStatus.POSTED,
            is_deleted=False
        ).exclude(
            payment_status='PAID' # fully paid are excluded
        )

        # Also strictly exclude any that somehow have total_amount - paid_amount <= 0 
        qs = qs.annotate(
            outstanding_amount=F('base_amount') - (F('paid_amount') * F('exchange_rate'))
        ).filter(outstanding_amount__gt=0)

        if crm_entity_id:
            qs = qs.filter(crm_entity_id=crm_entity_id)

        # Use COALESCE in case due_date is null
        due_dt = Coalesce('due_date', 'period_end')

        qs = qs.annotate(
            effective_due_date=due_dt
        )
        
        from datetime import timedelta
        b_30 = as_of_date - timedelta(days=30)
        b_60 = as_of_date - timedelta(days=60)
        b_90 = as_of_date - timedelta(days=90)

        qs = qs.annotate(
            bucket_current=Case(
                When(effective_due_date__gte=as_of_date, then=F('outstanding_amount')),
                default=Value(0), output_field=DecimalField()
            ),
            bucket_0_30=Case(
                When(effective_due_date__lt=as_of_date, effective_due_date__gte=b_30, then=F('outstanding_amount')),
                default=Value(0), output_field=DecimalField()
            ),
            bucket_31_60=Case(
                When(effective_due_date__lt=b_30, effective_due_date__gte=b_60, then=F('outstanding_amount')),
                default=Value(0), output_field=DecimalField()
            ),
            bucket_61_90=Case(
                When(effective_due_date__lt=b_60, effective_due_date__gte=b_90, then=F('outstanding_amount')),
                default=Value(0), output_field=DecimalField()
            ),
            bucket_90_plus=Case(
                When(effective_due_date__lt=b_90, then=F('outstanding_amount')),
                default=Value(0), output_field=DecimalField()
            )
        )

        qs = qs.select_related('crm_entity', 'service_contract', 'currency')
        qs = qs.order_by('effective_due_date', 'invoice_number')

        # Aggregated summary
        summary = qs.aggregate(
            total_current=Coalesce(Sum('bucket_current'), Decimal('0.00')),
            total_0_30=Coalesce(Sum('bucket_0_30'), Decimal('0.00')),
            total_31_60=Coalesce(Sum('bucket_31_60'), Decimal('0.00')),
            total_61_90=Coalesce(Sum('bucket_61_90'), Decimal('0.00')),
            total_90_plus=Coalesce(Sum('bucket_90_plus'), Decimal('0.00')),
            total_outstanding=Coalesce(Sum('outstanding_amount'), Decimal('0.00'))
        )

        return {
            'summary': summary,
            'invoices': qs
        }


class ARReconciliationService(BaseARService):
    """
    Compares Operational AR (ServiceInvoice) with Ledger AR (JournalEntryLine).
    Flag discrepancies.
    """
    def get_reconciliation(self, date_to=None):
        # 1. Get Ledger AR Balances per customer
        cb_service = CustomerBalanceService(company_id=self.company_id)
        ledger_balances = cb_service.get_customer_balances(date_to=date_to)

        ledger_map = {}
        for b in ledger_balances:
            ledger_map[str(b['crm_entity_id'])] = {
                'name': b['crm_entity__name'],
                'display_name': b['crm_entity__display_name'],
                'ledger_balance': b['balance']
            }

        # 2. Get Operational AR Balances per customer (BASE CURRENCY)
        inv_qs = ServiceInvoice.objects.filter(
            company_id=self.company_id,
            status=ServiceInvoiceStatus.POSTED,
            is_deleted=False
        )
        if date_to:
            inv_qs = inv_qs.filter(period_end__lte=date_to)

        inv_qs = inv_qs.annotate(
            base_outstanding=F('base_amount') - (F('paid_amount') * F('exchange_rate'))
        )

        op_balances = inv_qs.values(
            'crm_entity_id', 'crm_entity__name', 'crm_entity__display_name'
        ).annotate(
            operational_balance=Coalesce(Sum('base_outstanding'), Decimal('0.00'))
        )

        op_map = {}
        for b in op_balances:
            op_map[str(b['crm_entity_id'])] = {
                'name': b['crm_entity__name'],
                'display_name': b['crm_entity__display_name'],
                'operational_balance': b['operational_balance']
            }

        # 3. Merge and compute differences
        all_crm_ids = set(ledger_map.keys()).union(set(op_map.keys()))

        results = []
        for cid in all_crm_ids:
            ledger_val = ledger_map.get(cid, {}).get('ledger_balance', Decimal('0.00'))
            op_val = op_map.get(cid, {}).get('operational_balance', Decimal('0.00'))
            
            diff = op_val - ledger_val
            
            # Use small tolerance for float discrepancies (even though Decimal is used, some rounding might occur)
            has_discrepancy = abs(diff) > Decimal('0.01')
            
            name = ledger_map.get(cid, {}).get('display_name') or op_map.get(cid, {}).get('display_name') or "Unknown"
            
            results.append({
                'crm_entity_id': cid,
                'customer_name': name,
                'operational_balance': op_val,
                'ledger_balance': ledger_val,
                'difference': diff,
                'has_discrepancy': has_discrepancy
            })

        # Sort by discrepancy first, then by name
        results.sort(key=lambda x: (not x['has_discrepancy'], x['customer_name']))

        return results
