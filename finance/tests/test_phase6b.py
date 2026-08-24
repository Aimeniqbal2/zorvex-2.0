from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APITestCase
from rest_framework import status
from django.contrib.auth import get_user_model
from companies.models import Company
from finance.models import (
    ChartOfAccount, AccountGroup, Currency, SalesAccountingConfiguration,
    Journal, JournalEntry, JournalEntryLine, FiscalYear, AccountingPeriod
)
from sales.models import Sale, Customer
from crm.models import CRMEntity
from finance.services.sales_accounting import (
    preview_sale_journal, create_sale_journal, reverse_sale_journal,
    validate_sale_posting, get_sale_accounts
)
from django.core.exceptions import ValidationError
from platform_core.models import ModuleDefinition, CompanyModule
from subscriptions.models import CompanySubscription, SubscriptionPlan
import datetime
from decimal import Decimal

User = get_user_model()

class Phase6BSalesFinanceIntegrationTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.company1 = Company.objects.create(name="Company 1")
        cls.company2 = Company.objects.create(name="Company 2")
        
        # Setup Subscription and modules
        plan = SubscriptionPlan.objects.create(name="Enterprise", price=100)
        CompanySubscription.objects.create(
            company=cls.company1, plan=plan, start_date=datetime.date.today(),
            end_date=datetime.date.today() + datetime.timedelta(days=30), is_active=True
        )
        CompanySubscription.objects.create(
            company=cls.company2, plan=plan, start_date=datetime.date.today(),
            end_date=datetime.date.today() + datetime.timedelta(days=30), is_active=True
        )

        cls.finance_module = ModuleDefinition.objects.get_or_create(code='finance', defaults={'name': 'Finance', 'is_active': True})[0]
        CompanyModule.objects.create(company=cls.company1, module=cls.finance_module, enabled=True)
        CompanyModule.objects.create(company=cls.company2, module=cls.finance_module, enabled=True)
        
        cls.admin1 = User.objects.create_user(username="admin1", password="pw", company=cls.company1, role='admin')
        cls.admin2 = User.objects.create_user(username="admin2", password="pw", company=cls.company2, role='admin')

        cls.currency = Currency.objects.create(company=cls.company1, code="USD", name="US Dollar", is_base_currency=True)
        
        cls.fy = FiscalYear.objects.create(
            company=cls.company1, name="FY2026",
            start_date=datetime.date(2026, 1, 1), end_date=datetime.date(2026, 12, 31),
            is_current=True
        )
        cls.period = AccountingPeriod.objects.create(
            company=cls.company1, fiscal_year=cls.fy, month=1,
            start_date=datetime.date(2026, 1, 1), end_date=datetime.date(2099, 12, 31),
            status="OPEN"
        )
        
        # Accounts
        cls.asset_group = AccountGroup.objects.create(company=cls.company1, name="Assets", group_type="ASSET")
        cls.income_group = AccountGroup.objects.create(company=cls.company1, name="Income", group_type="INCOME")
        
        cls.rev_acc = ChartOfAccount.objects.create(company=cls.company1, account_group=cls.income_group, account_code="4000", account_name="Sales Rev", account_type="Income")
        cls.cash_acc = ChartOfAccount.objects.create(company=cls.company1, account_group=cls.asset_group, account_code="1000", account_name="Cash", account_type="Asset")
        cls.ar_acc = ChartOfAccount.objects.create(company=cls.company1, account_group=cls.asset_group, account_code="1100", account_name="Accounts Receivable", account_type="Asset")
        
        # Cross company account
        cls.asset_group_c2 = AccountGroup.objects.create(company=cls.company2, name="Assets 2", group_type="ASSET")
        cls.cash_acc_c2 = ChartOfAccount.objects.create(company=cls.company2, account_group=cls.asset_group_c2, account_code="1000", account_name="Cash 2", account_type="Asset")
        
        # Sales Accounting Config
        cls.config = SalesAccountingConfiguration.objects.create(
            company=cls.company1,
            sales_revenue_account=cls.rev_acc,
            accounts_receivable_account=cls.ar_acc,
            cash_account=cls.cash_acc,
            default_currency=cls.currency,
            is_active=True
        )
        
        # CRM / Sale
        cls.crm_entity = CRMEntity.objects.create(company=cls.company1, entity_type="CUSTOMER", name="Test Customer")
        cls.customer = Customer.objects.create(company=cls.company1, name="Test Customer", phone="123", crm_entity=cls.crm_entity)
        
        # Journal
        cls.journal, _ = Journal.objects.get_or_create(company=cls.company1, code="SALES", defaults={"name": "Sales Journal", "journal_type": "SALES"})

        cls.cash_sale = Sale.objects.create(company=cls.company1, customer=cls.customer, total_amount=1000, payment_method='cash', cashier=cls.admin1)
        cls.cash_sale.created_at = datetime.datetime(2026, 1, 10, tzinfo=datetime.timezone.utc)
        cls.cash_sale.save()
        
        cls.credit_sale = Sale.objects.create(company=cls.company1, customer=cls.customer, total_amount=2000, payment_method='credit', cashier=cls.admin1)
        cls.credit_sale.created_at = datetime.datetime(2026, 1, 11, tzinfo=datetime.timezone.utc)
        cls.credit_sale.save()

    def setUp(self):
        from rest_framework_simplejwt.tokens import RefreshToken
        token = RefreshToken.for_user(self.admin1)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')

    def test_config_crud_api(self):
        """Test API permissions and CRUD for SalesAccountingConfiguration"""
        url = reverse('salesaccountingconfig-list')
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.json() if isinstance(response.json(), list) else response.json().get('results', [])
        self.assertEqual(len(results), 1)
        
        # Test creation failure for cross-company
        data = {
            "sales_revenue_account": self.rev_acc.id,
            "accounts_receivable_account": self.ar_acc.id,
            "cash_account": self.cash_acc_c2.id, # from company 2
            "default_currency": self.currency.id,
            "is_active": True
        }
        response = self.client.post(url, data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        
    def test_cross_company_protection_model(self):
        """Test model validation for cross-company accounts"""
        config2 = SalesAccountingConfiguration(
            company=self.company1,
            sales_revenue_account=self.rev_acc,
            accounts_receivable_account=self.ar_acc,
            cash_account=self.cash_acc_c2,
            default_currency=self.currency
        )
        with self.assertRaises(ValidationError):
            config2.full_clean()

    def test_preview_cash_sale_journal(self):
        """Test preview journal generation for cash sale"""
        preview = preview_sale_journal(self.cash_sale)
        self.assertEqual(preview['company'], self.company1)
        self.assertEqual(len(preview['lines']), 2)
        debit_line = next(l for l in preview['lines'] if l['debit'] > 0)
        credit_line = next(l for l in preview['lines'] if l['credit'] > 0)
        self.assertEqual(debit_line['account'], self.cash_acc)
        self.assertEqual(credit_line['account'], self.rev_acc)
        self.assertEqual(debit_line['debit'], 1000)
        self.assertEqual(credit_line['credit'], 1000)

    def test_preview_credit_sale_journal(self):
        """Test preview journal generation for credit sale"""
        preview = preview_sale_journal(self.credit_sale)
        debit_line = next(l for l in preview['lines'] if l['debit'] > 0)
        self.assertEqual(debit_line['account'], self.ar_acc)

    def test_create_sale_journal(self):
        """Test actual journal generation"""
        entry = self.cash_sale.journal_entry
        self.assertIsNotNone(entry)
        self.assertEqual(entry.status, "POSTED")
        self.assertEqual(entry.source_module, "sales")
        self.assertEqual(entry.source_document_id, self.cash_sale.id)
        
        lines = entry.lines.all()
        self.assertEqual(lines.count(), 2)
        debit_line = lines.get(debit__gt=0)
        self.assertEqual(debit_line.account, self.cash_acc)
        self.assertEqual(debit_line.crm_entity, self.crm_entity)
        
        # Test validation fails if already posted
        with self.assertRaises(ValidationError):
            create_sale_journal(self.cash_sale)
            
    def test_reverse_sale_journal(self):
        """Test reversal journal generation"""
        entry = self.cash_sale.journal_entry
        self.cash_sale.status = 'CANCELLED'
        # To simulate a cancellation just set it manually for the test purpose, even though it doesn't exist
        setattr(self.cash_sale, 'status', 'CANCELLED')
        # Phase 6E: Saving it automatically generates the reversal
        self.cash_sale.save()
        
        reversal = JournalEntry.objects.get(source_document_id=self.cash_sale.id, source_document_type="Sale Reversal")
        self.assertEqual(reversal.status, "POSTED")
        self.assertEqual(reversal.source_document_type, "Sale Reversal")
        
        r_lines = reversal.lines.all()
        r_debit = r_lines.get(debit__gt=0)
        self.assertEqual(r_debit.account, self.rev_acc) # Revenue gets debited in reversal
        self.assertEqual(r_debit.debit, 1000)
        
    def test_validation_failures(self):
        """Test validation engine blocks invalid postings"""
        bad_sale = Sale.objects.create(company=self.company1, total_amount=500, payment_method='cash', cashier=self.admin1)
        bad_sale.created_at = datetime.datetime(2026, 1, 10, tzinfo=datetime.timezone.utc)
        bad_sale.save()
        # No customer
        with self.assertRaises(ValidationError):
            validate_sale_posting(bad_sale)
            
        bad_sale.customer = self.customer
        bad_sale.save()
        
        # Closed period
        self.period.status = 'CLOSED'
        self.period.save()
        with self.assertRaises(ValidationError):
            validate_sale_posting(bad_sale)
