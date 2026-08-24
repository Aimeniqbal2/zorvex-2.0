import copy
from django.utils import timezone
from reports.services import (
    DashboardReportingService,
    FinancialStatementsReportingService,
)

REPORT_REGISTRY = {
    'dashboard': {
        'service_class': DashboardReportingService,
        'method': 'get_dashboard_kpis',
        'template': 'reports/pdf/dashboard/dashboard.html',
        'title': 'Dashboard Metrics',
        'param_names': [],
    },
    'trial_balance': {
        'service_class': FinancialStatementsReportingService,
        'method': 'get_trial_balance',
        'template': 'reports/pdf/financial/trial_balance.html',
        'title': 'Trial Balance',
        'param_names': ['as_of_date'],
        'is_financial': True,
    },
    'profit_and_loss': {
        'service_class': FinancialStatementsReportingService,
        'method': 'get_profit_and_loss',
        'template': 'reports/pdf/financial/profit_and_loss.html',
        'title': 'Profit & Loss',
        'param_names': ['start_date', 'end_date'],
        'is_financial': True,
    },
    'balance_sheet': {
        'service_class': FinancialStatementsReportingService,
        'method': 'get_balance_sheet',
        'template': 'reports/pdf/financial/balance_sheet.html',
        'title': 'Balance Sheet',
        'param_names': ['as_of_date'],
        'is_financial': True,
    }
}

def build_pdf_context(company, report_title, data, params):
    context = copy.deepcopy(data)
    context['report_title'] = report_title
    
    context['company_name'] = company.name if company else "ZORVEX ERP"
    if company:
        context['company_address'] = getattr(company, 'address', '')
        context['company_phone'] = getattr(company, 'phone', '')
        context['company_tax_id'] = getattr(company, 'tax_id', '')
        if getattr(company, 'logo', None):
            # Using the path will allow xhtml2pdf to load it if local, but we must provide absolute filesystem path.
            # Usually xhtml2pdf handles Django media URLs with a link callback, but safe fallback is just the URL.
            context['company_logo_url'] = company.logo.url
            context['company_logo_path'] = company.logo.path

    context['generated_at'] = timezone.now().strftime("%Y-%m-%d %H:%M:%S")
    
    # Period formatting
    if 'start_date' in params and 'end_date' in params:
        context['period_display'] = f"{params['start_date']} to {params['end_date']}"
    elif 'as_of_date' in params:
        context['period_display'] = f"As of {params['as_of_date']}"
    else:
        context['period_display'] = ""

    return context
