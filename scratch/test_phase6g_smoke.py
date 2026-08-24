import datetime
import decimal
from django.test import TestCase
from rest_framework.test import APIClient
from django.contrib.auth import get_user_model
from django.urls import reverse
from unittest.mock import patch
from django.utils import timezone

from companies.models import Company
from platform_core.models import CompanyModule, ModuleDefinition, Warehouse, Branch
from crm.models import CRMEntity
from sales.models import Customer, CustomerCreditLedger, POSSession, Sale, SaleItem
from finance.models import (
    Currency, AccountGroup, ChartOfAccount, Journal, JournalEntry, JournalEntryLine, 
    SalesAccountingConfiguration, FiscalYear, AccountingPeriod
)
from inventory.models import Category, Product, Item, InventoryBalance, StockMovement, Vendor, PurchaseOrder, PurchaseOrderItem
from inventory.services import transaction_service
from django.core.exceptions import ValidationError

User = get_user_model()

class Phase6GSmokeTest(TestCase):
    @classmethod
    def setUpTestData(cls):
        # --------------------------------------------------
        # TEST ENVIRONMENT
        # --------------------------------------------------
        # Companies
        cls.company_a = Company.objects.create(name="Company A", business_type="retail")
        cls.company_b = Company.objects.create(name="Company B", business_type="retail")
        
        # Modules
        for code in ["inventory", "sales", "purchasing", "finance", "crm"]:
            mod, _ = ModuleDefinition.objects.get_or_create(code=code, defaults={"name": code})
            CompanyModule.objects.create(company=cls.company_a, module=mod, enabled=True)
            CompanyModule.objects.create(company=cls.company_b, module=mod, enabled=True)
            
        # Users
        cls.user_a = User.objects.create_user(username="admin_a", password="pw", company=cls.company_a, role="admin")
        cls.user_b = User.objects.create_user(username="admin_b", password="pw", company=cls.company_b, role="admin")
        
        # Branch & Warehouse
        cls.branch_a = Branch.objects.create(company=cls.company_a, name="Branch A")
        cls.warehouse_a = Warehouse.objects.create(company=cls.company_a, branch=cls.branch_a, name="WH A", code="WHA")
        
        cls.branch_b = Branch.objects.create(company=cls.company_b, name="Branch B")
        cls.warehouse_b = Warehouse.objects.create(company=cls.company_b, branch=cls.branch_b, name="WH B", code="WHB")
        
        # Universal Item
        cls.cat_a = Category.objects.create(company=cls.company_a, name="Cat A")
        cls.product_a = Product.objects.create(company=cls.company_a, category=cls.cat_a, model_name="Prod A", sale_price=100)
        cls.item_a = Item.objects.create(company=cls.company_a, item_code="ITEM-A", name="Universal Item A", track_inventory=True)
        
        # CRM Entities
        cls.crm_customer_a = CRMEntity.objects.create(company=cls.company_a, name="Customer A", entity_type="customer", code="CUST-A")
        cls.customer_a = Customer.objects.create(company=cls.company_a, name="Customer A", crm_entity=cls.crm_customer_a)
        
        cls.crm_vendor_a = CRMEntity.objects.create(company=cls.company_a, name="Vendor A", entity_type="supplier", code="VEND-A")
        cls.vendor_a = Vendor.objects.create(company=cls.company_a, name="Vendor A", crm_entity=cls.crm_vendor_a)
        
        # Finance Config for Company A
        cls.currency = Currency.objects.create(company=cls.company_a, code="USD", name="Dollar", symbol="$")
        cls.group_asset = AccountGroup.objects.create(company=cls.company_a, name="Assets", group_type="ASSET")
        cls.group_liability = AccountGroup.objects.create(company=cls.company_a, name="Liabilities", group_type="LIABILITY")
        cls.group_rev = AccountGroup.objects.create(company=cls.company_a, name="Revenue", group_type="REVENUE")
        cls.group_exp = AccountGroup.objects.create(company=cls.company_a, name="Expense", group_type="EXPENSE")
        
        cls.acc_cash = ChartOfAccount.objects.create(company=cls.company_a, account_group=cls.group_asset, account_code="1000", account_name="Cash", account_type="Asset")
        cls.acc_bank = ChartOfAccount.objects.create(company=cls.company_a, account_group=cls.group_asset, account_code="1100", account_name="Bank", account_type="Asset")
        cls.acc_ar = ChartOfAccount.objects.create(company=cls.company_a, account_group=cls.group_asset, account_code="1200", account_name="Accounts Receivable", account_type="Asset")
        cls.acc_inv = ChartOfAccount.objects.create(company=cls.company_a, account_group=cls.group_asset, account_code="1300", account_name="Inventory", account_type="Asset")
        cls.acc_ap = ChartOfAccount.objects.create(company=cls.company_a, account_group=cls.group_liability, account_code="2000", account_name="Accounts Payable", account_type="Liability")
        cls.acc_rev = ChartOfAccount.objects.create(company=cls.company_a, account_group=cls.group_rev, account_code="4000", account_name="Sales Revenue", account_type="Revenue")
        
        cls.sales_config = SalesAccountingConfiguration.objects.create(
            company=cls.company_a, default_currency=cls.currency,
            cash_account=cls.acc_cash, bank_account=cls.acc_bank,
            accounts_receivable_account=cls.acc_ar, sales_revenue_account=cls.acc_rev
        )
        
        # Finance Config for Company B
        cls.currency_b = Currency.objects.create(company=cls.company_b, code="EUR", name="Euro", symbol="€")
        
        # Period
        cls.fy = FiscalYear.objects.create(company=cls.company_a, name="2026", start_date=datetime.date(2026, 1, 1), end_date=datetime.date(2026, 12, 31))
        cls.period = AccountingPeriod.objects.create(company=cls.company_a, fiscal_year=cls.fy, month=1, start_date=datetime.date(2026, 1, 1), end_date=datetime.date(2026, 1, 31), status="OPEN")
        cls.period_closed = AccountingPeriod.objects.create(company=cls.company_a, fiscal_year=cls.fy, month=2, start_date=datetime.date(2026, 2, 1), end_date=datetime.date(2026, 2, 28), status="CLOSED")
        cls.period_locked = AccountingPeriod.objects.create(company=cls.company_a, fiscal_year=cls.fy, month=3, start_date=datetime.date(2026, 3, 1), end_date=datetime.date(2026, 3, 31), status="LOCKED")

    def setUp(self):
        self.client_a = APIClient()
        self.client_a.force_authenticate(user=self.user_a)
        
        self.client_b = APIClient()
        self.client_b.force_authenticate(user=self.user_b)
        
        self.session_a = POSSession.objects.create(company=self.company_a, cashier=self.user_a, opening_cash=100)

    # --------------------------------------------------
    # WORKFLOW 1 — CUSTOMER → SALE → PAYMENT → JOURNAL → LEDGER
    # --------------------------------------------------
    def test_workflow_1_customer_sale_payment_journal_ledger(self):
        # 1. Customer Verification
        self.assertTrue(Customer.objects.filter(id=self.customer_a.id).exists())
        self.assertEqual(self.customer_a.company, self.company_a)
        
        # Company B cannot access Customer A
        with patch('erp_core.middleware.get_current_company', return_value=self.company_b.id):
            res = self.client_b.get(f'/api/crm/customers/{self.customer_a.id}/', HTTP_X_COMPANY_ID=str(self.company_b.id))
            self.assertEqual(res.status_code, 404)
        
        # 2. Create Sale
        # First stock up inventory
        transaction_service.process_transaction(
            company=self.company_a, item=self.item_a, warehouse=self.warehouse_a,
            movement_type='OPENING_BALANCE', quantity=50, reference="INIT"
        )
        
        # Credit Sale
        sale = Sale.objects.create(
            company=self.company_a, cashier=self.user_a, customer=self.customer_a, 
            pos_session=self.session_a, payment_method='credit', 
            total_amount=decimal.Decimal('500.00'), status='COMPLETED'
        )
        sale.created_at = timezone.make_aware(datetime.datetime(2026, 1, 15, 12, 0, 0))
        sale.save()
        SaleItem.objects.create(company=self.company_a, sale=sale, product=self.product_a, item=self.item_a, quantity=5, unit_price=100)
        
        # Inventory Deduction via transaction_service (simulating POS checkout)
        transaction_service.process_transaction(
            company=self.company_a, item=self.item_a, warehouse=self.warehouse_a,
            movement_type='SALE', quantity=5, reference=f"SALE-{sale.id}"
        )
        
        sale.refresh_from_db()
        self.assertIsNotNone(sale.journal_entry)
        self.assertEqual(sale.journal_entry.source_document_id, sale.id)
        self.assertTrue(sale.journal_entry.lines.filter(crm_entity=self.crm_customer_a).exists())
        
        # 3. Verify Double Entry
        je = sale.journal_entry
        self.assertEqual(je.status, 'POSTED')
        
        total_debit = sum(line.debit for line in je.lines.all())
        total_credit = sum(line.credit for line in je.lines.all())
        self.assertEqual(total_debit, total_credit)
        self.assertEqual(total_debit, decimal.Decimal('500.00'))
        
        # Check specific lines
        ar_line = je.lines.get(debit__gt=0)
        rev_line = je.lines.get(credit__gt=0)
        self.assertEqual(ar_line.account, self.acc_ar)
        self.assertEqual(rev_line.account, self.acc_rev)
        
        # 4. Verify Ledger matches POSTED lines
        self.acc_ar.refresh_from_db()
        self.assertEqual(self.acc_ar.current_balance, decimal.Decimal('500.00'))
        
        self.acc_rev.refresh_from_db()
        self.assertEqual(self.acc_rev.current_balance, decimal.Decimal('500.00')) # Rev is credit balance
        
        # 5. Customer Payment
        payment = CustomerCreditLedger.objects.create(
            company=self.company_a, customer=self.customer_a, crm_entity=self.crm_customer_a,
            transaction_type='CREDIT', amount=decimal.Decimal('300.00')
        )
        payment.created_at = timezone.make_aware(datetime.datetime(2026, 1, 16, 12, 0, 0))
        payment.save()
        
        self.customer_a.refresh_from_db()
        self.assertEqual(self.customer_a.balance, decimal.Decimal('200.00'))
        
        self.assertIsNotNone(payment.journal_entry)
        je_payment = payment.journal_entry
        self.assertEqual(je_payment.status, 'POSTED')
        
        # Check payment lines
        p_cash = je_payment.lines.get(debit__gt=0)
        p_ar = je_payment.lines.get(credit__gt=0)
        self.assertEqual(p_cash.account, self.acc_cash)
        self.assertEqual(p_ar.account, self.acc_ar)
        self.assertEqual(p_cash.debit, decimal.Decimal('300.00'))
        
        # Verify ledger again
        self.acc_ar.refresh_from_db()
        self.assertEqual(self.acc_ar.current_balance, decimal.Decimal('200.00'))
        self.acc_cash.refresh_from_db()
        self.assertEqual(self.acc_cash.current_balance, decimal.Decimal('300.00'))
        
        # 6. Cancellation
        sale.status = 'CANCELLED'
        sale.save()
        
        sale.journal_entry.refresh_from_db()
        self.assertEqual(sale.journal_entry.status, 'REVERSED')
        
        reversal = JournalEntry.objects.get(reference=sale.journal_entry.entry_number)
        self.assertEqual(reversal.status, 'POSTED')
        rev_debit = reversal.lines.get(debit__gt=0)
        self.assertEqual(rev_debit.account, self.acc_rev)
        self.assertEqual(rev_debit.debit, decimal.Decimal('500.00'))
        
        self.acc_ar.refresh_from_db()
        self.assertEqual(self.acc_ar.current_balance, decimal.Decimal('-300.00')) # 500 created, 300 paid, 500 reversed
        
    # --------------------------------------------------
    # WORKFLOW 2 — VENDOR → PURCHASE → RECEIVING → INVENTORY → PROCUREMENT
    # --------------------------------------------------
    def test_workflow_2_purchasing_inventory_procurement(self):
        # 1. Vendor Verification
        self.assertEqual(self.vendor_a.company, self.company_a)
        
        # 2. Purchase Order
        po = PurchaseOrder.objects.create(company=self.company_a, vendor=self.vendor_a, status='DRAFT')
        poi = PurchaseOrderItem.objects.create(company=self.company_a, purchase_order=po, product=self.product_a, item=self.item_a, quantity=10, unit_cost=decimal.Decimal('80.00'))
        po.status = 'ORDERED'
        po.save()
        
        # 3. Receive Inventory
        transaction_service.process_transaction(
            company=self.company_a, item=self.item_a, warehouse=self.warehouse_a,
            movement_type='IN', quantity=10, reference=f"PO-{po.id}"
        )
        
        bal = InventoryBalance.objects.get(company=self.company_a, item=self.item_a, warehouse=self.warehouse_a)
        self.assertEqual(bal.quantity, 10)
        
        # 4. Procurement Verification
        from purchasing.models import ProcurementDocument, ProcurementLine
        # Simulate migration / bridge sync (Phase 5/6)
        doc = po.procurement_document
        doc.refresh_from_db()
        if not doc:
            from purchasing.management.commands.migrate_legacy_procurement import Command
            cmd = Command()
            cmd.migrate_purchase_orders(self.company_a, False)
            doc = ProcurementDocument.objects.filter(purchase_order=po).first()
            
        self.assertIsNotNone(doc)
        self.assertEqual(doc.status, 'APPROVED')
        self.assertEqual(doc.crm_entity, self.crm_vendor_a)

    # --------------------------------------------------
    # WORKFLOW 3 — MULTI-TENANT ISOLATION
    # --------------------------------------------------
    def test_workflow_3_multitenant_isolation(self):
        # API Isolation
        with patch('erp_core.middleware.get_current_company', return_value=self.company_b.id):
            res_cust = self.client_b.get(f'/api/sales/customers/{self.customer_a.id}/', HTTP_X_COMPANY_ID=str(self.company_b.id))
            res_item = self.client_b.get(f'/api/inventory/items/{self.item_a.id}/', HTTP_X_COMPANY_ID=str(self.company_b.id))
        
        self.assertEqual(res_cust.status_code, 404)
        self.assertEqual(res_item.status_code, 404)
        
        # ORM Cross-Company Reject (handled via ValidationError during clean/save)
        invalid_sale = Sale(company=self.company_a, customer=self.customer_a, crm_entity=self.crm_customer_a)
        # Assuming we try to assign a product from company B
        prod_b = Product.objects.create(company=self.company_b, model_name="B")
        item = SaleItem(sale=invalid_sale, product=prod_b)
        with self.assertRaises(ValidationError):
            item.clean()

    # --------------------------------------------------
    # WORKFLOW 4 — IMMUTABILITY
    # --------------------------------------------------
    def test_workflow_4_immutability(self):
        sale = Sale.objects.create(company=self.company_a, cashier=self.user_a, customer=self.customer_a, total_amount=100)
        sale.created_at = timezone.make_aware(datetime.datetime(2026, 1, 15, 12, 0, 0))
        sale.save() # Generates POSTED journal
        
        je = sale.journal_entry
        self.assertEqual(je.status, 'POSTED')
        
        # Attempt to modify
        with self.assertRaises(ValidationError):
            je.status = 'DRAFT'
            je.clean()
            je.save()
            
        je.refresh_from_db()
        line = je.lines.first()
        with self.assertRaises(ValidationError):
            line.debit = 999
            line.clean()
            line.save()
            
        with self.assertRaises(ValidationError):
            je.delete()

    # --------------------------------------------------
    # WORKFLOW 5 — ACCOUNTING PERIOD
    # --------------------------------------------------
    def test_workflow_5_accounting_period(self):
        from finance.services.sales_accounting import create_sale_journal
        # Closed period
        sale = Sale.objects.create(company=self.company_a, cashier=self.user_a, customer=self.customer_a, total_amount=100, status='DRAFT')
        sale.created_at = timezone.make_aware(datetime.datetime(2026, 2, 15, 12, 0, 0)) # Feb is CLOSED
        with self.assertRaises(ValidationError):
            create_sale_journal(sale)
            
        # Locked period
        sale2 = Sale.objects.create(company=self.company_a, cashier=self.user_a, customer=self.customer_a, total_amount=100, status='DRAFT')
        sale2.created_at = timezone.make_aware(datetime.datetime(2026, 3, 15, 12, 0, 0)) # Mar is LOCKED
        with self.assertRaises(ValidationError):
            create_sale_journal(sale2)

    # --------------------------------------------------
    # WORKFLOW 6 — IDEMPOTENCY
    # --------------------------------------------------
    def test_workflow_6_idempotency(self):
        sale = Sale.objects.create(company=self.company_a, cashier=self.user_a, customer=self.customer_a, total_amount=100)
        sale.created_at = timezone.make_aware(datetime.datetime(2026, 1, 15, 12, 0, 0))
        sale.save()
        
        je_id = sale.journal_entry_id
        
        # Save again
        sale.total_amount = 100
        sale.save()
        
        self.assertEqual(sale.journal_entry_id, je_id)
        
        # Cancel twice
        sale.status = 'CANCELLED'
        sale.save()
        
        count1 = JournalEntry.objects.filter(reference=sale.journal_entry.entry_number).count()
        
        sale.status = 'CANCELLED'
        sale.save()
        
        count2 = JournalEntry.objects.filter(reference=sale.journal_entry.entry_number).count()
        self.assertEqual(count1, count2)

    # --------------------------------------------------
    # WORKFLOW 7 — INVENTORY ISOLATION
    # --------------------------------------------------
    def test_workflow_7_inventory_isolation(self):
        bal_before = InventoryBalance.objects.filter(item=self.item_a, warehouse=self.warehouse_a).first()
        q_before = bal_before.quantity if bal_before else 0
        
        transaction_service.process_transaction(
            company=self.company_a, item=self.item_a, warehouse=self.warehouse_a,
            movement_type='IN', quantity=10, reference="ISOLATION_TEST"
        )
        
        bal_after = InventoryBalance.objects.get(item=self.item_a, warehouse=self.warehouse_a)
        self.assertEqual(bal_after.quantity, q_before + 10)
