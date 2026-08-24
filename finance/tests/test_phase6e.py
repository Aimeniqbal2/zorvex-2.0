import datetime
import io
import decimal
from unittest.mock import patch
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
from django.core.management import call_command
from rest_framework.test import APIClient
from django.urls import reverse

from companies.models import Company
from sales.models import Sale, Customer, CustomerCreditLedger, POSSession
from crm.models import CRMEntity
from finance.models import Journal, JournalEntry, SalesAccountingConfiguration, AccountingPeriod, ChartOfAccount, Currency, AccountGroup, FiscalYear
from platform_core.models import CompanyModule, ModuleDefinition

User = get_user_model()

class Phase6EIntegrationTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.company = Company.objects.create(name="Company 6E")
        cls.company2 = Company.objects.create(name="Company 6E 2")
        mod_sales, _ = ModuleDefinition.objects.get_or_create(code='sales', defaults={'name': 'Sales'})
        mod_finance, _ = ModuleDefinition.objects.get_or_create(code='finance', defaults={'name': 'Finance'})
        CompanyModule.objects.create(company=cls.company, module=mod_sales, enabled=True)
        CompanyModule.objects.create(company=cls.company, module=mod_finance, enabled=True)
        
        cls.user = User.objects.create_user(username="cashier_6e", password="pw", company=cls.company)
        cls.user.role = 'cashier'
        cls.user.save()
        
        # Setup currency
        cls.currency = Currency.objects.create(company=cls.company, code='USD', name='US Dollar', symbol='$')
        
        # Setup Chart of Accounts
        cls.group_asset = AccountGroup.objects.create(company=cls.company, name="Assets", group_type="ASSET")
        cls.group_revenue = AccountGroup.objects.create(company=cls.company, name="Revenue", group_type="REVENUE")
        
        cls.cash_acc = ChartOfAccount.objects.create(company=cls.company, account_group=cls.group_asset, account_code="1000", account_name="Cash", account_type="ASSET")
        cls.ar_acc = ChartOfAccount.objects.create(company=cls.company, account_group=cls.group_asset, account_code="1200", account_name="Accounts Receivable", account_type="ASSET")
        cls.bank_acc = ChartOfAccount.objects.create(company=cls.company, account_group=cls.group_asset, account_code="1100", account_name="Bank", account_type="ASSET")
        cls.rev_acc = ChartOfAccount.objects.create(company=cls.company, account_group=cls.group_revenue, account_code="4000", account_name="Sales Revenue", account_type="REVENUE")
        
        cls.config = SalesAccountingConfiguration.objects.create(
            company=cls.company,
            default_currency=cls.currency,
            cash_account=cls.cash_acc,
            bank_account=cls.bank_acc,
            accounts_receivable_account=cls.ar_acc,
            sales_revenue_account=cls.rev_acc,
        )
        
        cls.fy = FiscalYear.objects.create(
            company=cls.company,
            name="2020",
            start_date=datetime.date(2020, 1, 1),
            end_date=datetime.date(2099, 12, 31)
        )
        
        cls.period = AccountingPeriod.objects.create(
            company=cls.company,
            fiscal_year=cls.fy,
            month=1,
            start_date=datetime.date(2020, 1, 1),
            end_date=datetime.date(2099, 12, 31),
            status='OPEN'
        )
        
        cls.crm_entity = CRMEntity.objects.create(company=cls.company, name="John Doe", entity_type='customer')
        cls.customer = Customer.objects.create(company=cls.company, name="John Doe", crm_entity=cls.crm_entity)
        
        cls.session = POSSession.objects.create(company=cls.company, cashier=cls.user, opening_cash=100.00)

    def setUp(self):
        self.client.force_authenticate(user=self.user)

    def test_cash_sale_creates_journal_entry(self):
        sale = Sale.objects.create(
            company=self.company,
            cashier=self.user,
            customer=self.customer,
            pos_session=self.session,
            payment_method='cash',
            total_amount=decimal.Decimal('150.00')
        )
        sale.refresh_from_db()
        self.assertIsNotNone(sale.journal_entry)
        self.assertEqual(sale.journal_entry.status, 'POSTED')
        
        lines = sale.journal_entry.lines.all()
        self.assertEqual(lines.count(), 2)
        debit_line = lines.get(debit__gt=0)
        credit_line = lines.get(credit__gt=0)
        
        self.assertEqual(debit_line.account, self.cash_acc)
        self.assertEqual(debit_line.debit, decimal.Decimal('150.00'))
        
        self.assertEqual(credit_line.account, self.rev_acc)
        self.assertEqual(credit_line.credit, decimal.Decimal('150.00'))

    def test_credit_sale_syncs_ledger_and_journal(self):
        sale = Sale.objects.create(
            company=self.company,
            cashier=self.user,
            customer=self.customer,
            pos_session=self.session,
            payment_method='credit',
            total_amount=decimal.Decimal('200.00')
        )
        sale.refresh_from_db()
        
        # Check Sale's journal
        self.assertIsNotNone(sale.journal_entry)
        debit_line = sale.journal_entry.lines.get(debit__gt=0)
        self.assertEqual(debit_line.account, self.ar_acc)
        self.assertEqual(debit_line.debit, decimal.Decimal('200.00'))
        
        # Check CustomerCreditLedger
        ledger = CustomerCreditLedger.objects.get(sale=sale)
        self.assertEqual(ledger.journal_entry, sale.journal_entry)
        self.assertEqual(ledger.transaction_type, 'DEBIT')

    def test_split_payment_journal(self):
        sale = Sale.objects.create(
            company=self.company,
            cashier=self.user,
            customer=self.customer,
            pos_session=self.session,
            payment_method='split',
            total_amount=decimal.Decimal('300.00'),
            split_cash=decimal.Decimal('100.00'),
            split_card=decimal.Decimal('150.00')
            # remaining 50 is credit
        )
        lines = sale.journal_entry.lines.all()
        self.assertEqual(lines.count(), 4) # 3 debits, 1 credit
        self.assertEqual(lines.filter(account=self.cash_acc).first().debit, decimal.Decimal('100.00'))
        self.assertEqual(lines.filter(account=self.bank_acc).first().debit, decimal.Decimal('150.00'))
        self.assertEqual(lines.filter(account=self.ar_acc).first().debit, decimal.Decimal('50.00'))

    def test_sale_cancellation_reverses_journal(self):
        sale = Sale.objects.create(
            company=self.company,
            cashier=self.user,
            customer=self.customer,
            pos_session=self.session,
            payment_method='cash',
            total_amount=decimal.Decimal('50.00')
        )
        original_je = sale.journal_entry
        self.assertEqual(original_je.status, 'POSTED')
        
        # Cancel sale
        sale.status = 'CANCELLED'
        sale.save()
        
        original_je.refresh_from_db()
        self.assertEqual(original_je.status, 'REVERSED')
        
        reversal = JournalEntry.objects.filter(reference=original_je.entry_number).first()
        self.assertIsNotNone(reversal)
        self.assertEqual(reversal.status, 'POSTED')
        self.assertEqual(reversal.source_document_type, 'Sale Reversal')
        
        # Ensure reversed debits/credits
        debit_line = reversal.lines.get(debit__gt=0)
        self.assertEqual(debit_line.account, self.rev_acc) # Revenue is debited to reverse

    def test_customer_payment_creates_receipt_journal(self):
        # A credit payment
        ledger = CustomerCreditLedger.objects.create(
            company=self.company,
            customer=self.customer,
            crm_entity=self.crm_entity,
            transaction_type='CREDIT',
            amount=decimal.Decimal('75.00'),
            notes="Payment"
        )
        ledger.refresh_from_db()
        self.assertIsNotNone(ledger.journal_entry)
        self.assertEqual(ledger.journal_entry.journal.code, 'RECEIPTS')
        
        lines = ledger.journal_entry.lines.all()
        debit_line = lines.get(debit__gt=0)
        credit_line = lines.get(credit__gt=0)
        
        self.assertEqual(debit_line.account, self.cash_acc)
        self.assertEqual(credit_line.account, self.ar_acc)

    def test_delete_protection_via_api(self):
        sale = Sale.objects.create(
            company=self.company,
            cashier=self.user,
            customer=self.customer,
            pos_session=self.session,
            payment_method='cash',
            total_amount=decimal.Decimal('100.00')
        )
        
        # Give admin role to test deletion logic
        self.user.role = 'admin'
        self.user.save()
        
        # Attempt delete via API
        with patch('erp_core.middleware.get_current_company', return_value=self.company.id):
            response = self.client.delete(
                reverse('sale-detail', args=[sale.id]),
                HTTP_X_COMPANY_ID=str(self.company.id)
            )
        self.assertEqual(response.status_code, 400)
        self.assertIn('error', response.data)
        
        # Check it still exists
        self.assertTrue(Sale.objects.filter(id=sale.id).exists())
