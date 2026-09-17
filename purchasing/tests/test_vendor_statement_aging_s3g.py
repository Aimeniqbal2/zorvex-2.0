"""
purchasing/tests/test_vendor_statement_aging_s3g.py

Phase S-3G Unit & Integration Test Suite:
- Chronological Vendor Statement generation with dynamic running balances.
- Partial payments, credit notes, and payment reversal impacts on ledger.
- Unallocated credit balance tracking.
- AP Aging buckets (Current, 1-30, 31-60, 61-90, 90+ days) based on Due Dates.
- Exclusion of fully paid invoices from aging calculations.
- Company-wide AP aging aggregation and filtering.
- Vendor balance reconciliation (Zero-variance MATCHED vs VARIANCE detection & resolution).
- Cross-tenant isolation.
- REST API verification.
"""

from decimal import Decimal
from datetime import date, timedelta
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status

from companies.models import Company
from platform_core.models import Warehouse, ModuleDefinition, CompanyModule
from inventory.models import Item
from inventory.services.balance_service import increase_stock
from crm.models import CRMEntity
from purchasing.models import (
    VendorCategory, Vendor, ProcurementDocument, ProcurementLine,
    VendorPayment, VendorPaymentAllocation,
    PurchaseReturn, PurchaseReturnLine, VendorCreditNote,
    VendorReconciliation
)
from purchasing.services.payment_service import (
    create_vendor_payment,
    post_vendor_payment,
    reverse_vendor_payment
)
from purchasing.services.return_service import (
    create_purchase_return,
    post_purchase_return
)
from purchasing.services.statement_service import (
    get_vendor_statement,
    get_vendor_aging,
    get_company_ap_aging,
    create_vendor_reconciliation,
    resolve_vendor_reconciliation
)

User = get_user_model()


class VendorStatementAgingS3GTests(TestCase):
    def setUp(self):
        # 0. Purchasing Module
        self._purchasing_mod, _ = ModuleDefinition.objects.get_or_create(
            code='purchasing',
            defaults={'name': 'Purchasing', 'category': 'operations', 'is_active': True}
        )

        # 1. Companies (Tenants)
        self.company_a = Company.objects.create(name="Security Tenant Alpha")
        self.company_b = Company.objects.create(name="Security Tenant Beta")

        CompanyModule.objects.get_or_create(company=self.company_a, module=self._purchasing_mod, defaults={'enabled': True})
        CompanyModule.objects.get_or_create(company=self.company_b, module=self._purchasing_mod, defaults={'enabled': True})

        # 2. Users
        self.user_a = User.objects.create_user(
            username="fin_alpha",
            email="finance.alpha@zorvex.test",
            password="Password123!",
            first_name="Finance",
            last_name="Alpha",
            company_id=self.company_a.id,
            role="admin"
        )
        self.user_b = User.objects.create_user(
            username="fin_beta",
            email="finance.beta@zorvex.test",
            password="Password123!",
            first_name="Finance",
            last_name="Beta",
            company_id=self.company_b.id,
            role="admin"
        )

        # 3. Warehouses
        self.warehouse_a = Warehouse.objects.create(
            company=self.company_a,
            name="Main Tactical Vault A",
            code="W-A"
        )
        self.warehouse_b = Warehouse.objects.create(
            company=self.company_b,
            name="Main Tactical Vault B",
            code="W-B"
        )

        # 4. Inventory Item
        self.item_cctv = Item.objects.create(
            company=self.company_a,
            name="4K PTZ Camera",
            sku="SEC-CCTV-4K",
            cost_price=Decimal('10000.00'),
            selling_price=Decimal('15000.00')
        )

        # 5. Vendors
        self.crm_v1 = CRMEntity.objects.create(
            company=self.company_a,
            entity_type='SUPPLIER',
            name="Hikvision Direct"
        )
        self.crm_v2 = CRMEntity.objects.create(
            company=self.company_a,
            entity_type='SUPPLIER',
            name="Dahua Tech Supply"
        )

        self.cat_a = VendorCategory.objects.create(company=self.company_a, name="Surveillance Hardware")
        self.vendor_a1 = Vendor.objects.create(
            company=self.company_a,
            crm_entity=self.crm_v1,
            category=self.cat_a,
            code="VEND-001",
            name="Hikvision Direct",
            payment_terms="Net 30"
        )
        self.vendor_a2 = Vendor.objects.create(
            company=self.company_a,
            crm_entity=self.crm_v2,
            category=self.cat_a,
            code="VEND-002",
            name="Dahua Tech Supply",
            payment_terms="Net 30"
        )

        self.client = APIClient()

    def _create_posted_invoice(self, company, vendor, total_amount, document_date, due_date=None, number="INV-001"):
        """Helper to create a posted vendor bill."""
        inv = ProcurementDocument.objects.create(
            company=company,
            vendor=vendor,
            crm_entity=vendor.crm_entity,
            document_type='VENDOR_INVOICE',
            status='POSTED',
            number=number,
            vendor_invoice_number=f"EXT-{number}",
            document_date=document_date,
            due_date=due_date or (document_date + timedelta(days=30)),
            subtotal_amount=total_amount,
            total_amount=total_amount,
            currency='PKR'
        )
        return inv

    def test_01_statement_chronology_and_running_balance(self):
        """Test chronological statement calculation with running balances."""
        d1 = date(2026, 1, 10)
        d2 = date(2026, 1, 15)
        d3 = date(2026, 1, 20)

        # Bill 1: 50,000 on Jan 10
        inv1 = self._create_posted_invoice(self.company_a, self.vendor_a1, Decimal('50000.00'), d1, number="INV-101")
        
        # Payment 1: 20,000 on Jan 15
        pay1 = create_vendor_payment(
            company_id=self.company_a.id,
            vendor_id=self.vendor_a1.id,
            payment_date=d2,
            amount=Decimal('20000.00'),
            allocations_data=[{'invoice_id': str(inv1.id), 'amount': Decimal('20000.00')}],
            auto_post=True,
            user=self.user_a
        )

        # Bill 2: 30,000 on Jan 20
        inv2 = self._create_posted_invoice(self.company_a, self.vendor_a1, Decimal('30000.00'), d3, number="INV-102")

        stmt = get_vendor_statement(self.vendor_a1.id, self.company_a.id)

        self.assertEqual(stmt['transactions_count'], 3)
        self.assertEqual(stmt['total_purchases'], Decimal('80000.00'))
        self.assertEqual(stmt['total_payments'], Decimal('20000.00'))
        self.assertEqual(stmt['closing_balance'], Decimal('60000.00'))
        self.assertEqual(stmt['outstanding_payable'], Decimal('60000.00'))

        txs = stmt['transactions']
        # Event 1: Invoice 1
        self.assertEqual(txs[0]['transaction_type'], 'INVOICE')
        self.assertEqual(txs[0]['debit'], Decimal('50000.00'))
        self.assertEqual(txs[0]['credit'], Decimal('0.00'))
        self.assertEqual(txs[0]['running_balance'], Decimal('50000.00'))

        # Event 2: Payment 1
        self.assertEqual(txs[1]['transaction_type'], 'PAYMENT')
        self.assertEqual(txs[1]['debit'], Decimal('0.00'))
        self.assertEqual(txs[1]['credit'], Decimal('20000.00'))
        self.assertEqual(txs[1]['running_balance'], Decimal('30000.00'))

        # Event 3: Invoice 2
        self.assertEqual(txs[2]['transaction_type'], 'INVOICE')
        self.assertEqual(txs[2]['debit'], Decimal('30000.00'))
        self.assertEqual(txs[2]['credit'], Decimal('0.00'))
        self.assertEqual(txs[2]['running_balance'], Decimal('60000.00'))

    def test_02_partial_payment_balance(self):
        """Test multiple partial payments accurately reduce outstanding balance."""
        d1 = date(2026, 2, 1)
        inv = self._create_posted_invoice(self.company_a, self.vendor_a1, Decimal('100000.00'), d1, number="INV-201")

        # Payment 1: 30,000
        create_vendor_payment(
            company_id=self.company_a.id,
            vendor_id=self.vendor_a1.id,
            payment_date=date(2026, 2, 5),
            amount=Decimal('30000.00'),
            allocations_data=[{'invoice_id': str(inv.id), 'amount': Decimal('30000.00')}],
            auto_post=True,
            user=self.user_a
        )

        # Payment 2: 40,000
        create_vendor_payment(
            company_id=self.company_a.id,
            vendor_id=self.vendor_a1.id,
            payment_date=date(2026, 2, 10),
            amount=Decimal('40000.00'),
            allocations_data=[{'invoice_id': str(inv.id), 'amount': Decimal('40000.00')}],
            auto_post=True,
            user=self.user_a
        )

        stmt = get_vendor_statement(self.vendor_a1.id, self.company_a.id)
        self.assertEqual(stmt['total_purchases'], Decimal('100000.00'))
        self.assertEqual(stmt['total_payments'], Decimal('70000.00'))
        self.assertEqual(stmt['outstanding_payable'], Decimal('30000.00'))
        self.assertEqual(stmt['transactions'][-1]['running_balance'], Decimal('30000.00'))

    def test_03_credit_note_effect_on_statement(self):
        """Test that vendor credit note from return reduces running balance without negative balance."""
        d1 = date(2026, 2, 1)
        inv = self._create_posted_invoice(self.company_a, self.vendor_a1, Decimal('50000.00'), d1, number="INV-301")

        # Create GRN to link return
        grn = ProcurementDocument.objects.create(
            company=self.company_a,
            vendor=self.vendor_a1,
            crm_entity=self.vendor_a1.crm_entity,
            document_type='GOODS_RECEIPT',
            document_date=d1,
            status='POSTED',
            number="GRN-301",
            warehouse=self.warehouse_a
        )
        grn_line = ProcurementLine.objects.create(
            company=self.company_a,
            document=grn,
            item=self.item_cctv,
            quantity=5,
            accepted_quantity=5,
            unit_price=Decimal('10000.00'),
            total_amount=Decimal('50000.00')
        )

        # Return 2 cameras (20,000)
        ret = create_purchase_return(
            company_id=self.company_a.id,
            vendor_id=self.vendor_a1.id,
            warehouse_id=self.warehouse_a.id,
            return_date=date(2026, 2, 5),
            goods_receipt_id=grn.id,
            vendor_invoice_id=inv.id,
            lines_data=[{
                'grn_line_id': str(grn_line.id),
                'item_id': str(self.item_cctv.id),
                'return_quantity': 2,
                'unit_cost': Decimal('10000.00'),
                'reason': 'DEFECTIVE'
            }],
            user=self.user_a,
            auto_approve=True
        )
        increase_stock(self.item_cctv, self.warehouse_a, Decimal('5.00'))
        post_purchase_return(ret, user=self.user_a)

        stmt = get_vendor_statement(self.vendor_a1.id, self.company_a.id)
        self.assertEqual(stmt['total_purchases'], Decimal('50000.00'))
        self.assertEqual(stmt['total_credit_notes'], Decimal('20000.00'))
        self.assertEqual(stmt['outstanding_payable'], Decimal('30000.00'))

        # Credit note transaction in statement
        cn_tx = [t for t in stmt['transactions'] if t['transaction_type'] == 'CREDIT_NOTE'][0]
        self.assertEqual(cn_tx['credit'], Decimal('20000.00'))
        self.assertEqual(cn_tx['running_balance'], Decimal('30000.00'))

    def test_04_payment_reversal_restores_balance(self):
        """Test that reversing a payment adds a PAYMENT_REVERSAL debit event and restores ledger balance."""
        d1 = date(2026, 3, 1)
        inv = self._create_posted_invoice(self.company_a, self.vendor_a1, Decimal('40000.00'), d1, number="INV-401")

        pay = create_vendor_payment(
            company_id=self.company_a.id,
            vendor_id=self.vendor_a1.id,
            payment_date=date(2026, 3, 5),
            amount=Decimal('40000.00'),
            allocations_data=[{'invoice_id': str(inv.id), 'amount': Decimal('40000.00')}],
            auto_post=True,
            user=self.user_a
        )

        # Reverse payment on March 6
        reverse_vendor_payment(payment_id=pay.id, reversal_reason="Cheque dishonoured by bank", user=self.user_a)

        stmt = get_vendor_statement(self.vendor_a1.id, self.company_a.id)
        self.assertEqual(stmt['outstanding_payable'], Decimal('40000.00'))
        self.assertEqual(stmt['closing_balance'], Decimal('40000.00'))

        tx_types = [t['transaction_type'] for t in stmt['transactions']]
        self.assertIn('INVOICE', tx_types)
        self.assertIn('PAYMENT', tx_types)
        self.assertIn('PAYMENT_REVERSAL', tx_types)

        rev_tx = [t for t in stmt['transactions'] if t['transaction_type'] == 'PAYMENT_REVERSAL'][0]
        self.assertEqual(rev_tx['debit'], Decimal('40000.00'))
        self.assertEqual(rev_tx['running_balance'], Decimal('40000.00'))

    def test_05_unallocated_credit_displayed_separately(self):
        """Test unallocated credits when return credit occurs on paid bill."""
        inv = self._create_posted_invoice(self.company_a, self.vendor_a1, Decimal('30000.00'), date(2026, 1, 1), number="INV-501")

        # Full payment of 30,000
        create_vendor_payment(
            company_id=self.company_a.id,
            vendor_id=self.vendor_a1.id,
            payment_date=date(2026, 1, 5),
            amount=Decimal('30000.00'),
            allocations_data=[{'invoice_id': str(inv.id), 'amount': Decimal('30000.00')}],
            auto_post=True,
            user=self.user_a
        )

        # Return 10,000 creates 10,000 unallocated credit
        grn = ProcurementDocument.objects.create(
            company=self.company_a,
            vendor=self.vendor_a1,
            crm_entity=self.vendor_a1.crm_entity,
            document_type='GOODS_RECEIPT',
            document_date=date(2026, 1, 5),
            status='POSTED',
            number="GRN-501",
            warehouse=self.warehouse_a
        )
        grn_line = ProcurementLine.objects.create(
            company=self.company_a,
            document=grn,
            item=self.item_cctv,
            quantity=3,
            accepted_quantity=3,
            unit_price=Decimal('10000.00'),
            total_amount=Decimal('30000.00')
        )
        ret = create_purchase_return(
            company_id=self.company_a.id,
            vendor_id=self.vendor_a1.id,
            warehouse_id=self.warehouse_a.id,
            return_date=date(2026, 1, 10),
            goods_receipt_id=grn.id,
            vendor_invoice_id=inv.id,
            lines_data=[{
                'grn_line_id': str(grn_line.id),
                'item_id': str(self.item_cctv.id),
                'return_quantity': 1,
                'unit_cost': Decimal('10000.00'),
                'reason': 'WRONG_ITEM'
            }],
            user=self.user_a,
            auto_approve=True
        )
        increase_stock(self.item_cctv, self.warehouse_a, Decimal('3.00'))
        post_purchase_return(ret, user=self.user_a)

        stmt = get_vendor_statement(self.vendor_a1.id, self.company_a.id)
        self.assertEqual(stmt['outstanding_payable'], Decimal('0.00'))  # Non-negative
        self.assertEqual(stmt['unallocated_credit'], Decimal('10000.00'))

    def test_06_aging_bucket_calculation(self):
        """Test AP aging buckets based on invoice due dates."""
        today = date(2026, 4, 1)

        # 1. Current (Due 2026-04-10) -> 10,000
        self._create_posted_invoice(self.company_a, self.vendor_a1, Decimal('10000.00'), date(2026, 3, 10), due_date=date(2026, 4, 10), number="INV-CURR")

        # 2. 1-30 Days Overdue (Due 2026-03-15: 17 days overdue) -> 20,000
        self._create_posted_invoice(self.company_a, self.vendor_a1, Decimal('20000.00'), date(2026, 2, 15), due_date=date(2026, 3, 15), number="INV-30D")

        # 3. 31-60 Days Overdue (Due 2026-02-15: 45 days overdue) -> 30,000
        self._create_posted_invoice(self.company_a, self.vendor_a1, Decimal('30000.00'), date(2026, 1, 15), due_date=date(2026, 2, 15), number="INV-60D")

        # 4. 61-90 Days Overdue (Due 2026-01-15: 76 days overdue) -> 40,000
        self._create_posted_invoice(self.company_a, self.vendor_a1, Decimal('40000.00'), date(2025, 12, 15), due_date=date(2026, 1, 15), number="INV-90D")

        # 5. 90+ Days Overdue (Due 2025-11-15: 137 days overdue) -> 50,000
        self._create_posted_invoice(self.company_a, self.vendor_a1, Decimal('50000.00'), date(2025, 10, 15), due_date=date(2025, 11, 15), number="INV-OLD")

        aging = get_vendor_aging(self.vendor_a1.id, self.company_a.id, as_of_date=today)

        self.assertEqual(aging['current'], Decimal('10000.00'))
        self.assertEqual(aging['days_1_30'], Decimal('20000.00'))
        self.assertEqual(aging['days_31_60'], Decimal('30000.00'))
        self.assertEqual(aging['days_61_90'], Decimal('40000.00'))
        self.assertEqual(aging['days_over_90'], Decimal('50000.00'))
        self.assertEqual(aging['total_outstanding'], Decimal('150000.00'))
        self.assertEqual(aging['open_invoices_count'], 5)

    def test_07_paid_invoices_excluded_from_aging(self):
        """Test that fully paid invoices are completely excluded from aging."""
        today = date(2026, 4, 1)

        # Unpaid overdue bill: 25,000
        self._create_posted_invoice(self.company_a, self.vendor_a1, Decimal('25000.00'), date(2026, 1, 1), due_date=date(2026, 2, 1), number="INV-UNPAID")

        # Fully paid overdue bill: 75,000
        paid_inv = self._create_posted_invoice(self.company_a, self.vendor_a1, Decimal('75000.00'), date(2026, 1, 1), due_date=date(2026, 2, 1), number="INV-PAID")
        create_vendor_payment(
            company_id=self.company_a.id,
            vendor_id=self.vendor_a1.id,
            payment_date=date(2026, 2, 5),
            amount=Decimal('75000.00'),
            allocations_data=[{'invoice_id': str(paid_inv.id), 'amount': Decimal('75000.00')}],
            auto_post=True,
            user=self.user_a
        )

        aging = get_vendor_aging(self.vendor_a1.id, self.company_a.id, as_of_date=today)

        self.assertEqual(aging['total_outstanding'], Decimal('25000.00'))
        self.assertEqual(aging['open_invoices_count'], 1)
        self.assertEqual(aging['invoices'][0]['invoice_number'], "INV-UNPAID")

    def test_08_company_wide_ap_aging_aggregation(self):
        """Test company-wide AP aging aggregation across multiple vendors."""
        today = date(2026, 4, 1)

        # Vendor 1: 50,000 Current
        self._create_posted_invoice(self.company_a, self.vendor_a1, Decimal('50000.00'), date(2026, 3, 20), due_date=date(2026, 4, 20), number="INV-V1")

        # Vendor 2: 30,000 in 1-30 days
        self._create_posted_invoice(self.company_a, self.vendor_a2, Decimal('30000.00'), date(2026, 2, 20), due_date=date(2026, 3, 20), number="INV-V2")

        company_aging = get_company_ap_aging(self.company_a.id, as_of_date=today)

        self.assertEqual(company_aging['summary']['total_outstanding'], Decimal('80000.00'))
        self.assertEqual(company_aging['summary']['current'], Decimal('50000.00'))
        self.assertEqual(company_aging['summary']['days_1_30'], Decimal('30000.00'))
        self.assertEqual(company_aging['summary']['vendors_count'], 2)

    def test_09_reconciliation_zero_variance_auto_matched(self):
        """Test reconciliation creation where reported balance matches system balance exactly."""
        # Vendor A1 has 45,000 unpaid bill
        self._create_posted_invoice(self.company_a, self.vendor_a1, Decimal('45000.00'), date(2026, 3, 1), number="INV-REC1")

        rec = create_vendor_reconciliation(
            company_id=self.company_a.id,
            vendor_id=self.vendor_a1.id,
            statement_date=date(2026, 3, 31),
            vendor_reported_balance=Decimal('45000.00'),
            notes="March 2026 Supplier Statement received and checked",
            user=self.user_a
        )

        self.assertEqual(rec.system_balance, Decimal('45000.00'))
        self.assertEqual(rec.vendor_reported_balance, Decimal('45000.00'))
        self.assertEqual(rec.variance, Decimal('0.00'))
        self.assertEqual(rec.status, 'MATCHED')

    def test_10_reconciliation_variance_detected_and_resolved(self):
        """Test reconciliation where vendor reports different balance and finance user resolves discrepancy."""
        self._create_posted_invoice(self.company_a, self.vendor_a1, Decimal('50000.00'), date(2026, 3, 1), number="INV-REC2")

        # Vendor claims 55,000 (e.g. unbilled shipping fee or timing discrepancy)
        rec = create_vendor_reconciliation(
            company_id=self.company_a.id,
            vendor_id=self.vendor_a1.id,
            statement_date=date(2026, 3, 31),
            vendor_reported_balance=Decimal('55000.00'),
            notes="Variance of 5,000 detected against supplier billing portal",
            user=self.user_a
        )

        self.assertEqual(rec.system_balance, Decimal('50000.00'))
        self.assertEqual(rec.vendor_reported_balance, Decimal('55000.00'))
        self.assertEqual(rec.variance, Decimal('-5000.00'))
        self.assertEqual(rec.status, 'VARIANCE')

        # Resolve reconciliation with investigation audit
        resolved = resolve_vendor_reconciliation(
            reconciliation_id=rec.id,
            company_id=self.company_a.id,
            resolution_notes="Discrepancy investigated: Vendor included late freight charge in April invoice. Reconciled.",
            user=self.user_a
        )

        self.assertEqual(resolved.status, 'RESOLVED')
        self.assertEqual(resolved.resolved_by, self.user_a)
        self.assertIsNotNone(resolved.resolved_at)

    def test_11_cross_tenant_isolation(self):
        """Verify strict multi-tenant isolation for statements, aging, and reconciliations."""
        # Tenant A invoice
        self._create_posted_invoice(self.company_a, self.vendor_a1, Decimal('15000.00'), date(2026, 3, 1), number="INV-TA")

        # Tenant B cannot access Tenant A statement
        with self.assertRaises(Exception):
            get_vendor_statement(self.vendor_a1.id, self.company_b.id)

        # Tenant B cannot access Tenant A aging
        with self.assertRaises(Exception):
            get_vendor_aging(self.vendor_a1.id, self.company_b.id)

        # Tenant B cannot create reconciliation for Tenant A vendor
        with self.assertRaises(Exception):
            create_vendor_reconciliation(
                company_id=self.company_b.id,
                vendor_id=self.vendor_a1.id,
                statement_date=date(2026, 3, 31),
                vendor_reported_balance=Decimal('15000.00'),
                user=self.user_b
            )

    def test_12_rest_api_endpoints(self):
        """Test REST API endpoints for statement, aging, ap_aging, and reconciliations."""
        self.client.force_authenticate(user=self.user_a)
        self._create_posted_invoice(self.company_a, self.vendor_a1, Decimal('25000.00'), date(2026, 3, 1), number="INV-API")

        # 1. Vendor Statement API
        res_stmt = self.client.get(f'/api/purchasing/vendors/{self.vendor_a1.id}/statement/')
        self.assertEqual(res_stmt.status_code, status.HTTP_200_OK)
        self.assertEqual(res_stmt.data['outstanding_payable'], Decimal('25000.00'))

        # 2. Vendor Aging API
        res_aging = self.client.get(f'/api/purchasing/vendors/{self.vendor_a1.id}/aging/')
        self.assertEqual(res_aging.status_code, status.HTTP_200_OK)
        self.assertEqual(res_aging.data['total_outstanding'], Decimal('25000.00'))

        # 3. Company AP Aging API
        res_comp_aging = self.client.get('/api/purchasing/vendors/ap_aging/')
        self.assertEqual(res_comp_aging.status_code, status.HTTP_200_OK)
        self.assertEqual(res_comp_aging.data['summary']['total_outstanding'], Decimal('25000.00'))

        # 4. Reconciliation Creation API
        res_rec = self.client.post('/api/purchasing/reconciliations/', {
            'vendor': str(self.vendor_a1.id),
            'statement_date': '2026-03-31',
            'vendor_reported_balance': '25000.00',
            'notes': 'API Reconciliation test'
        }, format='json')
        self.assertEqual(res_rec.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res_rec.data['status'], 'MATCHED')
        rec_id = res_rec.data['id']

        # 5. Reconciliation Resolve API
        res_resolve = self.client.post(f'/api/purchasing/reconciliations/{rec_id}/resolve/', {
            'resolution_notes': 'Verified and approved via API.'
        }, format='json')
        self.assertEqual(res_resolve.status_code, status.HTTP_200_OK)
        self.assertEqual(res_resolve.data['status'], 'RESOLVED')
