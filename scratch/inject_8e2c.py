import os

views_path = "C:/Users/Aimen Iqbal/Desktop/ERP/reports/views.py"
urls_path = "C:/Users/Aimen Iqbal/Desktop/ERP/reports/urls.py"

views_addition = """
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
"""

# Modify views.py
with open(views_path, "r", encoding="utf-8") as f:
    content = f.read()

if "from reports.services.drill_down import FinancialDrillDownService" not in content:
    content = content.replace(
        "    UniversalExportService,", 
        "    UniversalExportService,\n)\nfrom reports.services.drill_down import FinancialDrillDownService\nfrom reports.services.cash_movement import CashMovementReportingService"
    )

if "class ComparativeProfitAndLossAPIView" not in content:
    content += "\n" + views_addition

with open(views_path, "w", encoding="utf-8") as f:
    f.write(content)

# Modify urls.py
with open(urls_path, "r", encoding="utf-8") as f:
    urls_content = f.read()

if "ComparativeProfitAndLossAPIView" not in urls_content:
    urls_content = urls_content.replace(
        "    ARReconciliationAPIView,",
        "    ARReconciliationAPIView,\n    ComparativeProfitAndLossAPIView,\n    CashMovementAPIView,\n    FinancialDrillDownAPIView,"
    )
    urls_content = urls_content.replace(
        "    path('finance/pnl/', ProfitAndLossAPIView.as_view(), name='api-report-pnl'),",
        "    path('finance/pnl/', ProfitAndLossAPIView.as_view(), name='api-report-pnl'),\n    path('finance/comparative/', ComparativeProfitAndLossAPIView.as_view(), name='api-report-comparative'),\n    path('finance/cash-movement/', CashMovementAPIView.as_view(), name='api-report-cash-movement'),\n    path('finance/drill-down/', FinancialDrillDownAPIView.as_view(), name='api-report-drill-down'),"
    )

with open(urls_path, "w", encoding="utf-8") as f:
    f.write(urls_content)

print("Successfully injected views and urls.")
