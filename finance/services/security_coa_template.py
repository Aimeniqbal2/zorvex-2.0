"""
finance/services/security_coa_template.py
Provisions the standard hierarchical Security Industry Chart of Accounts,
fiscal calendar, cost centers, profit centers, bank accounts, and control account configuration.
"""
from datetime import date
from django.db import transaction
from companies.models import Company
from finance.models import (
    ChartOfAccount, AccountType, NormalBalance,
    FiscalYear, AccountingPeriod, PeriodStatus,
    CostCenter, ProfitCenter, Currency,
    BankAccount, BankAccountType, SecurityFinanceConfiguration
)

@transaction.atomic
def provision_security_chart_of_accounts(company: Company) -> dict:
    """
    Idempotently builds or verifies the Security Industry Chart of Accounts template for a company.
    """
    created_counts = {
        'accounts': 0,
        'fiscal_years': 0,
        'periods': 0,
        'cost_centers': 0,
        'profit_centers': 0,
        'bank_accounts': 0,
    }

    # 1. Base Currency (PKR)
    base_curr, _ = Currency.objects.get_or_create(
        company=company,
        code='PKR',
        defaults={
            'name': 'Pakistani Rupee',
            'symbol': 'Rs',
            'decimal_places': 2,
            'is_base_currency': True
        }
    )

    # 2. Fiscal Year & 12 Periods for Current Calendar Year
    current_year = date.today().year
    fy_name = f"FY-{current_year}"
    fy, fy_created = FiscalYear.objects.get_or_create(
        company=company,
        name=fy_name,
        defaults={
            'start_date': date(current_year, 1, 1),
            'end_date': date(current_year, 12, 31),
            'is_current': True,
            'is_closed': False
        }
    )
    if fy_created:
        created_counts['fiscal_years'] += 1

    # Ensure 12 monthly periods
    for month in range(1, 13):
        # Month start and end
        start_d = date(current_year, month, 1)
        if month == 12:
            end_d = date(current_year, 12, 31)
        else:
            end_d = date(current_year, month + 1, 1)
            # Subtract 1 day
            from datetime import timedelta
            end_d = end_d - timedelta(days=1)

        p, p_created = AccountingPeriod.objects.get_or_create(
            company=company,
            fiscal_year=fy,
            month=month,
            defaults={
                'period_number': month,
                'start_date': start_d,
                'end_date': end_d,
                'status': PeriodStatus.OPEN
            }
        )
        if p_created:
            created_counts['periods'] += 1

    # 3. Standard Security Chart of Accounts Definition
    # Structure: (code, name, type, is_header, allow_posting, is_control, parent_code, normal_balance, desc)
    accounts_spec = [
        # --- 1000 ASSETS ---
        ('1000', 'Assets', AccountType.ASSET, True, False, False, None, NormalBalance.DEBIT, 'Top-level Assets header'),
        ('1100', 'Cash & Bank Accounts', AccountType.ASSET, True, False, False, '1000', NormalBalance.DEBIT, 'Liquid cash and bank balances'),
        ('1110', 'Head Office Main Cash', AccountType.ASSET, False, True, False, '1100', NormalBalance.DEBIT, 'Physical cash in office vault'),
        ('1120', 'Operating Bank Account', AccountType.ASSET, False, True, False, '1100', NormalBalance.DEBIT, 'Primary commercial banking account'),
        ('1130', 'Petty Cash - Karachi Ops', AccountType.ASSET, False, True, False, '1100', NormalBalance.DEBIT, 'Branch / site petty cash'),
        ('1200', 'Accounts Receivable (Trade Debtors)', AccountType.ASSET, False, True, True, '1000', NormalBalance.DEBIT, 'Client invoicing receivables control account'),
        ('1300', 'Guard & Staff Advances', AccountType.ASSET, False, True, False, '1000', NormalBalance.DEBIT, 'Short-term salary and field advances to personnel'),
        ('1400', 'Security Equipment & Store Inventory', AccountType.ASSET, False, True, False, '1000', NormalBalance.DEBIT, 'Uniforms, weapons, communication gear, and CCTV equipment'),
        ('1500', 'Security Deposits & Prepayments', AccountType.ASSET, False, True, False, '1000', NormalBalance.DEBIT, 'Office, weapon licensing, and client site deposits'),

        # --- 2000 LIABILITIES ---
        ('2000', 'Liabilities', AccountType.LIABILITY, True, False, False, None, NormalBalance.CREDIT, 'Top-level Liabilities header'),
        ('2100', 'Accounts Payable (Trade Creditors)', AccountType.LIABILITY, False, True, True, '2000', NormalBalance.CREDIT, 'Vendor and supplier bills control account'),
        ('2200', 'Guard & Staff Payroll Payable', AccountType.LIABILITY, False, True, True, '2000', NormalBalance.CREDIT, 'Accrued wages, overtime, and allowances payable'),
        ('2300', 'Tax Payable (WHT / Sales Tax)', AccountType.LIABILITY, False, True, False, '2000', NormalBalance.CREDIT, 'Statutory withholding and provincial sales taxes'),
        ('2400', 'Accrued Operational Expenses', AccountType.LIABILITY, False, True, False, '2000', NormalBalance.CREDIT, 'Accrued site utilities and rent'),

        # --- 3000 EQUITY ---
        ('3000', 'Equity', AccountType.EQUITY, True, False, False, None, NormalBalance.CREDIT, 'Top-level Capital & Equity header'),
        ('3100', 'Owner / Paid-up Capital', AccountType.EQUITY, False, True, False, '3000', NormalBalance.CREDIT, 'Initial and injected company capital'),
        ('3200', 'Retained Earnings', AccountType.EQUITY, False, True, False, '3000', NormalBalance.CREDIT, 'Accumulated prior years earnings'),

        # --- 4000 REVENUE ---
        ('4000', 'Operating Revenue', AccountType.REVENUE, True, False, False, None, NormalBalance.CREDIT, 'Top-level Revenue header'),
        ('4100', 'Security Guarding Service Revenue', AccountType.REVENUE, False, True, False, '4000', NormalBalance.CREDIT, 'Monthly static & mobile guard contract billing'),
        ('4200', 'Guard Overtime Billing Revenue', AccountType.REVENUE, False, True, False, '4000', NormalBalance.CREDIT, 'Client billable overtime & extra hours'),
        ('4300', 'Extra Duty & Event Escort Revenue', AccountType.REVENUE, False, True, False, '4000', NormalBalance.CREDIT, 'Short-term VIP, event, and cash-in-transit escort revenue'),
        ('4400', 'Security Equipment & CCTV Rental Revenue', AccountType.REVENUE, False, True, False, '4000', NormalBalance.CREDIT, 'Walkie-talkie, metal detector, and camera lease revenue'),
        ('4900', 'Other Income & Financial Gains', AccountType.OTHER_INCOME, False, True, False, '4000', NormalBalance.CREDIT, 'Disposal of old assets, scrap uniforms, interest'),

        # --- 5000 COST OF SERVICES ---
        ('5000', 'Cost of Security Services', AccountType.COST_OF_SERVICE, True, False, False, None, NormalBalance.DEBIT, 'Top-level Direct Service Delivery Costs'),
        ('5100', 'Guard Base Salaries', AccountType.COST_OF_SERVICE, False, True, False, '5000', NormalBalance.DEBIT, 'Direct monthly salaries paid to field security guards'),
        ('5200', 'Guard Overtime & Holiday Pay', AccountType.COST_OF_SERVICE, False, True, False, '5000', NormalBalance.DEBIT, 'Overtime compensation and night shift allowances'),
        ('5300', 'Site Transport & Patrol Fuel', AccountType.COST_OF_SERVICE, False, True, False, '5000', NormalBalance.DEBIT, 'Mobile patrol vehicles, fuel, and guard site drop-offs'),
        ('5400', 'Guard Uniforms, Badges & Gear', AccountType.COST_OF_SERVICE, False, True, False, '5000', NormalBalance.DEBIT, 'Boots, lanyards, caps, torches, and protective vests'),
        ('5500', 'Weapons, Ammunition & Firing Range', AccountType.COST_OF_SERVICE, False, True, False, '5000', NormalBalance.DEBIT, 'Weapon maintenance, ammo replenishment, and range tests'),

        # --- 6000 OPERATING EXPENSES ---
        ('6000', 'Administrative & General Expenses', AccountType.EXPENSE, True, False, False, None, NormalBalance.DEBIT, 'Top-level SG&A Operating Expenses'),
        ('6100', 'Head Office Rent & Utilities', AccountType.EXPENSE, False, True, False, '6000', NormalBalance.DEBIT, 'Electricity, water, gas, and internet for regional offices'),
        ('6200', 'Administrative & HQ Staff Salaries', AccountType.EXPENSE, False, True, False, '6000', NormalBalance.DEBIT, 'Management, HR, billing, and control room operator wages'),
        ('6300', 'Regulatory Licensing & Legal Compliance', AccountType.EXPENSE, False, True, False, '6000', NormalBalance.DEBIT, 'Home Department security company licensing and renewals'),
        ('6400', 'Office Repairs & Maintenance', AccountType.EXPENSE, False, True, False, '6000', NormalBalance.DEBIT, 'HQ upkeep, IT infrastructure, and furniture repairs'),
        ('6500', 'Marketing, Tenders & Business Development', AccountType.EXPENSE, False, True, False, '6000', NormalBalance.DEBIT, 'Proposal preparation, client meetings, and tender fees'),
    ]

    account_map = {}
    # First pass: create accounts
    for spec in accounts_spec:
        code, name, a_type, is_hdr, allow_p, is_ctrl, p_code, n_bal, desc = spec
        acc, created = ChartOfAccount.objects.get_or_create(
            company=company,
            account_code=code,
            defaults={
                'account_name': name,
                'account_type': a_type,
                'is_header': is_hdr,
                'allow_posting': allow_p,
                'is_control_account': is_ctrl,
                'normal_balance': n_bal,
                'currency': base_curr,
                'description': desc,
                'is_active': True
            }
        )
        account_map[code] = acc
        if created:
            created_counts['accounts'] += 1

    # Second pass: wire parents
    for spec in accounts_spec:
        code, name, a_type, is_hdr, allow_p, is_ctrl, p_code, n_bal, desc = spec
        if p_code and p_code in account_map:
            acc = account_map[code]
            parent_acc = account_map[p_code]
            if acc.parent_id != parent_acc.id:
                acc.parent = parent_acc
                acc.save(update_fields=['parent'])

    # 4. Standard Cost Centers
    cost_centers_spec = [
        ('HO', 'Head Office Administration', 'HQ Management and Executive Suite'),
        ('OPS', 'Field Operations Department', 'Guard deployments, mobile patrol, and supervision'),
        ('HR', 'HR & Guard Recruitment', 'Personnel onboarding, verification, and training'),
        ('FIN', 'Finance & Billing Department', 'Client invoicing, vendor payouts, and treasury'),
    ]
    for code, name, desc in cost_centers_spec:
        cc, created = CostCenter.objects.get_or_create(
            company=company,
            code=code,
            defaults={
                'name': name,
                'description': desc,
                'is_active': True
            }
        )
        if created:
            created_counts['cost_centers'] += 1

    # 5. Standard Profit Centers
    profit_centers_spec = [
        ('SECURITY_OPS', 'Manned Guarding Operations', 'Static guarding and facility protection services'),
        ('ESCORTS_SPECIAL', 'Special Escorts & Cash Transit', 'Armed escorts, CIT, and VIP executive protection'),
    ]
    for code, name, desc in profit_centers_spec:
        pc, created = ProfitCenter.objects.get_or_create(
            company=company,
            code=code,
            defaults={
                'name': name,
                'description': desc,
                'is_active': True
            }
        )
        if created:
            created_counts['profit_centers'] += 1

    # 6. Standard Bank / Cash Accounts
    bank_account_obj = None
    if '1120' in account_map:
        bank_account_obj, created = BankAccount.objects.get_or_create(
            company=company,
            account_title='Main Operations Bank',
            defaults={
                'account_type': BankAccountType.BANK,
                'bank_name': 'Habib Bank Limited (HBL)',
                'account_number': '0012345678901',
                'iban': 'PK36HABB000012345678901',
                'branch_name': 'Main Corporate Branch',
                'chart_of_account': account_map['1120'],
                'currency': base_curr,
                'is_active': True
            }
        )
        if created:
            created_counts['bank_accounts'] += 1

    if '1110' in account_map:
        _, created = BankAccount.objects.get_or_create(
            company=company,
            account_title='Head Office Vault Cash',
            defaults={
                'account_type': BankAccountType.CASH,
                'bank_name': 'Office Vault',
                'account_number': '',
                'chart_of_account': account_map['1110'],
                'currency': base_curr,
                'is_active': True
            }
        )
        if created:
            created_counts['bank_accounts'] += 1

    # 7. Configure SecurityFinanceConfiguration
    cfg, _ = SecurityFinanceConfiguration.objects.get_or_create(
        company=company,
        defaults={
            'accounts_receivable_account': account_map.get('1200'),
            'accounts_payable_account': account_map.get('2100'),
            'payroll_payable_account': account_map.get('2200'),
            'tax_payable_account': account_map.get('2300'),
            'security_service_revenue_account': account_map.get('4100'),
            'overtime_revenue_account': account_map.get('4200'),
            'extra_duty_revenue_account': account_map.get('4300'),
            'salary_cost_account': account_map.get('5100'),
            'overtime_cost_account': account_map.get('5200'),
            'inventory_equipment_account': account_map.get('1400'),
            'default_bank_account': bank_account_obj,
            'default_currency': base_curr,
            'is_active': True
        }
    )

    return {
        'status': 'success',
        'message': f"Provisioned Security COA for {company.name}.",
        'created_counts': created_counts,
        'total_accounts': len(account_map)
    }
