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
        company_id = (
            get_current_company()
            or (self.request.META.get('HTTP_X_COMPANY_ID') if hasattr(self.request, 'META') else None)
            or getattr(self.request.user, 'company_id', None)
        )
        if company_id:
            comp = Company.objects.filter(id=company_id).first()
            if comp:
                return comp
        if hasattr(self.request.user, 'company') and self.request.user.company:
            return self.request.user.company
        if getattr(self.request.user, 'is_superuser', False):
            from platform_core.views import _get_company_for_user
            comp, _ = _get_company_for_user(self.request)
            if comp:
                return comp
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

    @staticmethod
    def _resolve_payroll_month(company, month_str=None):
        import calendar
        from datetime import date
        from django.utils import timezone
        from hrm.models import PayrollRun
        from operations.models import DailyDutyPay

        today = timezone.now().date()
        current_month = f"{today.year}-{today.month:02d}"
        previous_month = f"{today.year - 1}-12" if today.month == 1 else f"{today.year}-{today.month - 1:02d}"

        month_set = {current_month, previous_month}
        try:
            for d in DailyDutyPay.objects.filter(company=company, is_deleted=False).dates('duty_date', 'month', order='DESC')[:12]:
                month_set.add(f"{d.year}-{d.month:02d}")
            for pr in PayrollRun.objects.filter(company=company, is_deleted=False).values_list('payroll_month', flat=True)[:12]:
                if pr and len(str(pr)) == 7:
                    month_set.add(str(pr))
        except Exception:
            pass
        available_months = sorted(month_set, reverse=True)

        chosen = (month_str or '').strip()
        if not chosen or chosen.upper() == 'AUTO':
            from django.db.models import Q
            curr_yr, curr_mo = map(int, current_month.split('-'))
            prev_yr, prev_mo = map(int, previous_month.split('-'))
            worked_q = Q(daily_pay_amount__gt=0) | Q(
                attendance_status__in=[
                    'PRESENT', 'P', 'OVERTIME', 'O', 'OVERTIME_DOZING', 'OD',
                    'WORKED_WEEKLY_OFF', 'WP', 'HALF_DAY', 'HD', 'DOUBLE_SHIFT', 'PO', 'POD'
                ]
            )
            has_curr = DailyDutyPay.objects.filter(
                company=company, duty_date__year=curr_yr, duty_date__month=curr_mo, is_deleted=False
            ).filter(worked_q).exists()
            has_prev = DailyDutyPay.objects.filter(
                company=company, duty_date__year=prev_yr, duty_date__month=prev_mo, is_deleted=False
            ).filter(worked_q).exists()
            chosen = previous_month if (has_prev and not has_curr) else current_month

        try:
            year, month = map(int, chosen.split('-'))
            days_in_month = calendar.monthrange(year, month)[1]
        except Exception:
            year, month = today.year, today.month
            days_in_month = calendar.monthrange(year, month)[1]
            chosen = f"{year}-{month:02d}"

        period_start = date(year, month, 1)
        period_end = date(year, month, days_in_month)
        return chosen, current_month, previous_month, available_months, period_start, period_end, days_in_month

    @action(detail=False, methods=['get'], url_path='live-attendance-salaries')
    def live_attendance_salaries(self, request):
        """
        GET /api/finance/payroll-integrations/live-attendance-salaries/?month=YYYY-MM
        High-performance read-only bulk aggregator for guard/employee attendance salaries
        from Operations (DailyDutyPay + Overtime + Additions/Deductions/Statutory/Advances),
        merging any already-finalized Finance snapshots & payment statuses without per-row writes.
        """
        from collections import defaultdict
        from decimal import Decimal, ROUND_HALF_UP
        from django.db.models import Q
        from django.utils import timezone
        from hrm.models import (
            Employee, AttendanceStatus, EmployeeSalaryAssignment, CompanyPayrollPolicy,
            StatutoryScheme, StatutorySchemeType, StatutoryRule, StatutorySchemeRateHistory,
            EmployeeStatutoryEnrollment, OvertimeRecord, OvertimeStatus, OvertimeType
        )
        from operations.models import (
            DailyDutyPay, DutyType, DailyPayCalculationStatus, Deployment,
            EmployeePayrollCalculation, PayrollAddition, PayrollAdditionType,
            PayrollAdditionFrequency, PayrollDeduction, PayrollDeductionType,
            PayrollDeductionFrequency
        )
        from finance.models import (
            SalaryPaymentBatchLine, SalaryPaymentLineStatus, EmployeePaymentDestination,
            EmployeeAdvance, AdvanceStatus, AdvanceRecoveryMethod
        )
        from finance.services.period_service import ensure_open_period_and_foundation

        def _q2(val):
            if val is None:
                return Decimal('0.00')
            d = Decimal(str(val)) if not isinstance(val, Decimal) else val
            return d.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

        company = self.get_company()
        month_param = request.query_params.get('month')
        (
            selected_month, current_month, previous_month, available_months,
            period_start, period_end, _days_in_month
        ) = self._resolve_payroll_month(company, month_param)

        ensure_open_period_and_foundation(company, period_end)
        ensure_open_period_and_foundation(company, timezone.now().date())

        # 1. Fetch lightweight values from DailyDutyPay (no heavy model hydration)
        ot_statuses = {'OVERTIME', 'O', 'OVERTIME_DOZING', 'OD'}
        absent_statuses = {AttendanceStatus.ABSENT, 'ABSENT', 'A', AttendanceStatus.UNPAID_LEAVE, 'UNPAID_LEAVE'}

        dp_stats_by_emp = {}
        sites_by_emp = defaultdict(set)
        dp_rows = DailyDutyPay.objects.filter(
            company=company, duty_date__gte=period_start, duty_date__lte=period_end, is_deleted=False
        ).values(
            'employee_id', 'site__name', 'duty_type', 'attendance_status',
            'payable_amount', 'daily_payable_rate', 'calculation_status',
            'unresolved_reason', 'duty_date'
        )
        for dp in dp_rows:
            eid = str(dp['employee_id'])
            if dp['site__name']:
                sites_by_emp[eid].add(dp['site__name'])
            st_stats = dp_stats_by_emp.get(eid)
            if st_stats is None:
                st_stats = {
                    'present_days': 0,
                    'ot_shifts': 0,
                    'raw_duty_earnings': Decimal('0.00'),
                    'raw_ot_earnings': Decimal('0.00'),
                    'blockers': [],
                }
                dp_stats_by_emp[eid] = st_stats

            amt = _q2(dp['payable_amount'])
            rate = _q2(dp['daily_payable_rate'])
            att_st = str(dp['attendance_status'] or '').upper()
            if (
                dp['calculation_status'] == DailyPayCalculationStatus.UNRESOLVED
                or (rate <= Decimal('0.00') and att_st not in absent_statuses)
            ):
                if len(st_stats['blockers']) < 3:
                    reason = dp['unresolved_reason'] or 'Missing rate setup'
                    st_stats['blockers'].append(f"Unresolved daily duty pay on {dp['duty_date']}: {reason}")

            if dp['duty_type'] == DutyType.OVERTIME or att_st in ot_statuses:
                st_stats['ot_shifts'] += 1
                st_stats['raw_ot_earnings'] += amt
            else:
                if att_st not in absent_statuses:
                    st_stats['present_days'] += 1
                st_stats['raw_duty_earnings'] += amt

        # 2. Existing finalized PayrollAccountingIntegration snapshots covering this month
        matching_integrations = list(PayrollAccountingIntegration.objects.filter(
            company=company,
            is_deleted=False,
            payroll_run__period_start__lte=period_end,
            payroll_run__period_end__gte=period_start,
        ).select_related('payroll_run').order_by('-created_at'))

        snaps_by_emp = {}
        snap_ids = []
        primary_integration = matching_integrations[0] if matching_integrations else None
        for integ in matching_integrations:
            for snap in integ.employee_snapshots.filter(is_deleted=False).select_related(
                'employee', 'employee__designation', 'department', 'payslip'
            ):
                eid = str(snap.employee_id)
                if eid not in snaps_by_emp:
                    snaps_by_emp[eid] = (integ, snap)
                    snap_ids.append(snap.id)

        paid_lines_by_snap = {}
        if snap_ids:
            for bl in SalaryPaymentBatchLine.objects.filter(
                company=company, employee_snapshot_id__in=snap_ids,
                status=SalaryPaymentLineStatus.SUCCESS, is_deleted=False
            ).select_related('batch'):
                paid_lines_by_snap[str(bl.employee_snapshot_id)] = bl

        # Active deployments for site fallback (values_list avoids ORM overhead)
        for emp_id_val, s_name in Deployment.objects.filter(
            company=company, is_deleted=False, status='ACTIVE', site__isnull=False
        ).values_list('employee_id', 'site__name'):
            if s_name:
                sites_by_emp[str(emp_id_val)].add(s_name)

        all_emp_ids = set(dp_stats_by_emp.keys()) | set(snaps_by_emp.keys())
        emp_id_list = list(all_emp_ids)
        employees_map = {
            str(e.id): e for e in Employee.objects.filter(
                company=company, id__in=emp_id_list, is_deleted=False
            ).select_related('designation', 'department')
        }

        # Destinations & Outstanding Advances
        dest_by_emp = {}
        for d in EmployeePaymentDestination.objects.filter(
            company=company, employee_id__in=emp_id_list, is_active=True, is_deleted=False
        ).order_by('-is_preferred'):
            eid = str(d.employee_id)
            if eid not in dest_by_emp:
                dest_by_emp[eid] = d

        adv_by_emp = defaultdict(Decimal)
        auto_adv_by_emp = defaultdict(list)
        for adv_id, adv_emp_id, adv_num, adv_bal, adv_st, adv_method, adv_ready in EmployeeAdvance.objects.filter(
            company=company, employee_id__in=emp_id_list,
            status=AdvanceStatus.PAID, is_deleted=False
        ).values_list(
            'id', 'employee_id', 'advance_number', 'outstanding_balance',
            'status', 'recovery_method', 'payroll_deduction_ready'
        ):
            bal = Decimal(str(adv_bal or 0))
            eid = str(adv_emp_id)
            adv_by_emp[eid] += bal
            if (
                adv_ready
                and bal > Decimal('0.00')
                and adv_method in (AdvanceRecoveryMethod.PAYROLL_DEDUCTION, AdvanceRecoveryMethod.MIXED)
            ):
                auto_adv_by_emp[eid].append((adv_id, adv_num, bal))

        # Existing calculations map
        existing_calcs = {
            str(c.employee_id): c for c in EmployeePayrollCalculation.objects.filter(
                company=company, employee_id__in=emp_id_list,
                period_start=period_start, period_end=period_end, is_deleted=False
            )
        }

        # 3. Bulk prefetch non-finalized/non-frozen payroll rule inputs in ~7 queries total (instead of 10,000+)
        eval_emp_ids = [
            eid for eid in emp_id_list
            if eid not in snaps_by_emp and not (existing_calcs.get(eid) and existing_calcs[eid].is_frozen)
        ]

        comp_by_emp = {}
        policy = None
        overtimes_by_emp = defaultdict(list)
        additions_by_emp = defaultdict(list)
        deductions_by_emp = defaultdict(list)
        adv_deductions_by_emp = defaultdict(list)
        statutory_schemes = []
        stat_rules_by_scheme = {}
        stat_hist_by_scheme = {}
        stat_enroll_by_emp_scheme = {}

        if eval_emp_ids:
            policy = CompanyPayrollPolicy.objects.filter(company=company, is_active=True).first()

            comp_fallback = {}
            for sa in EmployeeSalaryAssignment.objects.filter(
                company=company, employee_id__in=eval_emp_ids, status='ACTIVE', is_deleted=False
            ).order_by('-effective_from'):
                seid = str(sa.employee_id)
                if seid not in comp_fallback:
                    comp_fallback[seid] = sa
                if sa.effective_from <= period_end and (sa.effective_to is None or sa.effective_to >= period_end):
                    if seid not in comp_by_emp:
                        comp_by_emp[seid] = sa
            for seid, sa in comp_fallback.items():
                if seid not in comp_by_emp:
                    comp_by_emp[seid] = sa

            for ot in OvertimeRecord.objects.filter(
                company=company, employee_id__in=eval_emp_ids,
                date__gte=period_start, date__lte=period_end,
                status=OvertimeStatus.APPROVED, is_deleted=False
            ).order_by('date'):
                overtimes_by_emp[str(ot.employee_id)].append(ot)

            for add in PayrollAddition.objects.filter(
                company=company, employee_id__in=eval_emp_ids,
                is_active=True, is_approved=True, is_deleted=False
            ).filter(
                (Q(frequency=PayrollAdditionFrequency.ONE_TIME) & Q(effective_date__gte=period_start) & Q(effective_date__lte=period_end)) |
                (Q(frequency=PayrollAdditionFrequency.RECURRING) & Q(effective_from__lte=period_end) & (Q(effective_to__isnull=True) | Q(effective_to__gte=period_start)))
            ).values('employee_id', 'addition_type', 'amount'):
                additions_by_emp[str(add['employee_id'])].append(add)

            for ded in PayrollDeduction.objects.filter(
                company=company, employee_id__in=eval_emp_ids,
                is_active=True, is_approved=True, is_deleted=False
            ).filter(
                (Q(frequency=PayrollDeductionFrequency.ONE_TIME) & Q(effective_date__gte=period_start) & Q(effective_date__lte=period_end)) |
                (Q(frequency=PayrollDeductionFrequency.RECURRING) & Q(effective_from__lte=period_end) & (Q(effective_to__isnull=True) | Q(effective_to__gte=period_start)))
            ).values('employee_id', 'deduction_type', 'amount', 'advance_id', 'advance__advance_number', 'advance__outstanding_balance'):
                deid = str(ded['employee_id'])
                if ded['deduction_type'] == PayrollDeductionType.ADVANCE_RECOVERY:
                    adv_deductions_by_emp[deid].append(ded)
                else:
                    deductions_by_emp[deid].append(ded)

            statutory_schemes = list(StatutoryScheme.objects.filter(
                company=company, is_active=True, is_deleted=False
            ))
            if statutory_schemes:
                scheme_ids = [s.id for s in statutory_schemes]
                for rule in StatutoryRule.objects.filter(
                    company=company, scheme_id__in=scheme_ids,
                    effective_from__lte=period_end, is_deleted=False
                ).filter(
                    Q(effective_to__isnull=True) | Q(effective_to__gte=period_start)
                ).order_by('-effective_from'):
                    if rule.scheme_id not in stat_rules_by_scheme:
                        stat_rules_by_scheme[rule.scheme_id] = rule

                for rh in StatutorySchemeRateHistory.objects.filter(
                    company=company, scheme_id__in=scheme_ids,
                    effective_from__lte=period_end, is_deleted=False
                ).filter(
                    Q(effective_to__isnull=True) | Q(effective_to__gte=period_end)
                ).order_by('-effective_from'):
                    if rh.scheme_id not in stat_hist_by_scheme:
                        stat_hist_by_scheme[rh.scheme_id] = rh

                for enr in EmployeeStatutoryEnrollment.objects.filter(
                    company=company, employee_id__in=eval_emp_ids,
                    scheme_id__in=scheme_ids, is_deleted=False
                ):
                    key = (str(enr.employee_id), enr.scheme_id)
                    if key not in stat_enroll_by_emp_scheme:
                        stat_enroll_by_emp_scheme[key] = enr

        rows = []
        total_gross = Decimal('0.00')
        total_deductions = Decimal('0.00')
        total_net = Decimal('0.00')
        total_paid = Decimal('0.00')
        paid_count = 0
        unpaid_count = 0
        all_finalized = bool(snaps_by_emp) and len(snaps_by_emp) >= len(all_emp_ids)

        for eid in sorted(all_emp_ids, key=lambda x: (employees_map[x].first_name if x in employees_map else '').lower()):
            emp = employees_map.get(eid)
            if not emp:
                continue

            dp_st = dp_stats_by_emp.get(eid)
            present_days = dp_st['present_days'] if dp_st else 0
            ot_shifts = dp_st['ot_shifts'] if dp_st else 0
            raw_duty_earnings = dp_st['raw_duty_earnings'] if dp_st else Decimal('0.00')
            raw_ot_earnings = dp_st['raw_ot_earnings'] if dp_st else Decimal('0.00')

            snap_pair = snaps_by_emp.get(eid)
            calc = existing_calcs.get(eid)

            if snap_pair:
                integ, snap = snap_pair
                gross = _q2(snap.gross_earnings)
                ot_amt = _q2(snap.overtime_pay)
                allowances = _q2(snap.allowances)
                deductions = (_q2(snap.deductions) + _q2(snap.tax_amount)).quantize(Decimal('0.01'))
                adv_rec = _q2(snap.advance_recovery)
                net_salary = _q2(snap.net_salary)
                duty_earnings = max(Decimal('0.00'), gross - ot_amt - allowances).quantize(Decimal('0.01'))
                payment_status = snap.payment_status
                is_finalized_emp = True
                snapshot_id = str(snap.id)
                integ_id = str(integ.id)
                bl = paid_lines_by_snap.get(snapshot_id)
                pay_ref = bl.payment_reference if bl else ''
                batch_no = bl.batch.batch_number if (bl and bl.batch) else ''
                paid_at = bl.processed_at.isoformat() if (bl and bl.processed_at) else None
                blockers = []
            elif calc and calc.is_frozen:
                all_finalized = False
                is_finalized_emp = False
                snapshot_id = None
                integ_id = None
                payment_status = 'UNPAID'
                pay_ref = ''
                batch_no = ''
                paid_at = None
                duty_earnings = _q2(calc.duty_earnings)
                ot_amt = _q2(calc.total_ot_amount)
                allowances = (_q2(calc.allowances_amount) + _q2(calc.bonuses_amount) + _q2(calc.other_additions_amount)).quantize(Decimal('0.01'))
                gross = _q2(calc.gross_earnings)
                deductions = _q2(calc.total_deductions)
                adv_rec = _q2(calc.advance_recovery_amount)
                net_salary = _q2(calc.net_payable)
                present_days = calc.duty_days_count or present_days
                blockers = list(calc.blocking_reasons or []) if calc.has_blockers else []
            else:
                all_finalized = False
                is_finalized_emp = False
                snapshot_id = None
                integ_id = None
                payment_status = 'UNPAID'
                pay_ref = ''
                batch_no = ''
                paid_at = None

                # Live read-only in-memory calculation matching PayrollRulesService invariants
                blockers = list(dp_st['blockers']) if dp_st else []
                duty_earnings = _q2(raw_duty_earnings)
                comp_assignment = comp_by_emp.get(eid)
                if not comp_assignment and present_days == 0:
                    blockers.append("No active salary assignment or duty attendance found for employee.")

                single_ot_amt = Decimal('0.00')
                double_ot_amt = Decimal('0.00')
                for ot in overtimes_by_emp.get(eid, ()):
                    hrs = _q2(ot.hours)
                    is_double = (ot.ot_type == OvertimeType.DOUBLE_OT)
                    if ot.rate_override and ot.rate_override > Decimal('0.00'):
                        ot_rate = _q2(ot.rate_override)
                    elif comp_assignment and is_double and comp_assignment.double_ot_rate and comp_assignment.double_ot_rate > Decimal('0.00'):
                        ot_rate = _q2(comp_assignment.double_ot_rate)
                    elif comp_assignment and (not is_double) and comp_assignment.single_ot_rate and comp_assignment.single_ot_rate > Decimal('0.00'):
                        ot_rate = _q2(comp_assignment.single_ot_rate)
                    elif comp_assignment and is_double and comp_assignment.single_ot_rate and comp_assignment.single_ot_rate > Decimal('0.00') and (not (policy and getattr(policy, 'default_double_ot_rate', None))):
                        ot_rate = _q2(comp_assignment.single_ot_rate * Decimal('2.00'))
                    elif policy and is_double and getattr(policy, 'default_double_ot_rate', None) and policy.default_double_ot_rate > Decimal('0.00'):
                        ot_rate = _q2(policy.default_double_ot_rate)
                    elif policy and (not is_double) and getattr(policy, 'default_single_ot_rate', None) and policy.default_single_ot_rate > Decimal('0.00'):
                        ot_rate = _q2(policy.default_single_ot_rate)
                    elif policy and getattr(policy, 'enable_policy_ot_fallback', False) and comp_assignment and comp_assignment.base_salary > Decimal('0.00'):
                        std_hours = policy.standard_monthly_hours if policy.standard_monthly_hours > Decimal('0.00') else Decimal('160.00')
                        mult = policy.overtime_multiplier * (Decimal('2.00') if is_double else Decimal('1.00'))
                        ot_rate = _q2((comp_assignment.base_salary / std_hours) * mult)
                    else:
                        ot_rate = Decimal('0.00')
                        ot_type_name = "Double OT" if is_double else "Single OT"
                        blockers.append(f"Missing overtime rate for {ot_type_name} on {ot.date}.")

                    amt = _q2(hrs * ot_rate)
                    if is_double:
                        double_ot_amt += amt
                    else:
                        single_ot_amt += amt

                ot_amt = _q2(single_ot_amt + double_ot_amt + raw_ot_earnings)

                allowances_sum = Decimal('0.00')
                bonuses_sum = Decimal('0.00')
                other_add_sum = Decimal('0.00')
                for add in additions_by_emp.get(eid, ()):
                    a_amt = _q2(add['amount'])
                    if add['addition_type'] == PayrollAdditionType.ALLOWANCE:
                        allowances_sum += a_amt
                    elif add['addition_type'] == PayrollAdditionType.BONUS:
                        bonuses_sum += a_amt
                    else:
                        other_add_sum += a_amt
                allowances = _q2(allowances_sum + bonuses_sum + other_add_sum)

                gross = _q2(duty_earnings + ot_amt + allowances)

                stat_total = Decimal('0.00')
                if statutory_schemes:
                    stat_base = duty_earnings if duty_earnings > Decimal('0.00') else (comp_assignment.base_salary if comp_assignment else Decimal('0.00'))
                    for scheme in statutory_schemes:
                        enr = stat_enroll_by_emp_scheme.get((eid, scheme.id))
                        if not enr or not enr.is_enabled or not enr.is_active:
                            continue
                        if not enr.use_company_default and (enr.employee_rate_override is not None or enr.employer_rate_override is not None):
                            emp_rate = enr.employee_rate_override if enr.employee_rate_override is not None else Decimal('0.00')
                        else:
                            rh = stat_hist_by_scheme.get(scheme.id)
                            emp_rate = rh.employee_default_rate if rh else scheme.employee_default_rate

                        rule = stat_rules_by_scheme.get(scheme.id)
                        if rule and rule.is_flat_amount:
                            sch_emp_amt = _q2(rule.employee_rate if emp_rate == 0 else emp_rate)
                        else:
                            basis = stat_base
                            if rule and rule.wage_ceiling and basis > rule.wage_ceiling:
                                basis = rule.wage_ceiling
                            if rule and rule.wage_floor and basis < rule.wage_floor:
                                basis = rule.wage_floor
                            sch_emp_amt = _q2(basis * (emp_rate / Decimal('100.00')))
                        stat_total += sch_emp_amt

                other_ded_sum = Decimal('0.00')
                for ded in deductions_by_emp.get(eid, ()):
                    other_ded_sum += _q2(ded['amount'])

                adv_rec = Decimal('0.00')
                explicit_adv_ids = set()
                for adv_ded in adv_deductions_by_emp.get(eid, ()):
                    req_amt = _q2(adv_ded['amount'])
                    adv_id = adv_ded['advance_id']
                    if adv_id:
                        explicit_adv_ids.add(adv_id)
                        out_bal = Decimal(str(adv_ded['advance__outstanding_balance'] or 0))
                        if out_bal <= Decimal('0.00'):
                            blockers.append(f"Advance {adv_ded['advance__advance_number']} has zero outstanding balance.")
                            continue
                        if req_amt > out_bal:
                            blockers.append(f"Advance recovery exceeds outstanding balance for {adv_ded['advance__advance_number']}.")
                            adv_rec += out_bal
                        else:
                            adv_rec += req_amt
                    else:
                        adv_rec += req_amt

                for a_id, _a_num, a_bal in auto_adv_by_emp.get(eid, ()):
                    if a_id in explicit_adv_ids:
                        continue
                    recoverable = min(a_bal, gross - adv_rec)
                    if recoverable > Decimal('0.00'):
                        adv_rec += _q2(recoverable)

                deductions = _q2(stat_total + other_ded_sum + adv_rec)
                net_salary = _q2(gross - deductions)
                if net_salary < Decimal('0.00'):
                    blockers.append(f"Net payable salary is negative (Rs {net_salary}).")

            total_gross += gross
            total_deductions += deductions
            total_net += net_salary
            if payment_status == 'PAID':
                total_paid += net_salary
                paid_count += 1
            else:
                unpaid_count += 1

            dest = dest_by_emp.get(eid)
            emp_name = f"{emp.first_name} {emp.last_name}".strip()
            rows.append({
                'employee_id': eid,
                'employee_code': getattr(emp, 'display_code', None) or emp.employee_code or eid[:8],
                'employee_name': emp_name,
                'designation_name': emp.designation.name if emp.designation else 'Security Guard',
                'department_name': emp.department.name if emp.department else 'Security Operations',
                'sites': sorted(list(sites_by_emp.get(eid, set()))),
                'present_days': present_days,
                'ot_shifts': ot_shifts,
                'duty_earnings': float(duty_earnings),
                'overtime_pay': float(ot_amt),
                'allowances': float(allowances),
                'gross_earnings': float(gross),
                'deductions': float(deductions),
                'advance_recovery': float(adv_rec),
                'outstanding_advance': float(adv_by_emp.get(eid, Decimal('0.00'))),
                'net_salary': float(net_salary),
                'is_finalized': is_finalized_emp,
                'payment_status': payment_status,
                'snapshot_id': snapshot_id,
                'integration_id': integ_id,
                'calculation_id': str(calc.id) if calc else None,
                'batch_number': batch_no,
                'payment_reference': pay_ref,
                'paid_at': paid_at,
                'has_blockers': bool(blockers),
                'blocking_reasons': blockers,
                'payment_destination': {
                    'method': dest.payment_method,
                    'bank_name': dest.bank_name,
                    'account_number': dest.account_number or dest.iban or dest.wallet_number,
                    'wallet_provider': dest.wallet_provider,
                } if dest else None,
            })

        return Response({
            'month': selected_month,
            'current_month': current_month,
            'previous_month': previous_month,
            'available_months': available_months,
            'period_start': period_start.isoformat(),
            'period_end': period_end.isoformat(),
            'is_finalized': all_finalized and len(rows) > 0,
            'integration_id': str(primary_integration.id) if primary_integration else None,
            'integration_status': primary_integration.status if primary_integration else ('LIVE_ATTENDANCE_READY' if rows else 'NO_ATTENDANCE'),
            'summary': {
                'employee_count': len(rows),
                'total_gross': float(total_gross),
                'total_deductions': float(total_deductions),
                'total_net_payable': float(total_net),
                'total_paid': float(total_paid),
                'remaining_payable': float(max(Decimal('0.00'), total_net - total_paid)),
                'paid_count': paid_count,
                'unpaid_count': unpaid_count,
            },
            'employees': rows
        })

    @action(detail=False, methods=['post'], url_path='finalize-and-sync-month')
    def finalize_and_sync_month(self, request):
        """
        POST /api/finance/payroll-integrations/finalize-and-sync-month/
        One-click calculation -> mark READY -> PayrollRun -> Approve -> Finalize -> Finance Integration
        so attendance salaries from Operations can be approved & paid directly inside Finance.
        """
        from decimal import Decimal
        from datetime import date
        from django.utils import timezone
        from operations.models import DailyDutyPay, EmployeePayrollCalculation, PayrollCalculationStatus
        from operations.services.payroll_rules_service import PayrollRulesService
        from operations.services.payroll_run_service import PayrollRunService
        from finance.services.period_service import ensure_open_period_and_foundation

        company = self.get_company()
        month_param = request.data.get('month')
        target_emp_ids = request.data.get('employee_ids')

        (
            selected_month, _, _, _, period_start, period_end, _
        ) = self._resolve_payroll_month(company, month_param)

        ensure_open_period_and_foundation(company, period_end)
        ensure_open_period_and_foundation(company, timezone.now().date())

        # Find employees with attendance in this month who don't yet have a FINALIZED PayrollRun
        dp_emp_ids = set(
            str(eid) for eid in DailyDutyPay.objects.filter(
                company=company, duty_date__gte=period_start, duty_date__lte=period_end, is_deleted=False
            ).values_list('employee_id', flat=True).distinct()
        )
        if target_emp_ids:
            dp_emp_ids = dp_emp_ids & set(str(x) for x in target_emp_ids)

        if not dp_emp_ids:
            return Response(
                {'detail': f'No attendance/duty pay records found for {selected_month}.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        ready_calc_ids = []
        skipped_reasons = []
        already_integrated_ids = set()

        # Check existing snapshots in finalized runs for this period
        for snap in PayrollAccountingIntegration.objects.filter(
            company=company, is_deleted=False,
            payroll_run__period_start__lte=period_end, payroll_run__period_end__gte=period_start
        ).values_list('employee_snapshots__employee_id', flat=True):
            if snap:
                already_integrated_ids.add(str(snap))

        to_process = dp_emp_ids - already_integrated_ids
        if not to_process:
            existing_integ = PayrollAccountingIntegration.objects.filter(
                company=company, is_deleted=False,
                payroll_run__period_start__lte=period_end, payroll_run__period_end__gte=period_start
            ).first()
            return Response({
                'success': True,
                'already_finalized': True,
                'finalized_count': len(already_integrated_ids),
                'integration': self.get_serializer(existing_integ).data if existing_integ else None,
                'message': f'Salaries for {selected_month} are already finalized and ready for payment.'
            })

        try:
            with transaction.atomic():
                for eid in to_process:
                    calc = EmployeePayrollCalculation.objects.filter(
                        company=company, employee_id=eid,
                        period_start=period_start, period_end=period_end, is_deleted=False
                    ).first()

                    if calc and calc.is_frozen and calc.payroll_run_id and calc.payroll_run.status == 'FINALIZED':
                        # Ensure finance integration ran on that run
                        PayrollFinanceService.integrate_payroll_run(calc.payroll_run, user=request.user)
                        continue

                    if not calc or not calc.is_frozen:
                        calc = PayrollRulesService.calculate_employee_payroll(
                            company=company, employee=eid,
                            period_start=period_start, period_end=period_end,
                            user=request.user, force_recalculate=True
                        )

                    if calc.has_blockers or calc.status == PayrollCalculationStatus.BLOCKED:
                        skipped_reasons.append(f"{calc.employee}: {'; '.join(calc.blocking_reasons or [])}")
                        continue

                    if calc.status != PayrollCalculationStatus.READY:
                        calc = PayrollRulesService.mark_calculation_ready(company, calc.id, user=request.user)
                    ready_calc_ids.append(str(calc.id))

                integration = None
                run_id = None
                if ready_calc_ids:
                    payroll_run = PayrollRunService.create_payroll_run_from_calculations(
                        company=company,
                        period_start=period_start,
                        period_end=period_end,
                        calculation_ids=ready_calc_ids,
                        user=request.user,
                        notes=f"Auto-finalized via Security Finance for {selected_month}"
                    )
                    payroll_run = PayrollRunService.approve_payroll_run(company, payroll_run, user=request.user)
                    fin_res = PayrollRunService.finalize_payroll_run(company, payroll_run, user=request.user)
                    run_id = fin_res.get('payroll_run_id')
                    integ_id = fin_res.get('finance_integration_id')
                    integration = PayrollAccountingIntegration.objects.filter(id=integ_id).first()

                return Response({
                    'success': True,
                    'payroll_run_id': run_id,
                    'finalized_count': len(ready_calc_ids),
                    'skipped': skipped_reasons,
                    'integration': self.get_serializer(integration).data if integration else None,
                    'message': f'Finalized {len(ready_calc_ids)} employee salaries for {selected_month}.'
                }, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'], url_path='pay-guard-salaries')
    def pay_guard_salaries(self, request):
        """
        POST /api/finance/payroll-integrations/pay-guard-salaries/
        Finalizes (if needed) and immediately pays selected (or all unpaid) guards for a month
        from a Bank/Cash Treasury account, creating Payment Voucher + Treasury entry and marking PAID.
        """
        from decimal import Decimal
        from datetime import date
        from django.utils import timezone
        from operations.models import DailyDutyPay, EmployeePayrollCalculation, PayrollCalculationStatus
        from operations.services.payroll_rules_service import PayrollRulesService
        from operations.services.payroll_run_service import PayrollRunService
        from finance.models import (
            BankAccount, PayrollEmployeeFinanceSnapshot, PayrollEmployeePaymentStatus
        )
        from finance.services.period_service import ensure_open_period_and_foundation

        company = self.get_company()
        month_param = request.data.get('month')
        employee_ids = request.data.get('employee_ids')
        treasury_account_id = request.data.get('treasury_account_id')
        payment_date_str = request.data.get('payment_date')
        payment_reference = request.data.get('payment_reference', '')
        payment_provider = request.data.get('payment_provider', 'MANUAL')
        notes = request.data.get('notes', '')

        valid_providers = {'MANUAL', 'HBL', 'JS_BANK', 'DUBAI_ISLAMIC_BANK', 'EASYPAISA', 'JAZZCASH', 'OTHER'}
        if payment_provider not in valid_providers:
            payment_provider = 'MANUAL'

        pay_date = date.fromisoformat(payment_date_str) if payment_date_str else timezone.now().date()
        ensure_open_period_and_foundation(company, pay_date)

        (
            selected_month, _, _, _, period_start, period_end, _
        ) = self._resolve_payroll_month(company, month_param)
        ensure_open_period_and_foundation(company, period_end)
        ensure_open_period_and_foundation(company, timezone.now().date())

        treasury_acc = None
        if treasury_account_id:
            treasury_acc = BankAccount.objects.filter(id=treasury_account_id, company=company, is_deleted=False).first()
        if not treasury_acc:
            treasury_acc = BankAccount.objects.filter(company=company, is_active=True, is_deleted=False).first()
        if not treasury_acc:
            return Response(
                {'detail': 'No active Bank or Cash Treasury account found. Please create a Bank/Cash account in Vouchers & Treasury first.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            with transaction.atomic():
                # 1. Ensure all requested / active employees for this month are finalized into PayrollAccountingIntegration
                target_set = set(str(x) for x in employee_ids) if employee_ids else set(
                    str(eid) for eid in DailyDutyPay.objects.filter(
                        company=company, duty_date__gte=period_start, duty_date__lte=period_end, is_deleted=False
                    ).values_list('employee_id', flat=True).distinct()
                )

                # Also include anyone already in existing snapshot for this period
                existing_snaps_qs = PayrollEmployeeFinanceSnapshot.objects.filter(
                    company=company, is_deleted=False,
                    integration__payroll_run__period_start__lte=period_end,
                    integration__payroll_run__period_end__gte=period_start,
                )
                if target_set:
                    existing_snaps_qs = existing_snaps_qs.filter(employee_id__in=list(target_set))
                else:
                    target_set = set(str(s.employee_id) for s in existing_snaps_qs)

                finalized_emp_ids = set(str(eid) for eid in existing_snaps_qs.values_list('employee_id', flat=True))
                missing_emp_ids = target_set - finalized_emp_ids

                if missing_emp_ids:
                    ready_calc_ids = []
                    for eid in missing_emp_ids:
                        calc = PayrollRulesService.calculate_employee_payroll(
                            company=company, employee=eid,
                            period_start=period_start, period_end=period_end,
                            user=request.user, force_recalculate=True
                        )
                        if not calc.has_blockers and calc.status != PayrollCalculationStatus.BLOCKED and calc.net_payable > 0:
                            if calc.status != PayrollCalculationStatus.READY:
                                calc = PayrollRulesService.mark_calculation_ready(company, calc.id, user=request.user)
                            ready_calc_ids.append(str(calc.id))
                    if ready_calc_ids:
                        payroll_run = PayrollRunService.create_payroll_run_from_calculations(
                            company=company, period_start=period_start, period_end=period_end,
                            calculation_ids=ready_calc_ids, user=request.user,
                            notes=f"Finalized for direct salary payment ({selected_month})"
                        )
                        payroll_run = PayrollRunService.approve_payroll_run(company, payroll_run, user=request.user)
                        PayrollRunService.finalize_payroll_run(company, payroll_run, user=request.user)

                # 2. Gather unpaid snapshots grouped by integration
                unpaid_snaps = list(PayrollEmployeeFinanceSnapshot.objects.filter(
                    company=company, is_deleted=False,
                    employee_id__in=list(target_set),
                    integration__payroll_run__period_start__lte=period_end,
                    integration__payroll_run__period_end__gte=period_start,
                    payment_status__in=[PayrollEmployeePaymentStatus.UNPAID, PayrollEmployeePaymentStatus.FAILED]
                ).select_related('integration'))

                # Filter net_salary > 0
                unpaid_snaps = [s for s in unpaid_snaps if (s.net_salary or 0) > 0]
                if not unpaid_snaps:
                    return Response(
                        {'detail': 'All selected employees have zero net payable or are already marked PAID.'},
                        status=status.HTTP_400_BAD_REQUEST
                    )

                snaps_by_integ = {}
                for s in unpaid_snaps:
                    snaps_by_integ.setdefault(s.integration, []).append(str(s.id))

                created_batches = []
                paid_count = 0
                total_disbursed = Decimal('0.00')

                for integ, s_ids in snaps_by_integ.items():
                    batch = PayrollFinanceService.create_salary_payment_batch(
                        payroll_integration=integ,
                        treasury_account=treasury_acc,
                        payment_date=pay_date,
                        payment_mode='MANUAL',
                        payment_provider=payment_provider,
                        selected_snapshot_ids=s_ids,
                        notes=notes or f"Salary payment for {selected_month}",
                        user=request.user
                    )
                    batch = PayrollFinanceService.approve_batch(batch, user=request.user)
                    line_results = [
                        {
                            'line_id': str(line.id),
                            'status': 'SUCCESS',
                            'payment_reference': payment_reference or f"SAL-{selected_month}-{idx + 1}"
                        }
                        for idx, line in enumerate(batch.lines.all())
                    ]
                    batch = PayrollFinanceService.confirm_manual_payments(batch, line_results=line_results, user=request.user)
                    created_batches.append(batch)
                    paid_count += len(line_results)
                    total_disbursed += Decimal(str(batch.successful_amount or 0))

                return Response({
                    'success': True,
                    'paid_count': paid_count,
                    'total_disbursed': float(total_disbursed),
                    'batch_numbers': [b.batch_number for b in created_batches],
                    'message': f'Successfully disbursed PKR {total_disbursed:,.2f} to {paid_count} employee(s).'
                }, status=status.HTTP_200_OK)
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
    def bundle(self, request):
        company = self._get_company(request)
        s_date_str = request.query_params.get('start_date')
        e_date_str = request.query_params.get('end_date')

        from datetime import datetime
        start_date = datetime.strptime(s_date_str, '%Y-%m-%d').date() if s_date_str else None
        end_date = datetime.strptime(e_date_str, '%Y-%m-%d').date() if e_date_str else None

        from finance.services.executive_dashboard_service import ExecutiveFinanceDashboardService
        try:
            data = ExecutiveFinanceDashboardService.get_dashboard_bundle(company, start_date=start_date, end_date=end_date)
            return Response(data)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

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


