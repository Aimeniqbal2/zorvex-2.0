from decimal import Decimal
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient
from django.contrib.auth import get_user_model
from companies.models import Company
from finance.models import (
    AccountGroup, ChartOfAccount, FiscalYear, Currency,
    Budget, BudgetLine, Journal, JournalEntry, JournalEntryLine
)
from reports.models import Target
from reports.services.analytics.budget_vs_actual import BudgetVsActualService
from reports.services.analytics.target_performance import TargetPerformanceService
import datetime

User = get_user_model()

class Phase8G2Tests(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Test Company")
        self.other_company = Company.objects.create(name="Other Company")
        
        self.user = User.objects.create_user(
            username="admin", email="admin@test.com", password="password",
            company=self.company, role="admin", is_superuser=True
        )
        self.other_user = User.objects.create_user(
            username="otheradmin", email="other@test.com", password="password",
            company=self.other_company, role="admin", is_superuser=True
        )
        
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

        self.currency = Currency.objects.create(company=self.company, code='USD', name='US Dollar')
        self.fiscal_year = FiscalYear.objects.create(
            company=self.company,
            name="2023",
            start_date=datetime.date(2023, 1, 1),
            end_date=datetime.date(2023, 12, 31),
            is_current=True
        )
        self.account_group = AccountGroup.objects.create(
            company=self.company, name="Expenses", group_type="EXPENSE"
        )
        self.account = ChartOfAccount.objects.create(
            company=self.company,
            account_group=self.account_group,
            account_code="6000",
            account_name="Rent",
            currency=self.currency
        )
        
        self.budget = Budget.objects.create(
            company=self.company,
            name="2023 Rent Budget",
            fiscal_year=self.fiscal_year,
            currency=self.currency,
            status='DRAFT'
        )
        self.budget_line = BudgetLine.objects.create(
            company=self.company,
            budget=self.budget,
            account=self.account,
            amount=Decimal("12000.00")
        )
        
        self.target = Target.objects.create(
            company=self.company,
            target_type="REVENUE",
            target_value=Decimal("50000.00"),
            period_start=datetime.date(2023, 1, 1),
            period_end=datetime.date(2023, 3, 31)
        )

    def test_budget_crud(self):
        # Read
        url = reverse('budget-list')
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        
        # Create
        data = {
            'name': 'New Budget',
            'fiscal_year': self.fiscal_year.id,
            'currency': self.currency.id,
            'status': 'DRAFT',
            'company': self.company.id
        }
        response = self.client.post(url, data)
        if response.status_code != status.HTTP_201_CREATED:
            print("BUDGET CREATE ERROR:", response.data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_budget_tenant_isolation(self):
        self.client.force_authenticate(user=self.other_user)
        url = reverse('budget-list')
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 0)

    def test_target_crud(self):
        url = reverse('target-list')
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        
        data = {
            'target_type': 'SALES',
            'target_value': '10000.00',
            'period_start': '2023-01-01',
            'period_end': '2023-12-31',
            'company': self.company.id
        }
        response = self.client.post(url, data)
        if response.status_code != status.HTTP_201_CREATED:
            print("TARGET CREATE ERROR:", response.data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_target_tenant_isolation(self):
        self.client.force_authenticate(user=self.other_user)
        url = reverse('target-list')
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 0)

    def test_budget_vs_actual_service(self):
        journal = Journal.objects.create(company=self.company, name="General", code="GEN")
        journal_entry = JournalEntry.objects.create(
            company=self.company,
            journal=journal,
            entry_number="JE-001",
            entry_date=datetime.date(2023, 2, 1),
            status='POSTED'
        )
        JournalEntryLine.objects.create(
            company=self.company,
            journal_entry=journal_entry,
            account=self.account,
            debit=Decimal("1500.00"),
            credit=Decimal("0.00")
        )
        
        service = BudgetVsActualService(company_id=self.company.id)
        results = service.get_budget_vs_actual(budget_id=self.budget.id)
        
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['budget'], 12000.0)
        self.assertEqual(results[0]['actual'], 1500.0)
        self.assertEqual(results[0]['variance'], 10500.0)

    def test_target_performance_service(self):
        rev_group = AccountGroup.objects.create(
            company=self.company, name="Revenue", group_type="INCOME"
        )
        rev_account = ChartOfAccount.objects.create(
            company=self.company, account_group=rev_group,
            account_code="4000", account_name="Sales",
            currency=self.currency
        )
        
        journal = Journal.objects.create(company=self.company, name="Sales", code="SAL")
        journal_entry = JournalEntry.objects.create(
            company=self.company, journal=journal,
            entry_number="JE-002", entry_date=datetime.date(2023, 2, 1),
            status='POSTED'
        )
        JournalEntryLine.objects.create(
            company=self.company, journal_entry=journal_entry,
            account=rev_account, debit=Decimal("0.00"), credit=Decimal("20000.00")
        )
        
        service = TargetPerformanceService(company_id=self.company.id)
        results = service.get_target_performance(target_id=self.target.id)
        
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['target'], 50000.0)
        self.assertEqual(results[0]['actual'], 20000.0)
        self.assertEqual(results[0]['variance'], -30000.0)
        self.assertEqual(results[0]['achievement_percent'], 40.0)
