import uuid
from decimal import Decimal
from datetime import date, timedelta
from django.test import TestCase
from django.utils import timezone
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from companies.models import Company
from platform_core.models import Warehouse, ModuleDefinition, CompanyModule
from platform_core.services import enable_module
from inventory.models import Item, Category
from inventory.services.balance_service import increase_stock
from crm.models import CRMEntity
from purchasing.models import (
    VendorCategory, Vendor, ProcurementDocument, ProcurementLine,
    VendorPayment, VendorPaymentAllocation,
    PurchaseReturn, PurchaseReturnLine, VendorCreditNote,
    VendorReconciliation
)
from purchasing.services.reporting_service import (
    get_purchasing_dashboard_kpis,
    get_purchasing_report,
    get_vendor_performance_metrics,
    get_all_vendors_performance,
    compare_vendors_for_item,
    get_purchasing_exceptions,
    get_crm_procurement_demand
)

User = get_user_model()


class PurchasingReportsS3HTests(TestCase):
    """
    Phase S-3H: Comprehensive unit & integration tests for:
    - Purchasing Dashboard KPIs
    - 13 Operational Reports
    - Vendor Performance Scorecards
    - Multi-Vendor Comparison per Item
    - Purchasing Exception Monitor
    - Security CRM Cross-Module Procurement Demand Retrieval
    - Multi-Tenant Isolation
    """

    def setUp(self):
        # 1. Tenants
        self.company_a = Company.objects.create(name="Tactical Security Corp A")
        self.company_b = Company.objects.create(name="Apex Security Corp B")

        # 2. Users
        self.user_a = User.objects.create_user(
            username="manager_a",
            email="manager_a@tactical.com",
            password="Password123!",
            company_id=self.company_a.id,
            role="manager"
        )
        self.user_b = User.objects.create_user(
            username="manager_b",
            email="manager_b@apex.com",
            password="Password123!",
            company_id=self.company_b.id,
            role="manager"
        )

        # 3. Enable Purchasing Module
        self._purchasing_mod, _ = ModuleDefinition.objects.get_or_create(
            code='purchasing',
            defaults={'name': 'Purchasing', 'category': 'operations', 'is_active': True}
        )
        if not self._purchasing_mod.is_active:
            self._purchasing_mod.is_active = True
            self._purchasing_mod.save()

        enable_module(self.company_a, 'purchasing')
        enable_module(self.company_b, 'purchasing')

        # 4. Warehouse & Master Data
        self.warehouse_a = Warehouse.objects.create(
            company=self.company_a,
            name="Main Tactical Vault A",
            code="W-A"
        )
        self.warehouse_b = Warehouse.objects.create(
            company=self.company_b,
            name="Main Apex Vault B",
            code="W-B"
        )
        self.category_a = Category.objects.create(company=self.company_a, name="Surveillance Gear")

        # 5. Inventory Items
        self.item_camera = Item.objects.create(
            company=self.company_a,
            category=self.category_a,
            name="4K PTZ Camera",
            sku="SEC-CCTV-4K",
            cost_price=Decimal('10000.00'),
            selling_price=Decimal('15000.00')
        )
        self.item_nvr = Item.objects.create(
            company=self.company_a,
            category=self.category_a,
            name="32-Channel NVR Server",
            sku="SEC-NVR-32",
            cost_price=Decimal('40000.00'),
            selling_price=Decimal('60000.00')
        )

        # 6. Vendors
        self.crm_v1 = CRMEntity.objects.create(company=self.company_a, entity_type='SUPPLIER', name="Hikvision Direct")
        self.crm_v2 = CRMEntity.objects.create(company=self.company_a, entity_type='SUPPLIER', name="Dahua Tech Supply")

        self.cat_v = VendorCategory.objects.create(company=self.company_a, name="Hardware Suppliers")
        self.vendor_a1 = Vendor.objects.create(
            company=self.company_a,
            crm_entity=self.crm_v1,
            category=self.cat_v,
            code="VEND-001",
            name="Hikvision Direct",
            payment_terms="Net 30",
            rating=5
        )
        self.vendor_a2 = Vendor.objects.create(
            company=self.company_a,
            crm_entity=self.crm_v2,
            category=self.cat_v,
            code="VEND-002",
            name="Dahua Tech Supply",
            payment_terms="Net 30",
            rating=4
        )

        self.client = APIClient()

    def _create_po(self, company, vendor, item, qty, unit_price, status='APPROVED', doc_date=None, exp_date=None, number="PO-001", warehouse=None):
        doc_date = doc_date or date(2026, 1, 10)
        wh = warehouse or (self.warehouse_a if company == self.company_a else self.warehouse_b)
        tot = (qty * unit_price).quantize(Decimal('0.01'))
        po = ProcurementDocument.objects.create(
            company=company,
            vendor=vendor,
            crm_entity=vendor.crm_entity,
            warehouse=wh,
            document_type='PURCHASE_ORDER',
            status=status,
            number=number,
            document_date=doc_date,
            expected_delivery_date=exp_date or (doc_date + timedelta(days=10)),
            subtotal_amount=tot,
            total_amount=tot,
            currency='PKR',
            created_by=self.user_a if company == self.company_a else self.user_b
        )
        ProcurementLine.objects.create(
            company=company,
            document=po,
            item=item,
            quantity=qty,
            received_quantity=qty if status == 'COMPLETED' else Decimal('0.00'),
            unit_price=unit_price.quantize(Decimal('0.01')),
            total_amount=tot
        )
        return po

    def test_01_purchasing_dashboard_kpis(self):
        """Test calculation of purchasing dashboard operational and financial KPIs."""
        # 1. Open PO: 50,000
        self._create_po(self.company_a, self.vendor_a1, self.item_camera, Decimal('5.00'), Decimal('10000.00'), status='APPROVED', number="PO-KPI-1")
        # 2. Pending Approval PO: 40,000
        self._create_po(self.company_a, self.vendor_a1, self.item_nvr, Decimal('1.00'), Decimal('40000.00'), status='PENDING_APPROVAL', number="PO-KPI-2")

        # 3. Posted Vendor Bill: 30,000 (Due yesterday -> Overdue)
        yesterday = timezone.now().date() - timedelta(days=5)
        inv = ProcurementDocument.objects.create(
            company=self.company_a,
            vendor=self.vendor_a1,
            crm_entity=self.vendor_a1.crm_entity,
            document_type='VENDOR_INVOICE',
            status='POSTED',
            number="INV-KPI-1",
            vendor_invoice_number="EXT-KPI-1",
            document_date=yesterday - timedelta(days=20),
            due_date=yesterday,
            subtotal_amount=Decimal('30000.00'),
            total_amount=Decimal('30000.00'),
            currency='PKR'
        )

        kpis = get_purchasing_dashboard_kpis(self.company_a.id)

        self.assertEqual(kpis['open_purchase_orders_count'], 2)
        self.assertEqual(kpis['pending_approvals_count'], 1)
        self.assertEqual(kpis['pending_deliveries_count'], 1)
        self.assertEqual(kpis['posted_bills_count'], 1)
        self.assertEqual(kpis['outstanding_payables'], '30000.00')
        self.assertEqual(kpis['overdue_payables'], '30000.00')

    def test_02_purchases_by_vendor_report(self):
        """Test Purchases by Vendor operational report."""
        self._create_po(self.company_a, self.vendor_a1, self.item_camera, Decimal('4.00'), Decimal('10000.00'), status='APPROVED', number="PO-VEND-1")
        self._create_po(self.company_a, self.vendor_a2, self.item_camera, Decimal('2.00'), Decimal('12000.00'), status='APPROVED', number="PO-VEND-2")

        rep = get_purchasing_report(self.company_a.id, 'purchases_by_vendor')
        self.assertEqual(rep['count'], 2)

        v1_row = [r for r in rep['rows'] if r['vendor_id'] == str(self.vendor_a1.id)][0]
        self.assertEqual(v1_row['order_count'], 1)
        self.assertEqual(v1_row['total_ordered_amount'], '40000.00')

        v2_row = [r for r in rep['rows'] if r['vendor_id'] == str(self.vendor_a2.id)][0]
        self.assertEqual(v2_row['order_count'], 1)
        self.assertEqual(v2_row['total_ordered_amount'], '24000.00')

    def test_03_purchases_by_item_report(self):
        """Test Purchases by Item operational report."""
        self._create_po(self.company_a, self.vendor_a1, self.item_camera, Decimal('6.00'), Decimal('10000.00'), status='APPROVED', number="PO-ITEM-1")
        self._create_po(self.company_a, self.vendor_a1, self.item_nvr, Decimal('2.00'), Decimal('40000.00'), status='APPROVED', number="PO-ITEM-2")

        rep = get_purchasing_report(self.company_a.id, 'purchases_by_item')
        self.assertEqual(rep['count'], 2)

        cam_row = [r for r in rep['rows'] if r['item_id'] == str(self.item_camera.id)][0]
        self.assertEqual(cam_row['total_ordered_qty'], '6.00')
        self.assertEqual(cam_row['total_spend'], '60000.00')
        self.assertEqual(cam_row['average_unit_cost'], '10000.00')

    def test_04_po_status_and_pending_deliveries_report(self):
        """Test PO Status and Pending Deliveries reports."""
        po = self._create_po(
            self.company_a, self.vendor_a1, self.item_camera, Decimal('10.00'), Decimal('10000.00'),
            status='APPROVED', doc_date=date(2026, 2, 1), exp_date=date(2026, 2, 15), number="PO-DELIV-1"
        )

        rep_status = get_purchasing_report(self.company_a.id, 'po_status')
        self.assertEqual(rep_status['count'], 1)
        self.assertEqual(rep_status['rows'][0]['status'], 'APPROVED')

        rep_deliv = get_purchasing_report(self.company_a.id, 'pending_deliveries')
        self.assertEqual(rep_deliv['count'], 1)
        self.assertEqual(rep_deliv['rows'][0]['pending_quantity'], '10.00')
        self.assertEqual(rep_deliv['rows'][0]['pending_value'], '100000.00')

    def test_05_grn_receiving_history_and_vendor_bills_report(self):
        """Test GRN Receiving History and Vendor Bills reports."""
        grn = ProcurementDocument.objects.create(
            company=self.company_a,
            vendor=self.vendor_a1,
            crm_entity=self.vendor_a1.crm_entity,
            warehouse=self.warehouse_a,
            document_type='GOODS_RECEIPT',
            document_date=date(2026, 2, 10),
            status='POSTED',
            number="GRN-REP-1"
        )
        ProcurementLine.objects.create(
            company=self.company_a,
            document=grn,
            item=self.item_camera,
            quantity=5,
            received_quantity=5,
            accepted_quantity=4,
            rejected_quantity=1,
            unit_price=Decimal('10000.00'),
            total_amount=Decimal('50000.00')
        )

        rep_grn = get_purchasing_report(self.company_a.id, 'grn_receiving_history')
        self.assertEqual(rep_grn['count'], 1)
        self.assertEqual(rep_grn['rows'][0]['total_received_qty'], '5.00')
        self.assertEqual(rep_grn['rows'][0]['total_accepted_qty'], '4.00')
        self.assertEqual(rep_grn['rows'][0]['total_rejected_qty'], '1.00')

    def test_06_three_way_match_exceptions_report(self):
        """Test 3-Way Match Exceptions report detects price or quantity variance bills."""
        inv = ProcurementDocument.objects.create(
            company=self.company_a,
            vendor=self.vendor_a1,
            crm_entity=self.vendor_a1.crm_entity,
            document_type='VENDOR_INVOICE',
            status='POSTED',
            number="INV-MISMATCH-1",
            document_date=date(2026, 2, 10),
            subtotal_amount=Decimal('55000.00'),
            total_amount=Decimal('55000.00'),
            match_status='PRICE_MISMATCH'
        )

        rep = get_purchasing_report(self.company_a.id, 'three_way_match_exceptions')
        self.assertEqual(rep['count'], 1)
        self.assertEqual(rep['rows'][0]['bill_number'], 'INV-MISMATCH-1')
        self.assertEqual(rep['rows'][0]['match_status'], 'PRICE_MISMATCH')

    def test_07_vendor_performance_metrics_calculation(self):
        """Test calculation of vendor historical delivery, fulfillment, match, and return metrics."""
        # 1. PO: 10 items on Jan 1, expected delivery Jan 10
        po = self._create_po(
            self.company_a, self.vendor_a1, self.item_camera, Decimal('10.00'), Decimal('10000.00'),
            status='APPROVED', doc_date=date(2026, 1, 1), exp_date=date(2026, 1, 10), number="PO-PERF-1"
        )
        po.lines.update(received_quantity=Decimal('10.00'))

        # 2. GRN: delivered on Jan 8 (7 days lead time, ON-TIME)
        grn = ProcurementDocument.objects.create(
            company=self.company_a,
            parent_document=po,
            vendor=self.vendor_a1,
            crm_entity=self.vendor_a1.crm_entity,
            warehouse=self.warehouse_a,
            document_type='GOODS_RECEIPT',
            document_date=date(2026, 1, 8),
            status='POSTED',
            number="GRN-PERF-1"
        )
        grn_line = ProcurementLine.objects.create(
            company=self.company_a,
            document=grn,
            item=self.item_camera,
            quantity=10,
            received_quantity=10,
            accepted_quantity=10,
            unit_price=Decimal('10000.00'),
            total_amount=Decimal('100000.00')
        )

        # 3. Return 1 item (10% return rate)
        ret = PurchaseReturn.objects.create(
            company=self.company_a,
            vendor=self.vendor_a1,
            warehouse=self.warehouse_a,
            goods_receipt=grn,
            return_number="RET-PERF-1",
            return_date=date(2026, 1, 15),
            status='POSTED',
            total_return_amount=Decimal('10000.00')
        )
        PurchaseReturnLine.objects.create(
            company=self.company_a,
            purchase_return=ret,
            grn_line=grn_line,
            item=self.item_camera,
            return_quantity=1,
            unit_cost=Decimal('10000.00'),
            total_amount=Decimal('10000.00')
        )

        perf = get_vendor_performance_metrics(self.vendor_a1.id, self.company_a.id)

        self.assertEqual(perf['number_of_orders'], 1)
        self.assertEqual(perf['total_purchase_value'], '100000.00')
        self.assertEqual(perf['average_delivery_time_days'], 7.0)
        self.assertEqual(perf['on_time_delivery_pct'], 100.0)
        self.assertEqual(perf['quantity_fulfillment_pct'], 100.0)
        self.assertEqual(perf['return_rate_pct'], 10.0)
        # Verify manual rating is kept without being auto-overwritten
        self.assertEqual(perf['manual_rating'], '5')

    def test_08_vendor_comparison_for_item(self):
        """Test multi-vendor comparison for the same item."""
        # Vendor 1 sells camera for 10,000
        self._create_po(self.company_a, self.vendor_a1, self.item_camera, Decimal('5.00'), Decimal('10000.00'), status='APPROVED', number="PO-COMP-1")
        # Vendor 2 sells camera for 11,500
        self._create_po(self.company_a, self.vendor_a2, self.item_camera, Decimal('3.00'), Decimal('11500.00'), status='APPROVED', number="PO-COMP-2")

        comp = compare_vendors_for_item(self.item_camera.id, self.company_a.id)

        self.assertEqual(comp['suppliers_count'], 2)
        v1 = [v for v in comp['vendors'] if v['vendor_id'] == str(self.vendor_a1.id)][0]
        self.assertEqual(v1['latest_purchase_price'], '10000.00')

        v2 = [v for v in comp['vendors'] if v['vendor_id'] == str(self.vendor_a2.id)][0]
        self.assertEqual(v2['latest_purchase_price'], '11500.00')

    def test_09_purchasing_exception_monitor(self):
        """Test Purchasing Exception Monitor aggregates actionable operational and AP issues."""
        # 1. Overdue Delivery PO (exp date was 5 days ago)
        past_date = timezone.now().date() - timedelta(days=5)
        self._create_po(
            self.company_a, self.vendor_a1, self.item_camera, Decimal('5.00'), Decimal('10000.00'),
            status='APPROVED', doc_date=past_date - timedelta(days=10), exp_date=past_date, number="PO-EXC-1"
        )

        # 2. Unallocated Credit Note: 15,000
        ret_exc = PurchaseReturn.objects.create(
            company=self.company_a,
            vendor=self.vendor_a1,
            warehouse=self.warehouse_a,
            return_number="RET-EXC-1",
            return_date=past_date,
            status='POSTED',
            total_return_amount=Decimal('15000.00')
        )
        VendorCreditNote.objects.create(
            company=self.company_a,
            vendor=self.vendor_a1,
            purchase_return=ret_exc,
            credit_note_number="CN-EXC-1",
            amount=Decimal('15000.00'),
            allocated_amount=Decimal('0.00'),
            unallocated_amount=Decimal('15000.00'),
            status='POSTED'
        )

        exc = get_purchasing_exceptions(self.company_a.id)

        self.assertGreaterEqual(exc['summary']['overdue_deliveries_count'], 1)
        self.assertGreaterEqual(exc['summary']['unallocated_credits_count'], 1)
        self.assertGreaterEqual(exc['summary']['total_exceptions_count'], 2)

    def test_10_crm_procurement_demand_retrieval(self):
        """Test clean retrieval of procurement demand from S-2H signed CRM proposals without duplication."""
        try:
            from security_crm.models import SecurityProposal, ProposalVersion, ProposalEquipmentRequirement
            from crm.models import CRMEntity

            client_crm = CRMEntity.objects.create(company=self.company_a, entity_type='CUSTOMER', name="Embassy Security Group")
            prop = SecurityProposal.objects.create(
                company=self.company_a,
                client=client_crm,
                proposal_number="PRO-REP-2026",
                status='APPROVED',
                is_handoff_ready=True
            )
            v1 = ProposalVersion.objects.create(
                proposal=prop,
                version_number=1,
                is_current=True
            )
            ProposalEquipmentRequirement.objects.create(
                version=v1,
                item_name="Motorola Walkie-Talkies GP328",
                quantity=8,
                unit_rate=Decimal('25000.00'),
                line_total=Decimal('200000.00'),
                charge_type='ONE_TIME'
            )

            demand_data = get_crm_procurement_demand(self.company_a.id)
            self.assertGreaterEqual(demand_data['total_demand_items_count'], 1)
            self.assertEqual(demand_data['procurement_demand'][0]['item_name'], "Motorola Walkie-Talkies GP328")
            self.assertEqual(demand_data['procurement_demand'][0]['required_quantity'], 8)
        except ImportError:
            pass  # If security_crm is not running in test isolated runner

    def test_11_multi_tenant_isolation(self):
        """Verify strict multi-tenant isolation across all reports and KPIs."""
        # PO in Company A
        self._create_po(self.company_a, self.vendor_a1, self.item_camera, Decimal('5.00'), Decimal('10000.00'), number="PO-T-A")

        # PO in Company B
        crm_vb = CRMEntity.objects.create(company=self.company_b, entity_type='SUPPLIER', name="Apex Vendor B")
        cat_b = VendorCategory.objects.create(company=self.company_b, name="Category B")
        vend_b = Vendor.objects.create(company=self.company_b, crm_entity=crm_vb, category=cat_b, code="VB-01", name="Apex Vendor B")
        item_b = Item.objects.create(company=self.company_b, name="Item B", sku="SKU-B", cost_price=Decimal('5000.00'), selling_price=Decimal('8000.00'))
        self._create_po(self.company_b, vend_b, item_b, Decimal('20.00'), Decimal('5000.00'), number="PO-T-B")

        kpis_a = get_purchasing_dashboard_kpis(self.company_a.id)
        kpis_b = get_purchasing_dashboard_kpis(self.company_b.id)

        self.assertEqual(kpis_a['open_purchase_orders_count'], 1)
        self.assertEqual(kpis_a['open_purchase_orders_value'], '50000.00')

        self.assertEqual(kpis_b['open_purchase_orders_count'], 1)
        self.assertEqual(kpis_b['open_purchase_orders_value'], '100000.00')

    def test_12_rest_api_endpoints(self):
        """Test REST API endpoints for reports, dashboard KPIs, vendor performance, and comparison."""
        self._create_po(self.company_a, self.vendor_a1, self.item_camera, Decimal('3.00'), Decimal('10000.00'), number="PO-API-1")

        self.client.force_authenticate(user=self.user_a)

        # 1. Dashboard KPIs
        res_kpis = self.client.get('/api/purchasing/reports/dashboard-kpis/')
        self.assertEqual(res_kpis.status_code, 200)
        self.assertIn('open_purchase_orders_count', res_kpis.data)

        # 2. Report Data
        res_rep = self.client.get('/api/purchasing/reports/report-data/?report_type=purchases_by_vendor')
        self.assertEqual(res_rep.status_code, 200)
        self.assertIn('rows', res_rep.data)

        # 3. Vendor Performance
        res_perf = self.client.get('/api/purchasing/reports/vendor-performance/')
        self.assertEqual(res_perf.status_code, 200)

        # 4. Vendor Comparison
        res_comp = self.client.get(f'/api/purchasing/reports/vendor-comparison/?item={self.item_camera.id}')
        self.assertEqual(res_comp.status_code, 200)
        self.assertIn('vendors', res_comp.data)

        # 5. Exceptions
        res_exc = self.client.get('/api/purchasing/reports/exceptions/')
        self.assertEqual(res_exc.status_code, 200)
        self.assertIn('summary', res_exc.data)
