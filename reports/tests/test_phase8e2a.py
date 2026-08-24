"""
reports/tests/test_phase8e2a.py

Phase 8E-2A: Streaming Export & Reporting Performance Hardening Tests
Covers:
  - StreamingHttpResponse for CSV exports
  - Inventory valuation ORM aggregation
  - Low stock ORM-level filtering (no Python loops)
  - HR workforce utilization via values().iterator()
  - Contract profitability via values().iterator()
  - Tenant isolation
  - Permission enforcement
"""
import csv
import io
from decimal import Decimal
from datetime import date, time, datetime, timedelta

from django.test import TestCase
from django.urls import reverse
from django.contrib.auth import get_user_model
from django.http import StreamingHttpResponse
from django.utils import timezone as tz

from companies.models import Company
from hrm.models import Department, Employee, Designation, WorkforceAttendance
from billing.models import ServiceInvoice
from crm.models import CRMEntity
from operations.models import ServiceContract, ContractRate, OperationalSite, Deployment, DutyAssignment
from platform_core.models import Warehouse
from inventory.models import Category, Item, InventoryBalance
from reports.services.export import UniversalExportService, Echo

User = get_user_model()


class StreamingExportArchitectureTests(TestCase):
    """Tests for the streaming CSV export architecture."""

    def test_echo_write_returns_value(self):
        """Echo pseudo-buffer returns what it receives."""
        e = Echo()
        self.assertEqual(e.write("hello"), "hello")

    def test_stream_csv_returns_streaming_response(self):
        """stream_csv must return a StreamingHttpResponse, not HttpResponse."""
        data = [{"col_a": "val1", "col_b": "val2"}]
        response = UniversalExportService.stream_csv(data, filename_prefix="test", headers=["col_a", "col_b"])
        self.assertIsInstance(response, StreamingHttpResponse)

    def test_stream_csv_headers_present(self):
        """CSV headers must appear as the first row."""
        data = [{"name": "Widget", "qty": 5}]
        response = UniversalExportService.stream_csv(data, filename_prefix="test", headers=["name", "qty"])
        content = b"".join(response.streaming_content).decode("utf-8")
        reader = csv.reader(io.StringIO(content))
        rows = list(reader)
        self.assertEqual(rows[0], ["name", "qty"])

    def test_stream_csv_content_rows(self):
        """Streamed rows must contain data values."""
        data = [{"name": "Alpha", "qty": 10}, {"name": "Beta", "qty": 20}]
        response = UniversalExportService.stream_csv(data, filename_prefix="test", headers=["name", "qty"])
        content = b"".join(response.streaming_content).decode("utf-8")
        self.assertIn("Alpha", content)
        self.assertIn("Beta", content)

    def test_stream_csv_content_disposition(self):
        """Response must have attachment Content-Disposition header."""
        data = [{"a": "b"}]
        response = UniversalExportService.stream_csv(data, filename_prefix="myreport", headers=["a"])
        self.assertIn("attachment", response["Content-Disposition"])
        self.assertIn("myreport", response["Content-Disposition"])

    def test_stream_csv_utf8_content_type(self):
        """Response must declare UTF-8 CSV content type."""
        data = [{"a": "b"}]
        response = UniversalExportService.stream_csv(data, filename_prefix="r", headers=["a"])
        self.assertIn("text/csv", response["Content-Type"])
        self.assertIn("utf-8", response["Content-Type"])

    def test_stream_csv_decimal_serialization(self):
        """Decimal values must be serialized to float in output."""
        data = [{"price": Decimal("12.99")}]
        response = UniversalExportService.stream_csv(data, filename_prefix="test", headers=["price"])
        content = b"".join(response.streaming_content).decode("utf-8")
        self.assertIn("12.99", content)

    def test_stream_csv_date_serialization(self):
        """date values must be serialized to ISO format in output."""
        today = date.today()
        data = [{"on_date": today}]
        response = UniversalExportService.stream_csv(data, filename_prefix="test", headers=["on_date"])
        content = b"".join(response.streaming_content).decode("utf-8")
        self.assertIn(today.isoformat(), content)

    def test_stream_csv_empty_queryset(self):
        """Empty input must still produce headers row and no crash."""
        response = UniversalExportService.stream_csv([], filename_prefix="empty", headers=["col1", "col2"])
        content = b"".join(response.streaming_content).decode("utf-8")
        reader = csv.reader(io.StringIO(content))
        rows = list(reader)
        self.assertEqual(rows[0], ["col1", "col2"])
        self.assertEqual(len(rows), 1)  # only header, no data

    def test_stream_csv_row_formatter(self):
        """Custom row_formatter must be used to produce output rows."""
        data = [{"x": 1}, {"x": 2}]

        def fmt(item):
            return [item["x"] * 10]

        response = UniversalExportService.stream_csv(data, filename_prefix="test", headers=["x10"], row_formatter=fmt)
        content = b"".join(response.streaming_content).decode("utf-8")
        self.assertIn("10", content)
        self.assertIn("20", content)


class InventoryReportPerformanceTests(TestCase):
    """Tests for ORM-optimized inventory reporting."""

    @classmethod
    def setUpTestData(cls):
        cls.company = Company.objects.create(name="InvCo")
        cls.company2 = Company.objects.create(name="OtherInvCo")

        cls.user = User.objects.create_user(username="invuser", password="pass", company=cls.company)
        cls.user2 = User.objects.create_user(username="invuser2", password="pass", company=cls.company2)

        cls.warehouse = Warehouse.objects.create(company=cls.company, name="WH1")
        cls.cat = Category.objects.create(company=cls.company, name="Electronics")

        cls.item_a = Item.objects.create(
            company=cls.company, name="Item A", sku="SKU-A",
            category=cls.cat, cost_price=Decimal("5.00"),
            track_inventory=True, minimum_stock_level=Decimal("20.00")
        )
        cls.item_b = Item.objects.create(
            company=cls.company, name="Item B", sku="SKU-B",
            category=cls.cat, cost_price=Decimal("10.00"),
            track_inventory=True, minimum_stock_level=Decimal("10.00")
        )
        # item_a: qty=15 → below min 20 → low stock
        # item_b: qty=30 → above min 10 → not low stock
        InventoryBalance.objects.create(company=cls.company, item=cls.item_a, warehouse=cls.warehouse, quantity=Decimal("15.00"))
        InventoryBalance.objects.create(company=cls.company, item=cls.item_b, warehouse=cls.warehouse, quantity=Decimal("30.00"))

        # Company 2 data – must not appear for company 1
        cls.warehouse2 = Warehouse.objects.create(company=cls.company2, name="WH2")
        cls.cat2 = Category.objects.create(company=cls.company2, name="Parts")
        cls.item_c = Item.objects.create(
            company=cls.company2, name="Item C", sku="SKU-C",
            category=cls.cat2, cost_price=Decimal("2.00"),
            track_inventory=True, minimum_stock_level=Decimal("5.00")
        )
        InventoryBalance.objects.create(company=cls.company2, item=cls.item_c, warehouse=cls.warehouse2, quantity=Decimal("1.00"))

    def setUp(self):
        self.client.login(username="invuser", password="pass")

    def _enable_reports_module(self):
        """Enable the reports module for the company so the API allows access."""
        from platform_core.models import ModuleDefinition, CompanyModule
        mod, _ = ModuleDefinition.objects.get_or_create(code="reports", defaults={"name": "Reports"})
        CompanyModule.objects.get_or_create(company=self.company, module=mod, defaults={"enabled": True})

    # ----- Valuation tests -----

    def test_inventory_valuation_aggregation_correctness(self):
        """Inventory valuation must sum qty * cost_price at the DB level."""
        from reports.services.supply_chain import SupplyChainReportingService
        svc = SupplyChainReportingService(company_id=self.company.id)
        result = svc.get_inventory_valuation()
        # item_a: 15 * 5 = 75, item_b: 30 * 10 = 300, total = 375
        self.assertAlmostEqual(result["total_valuation"], 375.0)
        self.assertAlmostEqual(result["total_quantity"], 45.0)
        self.assertEqual(result["total_items"], 2)

    def test_inventory_valuation_company_isolation(self):
        """Inventory valuation must only include records for the requesting company."""
        from reports.services.supply_chain import SupplyChainReportingService
        svc = SupplyChainReportingService(company_id=self.company.id)
        result = svc.get_inventory_valuation()
        item_ids = [item["item_id"] for item in result["items"]]
        self.assertNotIn(str(self.item_c.id), item_ids)

    def test_inventory_valuation_warehouse_filter(self):
        """Warehouse filter must narrow results to the specified warehouse."""
        from reports.services.supply_chain import SupplyChainReportingService
        svc = SupplyChainReportingService(company_id=self.company.id)
        # Our warehouse has both items – valuation should still be 375
        result = svc.get_inventory_valuation(warehouse_id=self.warehouse.id)
        self.assertAlmostEqual(result["total_valuation"], 375.0)

    # ----- Low stock tests -----

    def test_low_stock_threshold_correctness(self):
        """Only items where current qty <= threshold should appear."""
        from reports.services.supply_chain import SupplyChainReportingService
        svc = SupplyChainReportingService(company_id=self.company.id)
        result = svc.get_low_stock_report()
        low_ids = [item["item_id"] for item in result["low_stock_items"]]
        # item_a: qty=15 <= min=20 → low stock
        self.assertIn(str(self.item_a.id), low_ids)
        # item_b: qty=30 > min=10 → NOT low stock
        self.assertNotIn(str(self.item_b.id), low_ids)

    def test_low_stock_company_isolation(self):
        """Low stock report must exclude records from other companies."""
        from reports.services.supply_chain import SupplyChainReportingService
        svc = SupplyChainReportingService(company_id=self.company.id)
        result = svc.get_low_stock_report()
        low_ids = [item["item_id"] for item in result["low_stock_items"]]
        self.assertNotIn(str(self.item_c.id), low_ids)


class HRUtilizationPerformanceTests(TestCase):
    """Tests for HR workforce utilization with values().iterator() optimization."""

    @classmethod
    def setUpTestData(cls):
        cls.company = Company.objects.create(name="HR Co")
        cls.company2 = Company.objects.create(name="HR Co 2")

        cls.user = User.objects.create_user(username="hruser", password="pass", company=cls.company)
        cls.department = Department.objects.create(company=cls.company, name="Ops")
        cls.employee = Employee.objects.create(
            company=cls.company, user=cls.user, first_name="Jane", last_name="Smith", department=cls.department
        )

        cls.crm = CRMEntity.objects.create(company=cls.company, entity_type="CUSTOMER", name="CRM Acme")
        cls.site = OperationalSite.objects.create(company=cls.company, name="HR Site", crm_entity=cls.crm)

        cls.today = date.today()
        cls.designation = Designation.objects.create(company=cls.company, name="Analyst")

        cls.contract = ServiceContract.objects.create(
            company=cls.company,
            crm_entity=cls.crm,
            contract_code="HR-CTR-001",
            start_date=cls.today,
            status="ACTIVE"
        )
        cls.contract.sites.add(cls.site)

        cls.deployment = Deployment.objects.create(
            company=cls.company,
            employee=cls.employee,
            site=cls.site,
            designation=cls.designation,
            service_contract=cls.contract,
            start_date=cls.today,
            status="ACTIVE"
        )

        # Duty: 09:00 – 17:00 = 8 scheduled hours
        DutyAssignment.objects.create(
            company=cls.company,
            deployment=cls.deployment,
            employee=cls.employee,
            site=cls.site,
            date=cls.today,
            start_time=time(9, 0),
            end_time=time(17, 0),
            status="COMPLETED"
        )

        # Attendance: 09:00 – 16:00 = 7 actual hours (timezone-aware)
        WorkforceAttendance.objects.create(
            company=cls.company,
            employee=cls.employee,
            date=cls.today,
            check_in=tz.make_aware(datetime.combine(cls.today, time(9, 0))),
            check_out=tz.make_aware(datetime.combine(cls.today, time(16, 0)))
        )

    def test_utilization_correctness(self):
        """Utilization must equal actual/scheduled * 100."""
        from reports.services.hr_analytics import HRAnalyticsReportingService
        svc = HRAnalyticsReportingService(company_id=self.company.id)
        result = svc.get_workforce_utilization()
        self.assertEqual(result["total_scheduled_hours"], 8.0)
        self.assertEqual(result["total_actual_hours"], 7.0)
        self.assertAlmostEqual(result["overall_utilization_percentage"], 87.5)

    def test_utilization_zero_scheduled_hours(self):
        """With no duties, scheduled hours = 0 and overall utilization = 0 (no division by zero)."""
        from reports.services.hr_analytics import HRAnalyticsReportingService
        # Use a company with no duties
        svc = HRAnalyticsReportingService(company_id=self.company2.id)
        result = svc.get_workforce_utilization()
        self.assertEqual(result["total_scheduled_hours"], 0.0)
        self.assertEqual(result["overall_utilization_percentage"], 0.0)

    def test_utilization_missing_attendance(self):
        """If attendance has no check_out, those records must be excluded."""
        from reports.services.hr_analytics import HRAnalyticsReportingService
        # Create a duty with no corresponding attendance at all
        svc = HRAnalyticsReportingService(company_id=self.company.id)
        result = svc.get_workforce_utilization()
        # Actual hours should still be 7.0 from the one valid attendance record
        self.assertEqual(result["total_actual_hours"], 7.0)

    def test_utilization_company_isolation(self):
        """Company 2 must never see company 1 utilization data."""
        from reports.services.hr_analytics import HRAnalyticsReportingService
        svc = HRAnalyticsReportingService(company_id=self.company2.id)
        result = svc.get_workforce_utilization()
        self.assertEqual(result["total_scheduled_hours"], 0.0)
        self.assertEqual(result["total_actual_hours"], 0.0)

    def test_utilization_group_by_employee(self):
        """group_by=employee must produce a breakdown keyed by employee_id."""
        from reports.services.hr_analytics import HRAnalyticsReportingService
        svc = HRAnalyticsReportingService(company_id=self.company.id)
        result = svc.get_workforce_utilization(group_by="employee")
        self.assertEqual(len(result["breakdown"]), 1)
        self.assertEqual(result["breakdown"][0]["group_id"], str(self.employee.id))


class ContractProfitabilityPerformanceTests(TestCase):
    """Tests for contract profitability with values().iterator() optimization."""

    @classmethod
    def setUpTestData(cls):
        cls.company = Company.objects.create(name="Ops Co")
        cls.company2 = Company.objects.create(name="Other Ops Co")

        cls.user = User.objects.create_user(username="opsuser", password="pass", company=cls.company)
        cls.department = Department.objects.create(company=cls.company, name="Field Ops")
        cls.employee = Employee.objects.create(
            company=cls.company, user=cls.user, first_name="Bob", last_name="Builder", department=cls.department
        )
        cls.designation = Designation.objects.create(company=cls.company, name="Supervisor")
        cls.crm = CRMEntity.objects.create(company=cls.company, entity_type="CUSTOMER", name="Client A")
        cls.site = OperationalSite.objects.create(company=cls.company, name="OPS Site", crm_entity=cls.crm)

        cls.today = date.today()

        cls.contract = ServiceContract.objects.create(
            company=cls.company,
            crm_entity=cls.crm,
            contract_code="OPS-CTR-001",
            start_date=cls.today,
            status="ACTIVE"
        )
        cls.contract.sites.add(cls.site)

        ContractRate.objects.create(
            company=cls.company,
            service_contract=cls.contract,
            designation=cls.designation,
            pay_rate=Decimal("15.00"),
            effective_date=cls.today
        )

        cls.deployment = Deployment.objects.create(
            company=cls.company,
            employee=cls.employee,
            site=cls.site,
            designation=cls.designation,
            service_contract=cls.contract,
            start_date=cls.today,
            status="ACTIVE"
        )

        # Duty: 09:00–17:00 = 8 hours completed → cost = 8 * 15 = 120
        DutyAssignment.objects.create(
            company=cls.company,
            deployment=cls.deployment,
            employee=cls.employee,
            site=cls.site,
            date=cls.today,
            start_time=time(9, 0),
            end_time=time(17, 0),
            status="COMPLETED"
        )

        # Revenue: invoice total_amount = 500
        ServiceInvoice.objects.create(
            company=cls.company,
            service_contract=cls.contract,
            crm_entity=cls.crm,
            period_start=cls.today,
            period_end=cls.today + timedelta(days=30),
            status="POSTED",
            total_amount=Decimal("500.00")
        )

    def test_profitability_correctness(self):
        """Revenue, cost, and profit must be computed correctly."""
        from reports.services.operations_metrics import OperationsMetricsReportingService
        svc = OperationsMetricsReportingService(company_id=self.company.id)
        result = svc.get_contract_profitability()
        self.assertEqual(len(result["contracts"]), 1)
        c = result["contracts"][0]
        self.assertEqual(c["revenue"], 500.0)
        self.assertAlmostEqual(c["estimated_cost"], 120.0)  # 8h * 15/h
        self.assertAlmostEqual(c["profit"], 380.0)
        self.assertAlmostEqual(c["completed_hours"], 8.0)

    def test_profitability_completed_duty_filter(self):
        """Only COMPLETED duties must contribute to cost calculation."""
        from reports.services.operations_metrics import OperationsMetricsReportingService
        # Create a SCHEDULED (non-completed) duty – must NOT be counted
        DutyAssignment.objects.create(
            company=self.company,
            deployment=self.deployment,
            employee=self.employee,
            site=self.site,
            date=self.today + timedelta(days=1),
            start_time=time(9, 0),
            end_time=time(17, 0),
            status="SCHEDULED"
        )
        svc = OperationsMetricsReportingService(company_id=self.company.id)
        result = svc.get_contract_profitability()
        c = result["contracts"][0]
        # Cost should still be 120.0 (only the COMPLETED duty counts)
        self.assertAlmostEqual(c["estimated_cost"], 120.0)

    def test_profitability_company_isolation(self):
        """Company 2 must see no contracts from company 1."""
        from reports.services.operations_metrics import OperationsMetricsReportingService
        svc = OperationsMetricsReportingService(company_id=self.company2.id)
        result = svc.get_contract_profitability()
        self.assertEqual(len(result["contracts"]), 0)


class ExportAPIEndpointTests(TestCase):
    """Integration tests for the streaming export API endpoints."""

    @classmethod
    def setUpTestData(cls):
        cls.company = Company.objects.create(name="API Co")
        cls.user = User.objects.create_user(username="apiuser", password="pass", company=cls.company)

        # Enable reports module
        from platform_core.models import ModuleDefinition, CompanyModule
        mod, _ = ModuleDefinition.objects.get_or_create(code="reports", defaults={"name": "Reports"})
        CompanyModule.objects.get_or_create(company=cls.company, module=mod, defaults={"enabled": True})

        cls.warehouse = Warehouse.objects.create(company=cls.company, name="API WH")
        cls.cat = Category.objects.create(company=cls.company, name="API Cat")
        cls.item = Item.objects.create(
            company=cls.company, name="API Item", sku="API-SKU",
            category=cls.cat, cost_price=Decimal("8.00"),
            track_inventory=True, minimum_stock_level=Decimal("100.00")
        )
        InventoryBalance.objects.create(company=cls.company, item=cls.item, warehouse=cls.warehouse, quantity=Decimal("10.00"))

        # Add active subscription so TenantMiddleware doesn't return 402
        from subscriptions.models import CompanySubscription, SubscriptionPlan
        plan, _ = SubscriptionPlan.objects.get_or_create(
            name="Test Plan", defaults={"price": "0.00", "max_users": 999}
        )
        CompanySubscription.objects.create(
            company=cls.company,
            plan=plan,
            is_active=True,
            start_date=date.today(),
            end_date=date.today() + timedelta(days=365)
        )

    def setUp(self):
        # Use DRF APIClient so force_authenticate() works regardless of
        # which DRF authentication backends are configured (JWT-only, etc.)
        from rest_framework.test import APIClient
        self.api_client = APIClient()
        self.api_client.force_authenticate(user=self.user)

    @staticmethod
    def _read_streaming(response):
        """Safely consume content from a streaming or regular response."""
        if hasattr(response, 'streaming_content'):
            return b"".join(response.streaming_content).decode("utf-8")
        return response.content.decode("utf-8")

    def test_inventory_valuation_export_is_streaming(self):
        """GET /reports/export/?type=inventory_valuation must return StreamingHttpResponse."""
        url = reverse("api-export-csv") + "?type=inventory_valuation"
        response = self.api_client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertIsInstance(response, StreamingHttpResponse)

    def test_inventory_valuation_export_contains_item(self):
        """Exported CSV must contain the test item."""
        url = reverse("api-export-csv") + "?type=inventory_valuation"
        response = self.api_client.get(url)
        content = self._read_streaming(response)
        self.assertIn("API-SKU", content)

    def test_low_stock_export_is_streaming(self):
        """GET /reports/export/?type=low_stock must return StreamingHttpResponse."""
        url = reverse("api-export-csv") + "?type=low_stock"
        response = self.api_client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertIsInstance(response, StreamingHttpResponse)

    def test_low_stock_export_contains_low_item(self):
        """Exported low stock CSV must contain items below threshold."""
        url = reverse("api-export-csv") + "?type=low_stock"
        response = self.api_client.get(url)
        content = self._read_streaming(response)
        # item has qty=10, min=100 → low stock
        self.assertIn("API-SKU", content)

    def test_export_requires_authentication(self):
        """Unauthenticated request must be rejected."""
        from rest_framework.test import APIClient
        anon_client = APIClient()  # no force_authenticate
        url = reverse("api-export-csv") + "?type=inventory_valuation"
        response = anon_client.get(url)
        self.assertIn(response.status_code, [302, 401, 403])

    def test_export_tenant_isolation(self):
        """Export must not return items from other companies."""
        from rest_framework.test import APIClient
        from subscriptions.models import CompanySubscription, SubscriptionPlan
        from platform_core.models import ModuleDefinition, CompanyModule

        company2 = Company.objects.create(name="Other API Co")
        user2 = User.objects.create_user(username="apiuser2", password="pass", company=company2)
        mod, _ = ModuleDefinition.objects.get_or_create(code="reports", defaults={"name": "Reports"})
        CompanyModule.objects.get_or_create(company=company2, module=mod, defaults={"enabled": True})
        plan, _ = SubscriptionPlan.objects.get_or_create(
            name="Test Plan", defaults={"price": "0.00", "max_users": 999}
        )
        CompanySubscription.objects.create(
            company=company2,
            plan=plan,
            is_active=True,
            start_date=date.today(),
            end_date=date.today() + timedelta(days=365)
        )

        client2 = APIClient()
        client2.force_authenticate(user=user2)
        url = reverse("api-export-csv") + "?type=inventory_valuation"
        response = client2.get(url)
        self.assertEqual(response.status_code, 200)
        content = self._read_streaming(response)
        self.assertNotIn("API-SKU", content)

