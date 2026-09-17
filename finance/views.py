from rest_framework import viewsets, filters, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from erp_core.permissions import RolePermission
from erp_core.views import TenantModelViewSet
from django.db.models import Sum
from django.db import transaction
from django.core.exceptions import ValidationError as DjangoValidationError
from platform_core.permissions import ModulePermission
from companies.models import Company
from .models import Expense, CreditAccount, LegacyJournalEntry
from .serializers import ExpenseSerializer, CreditAccountSerializer, LegacyJournalEntrySerializer


class ExpenseViewSet(TenantModelViewSet):
    required_module = 'finance'
    queryset = Expense.objects.all()
    serializer_class = ExpenseSerializer
    permission_classes = [IsAuthenticated, RolePermission, ModulePermission]
    allowed_roles = ['admin', 'manager']
    allowed_reads = ['admin', 'manager']
    required_read_permissions = ['finance.read']
    required_write_permissions = ['finance.write']
    filter_backends = [filters.OrderingFilter]
    ordering_fields = ['date', 'amount']

    def perform_create(self, serializer):
        serializer.save(company_id=self.request.user.company_id)


class CreditAccountViewSet(TenantModelViewSet):
    required_module = 'finance'
    queryset = CreditAccount.objects.all().select_related('crm_entity')
    serializer_class = CreditAccountSerializer
    permission_classes = [IsAuthenticated, RolePermission, ModulePermission]
    allowed_roles = ['admin', 'manager']
    allowed_reads = ['admin', 'manager', 'cashier']
    required_read_permissions = ['finance.read']
    required_write_permissions = ['finance.write']

    def perform_create(self, serializer):
        import uuid
        from finance.models import Journal
        
        journal_id = self.request.data.get('journal')
        if not journal_id:
            generic_journal, _ = Journal.objects.get_or_create(
                company_id=self.request.user.company_id,
                name='General Journal (Auto-Created)',
                defaults={'code': 'GEN'}
            )
            serializer.save(
                company_id=self.request.user.company_id,
                created_by=self.request.user,
                entry_number=f'JE-{uuid.uuid4().hex[:8].upper()}',
                journal=generic_journal
            )
        else:
            entry_number = self.request.data.get('entry_number', f'JE-{uuid.uuid4().hex[:8].upper()}')
            serializer.save(
                company_id=self.request.user.company_id,
                created_by=self.request.user,
                entry_number=entry_number
            )


class LegacyJournalEntryViewSet(TenantModelViewSet):
    """
    Auto-populated P&L journal. Read-only for most roles.
    Only creates via Sale/Service signals.
    """
    required_module = 'finance'
    queryset = LegacyJournalEntry.objects.all()
    serializer_class = LegacyJournalEntrySerializer
    permission_classes = [IsAuthenticated, RolePermission, ModulePermission]
    allowed_roles = ['admin']
    allowed_reads = ['admin', 'manager']
    required_read_permissions = ['finance.read']
    required_write_permissions = ['finance.write']
    filter_backends = [filters.OrderingFilter]
    ordering_fields = ['date', 'amount']
    http_method_names = ['get', 'head', 'options']  # Read-only

    @action(detail=False, methods=['get'])
    def summary(self, request):
        """Return total revenue, profit, and expense summary."""
        revenue = LegacyJournalEntry.objects.filter(
            entry_type__in=['REVENUE', 'SERVICE']
        ).aggregate(total=Sum('amount'), profit=Sum('profit'))
        expenses = Expense.objects.aggregate(total=Sum('amount'))
        return Response({
            'total_revenue': revenue['total'] or 0,
            'total_profit': revenue['profit'] or 0,
            'total_expenses': expenses['total'] or 0,
            'net': (revenue['total'] or 0) - (expenses['total'] or 0),
        })


from .models import (
    AccountGroup, ChartOfAccount, FiscalYear, AccountingPeriod,
    Journal, JournalEntry, JournalEntryLine, Currency, ExchangeRate,
    TaxGroup, TaxCode, CostCenter, ProfitCenter, FinancialTag,
    SalesAccountingConfiguration, FinancialAttachment, FinancialAuditTrail
)
from .serializers import (
    AccountGroupSerializer, ChartOfAccountSerializer, FiscalYearSerializer,
    AccountingPeriodSerializer, JournalSerializer, JournalEntrySerializer,
    JournalEntryLineSerializer, CurrencySerializer, ExchangeRateSerializer,
    TaxGroupSerializer, TaxCodeSerializer, CostCenterSerializer,
    ProfitCenterSerializer, FinancialTagSerializer,
    SalesAccountingConfigurationSerializer,
    FinancialAttachmentSerializer, FinancialAuditTrailSerializer
)

class BaseFinanceViewSet(TenantModelViewSet):
    required_module = 'finance'
    permission_classes = [IsAuthenticated, RolePermission, ModulePermission]
    allowed_roles = ['admin', 'manager']
    required_read_permissions = ['finance.read']
    required_write_permissions = ['finance.write']

    def get_company(self):
        from erp_core.middleware import get_current_company
        from companies.models import Company
        if hasattr(self.request.user, 'company') and self.request.user.company:
            return self.request.user.company
        company_id = get_current_company() or (self.request.META.get('HTTP_X_COMPANY_ID') if hasattr(self.request, 'META') else None) or getattr(self.request.user, 'company_id', None)
        if company_id:
            return Company.objects.filter(id=company_id).first()
        return None

    def _get_company(self, request=None):
        return self.get_company()

class AccountGroupViewSet(BaseFinanceViewSet):
    queryset = AccountGroup.objects.all().select_related('parent')
    serializer_class = AccountGroupSerializer

class ChartOfAccountViewSet(BaseFinanceViewSet):
    queryset = ChartOfAccount.objects.all().select_related('parent', 'account_group', 'currency')
    serializer_class = ChartOfAccountSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['account_code', 'account_name', 'description']
    ordering_fields = ['account_code', 'account_name', 'account_type', 'current_balance']

    def get_queryset(self):
        qs = super().get_queryset()
        account_type = self.request.query_params.get('account_type')
        if account_type:
            qs = qs.filter(account_type=account_type)
        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() in ['true', '1'])
        is_header = self.request.query_params.get('is_header')
        if is_header is not None:
            qs = qs.filter(is_header=is_header.lower() in ['true', '1'])
        is_control_account = self.request.query_params.get('is_control_account')
        if is_control_account is not None:
            qs = qs.filter(is_control_account=is_control_account.lower() in ['true', '1'])
        return qs

    @action(detail=False, methods=['get'])
    def tree(self, request):
        """Returns the full hierarchical COA tree for the company."""
        accounts = self.filter_queryset(self.get_queryset())
        serializer = self.get_serializer(accounts, many=True)
        acc_list = serializer.data

        # Build tree structure
        by_id = {acc['id']: {**acc, 'children': []} for acc in acc_list}
        root_nodes = []

        for acc_id, node in by_id.items():
            parent_id = node.get('parent')
            if parent_id and parent_id in by_id:
                by_id[parent_id]['children'].append(node)
            else:
                root_nodes.append(node)

        return Response(root_nodes)

    @action(detail=False, methods=['post'], url_path='provision-security-template')
    def provision_security_template(self, request):
        """Provisions standard Security Industry Chart of Accounts, fiscal periods, and config."""
        from .services.security_coa_template import provision_security_chart_of_accounts
        try:
            company = self.get_company()
            result = provision_security_chart_of_accounts(company)
            return Response(result, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)


class FiscalYearViewSet(BaseFinanceViewSet):
    queryset = FiscalYear.objects.all().order_by('-start_date')
    serializer_class = FiscalYearSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name']


class AccountingPeriodViewSet(BaseFinanceViewSet):
    queryset = AccountingPeriod.objects.all().select_related('fiscal_year').order_by('start_date')
    serializer_class = AccountingPeriodSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['fiscal_year__name', 'status']

    def get_queryset(self):
        qs = super().get_queryset()
        fy_id = self.request.query_params.get('fiscal_year')
        if fy_id:
            qs = qs.filter(fiscal_year_id=fy_id)
        status_param = self.request.query_params.get('status')
        if status_param:
            qs = qs.filter(status=status_param)
        return qs

    @action(detail=True, methods=['post'], url_path='set-status')
    def set_status(self, request, pk=None):
        period = self.get_object()
        new_status = request.data.get('status')
        if new_status not in ['OPEN', 'SOFT_CLOSED', 'CLOSED', 'LOCKED']:
            return Response({'detail': 'Invalid status. Must be OPEN, SOFT_CLOSED, or CLOSED.'}, status=status.HTTP_400_BAD_REQUEST)
        period.status = new_status
        period.save(update_fields=['status'])
        return Response(self.get_serializer(period).data)

    @action(detail=False, methods=['get'], url_path='check-date')
    def check_date(self, request):
        dt_str = request.query_params.get('date')
        if not dt_str:
            return Response({'detail': 'Missing date query parameter (YYYY-MM-DD).'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            from datetime import datetime
            txn_date = datetime.strptime(dt_str, '%Y-%m-%d').date()
        except ValueError:
            return Response({'detail': 'Invalid date format. Expected YYYY-MM-DD.'}, status=status.HTTP_400_BAD_REQUEST)

        is_adj = request.query_params.get('is_adjustment', '').lower() in ['true', '1']
        from .services.period_service import can_post_transaction
        can_post, msg, period = can_post_transaction(self.get_company(), txn_date, is_adjustment=is_adj)
        return Response({
            'can_post': can_post,
            'message': msg,
            'period_id': period.id if period else None,
            'period_status': period.status if period else None
        })

    @action(detail=True, methods=['get'])
    def readiness(self, request, pk=None):
        period = self.get_object()
        from finance.services.period_close_service import PeriodCloseService
        try:
            data = PeriodCloseService.get_readiness(period)
            return Response(data)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def soft_close(self, request, pk=None):
        period = self.get_object()
        notes = request.data.get('notes', '')
        from finance.services.period_close_service import PeriodCloseService
        try:
            p = PeriodCloseService.soft_close_period(period, user=request.user, notes=notes)
            return Response(self.get_serializer(p).data)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def final_close(self, request, pk=None):
        period = self.get_object()
        notes = request.data.get('notes', '')
        force = request.data.get('force', False)
        from finance.services.period_close_service import PeriodCloseService
        try:
            p = PeriodCloseService.final_close_period(period, user=request.user, notes=notes, force_if_warning=force)
            return Response(self.get_serializer(p).data)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def lock(self, request, pk=None):
        period = self.get_object()
        from finance.services.period_close_service import PeriodCloseService
        try:
            p = PeriodCloseService.lock_period(period, user=request.user)
            return Response(self.get_serializer(p).data)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def reopen(self, request, pk=None):
        period = self.get_object()
        reason = request.data.get('reason', '')
        target_status = request.data.get('target_status', 'SOFT_CLOSED')
        from finance.services.period_close_service import PeriodCloseService
        try:
            p = PeriodCloseService.reopen_period(period, user=request.user, reason=reason, target_status=target_status)
            return Response(self.get_serializer(p).data)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

class JournalViewSet(BaseFinanceViewSet):
    queryset = Journal.objects.all().order_by('code')
    serializer_class = JournalSerializer
    filterset_fields = ['journal_type', 'is_active']
    search_fields = ['code', 'name', 'description']


class JournalEntryViewSet(BaseFinanceViewSet):
    queryset = JournalEntry.objects.all().select_related(
        'journal', 'currency', 'created_by', 'approved_by', 'posted_by', 'reversal_of', 'reversed_by'
    ).prefetch_related('lines', 'lines__account', 'lines__cost_center', 'lines__profit_center', 'lines__crm_entity').order_by('-entry_date', '-created_at')
    serializer_class = JournalEntrySerializer
    filterset_fields = ['journal', 'status', 'source_type', 'is_manual']
    search_fields = ['entry_number', 'reference', 'description', 'source_number']

    def get_queryset(self):
        qs = super().get_queryset()
        start_date = self.request.query_params.get('start_date')
        end_date = self.request.query_params.get('end_date')
        if start_date:
            qs = qs.filter(posting_date__gte=start_date)
        if end_date:
            qs = qs.filter(posting_date__lte=end_date)
        source_id = self.request.query_params.get('source_id')
        if source_id:
            qs = qs.filter(source_id=source_id)
        return qs

    def perform_create(self, serializer):
        from finance.services.posting_service import AccountingPostingService
        journal_id = self.request.data.get('journal')
        company = self.get_company()
        if not journal_id:
            journal = AccountingPostingService.get_or_create_journal(company, 'GENERAL')
            serializer.save(
                company=company,
                created_by=self.request.user,
                journal=journal
            )
        else:
            serializer.save(
                company=company,
                created_by=self.request.user
            )

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.status == 'POSTED':
            from rest_framework.exceptions import ValidationError
            raise ValidationError("Cannot delete a posted journal entry. Use reversal instead.")
        return super().destroy(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.status == 'POSTED':
            from rest_framework.exceptions import ValidationError
            raise ValidationError("Cannot modify a posted journal entry. Use reversal instead.")
        return super().update(request, *args, **kwargs)

    @action(detail=True, methods=['post'])
    def post_entry(self, request, pk=None):
        entry = self.get_object()
        if entry.status == 'POSTED':
            return Response({'status': 'ALREADY_POSTED', 'entry_number': entry.entry_number})

        from finance.services.posting_service import AccountingPostingService
        try:
            # Load lines and post atomically
            lines_data = []
            for l in entry.lines.filter(is_deleted=False):
                lines_data.append({
                    'account': l.account,
                    'debit': l.debit,
                    'credit': l.credit,
                    'description': l.description,
                    'cost_center': l.cost_center,
                    'profit_center': l.profit_center,
                    'crm_entity': l.crm_entity,
                    'contract': l.contract,
                    'site': l.site,
                    'vendor': l.vendor,
                    'employee': l.employee,
                    'currency': l.currency,
                    'exchange_rate': l.exchange_rate,
                    'source_line_reference': l.source_line_reference
                })
            
            # Post
            posted_entry = AccountingPostingService.post_journal_entry(
                company=entry.company,
                journal=entry.journal,
                posting_date=entry.posting_date or entry.entry_date,
                document_date=entry.document_date or entry.entry_date,
                lines=lines_data,
                source_type=entry.source_type or 'MANUAL_JOURNAL',
                source_id=entry.source_id,
                source_number=entry.source_number,
                reference=entry.reference,
                description=entry.description,
                currency=entry.currency,
                exchange_rate=entry.exchange_rate,
                is_manual=entry.is_manual,
                user=request.user
            )
            return Response(JournalEntrySerializer(posted_entry).data)
        except DjangoValidationError as e:
            return Response({'detail': e.message_dict if hasattr(e, 'message_dict') else e.messages}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def reverse(self, request, pk=None):
        entry = self.get_object()
        serializer = JournalReversalRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        from finance.services.posting_service import AccountingPostingService
        try:
            reversal = AccountingPostingService.reverse_journal_entry(
                journal_entry=entry,
                reason=serializer.validated_data['reason'],
                reversal_date=serializer.validated_data.get('reversal_date'),
                user=request.user
            )
            return Response({
                'status': 'REVERSED',
                'original_entry': JournalEntrySerializer(entry).data,
                'reversal_entry': JournalEntrySerializer(reversal).data
            })
        except DjangoValidationError as e:
            return Response({'detail': e.message_dict if hasattr(e, 'message_dict') else e.messages}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)


class JournalEntryLineViewSet(BaseFinanceViewSet):
    queryset = JournalEntryLine.objects.all().select_related(
        'journal_entry', 'account', 'currency', 'cost_center', 'profit_center', 'crm_entity', 'contract', 'site', 'vendor', 'employee'
    )
    serializer_class = JournalEntryLineSerializer
    
    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.journal_entry and instance.journal_entry.status == 'POSTED':
            from rest_framework.exceptions import ValidationError
            raise ValidationError("Cannot delete lines of a posted journal entry.")
        return super().destroy(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.journal_entry and instance.journal_entry.status == 'POSTED':
            from rest_framework.exceptions import ValidationError
            raise ValidationError("Cannot modify lines of a posted journal entry.")
        return super().update(request, *args, **kwargs)


class GeneralLedgerViewSet(viewsets.ViewSet):
    """
    Comprehensive General Ledger & Financial Intelligence ViewSet:
    - Account Ledger running balances
    - Authoritative Trial Balance
    - Subledger Reconciliations
    - Posting Queue & 1-Click Posting
    - Double-Entry Previews
    - Manual Journal Entry Wizard
    """
    permission_classes = [IsAuthenticated]

    def _get_company(self, request):
        from erp_core.middleware import get_current_company
        from companies.models import Company
        if hasattr(request.user, 'company') and request.user.company:
            return request.user.company
        company_id = get_current_company() or (request.META.get('HTTP_X_COMPANY_ID') if hasattr(request, 'META') else None) or getattr(request.user, 'company_id', None)
        if company_id:
            return Company.objects.filter(id=company_id).first()
        return None

    @action(detail=False, methods=['get'])
    def account_ledger(self, request):
        company = self._get_company(request)
        account_id = request.query_params.get('account_id')
        if not account_id:
            # Fallback to first asset or cash account
            acc = ChartOfAccount.objects.filter(company=company, is_active=True).first()
            if not acc:
                return Response({'detail': 'No chart of accounts found.'}, status=status.HTTP_404_NOT_FOUND)
            account_id = str(acc.id)
        
        try:
            account = ChartOfAccount.objects.get(id=account_id, company=company)
        except ChartOfAccount.DoesNotExist:
            return Response({'detail': 'Account not found.'}, status=status.HTTP_404_NOT_FOUND)

        start_date_str = request.query_params.get('start_date')
        end_date_str = request.query_params.get('end_date')
        cost_center_id = request.query_params.get('cost_center_id')
        profit_center_id = request.query_params.get('profit_center_id')
        crm_entity_id = request.query_params.get('crm_entity_id')
        source_type = request.query_params.get('source_type')

        import datetime
        start_date = datetime.date.fromisoformat(start_date_str) if start_date_str else None
        end_date = datetime.date.fromisoformat(end_date_str) if end_date_str else timezone.now().date()
        
        cost_center = CostCenter.objects.filter(id=cost_center_id, company=company).first() if cost_center_id else None
        profit_center = ProfitCenter.objects.filter(id=profit_center_id, company=company).first() if profit_center_id else None

        from finance.services.posting_service import AccountingPostingService
        try:
            report = AccountingPostingService.get_account_ledger(
                company=company,
                account=account,
                start_date=start_date,
                end_date=end_date,
                cost_center=cost_center,
                profit_center=profit_center,
                source_type=source_type
            )
            return Response(report)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'])
    def trial_balance(self, request):
        company = self._get_company(request)
        start_date_str = request.query_params.get('start_date')
        end_date_str = request.query_params.get('end_date')
        as_of_date_str = request.query_params.get('as_of_date')
        cost_center_id = request.query_params.get('cost_center_id')
        profit_center_id = request.query_params.get('profit_center_id')

        import datetime
        start_date = datetime.date.fromisoformat(start_date_str) if start_date_str else None
        end_date = datetime.date.fromisoformat(end_date_str) if end_date_str else None
        as_of_date = datetime.date.fromisoformat(as_of_date_str) if as_of_date_str else None

        cost_center = CostCenter.objects.filter(id=cost_center_id, company=company).first() if cost_center_id else None
        profit_center = ProfitCenter.objects.filter(id=profit_center_id, company=company).first() if profit_center_id else None

        from finance.services.posting_service import AccountingPostingService
        try:
            report = AccountingPostingService.get_trial_balance(
                company=company,
                start_date=start_date,
                end_date=end_date,
                as_of_date=as_of_date,
                cost_center=cost_center,
                profit_center=profit_center
            )
            return Response(report)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'])
    def subledger_reconciliations(self, request):
        company = self._get_company(request)
        from finance.services.posting_service import AccountingPostingService
        try:
            result = AccountingPostingService.get_subledger_reconciliations(company=company)
            return Response(result)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'])
    def posting_queue(self, request):
        company = self._get_company(request)
        filter_status = request.query_params.get('filter_status', 'READY_TO_POST')
        source_type = request.query_params.get('source_type', 'ALL')

        from finance.services.posting_service import AccountingPostingService
        try:
            queue = AccountingPostingService.get_posting_queue(
                company=company,
                filter_status=filter_status,
                source_type=source_type
            )
            return Response({'queue': queue, 'total_count': len(queue)})
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'])
    def post_queue_item(self, request):
        company = self._get_company(request)
        source_type = request.data.get('source_type')
        source_id = request.data.get('source_id')

        if not source_type or not source_id:
            return Response({'detail': 'source_type and source_id are required.'}, status=status.HTTP_400_BAD_REQUEST)

        from finance.services.posting_service import AccountingPostingService
        try:
            if source_type == 'CLIENT_INVOICE':
                from billing.models import ClientInvoice
                invoice = ClientInvoice.objects.get(id=source_id, company=company)
                entry = AccountingPostingService.post_client_invoice(invoice, user=request.user)
            elif source_type == 'CLIENT_RECEIPT':
                from billing.models import ClientPaymentReceipt
                receipt = ClientPaymentReceipt.objects.get(id=source_id, company=company)
                entry = AccountingPostingService.post_client_receipt(receipt, user=request.user)
            elif source_type == 'EXPENSE':
                from finance.models import Expense
                expense = Expense.objects.get(id=source_id, company=company)
                entry = AccountingPostingService.post_expense(expense, user=request.user)
            elif source_type == 'PAYROLL_ACCRUAL':
                from finance.models import PayrollAccountingIntegration
                pr = PayrollAccountingIntegration.objects.get(id=source_id, company=company)
                entry = AccountingPostingService.post_payroll_accrual(pr, user=request.user)
            elif source_type == 'SALARY_PAYMENT':
                from finance.models import SalaryPaymentBatch
                batch = SalaryPaymentBatch.objects.get(id=source_id, company=company)
                entry = AccountingPostingService.post_salary_disbursement_batch(batch, user=request.user)
            elif source_type == 'TAX_PAYMENT':
                from finance.models import TaxPaymentVoucher
                voucher = TaxPaymentVoucher.objects.get(id=source_id, company=company)
                entry = AccountingPostingService.post_tax_payment(voucher, user=request.user)
            elif source_type == 'CONTRA_TRANSFER':
                from finance.models import FinancialVoucher
                v = FinancialVoucher.objects.get(id=source_id, company=company)
                entry = AccountingPostingService.post_treasury_contra_transfer(v, user=request.user)
            else:
                return Response({'detail': f"Unsupported queue item source_type: {source_type}"}, status=status.HTTP_400_BAD_REQUEST)

            return Response({
                'status': 'POSTED',
                'journal_entry': JournalEntrySerializer(entry).data
            })
        except DjangoValidationError as e:
            return Response({'detail': e.message_dict if hasattr(e, 'message_dict') else e.messages}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'])
    def post_all_ready(self, request):
        company = self._get_company(request)
        from finance.services.posting_service import AccountingPostingService

        queue = AccountingPostingService.get_posting_queue(company=company, filter_status='READY_TO_POST')
        results = []
        errors = []

        for item in queue:
            try:
                s_type = item['source_type']
                s_id = item['id']
                if s_type == 'CLIENT_INVOICE':
                    from billing.models import ClientInvoice
                    inv = ClientInvoice.objects.get(id=s_id, company=company)
                    je = AccountingPostingService.post_client_invoice(inv, user=request.user)
                elif s_type == 'EXPENSE':
                    from finance.models import Expense
                    exp = Expense.objects.get(id=s_id, company=company)
                    je = AccountingPostingService.post_expense(exp, user=request.user)
                elif s_type == 'PAYROLL_ACCRUAL':
                    from finance.models import PayrollAccountingIntegration
                    pr = PayrollAccountingIntegration.objects.get(id=s_id, company=company)
                    je = AccountingPostingService.post_payroll_accrual(pr, user=request.user)
                elif s_type == 'TAX_PAYMENT':
                    from finance.models import TaxPaymentVoucher
                    v = TaxPaymentVoucher.objects.get(id=s_id, company=company)
                    je = AccountingPostingService.post_tax_payment(v, user=request.user)
                else:
                    continue

                results.append({
                    'source_number': item['source_number'],
                    'entry_number': je.entry_number,
                    'amount': item['amount'],
                    'status': 'POSTED'
                })
            except Exception as e:
                errors.append({
                    'source_number': item.get('source_number'),
                    'error': str(e)
                })

        return Response({
            'total_processed': len(results),
            'total_errors': len(errors),
            'results': results,
            'errors': errors
        })

    @action(detail=False, methods=['post'])
    def create_manual_journal(self, request):
        company = self._get_company(request)
        serializer = ManualJournalCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        journal_id = data.get('journal_id')
        from finance.services.posting_service import AccountingPostingService
        if journal_id:
            journal = Journal.objects.get(id=journal_id, company=company)
        else:
            journal = AccountingPostingService.get_or_create_journal(company, 'GENERAL')

        lines = []
        for l in data['lines']:
            acc = ChartOfAccount.objects.get(id=l['account_id'], company=company)
            cc = CostCenter.objects.filter(id=l.get('cost_center_id'), company=company).first() if l.get('cost_center_id') else None
            pc = ProfitCenter.objects.filter(id=l.get('profit_center_id'), company=company).first() if l.get('profit_center_id') else None

            lines.append({
                'account': acc,
                'debit': l.get('debit', Decimal('0')),
                'credit': l.get('credit', Decimal('0')),
                'description': l.get('description', ''),
                'cost_center': cc,
                'profit_center': pc
            })

        try:
            entry = AccountingPostingService.post_journal_entry(
                company=company,
                journal=journal,
                posting_date=data.get('posting_date') or timezone.now().date(),
                document_date=data.get('document_date'),
                lines=lines,
                source_type='MANUAL_JOURNAL',
                reference=data.get('reference', ''),
                description=data.get('description', ''),
                is_manual=True,
                allow_control_account_override=data.get('allow_control_account_override', False),
                user=request.user
            )
            return Response(JournalEntrySerializer(entry).data, status=status.HTTP_201_CREATED)
        except DjangoValidationError as e:
            return Response({'detail': e.message_dict if hasattr(e, 'message_dict') else e.messages}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)


class CurrencyViewSet(BaseFinanceViewSet):
    queryset = Currency.objects.all()
    serializer_class = CurrencySerializer

class ExchangeRateViewSet(BaseFinanceViewSet):
    queryset = ExchangeRate.objects.all().select_related('from_currency', 'to_currency')
    serializer_class = ExchangeRateSerializer

class TaxGroupViewSet(BaseFinanceViewSet):
    queryset = TaxGroup.objects.all()
    serializer_class = TaxGroupSerializer

class TaxCodeViewSet(BaseFinanceViewSet):
    queryset = TaxCode.objects.all().select_related('tax_group')
    serializer_class = TaxCodeSerializer

class CostCenterViewSet(BaseFinanceViewSet):
    queryset = CostCenter.objects.all().select_related('parent')
    serializer_class = CostCenterSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['code', 'name', 'description']
    ordering_fields = ['code', 'name']

    def get_queryset(self):
        qs = super().get_queryset()
        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() in ['true', '1'])
        return qs

    @action(detail=False, methods=['get'])
    def tree(self, request):
        items = self.filter_queryset(self.get_queryset())
        serializer = self.get_serializer(items, many=True)
        item_list = serializer.data
        by_id = {item['id']: {**item, 'children': []} for item in item_list}
        root_nodes = []
        for item_id, node in by_id.items():
            parent_id = node.get('parent')
            if parent_id and parent_id in by_id:
                by_id[parent_id]['children'].append(node)
            else:
                root_nodes.append(node)
        return Response(root_nodes)


class ProfitCenterViewSet(BaseFinanceViewSet):
    queryset = ProfitCenter.objects.all().select_related('parent')
    serializer_class = ProfitCenterSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['code', 'name', 'description']
    ordering_fields = ['code', 'name']

    def get_queryset(self):
        qs = super().get_queryset()
        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() in ['true', '1'])
        return qs

    @action(detail=False, methods=['get'])
    def tree(self, request):
        items = self.filter_queryset(self.get_queryset())
        serializer = self.get_serializer(items, many=True)
        item_list = serializer.data
        by_id = {item['id']: {**item, 'children': []} for item in item_list}
        root_nodes = []
        for item_id, node in by_id.items():
            parent_id = node.get('parent')
            if parent_id and parent_id in by_id:
                by_id[parent_id]['children'].append(node)
            else:
                root_nodes.append(node)
        return Response(root_nodes)

class FinancialTagViewSet(BaseFinanceViewSet):
    queryset = FinancialTag.objects.all()
    serializer_class = FinancialTagSerializer

class SalesAccountingConfigurationViewSet(BaseFinanceViewSet):
    queryset = SalesAccountingConfiguration.objects.all().select_related(
        'sales_revenue_account', 'accounts_receivable_account', 'cash_account', 
        'bank_account', 'sales_discount_account', 'sales_return_account', 
        'sales_tax_account', 'rounding_account', 'default_currency'
    )
    serializer_class = SalesAccountingConfigurationSerializer


from .models import Budget, BudgetLine
from .serializers import BudgetSerializer, BudgetLineSerializer
from django.utils import timezone
from rest_framework import status

class BudgetViewSet(BaseFinanceViewSet):
    queryset = Budget.objects.all().select_related('fiscal_year', 'currency', 'created_by', 'approved_by').prefetch_related('lines')
    serializer_class = BudgetSerializer

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=['post'])
    def submit(self, request, pk=None):
        budget = self.get_object()
        if budget.status != 'DRAFT':
            return Response({'detail': 'Only DRAFT budgets can be submitted.'}, status=status.HTTP_400_BAD_REQUEST)
        budget.status = 'SUBMITTED'
        budget.save()
        return Response({'status': 'SUBMITTED'})

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        budget = self.get_object()
        if budget.status != 'SUBMITTED':
            return Response({'detail': 'Only SUBMITTED budgets can be approved.'}, status=status.HTTP_400_BAD_REQUEST)
        budget.status = 'APPROVED'
        budget.approved_by = request.user
        budget.approved_at = timezone.now()
        budget.save()
        return Response({'status': 'APPROVED'})
        
    @action(detail=True, methods=['post'])
    def activate(self, request, pk=None):
        budget = self.get_object()
        if budget.status != 'APPROVED':
            return Response({'detail': 'Only APPROVED budgets can be activated.'}, status=status.HTTP_400_BAD_REQUEST)
        budget.status = 'ACTIVE'
        budget.save()
        return Response({'status': 'ACTIVE'})

    @action(detail=True, methods=['post'])
    def close(self, request, pk=None):
        budget = self.get_object()
        if budget.status not in ['ACTIVE', 'APPROVED']:
            return Response({'detail': 'Only ACTIVE or APPROVED budgets can be closed.'}, status=status.HTTP_400_BAD_REQUEST)
        budget.status = 'CLOSED'
        budget.save()
        return Response({'status': 'CLOSED'})


class BudgetLineViewSet(BaseFinanceViewSet):
    queryset = BudgetLine.objects.all().select_related('budget', 'account', 'cost_center', 'profit_center', 'period')
    serializer_class = BudgetLineSerializer
    
    def create(self, request, *args, **kwargs):
        budget_id = request.data.get('budget')
        if budget_id:
            try:
                budget = Budget.objects.get(id=budget_id)
                if budget.status != 'DRAFT':
                    return Response({'detail': 'Can only add lines to DRAFT budgets.'}, status=status.HTTP_400_BAD_REQUEST)
            except Budget.DoesNotExist:
                pass
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.budget.status != 'DRAFT':
            return Response({'detail': 'Can only modify lines of DRAFT budgets.'}, status=status.HTTP_400_BAD_REQUEST)
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.budget.status != 'DRAFT':
            return Response({'detail': 'Can only delete lines from DRAFT budgets.'}, status=status.HTTP_400_BAD_REQUEST)
        return super().destroy(request, *args, **kwargs)

import mimetypes
from django.http import HttpResponse

class FinancialAttachmentViewSet(BaseFinanceViewSet):
    queryset = FinancialAttachment.objects.all()
    serializer_class = FinancialAttachmentSerializer
    
    @action(detail=True, methods=['get'])
    def download(self, request, pk=None):
        attachment = self.get_object()
        
        if not attachment.file:
            return Response({'detail': 'No file found.'}, status=404)
            
        file_path = attachment.file.path
        try:
            with open(file_path, 'rb') as f:
                mime_type, _ = mimetypes.guess_type(file_path)
                response = HttpResponse(f.read(), content_type=mime_type or 'application/octet-stream')
                response['Content-Disposition'] = f'attachment; filename="{attachment.filename}"'
                return response
        except FileNotFoundError:
            return Response({'detail': 'File not found on server.'}, status=404)

class FinancialAuditTrailViewSet(BaseFinanceViewSet):
    queryset = FinancialAuditTrail.objects.all().order_by('-created_at')
    serializer_class = FinancialAuditTrailSerializer
    http_method_names = ['get', 'head', 'options']

# ==============================================================================
# PHASE C-6: CASH, BANK & VOUCHERS
# ==============================================================================
# ==============================================================================
# PHASE C-6 & S-4D: CASH, BANK, TREASURY & FINANCIAL VOUCHERS
# ==============================================================================
from rest_framework import status
from .models import (
    BankAccount, FinancialVoucher, Cheque, BankStatement,
    FinancialVoucherLine, SecurityFinanceConfiguration, TreasuryTransaction
)
from .serializers import (
    BankAccountSerializer, FinancialVoucherSerializer, ChequeSerializer,
    BankStatementSerializer, FinancialVoucherLineSerializer,
    SecurityFinanceConfigurationSerializer, TreasuryTransactionSerializer
)
from .services.treasury_service import (
    initialize_opening_balance, get_account_statement_ledger,
    get_treasury_dashboard_metrics
)
from .services.voucher_service import (
    create_financial_voucher, submit_voucher_for_approval, approve_voucher,
    post_financial_voucher, reverse_financial_voucher, cancel_draft_voucher,
    create_contra_transfer, create_voucher_from_client_receipt,
    create_voucher_from_vendor_payment
)
from .services.cheque_service import (
    create_cheque, deposit_cheque, mark_cheque_cleared,
    bounce_cheque, cancel_cheque
)


class BankAccountViewSet(BaseFinanceViewSet):
    queryset = BankAccount.objects.all().select_related('chart_of_account', 'currency')
    serializer_class = BankAccountSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['account_title', 'bank_name', 'account_number', 'iban']
    ordering_fields = ['account_title', 'account_type', 'current_balance', 'created_at']

    def get_queryset(self):
        qs = super().get_queryset()
        acc_type = self.request.query_params.get('account_type')
        if acc_type:
            qs = qs.filter(account_type=acc_type)
        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() in ['true', '1'])
        return qs

    @action(detail=True, methods=['get'])
    def statement_history(self, request, pk=None):
        """
        Returns chronological statement ledger with running operational balance.
        """
        account = self.get_object()
        start_date_str = request.query_params.get('start_date')
        end_date_str = request.query_params.get('end_date')

        from datetime import datetime
        start_date = datetime.strptime(start_date_str, '%Y-%m-%d').date() if start_date_str else None
        end_date = datetime.strptime(end_date_str, '%Y-%m-%d').date() if end_date_str else None

        data = get_account_statement_ledger(account, start_date=start_date, end_date=end_date)
        return Response(data)

    @action(detail=True, methods=['post'])
    def set_opening_balance(self, request, pk=None):
        """
        Initializes opening balance for a treasury bank/cash account.
        """
        account = self.get_object()
        amount = request.data.get('amount')
        if amount is None:
            return Response({'detail': 'Amount is required.'}, status=status.HTTP_400_BAD_REQUEST)

        date_str = request.data.get('opening_date')
        from datetime import datetime
        op_date = datetime.strptime(date_str, '%Y-%m-%d').date() if date_str else None
        ref = request.data.get('reference', '')

        try:
            tx = initialize_opening_balance(
                bank_account=account,
                amount=amount,
                opening_date=op_date,
                reference=ref,
                user=request.user
            )
            return Response({
                'status': 'Opening balance initialized successfully',
                'current_balance': float(account.current_balance),
                'transaction_id': str(tx.id)
            })
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'])
    def treasury_dashboard(self, request):
        """
        Returns executive metrics, account balances, and recent movements for the Treasury dashboard.
        """
        company = self.get_company()
        data = get_treasury_dashboard_metrics(company)
        return Response(data)


class TreasuryTransactionViewSet(BaseFinanceViewSet):
    queryset = TreasuryTransaction.objects.all().select_related('bank_account', 'voucher', 'created_by')
    serializer_class = TreasuryTransactionSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['reference', 'description', 'bank_account__account_title']
    ordering_fields = ['transaction_date', 'created_at', 'money_in', 'money_out', 'running_balance']

    def get_queryset(self):
        qs = super().get_queryset()
        bank_account_id = self.request.query_params.get('bank_account')
        if bank_account_id:
            qs = qs.filter(bank_account_id=bank_account_id)
        tx_type = self.request.query_params.get('transaction_type')
        if tx_type:
            qs = qs.filter(transaction_type=tx_type)
        return qs


class FinancialVoucherViewSet(BaseFinanceViewSet):
    queryset = FinancialVoucher.objects.all().select_related(
        'bank_account', 'destination_bank_account', 'payment_account',
        'customer', 'currency', 'created_by', 'approved_by', 'posted_by', 'reversed_by'
    ).prefetch_related('lines', 'cheques')
    serializer_class = FinancialVoucherSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['voucher_number', 'reference', 'counterparty_name', 'description']
    ordering_fields = ['date', 'created_at', 'total_amount', 'voucher_number']

    def get_queryset(self):
        qs = super().get_queryset()
        v_type = self.request.query_params.get('voucher_type')
        if v_type:
            qs = qs.filter(voucher_type=v_type)
        v_status = self.request.query_params.get('status')
        if v_status:
            qs = qs.filter(status=v_status)
        bank_acc = self.request.query_params.get('bank_account')
        if bank_acc:
            qs = qs.filter(models.Q(bank_account_id=bank_acc) | models.Q(destination_bank_account_id=bank_acc))
        start_date = self.request.query_params.get('start_date')
        if start_date:
            qs = qs.filter(date__gte=start_date)
        end_date = self.request.query_params.get('end_date')
        if end_date:
            qs = qs.filter(date__lte=end_date)
        return qs

    def perform_create(self, serializer):
        company = self.get_company()
        serializer.save(company=company, created_by=self.request.user)

    @action(detail=True, methods=['post'])
    def submit_for_approval(self, request, pk=None):
        voucher = self.get_object()
        try:
            v = submit_voucher_for_approval(voucher, request.user)
            return Response({'status': 'Submitted for approval', 'voucher': self.get_serializer(v).data})
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        voucher = self.get_object()
        try:
            v = approve_voucher(voucher, request.user)
            return Response({'status': 'Voucher approved', 'voucher': self.get_serializer(v).data})
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def post_voucher(self, request, pk=None):
        voucher = self.get_object()
        try:
            v = post_financial_voucher(voucher, request.user)
            return Response({
                'status': 'Voucher posted successfully',
                'voucher': self.get_serializer(v).data
            })
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def reverse_voucher(self, request, pk=None):
        voucher = self.get_object()
        reason = request.data.get('reversal_reason', '')
        try:
            v = reverse_financial_voucher(voucher, reversal_reason=reason, user=request.user)
            return Response({
                'status': 'Voucher reversed successfully',
                'voucher': self.get_serializer(v).data
            })
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def cancel_voucher(self, request, pk=None):
        voucher = self.get_object()
        try:
            v = cancel_draft_voucher(voucher, request.user)
            return Response({
                'status': 'Voucher cancelled successfully',
                'voucher': self.get_serializer(v).data
            })
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'])
    def create_contra(self, request):
        company = self.get_company()
        from_acc_id = request.data.get('from_account')
        to_acc_id = request.data.get('to_account')
        amount = request.data.get('amount')
        date_str = request.data.get('date')
        ref = request.data.get('reference', '')
        desc = request.data.get('description', '')
        auto_post = request.data.get('auto_post', True)

        if not from_acc_id or not to_acc_id or not amount:
            return Response({'detail': 'from_account, to_account, and amount are required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            from_acc = BankAccount.objects.get(id=from_acc_id, company=company)
            to_acc = BankAccount.objects.get(id=to_acc_id, company=company)
            from datetime import datetime
            tx_date = datetime.strptime(date_str, '%Y-%m-%d').date() if date_str else timezone.now().date()

            v = create_contra_transfer(
                company=company,
                from_account=from_acc,
                to_account=to_acc,
                amount=amount,
                date=tx_date,
                reference=ref,
                description=desc,
                user=request.user,
                auto_post=auto_post,
            )
            return Response(self.get_serializer(v).data, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'])
    def from_client_receipt(self, request):
        company = self.get_company()
        receipt_id = request.data.get('receipt_id')
        if not receipt_id:
            return Response({'detail': 'receipt_id is required.'}, status=status.HTTP_400_BAD_REQUEST)

        from billing.models import ClientReceipt
        try:
            receipt = ClientReceipt.objects.get(id=receipt_id, company=company)
            v = create_voucher_from_client_receipt(receipt, user=request.user, auto_post=True)
            return Response(self.get_serializer(v).data, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'])
    def from_vendor_payment(self, request):
        company = self.get_company()
        payment_id = request.data.get('payment_id')
        if not payment_id:
            return Response({'detail': 'payment_id is required.'}, status=status.HTTP_400_BAD_REQUEST)

        from purchasing.models import VendorPayment
        try:
            payment = VendorPayment.objects.get(id=payment_id, company=company)
            v = create_voucher_from_vendor_payment(payment, user=request.user, auto_post=True)
            return Response(self.get_serializer(v).data, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)


class FinancialVoucherLineViewSet(BaseFinanceViewSet):
    queryset = FinancialVoucherLine.objects.all()
    serializer_class = FinancialVoucherLineSerializer
    filterset_fields = ['voucher']


class ChequeViewSet(BaseFinanceViewSet):
    queryset = Cheque.objects.all().select_related('bank_account', 'voucher', 'created_by', 'cleared_by', 'bounced_by')
    serializer_class = ChequeSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['cheque_number', 'payee_name', 'payer_name', 'drawer_bank', 'notes']
    ordering_fields = ['issue_date', 'due_date', 'clearing_date', 'amount', 'created_at']

    def get_queryset(self):
        qs = super().get_queryset()
        chq_status = self.request.query_params.get('status')
        if chq_status:
            qs = qs.filter(status=chq_status)
        bank_acc = self.request.query_params.get('bank_account')
        if bank_acc:
            qs = qs.filter(bank_account_id=bank_acc)
        return qs

    def perform_create(self, serializer):
        serializer.save(company=self.get_company(), created_by=self.request.user)

    @action(detail=True, methods=['post'])
    def deposit(self, request, pk=None):
        cheque = self.get_object()
        bank_account_id = request.data.get('bank_account')
        if not bank_account_id:
            return Response({'detail': 'bank_account is required for deposit.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            bank_acc = BankAccount.objects.get(id=bank_account_id, company=cheque.company)
            c = deposit_cheque(cheque, bank_acc, request.user)
            return Response({'status': 'Cheque deposited successfully', 'cheque': self.get_serializer(c).data})
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def clear_cheque(self, request, pk=None):
        cheque = self.get_object()
        date_str = request.data.get('clearing_date')
        from datetime import datetime
        clearing_date = datetime.strptime(date_str, '%Y-%m-%d').date() if date_str else None
        try:
            c = mark_cheque_cleared(cheque, clearing_date=clearing_date, user=request.user)
            return Response({'status': 'Cheque marked as cleared', 'cheque': self.get_serializer(c).data})
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def bounce(self, request, pk=None):
        cheque = self.get_object()
        reason = request.data.get('bounce_reason', '')
        try:
            c = bounce_cheque(cheque, bounce_reason=reason, user=request.user)
            return Response({'status': 'Cheque marked as bounced', 'cheque': self.get_serializer(c).data})
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        cheque = self.get_object()
        try:
            c = cancel_cheque(cheque, user=request.user)
            return Response({'status': 'Cheque cancelled successfully', 'cheque': self.get_serializer(c).data})
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)


class BankStatementViewSet(BaseFinanceViewSet):
    queryset = BankStatement.objects.all().select_related('bank_account').prefetch_related('lines').order_by('-end_date')
    serializer_class = BankStatementSerializer

    @action(detail=False, methods=['post'], url_path='import')
    def import_statement(self, request):
        company = self._get_company(request)
        bank_account_id = request.data.get('bank_account')
        lines_data = request.data.get('lines', [])
        statement_number = request.data.get('statement_number')
        start_date = request.data.get('start_date')
        end_date = request.data.get('end_date')
        opening_balance = Decimal(str(request.data.get('opening_balance', 0)))
        closing_balance = Decimal(str(request.data.get('closing_balance', 0)))
        file_hash = request.data.get('file_hash')

        from finance.models import BankAccount
        bank_account = BankAccount.objects.get(id=bank_account_id, company=company)

        from finance.services.bank_reconciliation_service import BankReconciliationService
        try:
            stmt = BankReconciliationService.import_bank_statement(
                company=company,
                bank_account=bank_account,
                lines_data=lines_data,
                statement_number=statement_number,
                start_date=start_date,
                end_date=end_date,
                opening_balance=opening_balance,
                closing_balance=closing_balance,
                file_hash=file_hash
            )
            return Response(self.get_serializer(stmt).data, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='auto-match')
    def auto_match(self, request, pk=None):
        statement = self.get_object()
        from finance.services.bank_reconciliation_service import BankReconciliationService
        try:
            res = BankReconciliationService.auto_match_statement(statement)
            return Response(res)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'], url_path='manual-match')
    def manual_match(self, request):
        line_id = request.data.get('line_id')
        from finance.models import BankStatementLine
        line = BankStatementLine.objects.get(id=line_id, company=self._get_company(request))

        treasury_id = request.data.get('treasury_transaction_id')
        voucher_id = request.data.get('voucher_id')
        cheque_id = request.data.get('cheque_id')
        reason = request.data.get('reason', '')

        from finance.services.bank_reconciliation_service import BankReconciliationService
        try:
            matched_line = BankReconciliationService.manual_match_line(
                line=line,
                treasury_transaction_id=treasury_id,
                voucher_id=voucher_id,
                cheque_id=cheque_id,
                user=request.user,
                reason=reason
            )
            from finance.serializers import BankStatementLineSerializer
            return Response(BankStatementLineSerializer(matched_line).data)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'], url_path='unmatch')
    def unmatch(self, request):
        line_id = request.data.get('line_id')
        reason = request.data.get('reason', '')
        from finance.models import BankStatementLine
        line = BankStatementLine.objects.get(id=line_id, company=self._get_company(request))

        from finance.services.bank_reconciliation_service import BankReconciliationService
        try:
            unmatched = BankReconciliationService.unmatch_line(line=line, user=request.user, reason=reason)
            from finance.serializers import BankStatementLineSerializer
            return Response(BankStatementLineSerializer(unmatched).data)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'], url_path='create-adjustment')
    def create_adjustment(self, request):
        line_id = request.data.get('line_id')
        expense_account_id = request.data.get('expense_account_id')
        cost_center_id = request.data.get('cost_center_id')
        notes = request.data.get('notes', '')

        from finance.models import BankStatementLine, ChartOfAccount, CostCenter
        line = BankStatementLine.objects.get(id=line_id, company=self._get_company(request))
        expense_account = ChartOfAccount.objects.get(id=expense_account_id, company=self._get_company(request))
        cost_center = CostCenter.objects.get(id=cost_center_id, company=self._get_company(request)) if cost_center_id else None

        from finance.services.bank_reconciliation_service import BankReconciliationService
        try:
            adj_line = BankReconciliationService.create_bank_charge_adjustment(
                line=line,
                expense_account=expense_account,
                cost_center=cost_center,
                user=request.user,
                notes=notes
            )
            from finance.serializers import BankStatementLineSerializer
            return Response(BankStatementLineSerializer(adj_line).data)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['get'])
    def summary(self, request, pk=None):
        statement = self.get_object()
        from finance.services.bank_reconciliation_service import BankReconciliationService
        try:
            data = BankReconciliationService.get_reconciliation_summary(statement)
            return Response(data)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='close-reconciliation')
    def close_reconciliation(self, request, pk=None):
        statement = self.get_object()
        from finance.services.bank_reconciliation_service import BankReconciliationService
        try:
            closed_stmt = BankReconciliationService.close_bank_reconciliation(statement, user=request.user)
            return Response(self.get_serializer(closed_stmt).data)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)


class SecurityFinanceConfigurationViewSet(BaseFinanceViewSet):
    queryset = SecurityFinanceConfiguration.objects.all().select_related(
        'accounts_receivable_account', 'accounts_payable_account', 'payroll_payable_account',
        'tax_payable_account', 'security_service_revenue_account', 'overtime_revenue_account',
        'extra_duty_revenue_account', 'salary_cost_account', 'overtime_cost_account',
        'inventory_equipment_account', 'default_bank_account', 'default_currency'
    )
    serializer_class = SecurityFinanceConfigurationSerializer

    @action(detail=False, methods=['get', 'post', 'put', 'patch'], url_path='current')
    def current_config(self, request):
        company = self.get_company()
        config, _ = SecurityFinanceConfiguration.objects.get_or_create(
            company=company,
            is_active=True
        )
        if request.method == 'GET':
            return Response(self.get_serializer(config).data)
        serializer = self.get_serializer(config, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


# ==============================================================================
# PHASE S-4E: EXPENSES, PETTY CASH, EMPLOYEE CLAIMS & ADVANCES
# ==============================================================================
from .models import ExpenseCategory, Expense, ExpenseAllocation, EmployeeAdvance, PettyCashCustodian
from .serializers import (
    ExpenseCategorySerializer, ExpenseSerializer, ExpenseAllocationSerializer,
    EmployeeAdvanceSerializer, PettyCashCustodianSerializer
)
from .services.expense_service import ExpenseService
from .services.advance_service import EmployeeAdvanceService
from .services.petty_cash_service import PettyCashService


class ExpenseCategoryViewSet(BaseFinanceViewSet):
    queryset = ExpenseCategory.objects.all().select_related('default_expense_account')
    serializer_class = ExpenseCategorySerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name', 'code', 'description']
    ordering_fields = ['name', 'code', 'created_at']

    def perform_create(self, serializer):
        serializer.save(company=self.get_company())


class ExpenseViewSet(BaseFinanceViewSet):
    queryset = Expense.objects.all().select_related(
        'category', 'vendor', 'employee', 'currency', 'bank_account',
        'expense_account', 'cost_center', 'profit_center', 'client',
        'contract', 'site', 'voucher', 'advance', 'created_by'
    ).prefetch_related('allocations')
    serializer_class = ExpenseSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['expense_number', 'title', 'payee', 'notes', 'receipt_reference']
    ordering_fields = ['expense_date', 'created_at', 'total_amount', 'expense_number']

    def get_queryset(self):
        qs = super().get_queryset()
        exp_type = self.request.query_params.get('expense_type')
        if exp_type:
            qs = qs.filter(expense_type=exp_type)
        exp_status = self.request.query_params.get('status')
        if exp_status:
            qs = qs.filter(status=exp_status)
        p_status = self.request.query_params.get('payment_status')
        if p_status:
            qs = qs.filter(payment_status=p_status)
        cat_id = self.request.query_params.get('category')
        if cat_id:
            qs = qs.filter(category_id=cat_id)
        cost_center_id = self.request.query_params.get('cost_center')
        if cost_center_id:
            qs = qs.filter(cost_center_id=cost_center_id)
        site_id = self.request.query_params.get('site')
        if site_id:
            qs = qs.filter(site_id=site_id)
        emp_id = self.request.query_params.get('employee')
        if emp_id:
            qs = qs.filter(employee_id=emp_id)
        start_date = self.request.query_params.get('start_date')
        if start_date:
            qs = qs.filter(expense_date__gte=start_date)
        end_date = self.request.query_params.get('end_date')
        if end_date:
            qs = qs.filter(expense_date__lte=end_date)
        return qs

    def perform_create(self, serializer):
        company = self.get_company()
        serializer.save(company=company, created_by=self.request.user)

    @action(detail=True, methods=['post'])
    def submit(self, request, pk=None):
        expense = self.get_object()
        try:
            exp = ExpenseService.submit_expense(expense, request.user)
            return Response({'status': 'Expense submitted', 'expense': self.get_serializer(exp).data})
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        expense = self.get_object()
        try:
            exp = ExpenseService.approve_expense(expense, request.user)
            return Response({'status': 'Expense approved', 'expense': self.get_serializer(exp).data})
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        expense = self.get_object()
        reason = request.data.get('rejection_reason', '')
        try:
            exp = ExpenseService.reject_expense(expense, reason, request.user)
            return Response({'status': 'Expense rejected', 'expense': self.get_serializer(exp).data})
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def pay_expense(self, request, pk=None):
        expense = self.get_object()
        bank_account_id = request.data.get('bank_account')
        if not bank_account_id:
            return Response({'detail': 'bank_account is required.'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            bank_acc = BankAccount.objects.get(id=bank_account_id, company=expense.company)
            payment_method = request.data.get('payment_method', PaymentMethod.BANK_TRANSFER)
            date_str = request.data.get('payment_date')
            from datetime import datetime
            p_date = datetime.strptime(date_str, '%Y-%m-%d').date() if date_str else None
            ref = request.data.get('reference', '')

            v = ExpenseService.pay_expense(
                expense=expense,
                bank_account=bank_acc,
                payment_method=payment_method,
                payment_date=p_date,
                user=request.user,
                reference=ref
            )
            return Response({
                'status': 'Expense paid successfully',
                'voucher_id': str(v.id),
                'voucher_number': v.voucher_number,
                'expense': self.get_serializer(expense).data
            })
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def reverse_expense(self, request, pk=None):
        expense = self.get_object()
        reason = request.data.get('reversal_reason', '')
        try:
            exp = ExpenseService.reverse_expense(expense, reason, request.user)
            return Response({'status': 'Expense reversed successfully', 'expense': self.get_serializer(exp).data})
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def cancel_expense(self, request, pk=None):
        expense = self.get_object()
        try:
            exp = ExpenseService.cancel_draft_expense(expense, request.user)
            return Response({'status': 'Expense cancelled', 'expense': self.get_serializer(exp).data})
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def set_allocations(self, request, pk=None):
        expense = self.get_object()
        allocations_data = request.data.get('allocations', [])
        try:
            allocs = ExpenseService.set_split_allocations(expense, allocations_data)
            return Response({
                'status': 'Allocations updated',
                'allocations': ExpenseAllocationSerializer(allocs, many=True).data,
                'expense': self.get_serializer(expense).data
            })
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'])
    def summary_metrics(self, request):
        company = self.get_company()
        expenses = Expense.objects.filter(company=company)
        from django.db.models import Sum, Q
        
        total_spent = expenses.filter(status='PAID').aggregate(s=Sum('total_amount'))['s'] or 0
        pending_approval = expenses.filter(status='PENDING_APPROVAL').aggregate(s=Sum('total_amount'))['s'] or 0
        approved_unpaid = expenses.filter(status='APPROVED', payment_status='UNPAID').aggregate(s=Sum('total_amount'))['s'] or 0
        claims_count = expenses.filter(expense_type='EMPLOYEE_CLAIM', status='PENDING_APPROVAL').count()
        petty_cash_spent = expenses.filter(expense_type='PETTY_CASH_EXPENSE', status='PAID').aggregate(s=Sum('total_amount'))['s'] or 0

        return Response({
            'total_spent': float(total_spent),
            'pending_approval': float(pending_approval),
            'approved_unpaid': float(approved_unpaid),
            'pending_claims_count': claims_count,
            'petty_cash_spent': float(petty_cash_spent)
        })


class EmployeeAdvanceViewSet(BaseFinanceViewSet):
    queryset = EmployeeAdvance.objects.all().select_related(
        'employee', 'bank_account', 'voucher', 'created_by', 'approved_by', 'paid_by'
    )
    serializer_class = EmployeeAdvanceSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['advance_number', 'purpose', 'employee__first_name', 'employee__last_name']
    ordering_fields = ['advance_date', 'created_at', 'amount', 'outstanding_balance']

    def get_queryset(self):
        qs = super().get_queryset()
        adv_type = self.request.query_params.get('advance_type')
        if adv_type:
            qs = qs.filter(advance_type=adv_type)
        adv_status = self.request.query_params.get('status')
        if adv_status:
            qs = qs.filter(status=adv_status)
        emp_id = self.request.query_params.get('employee')
        if emp_id:
            qs = qs.filter(employee_id=emp_id)
        return qs

    def perform_create(self, serializer):
        serializer.save(company=self.get_company(), created_by=self.request.user)

    @action(detail=True, methods=['post'])
    def submit(self, request, pk=None):
        advance = self.get_object()
        try:
            adv = EmployeeAdvanceService.submit_advance(advance, request.user)
            return Response({'status': 'Advance submitted', 'advance': self.get_serializer(adv).data})
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        advance = self.get_object()
        try:
            adv = EmployeeAdvanceService.approve_advance(advance, request.user)
            return Response({'status': 'Advance approved', 'advance': self.get_serializer(adv).data})
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        advance = self.get_object()
        reason = request.data.get('rejection_reason', '')
        try:
            adv = EmployeeAdvanceService.reject_advance(advance, reason, request.user)
            return Response({'status': 'Advance rejected', 'advance': self.get_serializer(adv).data})
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def pay_advance(self, request, pk=None):
        advance = self.get_object()
        bank_account_id = request.data.get('bank_account')
        if not bank_account_id:
            return Response({'detail': 'bank_account is required.'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            bank_acc = BankAccount.objects.get(id=bank_account_id, company=advance.company)
            payment_method = request.data.get('payment_method', PaymentMethod.BANK_TRANSFER)
            date_str = request.data.get('payment_date')
            from datetime import datetime
            p_date = datetime.strptime(date_str, '%Y-%m-%d').date() if date_str else None
            ref = request.data.get('reference', '')

            v = EmployeeAdvanceService.pay_advance(
                advance=advance,
                bank_account=bank_acc,
                payment_method=payment_method,
                payment_date=p_date,
                user=request.user,
                reference=ref
            )
            return Response({
                'status': 'Advance disbursed successfully',
                'voucher_id': str(v.id),
                'voucher_number': v.voucher_number,
                'advance': self.get_serializer(advance).data
            })
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def settle(self, request, pk=None):
        advance = self.get_object()
        expense_ids = request.data.get('expense_ids', [])
        cash_returned = request.data.get('cash_returned', 0)
        cash_return_bank_account_id = request.data.get('cash_return_bank_account')

        cash_return_bank_acc = None
        if cash_return_bank_account_id:
            cash_return_bank_acc = BankAccount.objects.get(id=cash_return_bank_account_id, company=advance.company)

        try:
            result = EmployeeAdvanceService.settle_advance_with_expenses(
                advance=advance,
                expense_ids=expense_ids,
                cash_returned=cash_returned,
                cash_return_bank_account=cash_return_bank_acc,
                user=request.user
            )
            return Response({'status': 'Advance settled successfully', 'summary': result})
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def record_cash_return(self, request, pk=None):
        advance = self.get_object()
        return_amount = request.data.get('return_amount')
        bank_account_id = request.data.get('bank_account')

        if not return_amount or not bank_account_id:
            return Response({'detail': 'return_amount and bank_account are required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            bank_acc = BankAccount.objects.get(id=bank_account_id, company=advance.company)
            ref = request.data.get('reference', '')
            v = EmployeeAdvanceService.record_cash_return(
                advance=advance,
                return_amount=return_amount,
                bank_account=bank_acc,
                reference=ref,
                user=request.user
            )
            return Response({
                'status': 'Cash return recorded successfully',
                'voucher_id': str(v.id),
                'voucher_number': v.voucher_number,
                'advance': self.get_serializer(advance).data
            })
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)


class PettyCashViewSet(BaseFinanceViewSet):
    queryset = PettyCashCustodian.objects.all().select_related('bank_account', 'custodian', 'custodian_user')
    serializer_class = PettyCashCustodianSerializer

    @action(detail=False, methods=['get'])
    def summary(self, request):
        company = self.get_company()
        data = PettyCashService.get_petty_cash_summary(company)
        return Response(data)

    @action(detail=False, methods=['post'])
    def fund(self, request):
        company = self.get_company()
        from_acc_id = request.data.get('from_account')
        to_acc_id = request.data.get('to_account')
        amount = request.data.get('amount')
        date_str = request.data.get('date')
        ref = request.data.get('reference', '')

        if not from_acc_id or not to_acc_id or not amount:
            return Response({'detail': 'from_account, to_account, and amount are required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            from_acc = BankAccount.objects.get(id=from_acc_id, company=company)
            to_acc = BankAccount.objects.get(id=to_acc_id, company=company)
            from datetime import datetime
            tx_date = datetime.strptime(date_str, '%Y-%m-%d').date() if date_str else None

            v = PettyCashService.fund_petty_cash(
                from_account=from_acc,
                to_petty_cash_account=to_acc,
                amount=amount,
                date=tx_date,
                reference=ref,
                user=request.user
            )
            return Response({
                'status': 'Petty cash funded successfully',
                'voucher_id': str(v.id),
                'voucher_number': v.voucher_number
            }, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'])
    def record_expense(self, request):
        company = self.get_company()
        petty_acc_id = request.data.get('petty_cash_account')
        title = request.data.get('title')
        amount = request.data.get('amount')
        cat_id = request.data.get('category')
        payee = request.data.get('payee', '')
        desc = request.data.get('description', '')
        cost_center_id = request.data.get('cost_center')
        site_id = request.data.get('site')
        receipt_ref = request.data.get('receipt_reference', '')

        if not petty_acc_id or not title or not amount:
            return Response({'detail': 'petty_cash_account, title, and amount are required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            petty_acc = BankAccount.objects.get(id=petty_acc_id, company=company)
            category = ExpenseCategory.objects.get(id=cat_id, company=company) if cat_id else None
            cost_center = CostCenter.objects.get(id=cost_center_id, company=company) if cost_center_id else None
            
            from operations.models import OperationalSite
            site = OperationalSite.objects.get(id=site_id, company=company) if site_id else None

            exp = PettyCashService.record_petty_cash_expense(
                company=company,
                petty_cash_account=petty_acc,
                title=title,
                amount=amount,
                category=category,
                payee=payee,
                description=desc,
                cost_center=cost_center,
                site=site,
                receipt_reference=receipt_ref,
                user=request.user,
                auto_post=True
            )
            return Response({
                'status': 'Petty cash expense recorded and posted',
                'expense': ExpenseSerializer(exp).data
            }, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'])
    def configure_custodian(self, request):
        company = self.get_company()
        acc_id = request.data.get('bank_account')
        emp_id = request.data.get('custodian')
        float_limit = request.data.get('float_limit', 50000)
        threshold = request.data.get('replenishment_threshold', 10000)
        single_limit = request.data.get('max_single_expense_limit', 15000)

        if not acc_id:
            return Response({'detail': 'bank_account is required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            acc = BankAccount.objects.get(id=acc_id, company=company)
            from hrm.models import Employee
            custodian = Employee.objects.get(id=emp_id, company=company) if emp_id else None

            cust_obj = PettyCashService.configure_custodian(
                company=company,
                bank_account=acc,
                custodian=custodian,
                float_limit=float_limit,
                replenishment_threshold=threshold,
                max_single_expense_limit=single_limit
            )
            return Response(self.get_serializer(cust_obj).data)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)


# ==============================================================================
# PHASE S-4F: PURCHASING → FINANCE ACCOUNTING INTEGRATION VIEWSETS
# ==============================================================================
from .models import PurchasingItemAccountMapping, PurchasingAccountingIntegration, PurchasingAccountingLinePreview
from .serializers import (
    PurchasingItemAccountMappingSerializer,
    PurchasingAccountingIntegrationSerializer,
    PurchasingAccountingLinePreviewSerializer
)
from .services.purchasing_integration_service import PurchasingIntegrationService


class PurchasingItemAccountMappingViewSet(BaseFinanceViewSet):
    queryset = PurchasingItemAccountMapping.objects.all().select_related(
        'item', 'item_category', 'expense_category', 'debit_account'
    )
    serializer_class = PurchasingItemAccountMappingSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['item__name', 'item_category__name', 'expense_category__name', 'debit_account__account_name', 'debit_account__account_code']
    ordering_fields = ['created_at', 'account_classification']

    def perform_create(self, serializer):
        serializer.save(company=self.get_company())


class PurchasingAccountingIntegrationViewSet(BaseFinanceViewSet):
    queryset = PurchasingAccountingIntegration.objects.all().select_related(
        'vendor', 'crm_entity', 'purchase_order', 'finance_config', 'ap_control_account', 'voucher', 'reviewed_by'
    ).prefetch_related(
        'lines__debit_account', 'lines__credit_account', 'lines__cost_center', 'lines__site'
    )
    serializer_class = PurchasingAccountingIntegrationSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['source_number', 'vendor__name', 'blocking_reason', 'notes']
    ordering_fields = ['transaction_date', 'amount', 'created_at', 'status']

    def get_queryset(self):
        qs = super().get_queryset()
        source_type = self.request.query_params.get('source_type')
        if source_type:
            qs = qs.filter(source_type=source_type)
        status_param = self.request.query_params.get('status')
        if status_param:
            qs = qs.filter(status=status_param)
        vendor_id = self.request.query_params.get('vendor')
        if vendor_id:
            qs = qs.filter(vendor_id=vendor_id)
        return qs

    @action(detail=False, methods=['get'])
    def summary_metrics(self, request):
        company = self.get_company()
        metrics = PurchasingIntegrationService.get_summary_metrics(company)
        return Response(metrics)

    @action(detail=False, methods=['post'])
    def sync_all(self, request):
        company = self.get_company()
        stats = PurchasingIntegrationService.sync_all_purchasing_integrations(company, user=request.user)
        return Response({
            'status': 'Sync completed',
            'stats': stats
        })

    @action(detail=False, methods=['get'])
    def preview(self, request):
        company = self.get_company()
        source_type = request.query_params.get('source_type')
        source_id = request.query_params.get('source_id')
        if not source_type or not source_id:
            return Response({'detail': 'source_type and source_id are required.'}, status=status.HTTP_400_BAD_REQUEST)

        data = PurchasingIntegrationService.get_accounting_preview_for_source(company, source_type, source_id)
        return Response(data)

    @action(detail=True, methods=['post'])
    def reclassify_line(self, request, pk=None):
        integration = self.get_object()
        line_id = request.data.get('line_id')
        if not line_id:
            return Response({'detail': 'line_id is required.'}, status=status.HTTP_400_BAD_REQUEST)

        line = integration.lines.filter(id=line_id).first()
        if not line:
            return Response({'detail': 'Line item not found on this integration record.'}, status=status.HTTP_404_NOT_FOUND)

        try:
            PurchasingIntegrationService.reclassify_line(
                line=line,
                debit_account_id=request.data.get('debit_account'),
                credit_account_id=request.data.get('credit_account'),
                cost_center_id=request.data.get('cost_center'),
                profit_center_id=request.data.get('profit_center'),
                site_id=request.data.get('site'),
                user=request.user
            )
            # Re-fetch updated integration
            integration.refresh_from_db()
            return Response({
                'status': 'Line reclassified successfully',
                'integration': self.get_serializer(integration).data
            })
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def refresh_integration(self, request, pk=None):
        integration = self.get_object()
        user = request.user
        try:
            if integration.source_type == 'VENDOR_BILL':
                from purchasing.models import ProcurementDocument
                doc = ProcurementDocument.objects.get(id=integration.source_id, company=integration.company)
                res = PurchasingIntegrationService.integrate_vendor_bill(doc, user=user)
            elif integration.source_type == 'VENDOR_PAYMENT':
                from purchasing.models import VendorPayment
                pay = VendorPayment.objects.get(id=integration.source_id, company=integration.company)
                res = PurchasingIntegrationService.integrate_vendor_payment(pay, user=user)
            elif integration.source_type == 'PURCHASE_RETURN':
                from purchasing.models import PurchaseReturn
                ret = PurchaseReturn.objects.get(id=integration.source_id, company=integration.company)
                res = PurchasingIntegrationService.integrate_purchase_return(ret, user=user)
            elif integration.source_type == 'VENDOR_CREDIT_NOTE':
                from purchasing.models import VendorCreditNote
                cn = VendorCreditNote.objects.get(id=integration.source_id, company=integration.company)
                res = PurchasingIntegrationService.integrate_vendor_credit_note(cn, user=user)
            else:
                return Response({'detail': f"Unknown source type {integration.source_type}"}, status=status.HTTP_400_BAD_REQUEST)

            return Response(self.get_serializer(res).data)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)


# ============================================================================
# PHASE S-4G: PAYROLL -> FINANCE INTEGRATION & SALARY DISBURSEMENT
# ============================================================================

from .models import (
    PayrollAccountingIntegration, PayrollEmployeeFinanceSnapshot, PayrollAccountMapping,
    EmployeePaymentDestination, SalaryPaymentBatch, SalaryPaymentBatchLine, PayrollDisbursementProviderConfig
)
from .serializers import (
    PayrollAccountMappingSerializer, EmployeePaymentDestinationSerializer,
    PayrollEmployeeFinanceSnapshotSerializer, PayrollAccountingIntegrationSerializer,
    SalaryPaymentBatchLineSerializer, SalaryPaymentBatchSerializer,
    PayrollDisbursementProviderConfigSerializer
)
from finance.services.payroll_finance_service import PayrollFinanceService
from hrm.models import PayrollRun


class PayrollAccountMappingViewSet(BaseFinanceViewSet):
    queryset = PayrollAccountMapping.objects.all().select_related(
        'employee', 'designation', 'department', 'salary_expense_account', 'overtime_expense_account', 'cost_center', 'profit_center'
    )
    serializer_class = PayrollAccountMappingSerializer


class EmployeePaymentDestinationViewSet(BaseFinanceViewSet):
    queryset = EmployeePaymentDestination.objects.all().select_related('employee')
    serializer_class = EmployeePaymentDestinationSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        emp_id = self.request.query_params.get('employee')
        if emp_id:
            qs = qs.filter(employee_id=emp_id)
        return qs


class PayrollAccountingIntegrationViewSet(BaseFinanceViewSet):
    queryset = PayrollAccountingIntegration.objects.all().select_related(
        'payroll_run', 'payroll_payable_account', 'tax_payable_account', 'advance_clearing_account'
    ).prefetch_related('employee_snapshots', 'employee_snapshots__employee')
    serializer_class = PayrollAccountingIntegrationSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        status_param = self.request.query_params.get('status')
        if status_param:
            qs = qs.filter(status=status_param)
        return qs

    @action(detail=False, methods=['get'])
    def summary_metrics(self, request):
        company = self.get_company()
        metrics = PayrollFinanceService.get_summary_metrics(company)
        return Response(metrics)

    @action(detail=False, methods=['post'])
    def sync_from_payroll_run(self, request):
        company = self.get_company()
        payroll_run_id = request.data.get('payroll_run_id')

        if payroll_run_id:
            run = PayrollRun.objects.filter(id=payroll_run_id, company=company).first()
            if not run:
                return Response({'detail': 'PayrollRun not found.'}, status=status.HTTP_404_NOT_FOUND)
            try:
                integration = PayrollFinanceService.integrate_payroll_run(run, user=request.user)
                return Response(self.get_serializer(integration).data)
            except Exception as e:
                return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        else:
            # Sync all finalized runs
            finalized_runs = PayrollRun.objects.filter(company=company, status='FINALIZED')
            synced = []
            for r in finalized_runs:
                try:
                    int_obj = PayrollFinanceService.integrate_payroll_run(r, user=request.user)
                    synced.append(int_obj)
                except Exception:
                    pass
            return Response({
                'status': 'Synced finalized payroll runs',
                'total_synced': len(synced),
                'results': self.get_serializer(synced, many=True).data
            })

    @action(detail=True, methods=['get'])
    def preview(self, request, pk=None):
        integration = self.get_object()
        company = self.get_company()
        preview_data = PayrollFinanceService.get_accounting_preview_for_payroll(
            company=company,
            payroll_run_id=str(integration.payroll_run_id)
        )
        return Response(preview_data)

    @action(detail=True, methods=['post'])
    def refresh(self, request, pk=None):
        integration = self.get_object()
        try:
            res = PayrollFinanceService.integrate_payroll_run(integration.payroll_run, user=request.user)
            return Response(self.get_serializer(res).data)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)


class SalaryPaymentBatchViewSet(BaseFinanceViewSet):
    queryset = SalaryPaymentBatch.objects.all().select_related(
        'payroll_integration', 'payroll_integration__payroll_run', 'treasury_account', 'voucher', 'prepared_by', 'approved_by'
    ).prefetch_related('lines', 'lines__employee')
    serializer_class = SalaryPaymentBatchSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        status_param = self.request.query_params.get('status')
        if status_param:
            qs = qs.filter(status=status_param)
        return qs

    @action(detail=False, methods=['post'])
    def create_batch(self, request):
        company = self.get_company()
        integration_id = request.data.get('payroll_integration')
        treasury_account_id = request.data.get('treasury_account')
        payment_date_str = request.data.get('payment_date')
        payment_mode = request.data.get('payment_mode', 'MANUAL')
        payment_provider = request.data.get('payment_provider', 'MANUAL')
        snapshot_ids = request.data.get('selected_snapshot_ids')
        notes = request.data.get('notes', '')

        if not integration_id or not treasury_account_id:
            return Response({'detail': 'payroll_integration and treasury_account are required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            integration = PayrollAccountingIntegration.objects.get(id=integration_id, company=company)
            treasury_acc = BankAccount.objects.get(id=treasury_account_id, company=company)
            payment_date = date.fromisoformat(payment_date_str) if payment_date_str else timezone.now().date()

            batch = PayrollFinanceService.create_salary_payment_batch(
                payroll_integration=integration,
                treasury_account=treasury_acc,
                payment_date=payment_date,
                payment_mode=payment_mode,
                payment_provider=payment_provider,
                selected_snapshot_ids=snapshot_ids,
                notes=notes,
                user=request.user
            )
            return Response(self.get_serializer(batch).data, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def validate_batch(self, request, pk=None):
        batch = self.get_object()
        validation = PayrollFinanceService.validate_batch(batch)
        return Response(validation)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        batch = self.get_object()
        try:
            batch = PayrollFinanceService.approve_batch(batch, user=request.user)
            return Response(self.get_serializer(batch).data)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['get'])
    def export_file(self, request, pk=None):
        batch = self.get_object()
        adapter = request.query_params.get('adapter', 'GENERIC_CSV')
        csv_content = PayrollFinanceService.export_batch_file(batch, adapter=adapter)
        
        from django.http import HttpResponse
        response = HttpResponse(csv_content, content_type='text/csv')
        response['Content-Disposition'] = f'attachment; filename="salary_batch_{batch.batch_number}.csv"'
        return response

    @action(detail=True, methods=['post'])
    def confirm_payments(self, request, pk=None):
        batch = self.get_object()
        line_results = request.data.get('line_results', [])
        try:
            batch = PayrollFinanceService.confirm_manual_payments(batch, line_results=line_results, user=request.user)
            return Response(self.get_serializer(batch).data)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def reverse_line(self, request, pk=None):
        batch = self.get_object()
        line_id = request.data.get('line_id')
        reason = request.data.get('reason', 'Payment reversal requested.')
        if not line_id:
            return Response({'detail': 'line_id is required.'}, status=status.HTTP_400_BAD_REQUEST)

        line = batch.lines.filter(id=line_id).first()
        if not line:
            return Response({'detail': 'Batch line not found.'}, status=status.HTTP_404_NOT_FOUND)

        try:
            PayrollFinanceService.reverse_salary_payment_line(line, reason=reason, user=request.user)
            batch.refresh_from_db()
            return Response(self.get_serializer(batch).data)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)


class PayrollDisbursementProviderConfigViewSet(BaseFinanceViewSet):
    queryset = PayrollDisbursementProviderConfig.objects.all()
    serializer_class = PayrollDisbursementProviderConfigSerializer


# ==============================================================================
# PHASE S-4H: TAX MANAGEMENT VIEWSETS
# ==============================================================================

from .models import (
    TaxAuthority, CompanyTaxProfile, TaxPeriod, TaxTransaction,
    ClientWithholdingCertificate, VendorWithholdingRecord, TaxPaymentVoucher, TaxAdjustment
)
from .serializers import (
    TaxAuthoritySerializer, CompanyTaxProfileSerializer, TaxPeriodSerializer,
    TaxTransactionSerializer, ClientWithholdingCertificateSerializer,
    VendorWithholdingRecordSerializer, TaxPaymentVoucherSerializer, TaxAdjustmentSerializer
)
from .services.tax_service import TaxService


class TaxAuthorityViewSet(BaseFinanceViewSet):
    queryset = TaxAuthority.objects.all()
    serializer_class = TaxAuthoritySerializer
    search_fields = ['name', 'code', 'jurisdiction', 'registration_number']


class CompanyTaxProfileViewSet(BaseFinanceViewSet):
    queryset = CompanyTaxProfile.objects.all()
    serializer_class = CompanyTaxProfileSerializer

    def get_queryset(self):
        company = self.get_company()
        if company:
            return CompanyTaxProfile.objects.filter(company=company)
        return super().get_queryset()

    @action(detail=False, methods=['get'])
    def current(self, request):
        company = self.get_company()
        if not company:
            return Response({'detail': 'Company context required.'}, status=status.HTTP_400_BAD_REQUEST)
        profile, _ = CompanyTaxProfile.objects.get_or_create(company=company)
        return Response(CompanyTaxProfileSerializer(profile).data)


class TaxPeriodViewSet(BaseFinanceViewSet):
    queryset = TaxPeriod.objects.all().select_related('tax_authority')
    serializer_class = TaxPeriodSerializer
    search_fields = ['name', 'acknowledgement_reference']
    filterset_fields = ['status', 'period_type', 'tax_category', 'tax_authority']


class TaxTransactionViewSet(BaseFinanceViewSet):
    queryset = TaxTransaction.objects.all().select_related('tax_code', 'gl_account', 'tax_period')
    serializer_class = TaxTransactionSerializer
    search_fields = ['source_number', 'counterparty_name', 'counterparty_tax_id']
    filterset_fields = ['tax_category', 'source_type', 'direction', 'status', 'is_recoverable']

    @action(detail=False, methods=['get'])
    def summary_metrics(self, request):
        company = self.get_company()
        if not company:
            return Response({'detail': 'Company context required.'}, status=status.HTTP_400_BAD_REQUEST)
        metrics = TaxService.get_tax_summary_metrics(company)
        return Response(metrics)

    @action(detail=False, methods=['post'])
    def sync_all_sources(self, request):
        company = self.get_company()
        if not company:
            return Response({'detail': 'Company context required.'}, status=status.HTTP_400_BAD_REQUEST)
        counts = TaxService.sync_all_source_taxes(company)
        return Response({
            'status': 'Synchronization successful',
            'counts': counts,
            'summary': TaxService.get_tax_summary_metrics(company)
        })


class ClientWithholdingCertificateViewSet(BaseFinanceViewSet):
    queryset = ClientWithholdingCertificate.objects.all().select_related('client', 'client_invoice', 'tax_code', 'tax_period')
    serializer_class = ClientWithholdingCertificateSerializer
    search_fields = ['certificate_number', 'cpr_challan_no', 'client__name']
    filterset_fields = ['verification_status', 'tax_code', 'client']

    @action(detail=True, methods=['post'])
    def verify_certificate(self, request, pk=None):
        cert = self.get_object()
        ver_status = request.data.get('verification_status', 'VERIFIED')
        try:
            cert = TaxService.verify_client_withholding_certificate(cert, status=ver_status, user=request.user)
            return Response(self.get_serializer(cert).data)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)


class VendorWithholdingRecordViewSet(BaseFinanceViewSet):
    queryset = VendorWithholdingRecord.objects.all().select_related('vendor', 'vendor_bill', 'vendor_payment', 'tax_code')
    serializer_class = VendorWithholdingRecordSerializer
    search_fields = ['vendor__name', 'cpr_number', 'certificate_number']
    filterset_fields = ['status', 'tax_code', 'vendor']


class TaxPaymentVoucherViewSet(BaseFinanceViewSet):
    queryset = TaxPaymentVoucher.objects.all().select_related('tax_authority', 'treasury_account', 'tax_period', 'voucher')
    serializer_class = TaxPaymentVoucherSerializer
    search_fields = ['voucher_number', 'challan_number', 'psid_number', 'cpr_number']
    filterset_fields = ['status', 'tax_type', 'tax_authority']

    @action(detail=False, methods=['post'])
    def create_voucher(self, request):
        company = self.get_company()
        if not company:
            return Response({'detail': 'Company context required.'}, status=status.HTTP_400_BAD_REQUEST)

        authority_id = request.data.get('tax_authority')
        account_id = request.data.get('treasury_account')
        amount_raw = request.data.get('amount')
        payment_date = request.data.get('payment_date') or timezone.now().date()
        tax_type = request.data.get('tax_type', 'SALES_TAX')
        tax_period_id = request.data.get('tax_period')
        psid_number = request.data.get('psid_number', '')
        challan_number = request.data.get('challan_number', '')
        notes = request.data.get('notes', '')

        if not authority_id or not account_id or not amount_raw:
            return Response({'detail': 'tax_authority, treasury_account, and amount are required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            authority = TaxAuthority.objects.get(id=authority_id, company=company)
            treasury_acc = BankAccount.objects.get(id=account_id, company=company)
            amount = Decimal(str(amount_raw))
            tax_period = TaxPeriod.objects.get(id=tax_period_id, company=company) if tax_period_id else None

            voucher = TaxService.create_tax_payment_voucher(
                company=company,
                tax_authority=authority,
                treasury_account=treasury_acc,
                amount=amount,
                payment_date=payment_date,
                tax_type=tax_type,
                tax_period=tax_period,
                psid_number=psid_number,
                challan_number=challan_number,
                notes=notes,
                user=request.user
            )
            return Response(self.get_serializer(voucher).data, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        voucher = self.get_object()
        try:
            voucher = TaxService.approve_tax_payment_voucher(voucher, user=request.user)
            return Response(self.get_serializer(voucher).data)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def pay(self, request, pk=None):
        voucher = self.get_object()
        cpr_number = request.data.get('cpr_number', '')
        try:
            voucher = TaxService.pay_tax_payment_voucher(voucher, cpr_number=cpr_number, user=request.user)
            return Response(self.get_serializer(voucher).data)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def mark_filed(self, request, pk=None):
        voucher = self.get_object()
        cpr_number = request.data.get('cpr_number', '')
        try:
            voucher = TaxService.mark_tax_voucher_filed(voucher, cpr_number=cpr_number, user=request.user)
            return Response(self.get_serializer(voucher).data)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)


class TaxAdjustmentViewSet(BaseFinanceViewSet):
    queryset = TaxAdjustment.objects.all().select_related('tax_code', 'tax_period')
    serializer_class = TaxAdjustmentSerializer

    @action(detail=False, methods=['post'])
    def create_adjustment(self, request):
        company = self.get_company()
        if not company:
            return Response({'detail': 'Company context required.'}, status=status.HTTP_400_BAD_REQUEST)

        tax_code_id = request.data.get('tax_code')
        adj_type = request.data.get('adjustment_type')
        amount_raw = request.data.get('amount')
        reason = request.data.get('reason')
        tax_date = request.data.get('tax_date')
        tax_period_id = request.data.get('tax_period')

        if not tax_code_id or not adj_type or not amount_raw or not reason:
            return Response({'detail': 'tax_code, adjustment_type, amount, and reason are required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            tax_code = TaxCode.objects.get(id=tax_code_id, company=company)
            amount = Decimal(str(amount_raw))
            tax_period = TaxPeriod.objects.get(id=tax_period_id, company=company) if tax_period_id else None

            adj = TaxService.create_tax_adjustment(
                company=company,
                tax_code=tax_code,
                adjustment_type=adj_type,
                amount=amount,
                reason=reason,
                tax_date=tax_date,
                tax_period=tax_period,
                user=request.user
            )
            return Response(self.get_serializer(adj).data, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)


# ==============================================================================
# PHASE S-4J: FINANCIAL STATEMENTS & PROFITABILITY VIEWSETS
# ==============================================================================

from .models import AllocationProfile
from .serializers import AllocationProfileSerializer

class AllocationProfileViewSet(BaseFinanceViewSet):
    queryset = AllocationProfile.objects.all().select_related('source_cost_center', 'target_site', 'target_contract', 'target_profit_center')
    serializer_class = AllocationProfileSerializer


class FinancialStatementsViewSet(viewsets.ViewSet):
    """
    Authoritative Financial Statements API.
    P&L, Balance Sheet, Cash Flow, and Statement Validation.
    """
    permission_classes = [permissions.IsAuthenticated]

    def _get_company(self, request):
        company = getattr(request, 'company', None)
        if not company:
            from erp_core.middleware import get_current_company
            cid = get_current_company()
            if cid:
                from companies.models import Company
                company = Company.objects.filter(id=cid).first()
        return company

    @action(detail=False, methods=['get'])
    def profit_and_loss(self, request):
        company = self._get_company(request)
        if not company:
            return Response({'detail': 'Company context required.'}, status=status.HTTP_400_BAD_REQUEST)

        params = request.query_params
        from finance.services.financial_statements_service import FinancialStatementsService
        try:
            data = FinancialStatementsService.get_profit_and_loss(
                company=company,
                start_date=params.get('start_date'),
                end_date=params.get('end_date'),
                compare_start_date=params.get('compare_start_date'),
                compare_end_date=params.get('compare_end_date'),
                cost_center_id=params.get('cost_center_id'),
                profit_center_id=params.get('profit_center_id'),
                client_id=params.get('client_id'),
                contract_id=params.get('contract_id'),
                site_id=params.get('site_id'),
                department=params.get('department'),
            )
            return Response(data)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'])
    def balance_sheet(self, request):
        company = self._get_company(request)
        if not company:
            return Response({'detail': 'Company context required.'}, status=status.HTTP_400_BAD_REQUEST)

        params = request.query_params
        from finance.services.financial_statements_service import FinancialStatementsService
        try:
            data = FinancialStatementsService.get_balance_sheet(
                company=company,
                as_of_date=params.get('as_of_date'),
                cost_center_id=params.get('cost_center_id'),
                profit_center_id=params.get('profit_center_id'),
                client_id=params.get('client_id'),
                contract_id=params.get('contract_id'),
                site_id=params.get('site_id'),
            )
            return Response(data)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'])
    def cash_flow(self, request):
        company = self._get_company(request)
        if not company:
            return Response({'detail': 'Company context required.'}, status=status.HTTP_400_BAD_REQUEST)

        params = request.query_params
        from finance.services.financial_statements_service import FinancialStatementsService
        try:
            data = FinancialStatementsService.get_cash_flow_statement(
                company=company,
                start_date=params.get('start_date'),
                end_date=params.get('end_date'),
            )
            return Response(data)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'])
    def statement_validation(self, request):
        company = self._get_company(request)
        if not company:
            return Response({'detail': 'Company context required.'}, status=status.HTTP_400_BAD_REQUEST)

        as_of_date = request.query_params.get('as_of_date')
        from finance.services.financial_statements_service import FinancialStatementsService
        try:
            data = FinancialStatementsService.validate_statements(company=company, as_of_date=as_of_date)
            return Response(data)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)


class ProfitabilityViewSet(viewsets.ViewSet):
    """
    Authoritative Profitability & Cost Analysis API.
    Client, Contract, Site, Cost Center, Profit Center, Overhead Allocation, and Exceptions.
    """
    permission_classes = [permissions.IsAuthenticated]

    def _get_company(self, request):
        company = getattr(request, 'company', None)
        if not company:
            from erp_core.middleware import get_current_company
            cid = get_current_company()
            if cid:
                from companies.models import Company
                company = Company.objects.filter(id=cid).first()
        return company

    @action(detail=False, methods=['get'])
    def clients(self, request):
        company = self._get_company(request)
        if not company:
            return Response({'detail': 'Company context required.'}, status=status.HTTP_400_BAD_REQUEST)

        params = request.query_params
        from finance.services.profitability_service import ProfitabilityService
        try:
            data = ProfitabilityService.get_client_profitability(
                company=company,
                start_date=params.get('start_date'),
                end_date=params.get('end_date'),
                client_id=params.get('client_id')
            )
            return Response(data)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'])
    def contracts(self, request):
        company = self._get_company(request)
        if not company:
            return Response({'detail': 'Company context required.'}, status=status.HTTP_400_BAD_REQUEST)

        params = request.query_params
        from finance.services.profitability_service import ProfitabilityService
        try:
            data = ProfitabilityService.get_contract_profitability(
                company=company,
                start_date=params.get('start_date'),
                end_date=params.get('end_date'),
                contract_id=params.get('contract_id'),
                client_id=params.get('client_id')
            )
            return Response(data)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'])
    def sites(self, request):
        company = self._get_company(request)
        if not company:
            return Response({'detail': 'Company context required.'}, status=status.HTTP_400_BAD_REQUEST)

        params = request.query_params
        from finance.services.profitability_service import ProfitabilityService
        try:
            data = ProfitabilityService.get_site_profitability(
                company=company,
                start_date=params.get('start_date'),
                end_date=params.get('end_date'),
                site_id=params.get('site_id'),
                contract_id=params.get('contract_id'),
                client_id=params.get('client_id')
            )
            return Response(data)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'])
    def unattributed_lines(self, request):
        company = self._get_company(request)
        if not company:
            return Response({'detail': 'Company context required.'}, status=status.HTTP_400_BAD_REQUEST)

        params = request.query_params
        from finance.services.profitability_service import ProfitabilityService
        try:
            data = ProfitabilityService.get_unattributed_financial_lines(
                company=company,
                start_date=params.get('start_date'),
                end_date=params.get('end_date')
            )
            return Response(data)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'])
    def drilldown(self, request):
        company = self._get_company(request)
        if not company:
            return Response({'detail': 'Company context required.'}, status=status.HTTP_400_BAD_REQUEST)

        params = request.query_params
        from finance.services.profitability_service import ProfitabilityService
        try:
            data = ProfitabilityService.get_profitability_drilldown(
                company=company,
                site_id=params.get('site_id'),
                contract_id=params.get('contract_id'),
                client_id=params.get('client_id'),
                account_id=params.get('account_id')
            )
            return Response(data)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)


class CashCountViewSet(BaseFinanceViewSet):
    from finance.models import CashCount
    from finance.serializers import CashCountSerializer
    queryset = CashCount.objects.all().select_related('cash_account', 'counted_by', 'reviewed_by').order_by('-count_date')
    serializer_class = CashCountSerializer

    @action(detail=False, methods=['post'], url_path='perform-count')
    def perform_count(self, request):
        company = self._get_company(request)
        cash_account_id = request.data.get('cash_account')
        count_date_str = request.data.get('count_date')
        physical_count = Decimal(str(request.data.get('physical_count', 0)))
        reason = request.data.get('variance_reason', '')

        from finance.models import BankAccount
        cash_account = BankAccount.objects.get(id=cash_account_id, company=company)

        from datetime import datetime
        c_date = datetime.strptime(count_date_str, '%Y-%m-%d').date() if count_date_str else date.today()

        from finance.services.cash_reconciliation_service import CashReconciliationService
        try:
            count_obj = CashReconciliationService.perform_cash_count(
                cash_account=cash_account,
                count_date=c_date,
                physical_count=physical_count,
                counted_by=request.user,
                variance_reason=reason
            )
            return Response(self.get_serializer(count_obj).data, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)


class SubledgerReconciliationViewSet(BaseFinanceViewSet):
    from finance.models import SubledgerReconciliationSnapshot
    from finance.serializers import SubledgerReconciliationSnapshotSerializer
    queryset = SubledgerReconciliationSnapshot.objects.all().select_related('period').order_by('-snapshot_date')
    serializer_class = SubledgerReconciliationSnapshotSerializer

    @action(detail=False, methods=['get'])
    def summary(self, request):
        company = self._get_company(request)
        period_id = request.query_params.get('period_id')
        period = None
        if period_id:
            from finance.models import AccountingPeriod
            period = AccountingPeriod.objects.get(id=period_id, company=company)

        from finance.services.subledger_reconciliation_service import SubledgerReconciliationService
        try:
            data = SubledgerReconciliationService.get_subledger_reconciliation_summary(company=company, period=period)
            return Response(data)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'], url_path='create-snapshot')
    def create_snapshot(self, request):
        company = self._get_company(request)
        period_id = request.data.get('period_id')
        from finance.models import AccountingPeriod
        period = AccountingPeriod.objects.get(id=period_id, company=company)

        from finance.services.subledger_reconciliation_service import SubledgerReconciliationService
        try:
            snapshot = SubledgerReconciliationService.create_subledger_snapshot(period=period)
            return Response(self.get_serializer(snapshot).data, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)


class ControlExceptionViewSet(BaseFinanceViewSet):
    from finance.models import ControlException
    from finance.serializers import ControlExceptionSerializer
    queryset = ControlException.objects.all().select_related('period', 'resolved_by').order_by('-created_at')
    serializer_class = ControlExceptionSerializer

    @action(detail=True, methods=['post'], url_path='resolve')
    def resolve_exception(self, request, pk=None):
        exc = self.get_object()
        explanation = request.data.get('explanation', '')
        accept = request.data.get('explicitly_accept', False)

        from finance.models import ControlExceptionStatus
        exc.status = ControlExceptionStatus.EXPLICITLY_ACCEPTED if accept else ControlExceptionStatus.RESOLVED
        exc.resolved_by = request.user
        exc.resolved_at = timezone.now()
        exc.resolution_explanation = explanation
        exc.save()

        return Response(self.get_serializer(exc).data)


class YearEndClosingViewSet(BaseFinanceViewSet):
    queryset = JournalEntry.objects.filter(source_type='YEAR_END_CLOSE')
    serializer_class = JournalEntrySerializer

    @action(detail=False, methods=['get'])
    def readiness(self, request):
        company = self._get_company(request)
        fy_id = request.query_params.get('fiscal_year_id')
        from finance.models import FiscalYear
        if fy_id:
            fy = FiscalYear.objects.get(id=fy_id, company=company)
        else:
            fy = FiscalYear.objects.filter(company=company, is_current=True).first()

        if not fy:
            return Response({'detail': 'No fiscal year specified or active.'}, status=status.HTTP_400_BAD_REQUEST)

        from finance.services.year_end_closing_service import YearEndClosingService
        try:
            data = YearEndClosingService.get_year_end_readiness(fiscal_year=fy)
            return Response(data)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'], url_path='close-year')
    def close_year(self, request):
        company = self._get_company(request)
        fy_id = request.data.get('fiscal_year_id')
        from finance.models import FiscalYear
        fy = FiscalYear.objects.get(id=fy_id, company=company)

        from finance.services.year_end_closing_service import YearEndClosingService
        try:
            je = YearEndClosingService.create_year_end_closing_journal(fiscal_year=fy, user=request.user)
            return Response({'status': 'Year-End Closing Journal posted successfully', 'journal_entry': self.get_serializer(je).data})
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)


class ExecutiveFinanceDashboardViewSet(BaseFinanceViewSet):
    """
    Consolidated Executive Finance Dashboard API ViewSet.
    Serves live KPIs, health summary, trend analytics, sub-module snapshots, and finance action center queue.
    """
    queryset = JournalEntry.objects.none()
    serializer_class = JournalEntrySerializer

    @action(detail=False, methods=['get'])
    def overview(self, request):
        company = self._get_company(request)
        s_date_str = request.query_params.get('start_date')
        e_date_str = request.query_params.get('end_date')

        from datetime import datetime
        start_date = datetime.strptime(s_date_str, '%Y-%m-%d').date() if s_date_str else None
        end_date = datetime.strptime(e_date_str, '%Y-%m-%d').date() if e_date_str else None

        from finance.services.executive_dashboard_service import ExecutiveFinanceDashboardService
        try:
            data = ExecutiveFinanceDashboardService.get_executive_dashboard(company, start_date=start_date, end_date=end_date)
            return Response(data)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'], url_path='financial-health')
    def financial_health(self, request):
        company = self._get_company(request)
        from finance.services.executive_dashboard_service import ExecutiveFinanceDashboardService
        try:
            data = ExecutiveFinanceDashboardService.get_financial_health_summary(company)
            return Response(data)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'])
    def trends(self, request):
        company = self._get_company(request)
        from finance.services.executive_dashboard_service import ExecutiveFinanceDashboardService
        try:
            data = ExecutiveFinanceDashboardService.get_revenue_expense_trend(company)
            return Response(data)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'], url_path='receivables-snapshot')
    def receivables_snapshot(self, request):
        company = self._get_company(request)
        from finance.services.executive_dashboard_service import ExecutiveFinanceDashboardService
        try:
            data = ExecutiveFinanceDashboardService.get_receivables_snapshot(company)
            return Response(data)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'], url_path='payables-snapshot')
    def payables_snapshot(self, request):
        company = self._get_company(request)
        from finance.services.executive_dashboard_service import ExecutiveFinanceDashboardService
        try:
            data = ExecutiveFinanceDashboardService.get_payables_snapshot(company)
            return Response(data)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'], url_path='payroll-snapshot')
    def payroll_snapshot(self, request):
        company = self._get_company(request)
        from finance.services.executive_dashboard_service import ExecutiveFinanceDashboardService
        try:
            data = ExecutiveFinanceDashboardService.get_payroll_snapshot(company)
            return Response(data)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'], url_path='tax-snapshot')
    def tax_snapshot(self, request):
        company = self._get_company(request)
        from finance.services.executive_dashboard_service import ExecutiveFinanceDashboardService
        try:
            data = ExecutiveFinanceDashboardService.get_tax_snapshot(company)
            return Response(data)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'], url_path='treasury-snapshot')
    def treasury_snapshot(self, request):
        company = self._get_company(request)
        from finance.services.executive_dashboard_service import ExecutiveFinanceDashboardService
        try:
            data = ExecutiveFinanceDashboardService.get_treasury_snapshot(company)
            return Response(data)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'], url_path='profitability-snapshot')
    def profitability_snapshot(self, request):
        company = self._get_company(request)
        from finance.services.executive_dashboard_service import ExecutiveFinanceDashboardService
        try:
            data = ExecutiveFinanceDashboardService.get_profitability_snapshot(company)
            return Response(data)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'], url_path='accounting-health')
    def accounting_health(self, request):
        company = self._get_company(request)
        from finance.services.executive_dashboard_service import ExecutiveFinanceDashboardService
        try:
            data = ExecutiveFinanceDashboardService.get_accounting_health(company)
            return Response(data)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'], url_path='action-center')
    def action_center(self, request):
        company = self._get_company(request)
        from finance.services.executive_dashboard_service import ExecutiveFinanceDashboardService
        try:
            data = ExecutiveFinanceDashboardService.get_action_center(company)
            return Response(data)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)


