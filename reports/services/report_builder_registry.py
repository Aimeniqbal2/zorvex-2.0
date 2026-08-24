from finance.models import JournalEntryLine
from inventory.models import InventoryBalance
from django.db.models import F, ExpressionWrapper, DecimalField, CharField, Value
from django.db.models.functions import Coalesce

def get_general_ledger_qs(company_id, filters=None):
    return JournalEntryLine.objects.filter(
        company_id=company_id,
        journal_entry__status='POSTED'
    ).select_related('account', 'journal_entry')

def get_inventory_valuation_qs(company_id, filters=None):
    return InventoryBalance.objects.filter(
        company_id=company_id,
        is_deleted=False,
        item__is_deleted=False,
    ).annotate(
        line_value=ExpressionWrapper(
            Coalesce(F('quantity'), 0.0, output_field=DecimalField())
            * Coalesce(F('item__cost_price'), 0.0, output_field=DecimalField()),
            output_field=DecimalField()
        ),
        item_name=F('item__name'),
        sku=Coalesce(F('item__sku'), F('item__item_code'), Value(''), output_field=CharField()),
        warehouse_name=Coalesce(F('warehouse__name'), Value('Default'), output_field=CharField()),
        unit_cost=F('item__cost_price'),
    )

def get_trial_balance_data(company_id, filters=None):
    from reports.services.financial_statements import FinancialStatementsReportingService
    service = FinancialStatementsReportingService(company_id=company_id)
    as_of_date = filters.get('as_of_date') if filters else None
    res = service.get_trial_balance(as_of_date=as_of_date)
    return res['accounts']

def get_profit_loss_data(company_id, filters=None):
    from reports.services.financial_statements import FinancialStatementsReportingService
    service = FinancialStatementsReportingService(company_id=company_id)
    start_date = filters.get('date_from') if filters else None
    end_date = filters.get('date_to') if filters else None
    res = service.get_profit_and_loss(start_date=start_date, end_date=end_date)
    
    flat = []
    for gtype, gdata in res.get('details', {}).items():
        for acc in gdata.get('accounts', []):
            flat.append({
                'account_id': acc.get('account_id'),
                'account_code': acc.get('account_code'),
                'account_name': acc.get('account_name'),
                'group_type': gtype,
                'amount': acc.get('amount')
            })
    return flat

REPORT_BUILDER_REGISTRY = {
    'general_ledger': {
        'label': 'General Ledger',
        'type': 'queryset',
        'get_queryset': get_general_ledger_qs,
        'columns': {
            'date': {'label': 'Date', 'type': 'date', 'orm_path': 'journal_entry__entry_date'},
            'account_code': {'label': 'Account Code', 'type': 'string', 'orm_path': 'account__account_code'},
            'account_name': {'label': 'Account Name', 'type': 'string', 'orm_path': 'account__account_name'},
            'debit': {'label': 'Debit', 'type': 'decimal', 'orm_path': 'debit'},
            'credit': {'label': 'Credit', 'type': 'decimal', 'orm_path': 'credit'},
            'description': {'label': 'Description', 'type': 'string', 'orm_path': 'description'},
            'journal_number': {'label': 'Journal Number', 'type': 'string', 'orm_path': 'journal_entry__entry_number'},
        },
        'filters': {
            'date_from': {'type': 'date', 'orm_path': 'journal_entry__entry_date__gte'},
            'date_to': {'type': 'date', 'orm_path': 'journal_entry__entry_date__lte'},
            'account_id': {'type': 'uuid', 'orm_path': 'account_id'},
        },
        'ordering': {
            'date': 'journal_entry__entry_date',
            'account_code': 'account__account_code',
            'debit': 'debit',
            'credit': 'credit'
        },
        'max_preview_rows': 50,
        'permission_required': 'finance',
    },
    'inventory_valuation': {
        'label': 'Inventory Valuation',
        'type': 'queryset',
        'get_queryset': get_inventory_valuation_qs,
        'columns': {
            'item_id': {'label': 'Item ID', 'type': 'uuid', 'orm_path': 'item_id'},
            'item_name': {'label': 'Item Name', 'type': 'string', 'orm_path': 'item_name'},
            'sku': {'label': 'SKU', 'type': 'string', 'orm_path': 'sku'},
            'warehouse_name': {'label': 'Warehouse', 'type': 'string', 'orm_path': 'warehouse_name'},
            'quantity': {'label': 'Quantity', 'type': 'decimal', 'orm_path': 'quantity'},
            'unit_cost': {'label': 'Unit Cost', 'type': 'decimal', 'orm_path': 'unit_cost'},
            'total_value': {'label': 'Total Value', 'type': 'decimal', 'orm_path': 'line_value'},
        },
        'filters': {
            'warehouse_id': {'type': 'uuid', 'orm_path': 'warehouse_id'},
            'item_id': {'type': 'uuid', 'orm_path': 'item_id'},
        },
        'ordering': {
            'item_name': 'item_name',
            'quantity': 'quantity',
            'total_value': 'line_value',
        },
        'max_preview_rows': 50,
        'permission_required': 'inventory',
    },
    'trial_balance': {
        'label': 'Trial Balance',
        'type': 'service',
        'get_data': get_trial_balance_data,
        'columns': {
            'account_id': {'label': 'Account ID', 'type': 'uuid', 'dict_key': 'account_id'},
            'account_code': {'label': 'Account Code', 'type': 'string', 'dict_key': 'account_code'},
            'account_name': {'label': 'Account Name', 'type': 'string', 'dict_key': 'account_name'},
            'account_type': {'label': 'Account Type', 'type': 'string', 'dict_key': 'account_type'},
            'debit': {'label': 'Debit', 'type': 'decimal', 'dict_key': 'debit'},
            'credit': {'label': 'Credit', 'type': 'decimal', 'dict_key': 'credit'},
            'balance': {'label': 'Balance', 'type': 'decimal', 'dict_key': 'balance'},
        },
        'filters': {
            'as_of_date': {'type': 'date', 'dict_key': 'as_of_date'},
        },
        'ordering': {
            'account_code': 'account_code',
            'balance': 'balance',
        },
        'max_preview_rows': 50,
        'permission_required': 'finance',
    },
    'profit_loss': {
        'label': 'Profit & Loss',
        'type': 'service',
        'get_data': get_profit_loss_data,
        'columns': {
            'account_id': {'label': 'Account ID', 'type': 'uuid', 'dict_key': 'account_id'},
            'account_code': {'label': 'Account Code', 'type': 'string', 'dict_key': 'account_code'},
            'account_name': {'label': 'Account Name', 'type': 'string', 'dict_key': 'account_name'},
            'group_type': {'label': 'Group Type', 'type': 'string', 'dict_key': 'group_type'},
            'amount': {'label': 'Amount', 'type': 'decimal', 'dict_key': 'amount'},
        },
        'filters': {
            'date_from': {'type': 'date', 'dict_key': 'date_from'},
            'date_to': {'type': 'date', 'dict_key': 'date_to'},
        },
        'ordering': {
            'account_code': 'account_code',
            'amount': 'amount',
        },
        'max_preview_rows': 50,
        'permission_required': 'finance',
    }
}
