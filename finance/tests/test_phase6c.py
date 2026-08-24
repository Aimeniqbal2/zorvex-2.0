import datetime
from django.core.management import call_command
from django.core.exceptions import ValidationError
from django.test import TestCase
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
from companies.models import Company
from sales.models import Sale, Customer, CustomerCreditLedger
from finance.models import JournalEntry, Journal, AccountingPeriod, FiscalYear
from finance.services.compatibility import get_architecture_state, resolve_sale, get_journal_entry
from sales.serializers import SaleSerializer, CustomerCreditLedgerSerializer
from sales.admin import SaleAdmin
from django.contrib.admin.sites import site
import io

User = get_user_model()

class Phase6CSalesFinanceBridgeTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.company1 = Company.objects.create(name="Company 1")
        cls.company2 = Company.objects.create(name="Company 2")
        cls.admin1 = User.objects.create_user(username="admin1", password="pw", company=cls.company1, role='admin')
        
        cls.customer = Customer.objects.create(company=cls.company1, name="Cust 1")
        
        cls.journal1 = Journal.objects.create(company=cls.company1, code="J1", name="J1", journal_type="SALES")
        cls.journal2 = Journal.objects.create(company=cls.company2, code="J2", name="J2", journal_type="SALES")
        
        cls.je1 = JournalEntry.objects.create(company=cls.company1, journal=cls.journal1, entry_date=datetime.date.today())
        cls.je2 = JournalEntry.objects.create(company=cls.company2, journal=cls.journal2, entry_date=datetime.date.today())

        cls.sale1 = Sale.objects.create(company=cls.company1, customer=cls.customer, payment_method='cash', cashier=cls.admin1)

    def test_bridge_creation_and_validation(self):
        # Valid bridge
        self.sale1.journal_entry = self.je1
        self.sale1.full_clean() # Should pass

    def test_cross_company_rejection(self):
        # Invalid bridge
        self.sale1.journal_entry = self.je2
        with self.assertRaises(ValidationError):
            self.sale1.full_clean()

    def test_compatibility_services(self):
        self.sale1.journal_entry = self.je1
        self.sale1.save()
        
        # Test get_architecture_state
        self.assertEqual(get_architecture_state(self.sale1), "Bridge")
        
        legacy_sale = Sale.objects.create(company=self.company1, customer=self.customer, payment_method='cash', cashier=self.admin1)
        self.assertEqual(get_architecture_state(legacy_sale), "Legacy")
        self.assertEqual(get_architecture_state(self.je1), "Universal Finance")
        
        # Test resolve_sale
        resolved_sale = resolve_sale(self.je1)
        self.assertEqual(resolved_sale, self.sale1)
        
        # Test get_journal_entry
        self.assertEqual(get_journal_entry(self.sale1), self.je1)

    def test_serializer_output(self):
        self.sale1.journal_entry = self.je1
        self.sale1.save()
        
        serializer = SaleSerializer(self.sale1)
        self.assertIn('journal_entry', serializer.data)
        self.assertIn('architecture_state', serializer.data)
        self.assertEqual(serializer.data['journal_entry'], self.je1.id)
        self.assertEqual(serializer.data['architecture_state'], "Bridge")

    def test_admin_display(self):
        admin_instance = SaleAdmin(Sale, site)
        self.assertIn('finance_architecture_state', admin_instance.list_display)
        self.assertIn('journal_entry', admin_instance.list_display)
        self.assertIn('journal_entry', admin_instance.list_select_related)

    def test_audit_command(self):
        # Create a bad state
        # Django doesn't let us easily save a bad foreign key if full_clean is called,
        # but we can force it with update()
        
        Sale.objects.filter(id=self.sale1.id).update(journal_entry=self.je2)
        
        out = io.StringIO()
        call_command('audit_finance_bridge', stdout=out)
        output = out.getvalue()
        
        self.assertIn("have cross-company JournalEntry references", output)
        self.assertIn("Audit FAIL: Broken bridges detected", output)
        
        # Clean it up
        Sale.objects.filter(id=self.sale1.id).update(journal_entry=self.je1)
        out2 = io.StringIO()
        call_command('audit_finance_bridge', stdout=out2)
        output2 = out2.getvalue()
        
        self.assertIn("Audit PASS: All bridges valid.", output2)
