from rest_framework import viewsets, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from erp_core.permissions import RolePermission
from erp_core.views import TenantModelViewSet
from django.db.models import Sum
from django.db import transaction
from django.core.exceptions import ValidationError as DjangoValidationError
from platform_core.permissions import ModulePermission
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

class AccountGroupViewSet(BaseFinanceViewSet):
    queryset = AccountGroup.objects.all().select_related('parent')
    serializer_class = AccountGroupSerializer

class ChartOfAccountViewSet(BaseFinanceViewSet):
    queryset = ChartOfAccount.objects.all().select_related('account_group', 'currency')
    serializer_class = ChartOfAccountSerializer

class FiscalYearViewSet(BaseFinanceViewSet):
    queryset = FiscalYear.objects.all()
    serializer_class = FiscalYearSerializer

class AccountingPeriodViewSet(BaseFinanceViewSet):
    queryset = AccountingPeriod.objects.all().select_related('fiscal_year')
    serializer_class = AccountingPeriodSerializer

class JournalViewSet(BaseFinanceViewSet):
    queryset = Journal.objects.all()
    serializer_class = JournalSerializer

class JournalEntryViewSet(BaseFinanceViewSet):
    queryset = JournalEntry.objects.all().select_related('journal', 'created_by', 'approved_by').prefetch_related('lines')
    serializer_class = JournalEntrySerializer
    
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
    
    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if getattr(instance, 'status', None) == 'POSTED':
            from rest_framework.exceptions import ValidationError
            raise ValidationError("Cannot delete a posted journal entry.")
        return super().destroy(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        if getattr(instance, 'status', None) == 'POSTED':
            from rest_framework.exceptions import ValidationError
            raise ValidationError("Cannot modify a posted journal entry.")
        return super().update(request, *args, **kwargs)

    @action(detail=True, methods=['post'])
    def post_entry(self, request, pk=None):
        company_role = getattr(request.user, 'company_role', None)
        if company_role and 'finance.post' not in company_role.permissions:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("You do not have permission to post journal entries.")
            
        entry = self.get_object()
        
        from finance.services.posting import post_entry as post_entry_service
        try:
            post_entry_service(entry.id, user=request.user)
        except DjangoValidationError as e:
            return Response({'detail': e.message_dict if hasattr(e, 'message_dict') else e.messages}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
            
        return Response({'status': 'POSTED'})    
class JournalEntryLineViewSet(BaseFinanceViewSet):
    queryset = JournalEntryLine.objects.all().select_related(
        'journal_entry', 'account', 'currency', 'cost_center', 'profit_center', 'crm_entity'
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

    def create(self, request, *args, **kwargs):
        journal_entry_id = request.data.get('journal_entry')
        if journal_entry_id:
            try:
                from .models import JournalEntry
                entry = JournalEntry.objects.get(id=journal_entry_id)
                if entry.status == 'POSTED':
                    from rest_framework.exceptions import ValidationError
                    raise ValidationError("Cannot add lines to a posted journal entry.")
            except JournalEntry.DoesNotExist:
                pass
        return super().create(request, *args, **kwargs)

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

class ProfitCenterViewSet(BaseFinanceViewSet):
    queryset = ProfitCenter.objects.all().select_related('parent')
    serializer_class = ProfitCenterSerializer

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
from .models import BankAccount, FinancialVoucher, Cheque, BankStatement, FinancialVoucherLine
from .serializers import (
    BankAccountSerializer, FinancialVoucherSerializer, ChequeSerializer, BankStatementSerializer, FinancialVoucherLineSerializer
)

class BankAccountViewSet(BaseFinanceViewSet):
    queryset = BankAccount.objects.all()
    serializer_class = BankAccountSerializer

class FinancialVoucherViewSet(BaseFinanceViewSet):
    queryset = FinancialVoucher.objects.all()
    serializer_class = FinancialVoucherSerializer

    @action(detail=True, methods=['post'])
    def post_voucher(self, request, pk=None):
        voucher = self.get_object()
        from .services.voucher_service import post_financial_voucher
        try:
            journal_entry = post_financial_voucher(voucher, request.user)
            return Response({'status': 'Voucher posted successfully', 'journal_entry_id': journal_entry.id})
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

class FinancialVoucherLineViewSet(BaseFinanceViewSet):
    queryset = FinancialVoucherLine.objects.all()
    serializer_class = FinancialVoucherLineSerializer
    filterset_fields = ['voucher']

class ChequeViewSet(BaseFinanceViewSet):
    queryset = Cheque.objects.all()
    serializer_class = ChequeSerializer
    
    @action(detail=True, methods=['post'])
    def clear_cheque(self, request, pk=None):
        cheque = self.get_object()
        from .services.cheque_service import mark_cheque_cleared
        try:
            mark_cheque_cleared(cheque, request.user)
            return Response({'status': 'Cheque marked as cleared'})
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

class BankStatementViewSet(BaseFinanceViewSet):
    queryset = BankStatement.objects.all()
    serializer_class = BankStatementSerializer
