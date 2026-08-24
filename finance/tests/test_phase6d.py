import io
import datetime
from decimal import Decimal
from django.test import TestCase
from django.core.management import call_command
from django.contrib.auth import get_user_model

from companies.models import Company
from sales.models import Sale, Customer, CustomerCreditLedger
from crm.models import CRMEntity
from finance.models import Journal, JournalEntry, SalesAccountingConfiguration, AccountingPeriod, ChartOfAccount, Currency, AccountGroup, FiscalYear

User = get_user_model()

class Phase6DMigrationTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.company = Company.objects.create(name="Company 6D")
        cls.company2 = Company.objects.create(name="Company 6D 2")
        cls.user = User.objects.create_user(username="u6d", password="pw", company=cls.company)
        
        cls.currency = Currency.objects.create(company=cls.company, code="USD", name="US Dollar", symbol="$")
        cls.ag_asset = AccountGroup.objects.create(company=cls.company, name="Assets", group_type="ASSET")
        cls.ag_rev = AccountGroup.objects.create(company=cls.company, name="Revenue", group_type="REVENUE")
        
        cls.cash_acc = ChartOfAccount.objects.create(company=cls.company, account_group=cls.ag_asset, account_code="1000", account_name="Cash", account_type="ASSET")
        cls.ar_acc = ChartOfAccount.objects.create(company=cls.company, account_group=cls.ag_asset, account_code="1200", account_name="AR", account_type="ASSET")
        cls.rev_acc = ChartOfAccount.objects.create(company=cls.company, account_group=cls.ag_rev, account_code="4000", account_name="Revenue", account_type="REVENUE")
        
        cls.config = SalesAccountingConfiguration.objects.create(
            company=cls.company,
            is_active=True,
            default_currency=cls.currency,
            cash_account=cls.cash_acc,
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
        
        cls.crm = CRMEntity.objects.create(company=cls.company, name="C1")
        cls.customer = Customer.objects.create(company=cls.company, name="Cust 1", crm_entity=cls.crm)
        
        cls.sale1 = Sale.objects.create(
            company=cls.company, 
            customer=cls.customer, 
            crm_entity=cls.crm,
            cashier=cls.user,
            total_amount=Decimal('100.00'),
            payment_method='cash'
        )
        
        cls.sale_credit = Sale.objects.create(
            company=cls.company, 
            customer=cls.customer, 
            crm_entity=cls.crm,
            cashier=cls.user,
            total_amount=Decimal('50.00'),
            payment_method='credit'
        )
        
        cls.ccl = CustomerCreditLedger.objects.create(
            company=cls.company,
            customer=cls.customer,
            crm_entity=cls.crm,
            sale=cls.sale_credit,
            transaction_type='DEBIT',
            amount=Decimal('50.00')
        )
        
        # Cross company
        cls.sale_other = Sale.objects.create(
            company=cls.company2, 
            cashier=cls.user,
            total_amount=Decimal('100.00'),
            payment_method='cash'
        )
        
        # Simulate historical pre-Phase6E data
        Sale.objects.all().update(journal_entry=None)
        CustomerCreditLedger.objects.all().update(journal_entry=None)
        JournalEntry.objects.all().delete()

    def test_migration_and_idempotency(self):
        out = io.StringIO()
        call_command('migrate_sales_to_finance', stdout=out)
        
        self.sale1.refresh_from_db()
        self.assertIsNotNone(self.sale1.journal_entry)
        self.assertEqual(self.sale1.journal_entry.source_module, 'sales')
        
        self.sale_credit.refresh_from_db()
        self.assertIsNotNone(self.sale_credit.journal_entry)
        
        self.ccl.refresh_from_db()
        self.assertEqual(self.ccl.journal_entry, self.sale_credit.journal_entry)
        
        # Idempotency
        count_before = JournalEntry.objects.count()
        call_command('migrate_sales_to_finance', stdout=out)
        self.assertEqual(JournalEntry.objects.count(), count_before)

    def test_rollback(self):
        call_command('migrate_sales_to_finance')
        self.sale1.refresh_from_db()
        self.assertIsNotNone(self.sale1.journal_entry)
        
        call_command('migrate_sales_to_finance', rollback=True)
        self.sale1.refresh_from_db()
        self.assertIsNone(self.sale1.journal_entry)
        self.ccl.refresh_from_db()
        self.assertIsNone(self.ccl.journal_entry)
        
        self.assertEqual(JournalEntry.objects.filter(source_module='sales').count(), 0)

    def test_missing_crm_skip(self):
        sale_no_crm = Sale.objects.create(
            company=self.company, 
            cashier=self.user,
            total_amount=Decimal('100.00'),
            payment_method='cash'
        ) # no customer/crm
        
        out = io.StringIO()
        call_command('migrate_sales_to_finance', stdout=out)
        output = out.getvalue()
        
        sale_no_crm.refresh_from_db()
        self.assertIsNone(sale_no_crm.journal_entry)
        self.assertIn("Sale must have a customer.", output)

    def test_closed_period_skip(self):
        self.period.status = 'CLOSED'
        self.period.save()
        
        out = io.StringIO()
        call_command('migrate_sales_to_finance', stdout=out)
        
        self.sale1.refresh_from_db()
        self.assertIsNone(self.sale1.journal_entry)
        
        self.period.status = 'OPEN'
        self.period.save()

    def test_verify_command(self):
        call_command('migrate_sales_to_finance')
        
        out = io.StringIO()
        call_command('verify_sales_finance_migration', stdout=out)
        output = out.getvalue()
        
        self.assertIn("[WARNING] 1 Sales missing journal bridges", output) # sale_other skipped because company2 has no config
        
        # Induce a duplicate
        self.sale1.refresh_from_db()
        je = self.sale1.journal_entry
        je.pk = None
        je.entry_number = "DUPLICATE-123"
        je.save()
        
        out2 = io.StringIO()
        call_command('verify_sales_finance_migration', stdout=out2)
        output2 = out2.getvalue()
        self.assertIn("Duplicate JournalEntry", output2)
