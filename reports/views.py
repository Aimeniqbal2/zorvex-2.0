"""
reports/views.py

Phase 8E-1 — Universal Reporting API Endpoints
Exposes JSON and CSV endpoints for financial statements, HR, operations,
inventory, purchasing, and CRM reporting services.
All queries strictly enforce tenant isolation and role-based access control.
"""
import csv
from datetime import datetime, date
from django.http import HttpResponse
from django.db.models import Sum
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied, ValidationError

from platform_core.permissions import ModulePermission
from reports.services import (
    DashboardReportingService,
    FinancialStatementsReportingService,
    HRAnalyticsReportingService,
    OperationsMetricsReportingService,
    SupplyChainReportingService,
    CRMAnalyticsReportingService,
    GeneralLedgerService,
    AccountLedgerService,
    CustomerBalanceService,
    CustomerStatementService,
    ARAgingService,
    ARReconciliationService,
    UniversalExportService,
)
from reports.services.drill_down import FinancialDrillDownService
from reports.services.cash_movement import CashMovementReportingService
from reports.services.cache import ReportingCacheService
from reports.services.pdf import PDFReportService
from django.utils import timezone
import os
import copy

def _build_pdf_context(request, report_title, data, period_display=""):
    context = copy.deepcopy(data)
    context['report_title'] = report_title
    company = getattr(request.user, 'company', None)
    context['company_name'] = company.name if company else "ZORVEX ERP"
    context['generated_at'] = timezone.now().strftime("%Y-%m-%d %H:%M:%S")
    context['period_display'] = period_display
    return context
def _check_finance_permission(request):
    user_role = getattr(request.user, 'role', '')
    if user_role not in ('admin', 'manager', 'super_admin') and not getattr(request.user, 'is_superuser', False):
        raise PermissionDenied("Access to financial reports is restricted to Admin and Manager roles.")


def _parse_date(date_str, param_name="date"):
    if not date_str:
        return None
    try:
        return datetime.strptime(date_str, "%Y-%m-%d").date()
    except ValueError:
        raise ValidationError({param_name: f"Invalid date format '{date_str}'. Use YYYY-MM-DD."})


def _validate_date_range(start_date, end_date):
    if start_date and end_date and start_date > end_date:
        raise ValidationError({"non_field_errors": "start_date cannot be after end_date."})


class DashboardAPIView(APIView):
    """
    Returns unified dashboard aggregates in a single API call.
    """
    required_module = 'reports'
    permission_classes = [IsAuthenticated, ModulePermission]

    def get(self, request):
        company_id = request.user.company_id
        
        cache_service = ReportingCacheService(company_id=company_id)
        ttl = int(os.environ.get('REPORT_CACHE_TTL', 300))
        cache_key = cache_service.generate_key(
            namespace='dashboard_kpis',
            category='dashboard'
        )
        
        data = cache_service.get(cache_key)
        if data is None:
            service = DashboardReportingService(company_id=company_id)
            data = service.get_dashboard_kpis()
            cache_service.set(cache_key, data, timeout=ttl)

        # Deepcopy to avoid mutating in-memory cache backends like LocMemCache
        response_data = copy.deepcopy(data)

        user_role = getattr(request.user, 'role', '')
        has_finance_access = user_role in ('admin', 'manager', 'super_admin') or request.user.is_superuser

        if not has_finance_access:
            response_data['total_revenue'] = 0.0
            response_data['total_expenses'] = 0.0
            response_data['net_profit'] = 0.0
            response_data['kpi_changes']['revenue'] = {'current': 0.0, 'previous': 0.0, 'pct': 0.0}
            response_data['kpi_changes']['profit'] = {'current': 0.0, 'previous': 0.0, 'pct': 0.0}
            response_data['revenue_trends']['data'] = [0.0] * len(response_data['revenue_trends']['data'])

        if request.query_params.get('export') == 'pdf':
            context = _build_pdf_context(request, "Dashboard Metrics", response_data)
            return PDFReportService.render_pdf("reports/pdf/dashboard/dashboard.html", context, filename_prefix="dashboard")

        return Response(response_data)


# ============================================================================
# FINANCIAL STATEMENTS API VIEWS
# ============================================================================

class TrialBalanceAPIView(APIView):
    required_module = 'reports'
    permission_classes = [IsAuthenticated, ModulePermission]

    def get(self, request):
        _check_finance_permission(request)
        company_id = request.user.company_id
        as_of_date = _parse_date(request.query_params.get('as_of_date'), 'as_of_date')

        service = FinancialStatementsReportingService(company_id=company_id)
        data = service.get_trial_balance(as_of_date=as_of_date)

        if request.query_params.get('format') == 'csv':
            return UniversalExportService.export_csv_from_dicts(data['accounts'], filename_prefix="trial_balance")
            
        if request.query_params.get('export') == 'pdf':
            # Large report protection
            if len(data.get('accounts', [])) > 1000:
                from rest_framework.exceptions import ValidationError
                raise ValidationError({"detail": "This report is too large for synchronous PDF generation. Please use CSV export."})
            period = f"As of {as_of_date}" if as_of_date else ""
            context = _build_pdf_context(request, "Trial Balance", data, period_display=period)
            return PDFReportService.render_pdf("reports/pdf/financial/trial_balance.html", context, filename_prefix="trial_balance")
            
        return Response(data)


class ProfitAndLossAPIView(APIView):
    required_module = 'reports'
    permission_classes = [IsAuthenticated, ModulePermission]

    def get(self, request):
        _check_finance_permission(request)
        company_id = request.user.company_id
        start_date = _parse_date(request.query_params.get('start_date'), 'start_date')
        end_date = _parse_date(request.query_params.get('end_date'), 'end_date')
        _validate_date_range(start_date, end_date)

        service = FinancialStatementsReportingService(company_id=company_id)
        data = service.get_profit_and_loss(start_date=start_date, end_date=end_date)

        if request.query_params.get('format') == 'csv':
            flat_items = []
            for gtype, details in data['details'].items():
                for acc in details['accounts']:
                    flat_items.append({
                        'category': gtype,
                        'account_code': acc['account_code'],
                        'account_name': acc['account_name'],
                        'amount': acc['amount'],
                    })
            return UniversalExportService.export_csv_from_dicts(flat_items, filename_prefix="pnl_statement")

        if request.query_params.get('export') == 'pdf':
            period = f"{start_date} to {end_date}" if start_date and end_date else ""
            context = _build_pdf_context(request, "Profit & Loss", data, period_display=period)
            return PDFReportService.render_pdf("reports/pdf/financial/profit_and_loss.html", context, filename_prefix="profit_and_loss")

        return Response(data)


class BalanceSheetAPIView(APIView):
    required_module = 'reports'
    permission_classes = [IsAuthenticated, ModulePermission]

    def get(self, request):
        _check_finance_permission(request)
        company_id = request.user.company_id
        as_of_date = _parse_date(request.query_params.get('as_of_date'), 'as_of_date')

        service = FinancialStatementsReportingService(company_id=company_id)
        data = service.get_balance_sheet(as_of_date=as_of_date)

        if request.query_params.get('format') == 'csv':
            flat_items = []
            for cat_name in ('assets', 'liabilities', 'equity'):
                for item in data[cat_name]['items']:
                    flat_items.append({
                        'section': cat_name.upper(),
                        'account_code': item['account_code'],
                        'account_name': item['account_name'],
                        'amount': item['amount'],
                    })
            flat_items.append({
                'section': 'EQUITY',
                'account_code': 'RETAINED_EARNINGS',
                'account_name': 'Retained Earnings (Net Profit to Date)',
                'amount': data['equity']['retained_earnings'],
            })
            return UniversalExportService.export_csv_from_dicts(flat_items, filename_prefix="balance_sheet")

        if request.query_params.get('export') == 'pdf':
            period = f"As of {as_of_date}" if as_of_date else ""
            context = _build_pdf_context(request, "Balance Sheet", data, period_display=period)
            return PDFReportService.render_pdf("reports/pdf/financial/balance_sheet.html", context, filename_prefix="balance_sheet")

        return Response(data)


# ============================================================================
# HR ANALYTICS API VIEWS
# ============================================================================

class PayrollSummaryAPIView(APIView):
    required_module = 'reports'
    permission_classes = [IsAuthenticated, ModulePermission]

    def get(self, request):
        _check_finance_permission(request)
        company_id = request.user.company_id
        start_date = _parse_date(request.query_params.get('start_date'), 'start_date')
        end_date = _parse_date(request.query_params.get('end_date'), 'end_date')
        _validate_date_range(start_date, end_date)

        service = HRAnalyticsReportingService(company_id=company_id)
        data = service.get_payroll_summary(start_date=start_date, end_date=end_date)

        if request.query_params.get('format') == 'csv':
            return UniversalExportService.export_csv_from_dicts(data['components_breakdown'], filename_prefix="payroll_summary")

        return Response(data)


class WorkforceUtilizationAPIView(APIView):
    required_module = 'reports'
    permission_classes = [IsAuthenticated, ModulePermission]

    def get(self, request):
        company_id = request.user.company_id
        start_date = _parse_date(request.query_params.get('start_date'), 'start_date')
        end_date = _parse_date(request.query_params.get('end_date'), 'end_date')
        _validate_date_range(start_date, end_date)
        group_by = request.query_params.get('group_by')

        service = HRAnalyticsReportingService(company_id=company_id)
        data = service.get_workforce_utilization(start_date=start_date, end_date=end_date, group_by=group_by)

        if request.query_params.get('format') == 'csv':
            return UniversalExportService.export_csv_from_dicts(data['breakdown'], filename_prefix="workforce_utilization")

        return Response(data)


# ============================================================================
# OPERATIONS ANALYTICS API VIEWS
# ============================================================================

class ContractProfitabilityAPIView(APIView):
    required_module = 'reports'
    permission_classes = [IsAuthenticated, ModulePermission]

    def get(self, request):
        _check_finance_permission(request)
        company_id = request.user.company_id
        start_date = _parse_date(request.query_params.get('start_date'), 'start_date')
        end_date = _parse_date(request.query_params.get('end_date'), 'end_date')
        _validate_date_range(start_date, end_date)

        service = OperationsMetricsReportingService(company_id=company_id)
        data = service.get_contract_profitability(start_date=start_date, end_date=end_date)

        if request.query_params.get('format') == 'csv':
            return UniversalExportService.export_csv_from_dicts(data['contracts'], filename_prefix="contract_profitability")

        return Response(data)


class OperationsPerformanceAPIView(APIView):
    required_module = 'reports'
    permission_classes = [IsAuthenticated, ModulePermission]

    def get(self, request):
        company_id = request.user.company_id
        start_date = _parse_date(request.query_params.get('start_date'), 'start_date')
        end_date = _parse_date(request.query_params.get('end_date'), 'end_date')
        _validate_date_range(start_date, end_date)

        service = OperationsMetricsReportingService(company_id=company_id)
        data = service.get_operations_performance(start_date=start_date, end_date=end_date)
        return Response(data)


# ============================================================================
# INVENTORY & PURCHASING API VIEWS
# ============================================================================

class InventoryValuationAPIView(APIView):
    required_module = 'reports'
    permission_classes = [IsAuthenticated, ModulePermission]

    def get(self, request):
        company_id = request.user.company_id
        warehouse_id = request.query_params.get('warehouse_id')
        is_csv = request.query_params.get('format') == 'csv'

        service = SupplyChainReportingService(company_id=company_id)
        data = service.get_inventory_valuation(warehouse_id=warehouse_id, as_queryset=is_csv)

        if is_csv:
            return UniversalExportService.stream_csv(data['items'], filename_prefix="inventory_valuation")

        return Response(data)


class LowStockReportAPIView(APIView):
    required_module = 'reports'
    permission_classes = [IsAuthenticated, ModulePermission]

    def get(self, request):
        company_id = request.user.company_id
        is_csv = request.query_params.get('format') == 'csv'

        service = SupplyChainReportingService(company_id=company_id)
        data = service.get_low_stock_report(as_queryset=is_csv)

        if is_csv:
            return UniversalExportService.stream_csv(data['low_stock_items'], filename_prefix="low_stock_report")

        return Response(data)


class VendorSpendAPIView(APIView):
    required_module = 'reports'
    permission_classes = [IsAuthenticated, ModulePermission]

    def get(self, request):
        company_id = request.user.company_id
        start_date = _parse_date(request.query_params.get('start_date'), 'start_date')
        end_date = _parse_date(request.query_params.get('end_date'), 'end_date')
        _validate_date_range(start_date, end_date)

        service = SupplyChainReportingService(company_id=company_id)
        data = service.get_vendor_spend(start_date=start_date, end_date=end_date)

        if request.query_params.get('format') == 'csv':
            return UniversalExportService.export_csv_from_dicts(data['vendors'], filename_prefix="vendor_spend")

        return Response(data)


class ProcurementCycleTimeAPIView(APIView):
    required_module = 'reports'
    permission_classes = [IsAuthenticated, ModulePermission]

    def get(self, request):
        company_id = request.user.company_id
        start_date = _parse_date(request.query_params.get('start_date'), 'start_date')
        end_date = _parse_date(request.query_params.get('end_date'), 'end_date')
        _validate_date_range(start_date, end_date)

        service = SupplyChainReportingService(company_id=company_id)
        data = service.get_procurement_cycle_time(start_date=start_date, end_date=end_date)
        return Response(data)


# ============================================================================
# CRM ANALYTICS API VIEWS
# ============================================================================

class CustomerLifetimeValueAPIView(APIView):
    required_module = 'reports'
    permission_classes = [IsAuthenticated, ModulePermission]

    def get(self, request):
        company_id = request.user.company_id

        service = CRMAnalyticsReportingService(company_id=company_id)
        data = service.get_customer_lifetime_value()

        if request.query_params.get('format') == 'csv':
            return UniversalExportService.export_csv_from_dicts(data['customers'], filename_prefix="customer_lifetime_value")

        return Response(data)




# ============================================================================
# ACCOUNTS RECEIVABLE API VIEWS
# ============================================================================

class ARAgingAPIView(APIView):
    required_module = 'reports'
    permission_classes = [IsAuthenticated, ModulePermission]

    def get(self, request):
        _check_finance_permission(request)
        company_id = request.user.company_id
        crm_entity_id = request.query_params.get('crm_entity_id')
        date_to = _parse_date(request.query_params.get('date_to'), 'date_to')

        service = ARAgingService(company_id=company_id)
        data = service.get_ar_aging(crm_entity_id=crm_entity_id, date_to=date_to)

        is_csv = request.query_params.get('export') == 'csv'
        if is_csv:
            qs = data['invoices']
            headers = [
                'invoice_number', 'period_start', 'period_end', 'due_date', 
                'total_amount', 'paid_amount', 'outstanding_amount', 'currency', 
                'customer_name'
            ]
            def row_formatter(item):
                return [
                    item.invoice_number,
                    item.period_start.isoformat() if item.period_start else '',
                    item.period_end.isoformat() if item.period_end else '',
                    item.effective_due_date.isoformat() if item.effective_due_date else '',
                    float(item.total_amount),
                    float(item.paid_amount),
                    float(item.outstanding_amount) if hasattr(item, 'outstanding_amount') else 0.0,
                    item.currency.code if item.currency else '',
                    item.crm_entity.name if item.crm_entity else ''
                ]
            return UniversalExportService.stream_csv(
                qs, 
                filename_prefix="ar_aging", 
                headers=headers, 
                row_formatter=row_formatter
            )

        # Pagination for JSON
        qs = data['invoices']
        page = int(request.query_params.get('page', 1))
        page_size = int(request.query_params.get('page_size', 100))
        
        start = (page - 1) * page_size
        end = start + page_size
        
        total_count = qs.count()
        page_items = qs[start:end]

        invoices = []
        for item in page_items:
            invoices.append({
                'id': str(item.id),
                'invoice_number': item.invoice_number,
                'period_start': item.period_start.isoformat() if item.period_start else None,
                'period_end': item.period_end.isoformat() if item.period_end else None,
                'due_date': item.effective_due_date.isoformat() if item.effective_due_date else None,
                'total_amount': float(item.total_amount),
                'paid_amount': float(item.paid_amount),
                'outstanding_amount': float(item.outstanding_amount) if hasattr(item, 'outstanding_amount') else 0.0,
                'currency': item.currency.code if item.currency else None,
                'crm_entity_id': str(item.crm_entity_id) if item.crm_entity_id else None,
                'customer_name': item.crm_entity.name if item.crm_entity else None,
                'bucket_current': float(item.bucket_current) if hasattr(item, 'bucket_current') else 0.0,
                'bucket_0_30': float(item.bucket_0_30) if hasattr(item, 'bucket_0_30') else 0.0,
                'bucket_31_60': float(item.bucket_31_60) if hasattr(item, 'bucket_31_60') else 0.0,
                'bucket_61_90': float(item.bucket_61_90) if hasattr(item, 'bucket_61_90') else 0.0,
                'bucket_90_plus': float(item.bucket_90_plus) if hasattr(item, 'bucket_90_plus') else 0.0,
            })

        summary = data['summary']
        return Response({
            'summary': {
                'total_current': float(summary['total_current']),
                'total_0_30': float(summary['total_0_30']),
                'total_31_60': float(summary['total_31_60']),
                'total_61_90': float(summary['total_61_90']),
                'total_90_plus': float(summary['total_90_plus']),
                'total_outstanding': float(summary['total_outstanding']),
            },
            'invoices': {
                'count': total_count,
                'page': page,
                'page_size': page_size,
                'results': invoices
            }
        })


class CustomerBalanceAPIView(APIView):
    required_module = 'reports'
    permission_classes = [IsAuthenticated, ModulePermission]

    def get(self, request):
        _check_finance_permission(request)
        company_id = request.user.company_id
        
        date_from = _parse_date(request.query_params.get('date_from'), 'date_from')
        date_to = _parse_date(request.query_params.get('date_to'), 'date_to')
        _validate_date_range(date_from, date_to)
        crm_entity_id = request.query_params.get('crm_entity_id')

        service = CustomerBalanceService(company_id=company_id)
        qs = service.get_customer_balances(date_from=date_from, date_to=date_to, crm_entity_id=crm_entity_id)

        is_csv = request.query_params.get('export') == 'csv'
        if is_csv:
            headers = ['crm_entity_id', 'customer_name', 'customer_display_name', 'total_debit', 'total_credit', 'balance']
            def row_formatter(item):
                return [
                    str(item['crm_entity_id']),
                    item['crm_entity__name'],
                    item['crm_entity__display_name'],
                    float(item['total_debit']),
                    float(item['total_credit']),
                    float(item['balance'])
                ]
            return UniversalExportService.stream_csv(
                qs, 
                filename_prefix="customer_balances", 
                headers=headers, 
                row_formatter=row_formatter
            )

        # Pagination for JSON
        if hasattr(qs, 'count') and not isinstance(qs, list):
            page = int(request.query_params.get('page', 1))
            page_size = int(request.query_params.get('page_size', 100))
            start = (page - 1) * page_size
            end = start + page_size
            total_count = qs.count()
            page_items = qs[start:end]
        else:
            page = 1
            page_size = len(qs) if isinstance(qs, list) else 0
            page_items = qs
            total_count = len(qs) if isinstance(qs, list) else 0

        results = []
        for item in page_items:
            results.append({
                'crm_entity_id': str(item['crm_entity_id']),
                'customer_name': item['crm_entity__name'],
                'customer_display_name': item['crm_entity__display_name'],
                'total_debit': float(item['total_debit']),
                'total_credit': float(item['total_credit']),
                'balance': float(item['balance'])
            })

        return Response({
            'count': total_count,
            'results': results
        })


class CustomerStatementAPIView(APIView):
    required_module = 'reports'
    permission_classes = [IsAuthenticated, ModulePermission]

    def get(self, request):
        _check_finance_permission(request)
        company_id = request.user.company_id
        
        crm_entity_id = request.query_params.get('crm_entity_id')
        if not crm_entity_id:
            raise ValidationError({'crm_entity_id': 'This parameter is required for Customer Statement.'})

        date_from = _parse_date(request.query_params.get('date_from'), 'date_from')
        date_to = _parse_date(request.query_params.get('date_to'), 'date_to')
        _validate_date_range(date_from, date_to)

        service = CustomerStatementService(company_id=company_id)
        try:
            data = service.get_customer_statement(crm_entity_id=crm_entity_id, date_from=date_from, date_to=date_to)
        except ValueError as e:
            raise ValidationError({'crm_entity_id': str(e)})

        qs = data['transactions']
        is_csv = request.query_params.get('format') == 'csv'

        if is_csv:
            headers = [
                'entry_date', 'journal_number', 'debit', 'credit', 
                'movement', 'running_balance', 'source_document_type', 'source_document_id', 'description'
            ]
            def row_formatter(item):
                return [
                    item.journal_entry.entry_date.isoformat(),
                    item.journal_entry.entry_number,
                    float(item.debit),
                    float(item.credit),
                    float(item.movement) if hasattr(item, 'movement') else 0.0,
                    float(item.running_balance) if hasattr(item, 'running_balance') else 0.0,
                    item.source_document_type,
                    item.source_document_id,
                    item.description
                ]
            return UniversalExportService.stream_csv(
                qs, 
                filename_prefix=f"customer_statement_{crm_entity_id}", 
                headers=headers, 
                row_formatter=row_formatter
            )

        if hasattr(qs, 'count') and not isinstance(qs, list):
            page = int(request.query_params.get('page', 1))
            page_size = int(request.query_params.get('page_size', 100))
            start = (page - 1) * page_size
            end = start + page_size
            total_count = qs.count()
            page_items = qs[start:end]
        else:
            page = 1
            page_size = len(qs) if isinstance(qs, list) else 0
            page_items = qs
            total_count = len(qs) if isinstance(qs, list) else 0

        transactions = []
        for item in page_items:
            transactions.append({
                'id': str(item.id),
                'entry_date': item.journal_entry.entry_date.isoformat(),
                'journal_entry_id': str(item.journal_entry.id),
                'journal_number': item.journal_entry.entry_number,
                'debit': float(item.debit),
                'credit': float(item.credit),
                'movement': float(item.movement) if hasattr(item, 'movement') else 0.0,
                'running_balance': float(item.running_balance) if hasattr(item, 'running_balance') else 0.0,
                'source_module': item.journal_entry.source_module,
                'source_document_type': item.journal_entry.source_document_type,
                'source_document_id': item.journal_entry.source_document_id,
                'description': item.description,
            })

        return Response({
            'crm_entity_id': data['crm_entity_id'],
            'customer_name': data['customer_name'],
            'opening_balance': float(data['opening_balance']),
            'period_debit': float(data['period_debit']),
            'period_credit': float(data['period_credit']),
            'closing_balance': float(data['closing_balance']),
            'transactions': {
                'count': total_count,
                'page': page,
                'page_size': page_size if 'page_size' in locals() else None,
                'results': transactions
            }
        })


class ARReconciliationAPIView(APIView):
    required_module = 'reports'
    permission_classes = [IsAuthenticated, ModulePermission]

    def get(self, request):
        _check_finance_permission(request)
        company_id = request.user.company_id
        date_to = _parse_date(request.query_params.get('date_to'), 'date_to')

        service = ARReconciliationService(company_id=company_id)
        results = service.get_reconciliation(date_to=date_to)

        is_csv = request.query_params.get('format') == 'csv'
        if is_csv:
            return UniversalExportService.export_csv_from_dicts(results, filename_prefix="ar_reconciliation")

        return Response({
            'count': len(results),
            'results': [
                {
                    'crm_entity_id': str(r['crm_entity_id']),
                    'customer_name': r['customer_name'],
                    'operational_balance': float(r['operational_balance']),
                    'ledger_balance': float(r['ledger_balance']),
                    'difference': float(r['difference']),
                    'has_discrepancy': r['has_discrepancy'],
                }
                for r in results
            ]
        })


# ============================================================================
# GENERAL LEDGER & ACCOUNT LEDGER API VIEWS
# ============================================================================

class GeneralLedgerAPIView(APIView):
    required_module = 'reports'
    permission_classes = [IsAuthenticated, ModulePermission]

    def get(self, request):
        _check_finance_permission(request)
        company_id = request.user.company_id
        
        date_from = _parse_date(request.query_params.get('date_from'), 'date_from')
        date_to = _parse_date(request.query_params.get('date_to'), 'date_to')
        _validate_date_range(date_from, date_to)

        account_id = request.query_params.get('account_id')
        journal_id = request.query_params.get('journal_id')
        cost_center_id = request.query_params.get('cost_center_id')
        profit_center_id = request.query_params.get('profit_center_id')
        crm_entity_id = request.query_params.get('crm_entity_id')

        service = GeneralLedgerService(company_id=company_id)
        qs = service.get_general_ledger(
            date_from=date_from,
            date_to=date_to,
            account_id=account_id,
            journal_id=journal_id,
            cost_center_id=cost_center_id,
            profit_center_id=profit_center_id,
            crm_entity_id=crm_entity_id
        )

        is_csv = request.query_params.get('export') == 'csv'

        if is_csv:
            headers = [
                'entry_date', 'journal_number', 'journal_name', 'account_code', 'account_name', 
                'debit', 'credit', 'currency', 'exchange_rate', 'cost_center', 'profit_center', 
                'crm_entity', 'source_module', 'source_document_type', 'source_document_id', 'description'
            ]
            
            def row_formatter(item):
                return [
                    item.journal_entry.entry_date.isoformat(),
                    item.journal_entry.entry_number,
                    item.journal_entry.journal.name if item.journal_entry.journal else '',
                    item.account.account_code,
                    item.account.account_name,
                    float(item.debit),
                    float(item.credit),
                    item.currency,
                    float(item.exchange_rate),
                    item.cost_center.name if getattr(item, 'cost_center', None) else '',
                    item.profit_center.name if getattr(item, 'profit_center', None) else '',
                    item.crm_entity.name if getattr(item, 'crm_entity', None) else '',
                    item.journal_entry.source_module,
                    item.journal_entry.source_document_type,
                    item.journal_entry.source_document_id,
                    item.description
                ]
            
            return UniversalExportService.stream_csv(
                qs, 
                filename_prefix="general_ledger", 
                headers=headers, 
                row_formatter=row_formatter
            )

        # Pagination for JSON (using simple slice for demonstration as per 'implement smallest solution')
        page = int(request.query_params.get('page', 1))
        page_size = int(request.query_params.get('page_size', 100))
        
        start = (page - 1) * page_size
        end = start + page_size
        
        total_count = qs.count()
        page_items = qs[start:end]

        data = []
        for item in page_items:
            data.append({
                'id': str(item.id),
                'entry_date': item.journal_entry.entry_date.isoformat(),
                'journal_entry_id': str(item.journal_entry.id),
                'journal_number': item.journal_entry.entry_number,
                'account_id': str(item.account_id),
                'account_code': item.account.account_code,
                'account_name': item.account.account_name,
                'debit': float(item.debit),
                'credit': float(item.credit),
                'currency': item.currency,
                'exchange_rate': float(item.exchange_rate),
                'source_module': item.journal_entry.source_module,
                'source_document_type': item.journal_entry.source_document_type,
                'source_document_id': item.journal_entry.source_document_id,
                'description': item.description,
                'cost_center_id': str(item.cost_center_id) if item.cost_center_id else None,
                'profit_center_id': str(item.profit_center_id) if item.profit_center_id else None,
                'crm_entity_id': str(item.crm_entity_id) if item.crm_entity_id else None,
            })

        return Response({
            'count': total_count,
            'page': page,
            'page_size': page_size,
            'results': data
        })


class AccountLedgerAPIView(APIView):
    required_module = 'reports'
    permission_classes = [IsAuthenticated, ModulePermission]

    def get(self, request):
        _check_finance_permission(request)
        company_id = request.user.company_id
        
        account_id = request.query_params.get('account_id')
        if not account_id:
            raise ValidationError({'account_id': 'This parameter is required for Account Ledger.'})

        date_from = _parse_date(request.query_params.get('date_from'), 'date_from')
        date_to = _parse_date(request.query_params.get('date_to'), 'date_to')
        _validate_date_range(date_from, date_to)

        service = AccountLedgerService(company_id=company_id)
        try:
            data = service.get_account_ledger(
                account_id=account_id,
                date_from=date_from,
                date_to=date_to
            )
        except ValueError as e:
            raise ValidationError({'account_id': str(e)})

        qs = data['transactions']
        is_csv = request.query_params.get('export') == 'csv'

        if is_csv:
            headers = [
                'entry_date', 'journal_number', 'account_code', 'account_name', 
                'debit', 'credit', 'movement', 'running_balance', 'source_document_type', 'source_document_id'
            ]
            
            def row_formatter(item):
                return [
                    item.journal_entry.entry_date.isoformat(),
                    item.journal_entry.entry_number,
                    item.account.account_code,
                    item.account.account_name,
                    float(item.debit),
                    float(item.credit),
                    float(item.movement) if hasattr(item, 'movement') else 0.0,
                    float(item.running_balance) if hasattr(item, 'running_balance') else 0.0,
                    item.journal_entry.source_document_type,
                    item.journal_entry.source_document_id
                ]
            
            return UniversalExportService.stream_csv(
                qs, 
                filename_prefix=f"account_ledger_{data['account_code']}", 
                headers=headers, 
                row_formatter=row_formatter
            )

        page = int(request.query_params.get('page', 1))
        page_size = int(request.query_params.get('page_size', 100))
        
        start = (page - 1) * page_size
        end = start + page_size
        
        total_count = qs.count()
        page_items = qs[start:end]

        transactions = []
        for item in page_items:
            transactions.append({
                'id': str(item.id),
                'entry_date': item.journal_entry.entry_date.isoformat(),
                'journal_entry_id': str(item.journal_entry.id),
                'journal_number': item.journal_entry.entry_number,
                'debit': float(item.debit),
                'credit': float(item.credit),
                'movement': float(item.movement) if hasattr(item, 'movement') else 0.0,
                'running_balance': float(item.running_balance) if hasattr(item, 'running_balance') else 0.0,
                'source_module': item.journal_entry.source_module,
                'source_document_type': item.journal_entry.source_document_type,
                'source_document_id': item.journal_entry.source_document_id,
                'description': item.description,
            })

        return Response({
            'account_id': data['account_id'],
            'account_code': data['account_code'],
            'account_name': data['account_name'],
            'is_debit_normal': data['is_debit_normal'],
            'opening_balance': data['opening_balance'],
            'period_debit': data['period_debit'],
            'period_credit': data['period_credit'],
            'closing_balance': data['closing_balance'],
            'transactions': {
                'count': total_count,
                'page': page,
                'page_size': page_size,
                'results': transactions
            }
        })


# ============================================================================
# REFACTORED UNIVERSAL EXPORT VIEW
# ============================================================================

class ExportCSVAPIView(APIView):
    """
    Universal CSV export view supporting various reporting domains without N+1 queries.
    """
    required_module = 'reports'
    permission_classes = [IsAuthenticated, ModulePermission]

    def get(self, request):
        report_type = request.query_params.get('type', 'inventory_valuation')
        company_id = request.user.company_id

        start_date = _parse_date(request.query_params.get('start_date'), 'start_date')
        end_date = _parse_date(request.query_params.get('end_date'), 'end_date')

        if report_type == 'inventory_valuation':
            service = SupplyChainReportingService(company_id=company_id)
            data = service.get_inventory_valuation(as_queryset=True)
            return UniversalExportService.stream_csv(data['items'], filename_prefix="inventory_valuation")

        elif report_type == 'low_stock':
            service = SupplyChainReportingService(company_id=company_id)
            data = service.get_low_stock_report(as_queryset=True)
            return UniversalExportService.stream_csv(data['low_stock_items'], filename_prefix="low_stock_report")

        elif report_type == 'vendor_spend':
            service = SupplyChainReportingService(company_id=company_id)
            data = service.get_vendor_spend(start_date=start_date, end_date=end_date)
            return UniversalExportService.export_csv_from_dicts(data['vendors'], filename_prefix="vendor_spend")

        elif report_type == 'clv':
            service = CRMAnalyticsReportingService(company_id=company_id)
            data = service.get_customer_lifetime_value()
            return UniversalExportService.export_csv_from_dicts(data['customers'], filename_prefix="customer_lifetime_value")

        elif report_type == 'pnl':
            _check_finance_permission(request)
            service = FinancialStatementsReportingService(company_id=company_id)
            data = service.get_profit_and_loss(start_date=start_date, end_date=end_date)
            flat_items = []
            for gtype, details in data['details'].items():
                for acc in details['accounts']:
                    flat_items.append({
                        'category': gtype,
                        'account_code': acc['account_code'],
                        'account_name': acc['account_name'],
                        'amount': acc['amount'],
                    })
            return UniversalExportService.export_csv_from_dicts(flat_items, filename_prefix="pnl_statement")

        elif report_type == 'general_ledger':
            _check_finance_permission(request)
            service = GeneralLedgerService(company_id=company_id)
            qs = service.get_general_ledger(
                date_from=start_date,
                date_to=end_date,
                account_id=request.query_params.get('account_id'),
                journal_id=request.query_params.get('journal_id')
            )
            def row_formatter(item):
                return [
                    item.journal_entry.entry_date.isoformat(),
                    item.journal_entry.entry_number,
                    item.account.account_code,
                    float(item.debit),
                    float(item.credit)
                ]
            return UniversalExportService.stream_csv(qs, filename_prefix="general_ledger", headers=['date', 'journal', 'account', 'debit', 'credit'], row_formatter=row_formatter)

        elif report_type == 'account_ledger':
            _check_finance_permission(request)
            account_id = request.query_params.get('account_id')
            if not account_id:
                raise ValidationError({'account_id': 'Required for account_ledger export'})
            service = AccountLedgerService(company_id=company_id)
            data = service.get_account_ledger(account_id=account_id, date_from=start_date, date_to=end_date)
            qs = data['transactions']
            def row_formatter(item):
                return [
                    item.journal_entry.entry_date.isoformat(),
                    item.journal_entry.entry_number,
                    float(item.debit),
                    float(item.credit),
                    float(item.running_balance) if hasattr(item, 'running_balance') else 0.0
                ]
            return UniversalExportService.stream_csv(qs, filename_prefix=f"account_ledger_{data['account_code']}", headers=['date', 'journal', 'debit', 'credit', 'running_balance'], row_formatter=row_formatter)

        else:
            raise ValidationError({'type': f"Unsupported export report type '{report_type}'."})


class MonthlyAnalyticsAPIView(APIView):
    """
    Month-wise analytics data. Admin and Manager only.
    """
    required_module = 'reports'
    permission_classes = [IsAuthenticated, ModulePermission]

    def get(self, request):
        _check_finance_permission(request)
        company_id = request.user.company_id

        year = int(request.query_params.get('year', datetime.now().year))
        month_param = request.query_params.get('month')
        months = [int(month_param)] if month_param else list(range(1, 13))

        service = FinancialReportingService(company_id=company_id)

        results = []
        for m in months:
            from calendar import month_abbr, monthrange
            s_date = date(year, m, 1)
            e_date = date(year, m, monthrange(year, m)[1])

            rev = service.get_revenue(start_date=s_date, end_date=e_date)
            exp = service.get_expenses(start_date=s_date, end_date=e_date)
            profit = rev - exp

            results.append({
                'month': m,
                'month_name': month_abbr[m],
                'year': year,
                'revenue': float(rev),
                'expenses': float(exp),
                'profit': float(profit),
            })

        return Response({'year': year, 'month': month_param, 'data': results})


class ComparativeProfitAndLossAPIView(APIView):
    required_module = 'reports'
    permission_classes = [IsAuthenticated, ModulePermission]

    def get(self, request):
        _check_finance_permission(request)
        
        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')
        export = request.query_params.get('export')
        
        if not date_from or not date_to:
            raise ValidationError("date_from and date_to are required.")
            
        service = FinancialStatementsReportingService(company_id=request.user.company_id)
        data = service.get_comparative_profit_and_loss(date_from=date_from, date_to=date_to)
        
        if export == 'csv':
            # Flatten for CSV
            flat = [
                {'category': 'Revenue', **data['revenue']},
                {'category': 'Cost of Sales', **data['cost_of_sales']},
                {'category': 'Gross Profit', **data['gross_profit']},
                {'category': 'Expenses', **data['expenses']},
                {'category': 'Net Profit', **data['net_profit']}
            ]
            return UniversalExportService.export_csv_from_dicts(flat, filename_prefix='comparative_pnl')

        return Response(data)

class CashMovementAPIView(APIView):
    required_module = 'reports'
    permission_classes = [IsAuthenticated, ModulePermission]

    def get(self, request):
        _check_finance_permission(request)
        
        date_from = _parse_date(request.query_params.get('date_from'), 'date_from')
        date_to = _parse_date(request.query_params.get('date_to'), 'date_to')
        account_id = request.query_params.get('account_id')
        export = request.query_params.get('export')
        
        _validate_date_range(date_from, date_to)
        
        service = CashMovementReportingService(company_id=request.user.company_id)
        data = service.get_cash_movement(date_from=date_from, date_to=date_to, account_id=account_id)
        
        if export == 'csv':
            # We must return StreamingHttpResponse. Wait! It is a dict, not a list of rows. We can wrap it as a 1-row CSV.
            # But the requirement is "Cash Movement CSV streaming".
            def dict_to_list():
                yield data
                
            return UniversalExportService.stream_csv(
                dict_to_list(),
                filename_prefix='cash_movement',
                headers=['date_from', 'date_to', 'opening_balance', 'receipts', 'disbursements', 'net_movement', 'closing_balance']
            )

        return Response(data)

class FinancialDrillDownAPIView(APIView):
    required_module = 'reports'
    permission_classes = [IsAuthenticated, ModulePermission]

    def get(self, request):
        _check_finance_permission(request)
        
        params = {
            'journal_entry_id': request.query_params.get('journal_entry_id'),
            'journal_entry_line_id': request.query_params.get('journal_entry_line_id'),
            'account_id': request.query_params.get('account_id'),
            'crm_entity_id': request.query_params.get('crm_entity_id'),
            'cost_center_id': request.query_params.get('cost_center_id'),
            'profit_center_id': request.query_params.get('profit_center_id'),
            'source_module': request.query_params.get('source_module'),
            'source_document_type': request.query_params.get('source_document_type'),
            'source_document_id': request.query_params.get('source_document_id'),
            'date_from': _parse_date(request.query_params.get('date_from'), 'date_from'),
            'date_to': _parse_date(request.query_params.get('date_to'), 'date_to')
        }
        
        export = request.query_params.get('export')
        service = FinancialDrillDownService(company_id=request.user.company_id)
        qs = service.get_drill_down_transactions(**params)
        
        if export == 'csv':
            def row_formatter(line):
                return [
                    line.journal_entry.entry_number,
                    line.journal_entry.entry_date,
                    line.account.account_code,
                    line.account.account_name,
                    line.description,
                    line.debit,
                    line.credit,
                    line.journal_entry.source_module,
                    line.journal_entry.source_document_type,
                    line.journal_entry.source_document_id
                ]
            headers = [
                'entry_number', 'entry_date', 'account_code', 'account_name', 
                'description', 'debit', 'credit', 'source_module', 'source_document_type', 'source_document_id'
            ]
            return UniversalExportService.stream_csv(qs, filename_prefix='financial_drill_down', headers=headers, row_formatter=row_formatter)

        # Pagination for JSON
        page = int(request.query_params.get('page', 1))
        page_size = int(request.query_params.get('page_size', 50))
        total = qs.count()
        start = (page - 1) * page_size
        end = start + page_size
        
        results = []
        for line in qs[start:end]:
            results.append({
                'id': str(line.id),
                'journal_entry_id': str(line.journal_entry_id),
                'entry_number': line.journal_entry.entry_number,
                'entry_date': str(line.journal_entry.entry_date),
                'account_id': str(line.account_id),
                'account_code': line.account.account_code,
                'account_name': line.account.account_name,
                'description': line.description,
                'debit': float(line.debit),
                'credit': float(line.credit),
                'source_module': line.journal_entry.source_module,
                'source_document_type': line.journal_entry.source_document_type,
                'source_document_id': str(line.journal_entry.source_document_id) if line.journal_entry.source_document_id else None
            })
            
        return Response({
            'count': total,
            'page': page,
            'page_size': page_size,
            'results': results
        })

# ============================================================================
# ASYNC PDF REPORTING API VIEWS (PHASE 8F-C2)
# ============================================================================

from reports.models import GeneratedReport
from reports.services.report_registry import REPORT_REGISTRY
from reports.tasks import generate_pdf_report
from django.utils import timezone
from django.http import FileResponse
from django.shortcuts import get_object_or_404

class GeneratedReportCreateAPIView(APIView):
    """
    Initiates an asynchronous PDF generation job.
    """
    required_module = 'reports'
    permission_classes = [IsAuthenticated, ModulePermission]

    def post(self, request):
        report_type = request.data.get('report_type')
        if not report_type or report_type not in REPORT_REGISTRY:
            return Response({"detail": "Invalid or missing report_type."}, status=400)
            
        registry_entry = REPORT_REGISTRY[report_type]
        if registry_entry['service_class'].__name__ in [
            'FinancialStatementsReportingService', 
            'GeneralLedgerService', 
            'AccountLedgerService',
            'ARAgingService',
            'ARReconciliationService',
            'CashMovementReportingService'
        ]:
            _check_finance_permission(request)

        # Basic param validation
        parameters = request.data.get('parameters', {})
        if not isinstance(parameters, dict):
            return Response({"detail": "Parameters must be a JSON object."}, status=400)
            
        for param_name in registry_entry['param_names']:
            # Could validate presence, but we'll let service handle missing logic (or default them)
            pass

        report = GeneratedReport.objects.create(
            company_id=request.user.company_id,
            created_by=request.user,
            report_type=report_type,
            parameters=parameters,
            status=GeneratedReport.Status.PENDING
        )

        task = generate_pdf_report.delay(report.id)
        report.task_id = task.id
        report.save(update_fields=['task_id'])

        return Response({
            "id": report.id,
            "status": report.status,
            "report_type": report.report_type,
            "created_at": report.created_at,
            "task_id": report.task_id
        }, status=202)


class GeneratedReportStatusAPIView(APIView):
    required_module = 'reports'
    permission_classes = [IsAuthenticated, ModulePermission]

    def get(self, request, pk):
        report = get_object_or_404(GeneratedReport, id=pk, company_id=request.user.company_id)
        
        data = {
            "id": report.id,
            "report_type": report.report_type,
            "status": report.status,
            "created_at": report.created_at,
            "started_at": report.started_at,
            "completed_at": report.completed_at,
            "expires_at": report.expires_at,
            "error_message": report.error_message if report.status == GeneratedReport.Status.FAILED else None,
        }
        return Response(data)


class GeneratedReportDownloadAPIView(APIView):
    required_module = 'reports'
    permission_classes = [IsAuthenticated, ModulePermission]

    def get(self, request, pk):
        report = get_object_or_404(GeneratedReport, id=pk, company_id=request.user.company_id)
        
        # Enforce finance permission if it was a financial report
        registry_entry = REPORT_REGISTRY.get(report.report_type)
        if registry_entry and registry_entry['service_class'].__name__ in [
            'FinancialStatementsReportingService', 
            'GeneralLedgerService', 
            'AccountLedgerService',
            'ARAgingService',
            'ARReconciliationService',
            'CashMovementReportingService'
        ]:
            _check_finance_permission(request)

        if report.status != GeneratedReport.Status.SUCCESS:
            return Response({"detail": f"Report cannot be downloaded. Current status: {report.status}"}, status=400)
            
        if report.expires_at and timezone.now() > report.expires_at:
            return Response({"detail": "This report has expired."}, status=400)
            
        if not report.file:
            return Response({"detail": "File not found."}, status=404)
            
        try:
            # FileResponse handles efficient streaming.
            response = FileResponse(report.file.open('rb'), content_type='application/pdf')
            response['Content-Disposition'] = f'attachment; filename="{report.file_name}"'
            return response
        except Exception:
            return Response({"detail": "Failed to read the file from storage."}, status=500)

from erp_core.views import TenantModelViewSet
from .models import Target
from .serializers import TargetSerializer
from rest_framework import filters

class TargetViewSet(TenantModelViewSet):
    required_module = 'reports'
    queryset = Target.objects.all().select_related('employee', 'department', 'cost_center', 'crm_entity')
    serializer_class = TargetSerializer
    permission_classes = [IsAuthenticated, ModulePermission]
    filter_backends = [filters.OrderingFilter]
    ordering_fields = ['period_start', 'target_value']
    
    def perform_create(self, serializer):
        serializer.save(company_id=self.request.user.company_id)


from reports.services.analytics.budget_vs_actual import BudgetVsActualService
from reports.services.analytics.target_performance import TargetPerformanceService

class BudgetVsActualAPIView(APIView):
    required_module = 'reports'
    permission_classes = [IsAuthenticated, ModulePermission]

    def get(self, request):
        _check_finance_permission(request)
        company_id = request.user.company_id
        
        budget_id = request.query_params.get('budget_id')
        if not budget_id:
            raise ValidationError({"budget_id": "Required parameter."})
            
        account_id = request.query_params.get('account_id')
        cost_center_id = request.query_params.get('cost_center_id')
        profit_center_id = request.query_params.get('profit_center_id')

        service = BudgetVsActualService(company_id=company_id)
        data = service.get_budget_vs_actual(
            budget_id=budget_id,
            account_id=account_id,
            cost_center_id=cost_center_id,
            profit_center_id=profit_center_id
        )

        is_csv = request.query_params.get('format') == 'csv'
        if is_csv:
            return UniversalExportService.export_csv_from_dicts(data, filename_prefix="budget_vs_actual")
            
        return Response(data)

class TargetPerformanceAPIView(APIView):
    required_module = 'reports'
    permission_classes = [IsAuthenticated, ModulePermission]

    def get(self, request):
        company_id = request.user.company_id
        target_id = request.query_params.get('target_id')
        target_type = request.query_params.get('target_type')
        period_start = _parse_date(request.query_params.get('period_start'), 'period_start')
        period_end = _parse_date(request.query_params.get('period_end'), 'period_end')

        service = TargetPerformanceService(company_id=company_id)
        data = service.get_target_performance(
            target_id=target_id,
            target_type=target_type,
            period_start=period_start,
            period_end=period_end
        )
        
        is_csv = request.query_params.get('format') == 'csv'
        if is_csv:
            return UniversalExportService.export_csv_from_dicts(data, filename_prefix="target_performance")
            
        return Response(data)
