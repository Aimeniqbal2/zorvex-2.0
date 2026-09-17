from decimal import Decimal
from datetime import date, timedelta
from django.test import TestCase
from django.utils import timezone
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError

from companies.models import Company
from finance.models import (
    ChartOfAccount, AccountType,
    AccountingPeriod, PeriodStatus, SecurityFinanceConfiguration,
    PurchasingIntegrationSourceType, PurchasingAccountingStatus,
    PurchasingItemAccountMapping, PurchasingAccountingIntegration,
    PurchasingAccountingLinePreview, CostCenter, ProfitCenter,
    BankAccount, BankAccountType, Currency, ExpenseCategory
)
from purchasing.models import (
    Vendor, ProcurementDocument, ProcurementLine,
    VendorPayment, PurchaseReturn, PurchaseReturnLine, VendorCreditNote
)
from inventory.models import Item, Category
from platform_core.models import Warehouse
from crm.models import CRMEntity
from operations.models import OperationalSite
from finance.services.security_coa_template import provision_security_chart_of_accounts
from finance.services.purchasing_integration_service import PurchasingIntegrationService

User = get_user_model()


class PurchasingIntegrationS4FTests(TestCase):
    """
    Unit and integration test suite for Phase S-4F: Purchasing -> Finance Accounting Integration.
    """

    def setUp(self):
        self.company_a = Company.objects.create(name="Alpha Security Corp", is_active=True)
        self.company_b = Company.objects.create(name="Bravo Security Corp", is_active=True)

        self.user_a = User.objects.create_user(
            username="finance_lead_a",
            email="lead@alpha.com",
            password="Password123!",
            company=self.company_a
        )
        self.user_b = User.objects.create_user(
            username="finance_lead_b",
            email="lead@bravo.com",
            password="Password123!",
            company=self.company_b
        )

        # Provision universal COA and fiscal structure
        provision_security_chart_of_accounts(self.company_a)
        provision_security_chart_of_accounts(self.company_b)

        self.currency_pkr = Currency.objects.get(company=self.company_a, code='PKR')
        self.sec_cfg_a = SecurityFinanceConfiguration.objects.get(company=self.company_a, is_active=True)
        self.acc_ap = self.sec_cfg_a.accounts_payable_account
        self.acc_inv = self.sec_cfg_a.inventory_equipment_account
        self.acc_tax = self.sec_cfg_a.tax_payable_account

        self.bank_acc_a = BankAccount.objects.get(company=self.company_a, account_title='Main Operations Bank')
        self.acc_bank_gl = self.bank_acc_a.chart_of_account

        # Create Operating Expense account for Company A
        self.acc_software_exp = ChartOfAccount.objects.create(
            company=self.company_a, account_code="5050", account_name="Software Subscriptions Expense",
            account_type=AccountType.EXPENSE, is_active=True, is_header=False
        )

        # Header account for validation tests
        self.acc_header = ChartOfAccount.objects.create(
            company=self.company_a, account_code="2000-HDR", account_name="Payables Header",
            account_type=AccountType.LIABILITY, is_active=True, is_header=True
        )

        # Company B Accounts for isolation checks
        sec_cfg_b = SecurityFinanceConfiguration.objects.get(company=self.company_b, is_active=True)
        self.acc_ap_b = sec_cfg_b.accounts_payable_account

        # Vendor
        self.vendor = Vendor.objects.create(
            company=self.company_a,
            name='Hikvision Direct Pakistan',
            email='sales@hikvision.pk',
            phone='+92 300 1234567'
        )
        self.crm_vendor = self.vendor.crm_entity

        # Operational Entities
        self.warehouse = Warehouse.objects.create(company=self.company_a, name="Central Storage Karachi", code="WH-KHI")
        self.cost_center = CostCenter.objects.create(company=self.company_a, name="North Sector Operations", code="CC-NORTH")
        self.profit_center = ProfitCenter.objects.create(company=self.company_a, name="Karachi Security Zone", code="PC-KHI")
        self.site = OperationalSite.objects.create(company=self.company_a, crm_entity=self.crm_vendor, name="Habib Bank Plaza")

        # Inventory Items
        self.cat_equipment = Category.objects.create(company=self.company_a, name="Security Surveillance")
        self.cat_software = Category.objects.create(company=self.company_a, name="IT Subscriptions")

        self.item_camera = Item.objects.create(
            company=self.company_a, name="Hikvision IP Camera 4MP", sku="HIK-4MP",
            category=self.cat_equipment, item_type="EQUIPMENT", cost_price=Decimal('15000.00'), is_active=True
        )
        self.item_software = Item.objects.create(
            company=self.company_a, name="VMS Cloud License", sku="VMS-LIC",
            category=self.cat_software, item_type="SERVICE", cost_price=Decimal('50000.00'), is_active=True
        )

    def test_01_posted_vendor_bill_becomes_finance_ready(self):
        """Test a posted vendor bill for inventory equipment becomes READY with correct Dr/Cr accounts."""
        bill = ProcurementDocument.objects.create(
            company=self.company_a, document_type='VENDOR_INVOICE', status='POSTED',
            crm_entity=self.crm_vendor, vendor=self.vendor, warehouse=self.warehouse,
            document_date=date(2026, 9, 5), subtotal_amount=Decimal('150000.00'),
            tax_amount=Decimal('0.00'), total_amount=Decimal('150000.00'),
            currency='PKR', ap_ready=True
        )
        ProcurementLine.objects.create(
            company=self.company_a, document=bill, item=self.item_camera,
            quantity=Decimal('10.0000'), unit_price=Decimal('15000.00'),
            total_amount=Decimal('150000.00'), line_number=1
        )

        integration = PurchasingIntegrationService.integrate_vendor_bill(bill, user=self.user_a)

        self.assertEqual(integration.status, PurchasingAccountingStatus.READY)
        self.assertEqual(integration.amount, Decimal('150000.00'))
        self.assertEqual(integration.ap_control_account, self.acc_ap)
        self.assertEqual(integration.lines.count(), 1)

        line = integration.lines.first()
        self.assertEqual(line.debit_account, self.acc_inv)
        self.assertEqual(line.credit_account, self.acc_ap)
        self.assertFalse(line.is_unresolved)

    def test_02_ap_control_account_resolution_from_config(self):
        """Test missing AP control account causes integration to be BLOCKED with clear message."""
        # Temporarily clear AP account
        self.sec_cfg_a.accounts_payable_account = None
        self.sec_cfg_a.save()

        bill = ProcurementDocument.objects.create(
            company=self.company_a, document_type='VENDOR_INVOICE', status='POSTED',
            crm_entity=self.crm_vendor, vendor=self.vendor, document_date=date(2026, 9, 6),
            total_amount=Decimal('50000.00'), currency='PKR'
        )
        ProcurementLine.objects.create(
            company=self.company_a, document=bill, item=self.item_camera,
            quantity=Decimal('1'), unit_price=Decimal('50000.00'),
            total_amount=Decimal('50000.00'), line_number=1
        )

        integration = PurchasingIntegrationService.integrate_vendor_bill(bill, user=self.user_a)
        self.assertEqual(integration.status, PurchasingAccountingStatus.BLOCKED)
        self.assertIn("Missing Accounts Payable control account", integration.blocking_reason)

    def test_03_inventory_purchase_classification_precedence(self):
        """Test specific item mapping takes precedence over category and default."""
        custom_inv_acc = ChartOfAccount.objects.create(
            company=self.company_a, account_code="1055", account_name="Special Radios",
            account_type=AccountType.ASSET, is_active=True, is_header=False
        )
        PurchasingItemAccountMapping.objects.create(
            company=self.company_a, item=self.item_camera,
            account_classification='INVENTORY_ASSET', debit_account=custom_inv_acc, is_active=True
        )

        bill = ProcurementDocument.objects.create(
            company=self.company_a, document_type='VENDOR_INVOICE', status='POSTED',
            crm_entity=self.crm_vendor, vendor=self.vendor, document_date=date(2026, 9, 7),
            total_amount=Decimal('30000.00'), currency='PKR'
        )
        ProcurementLine.objects.create(
            company=self.company_a, document=bill, item=self.item_camera,
            quantity=Decimal('2'), unit_price=Decimal('15000.00'),
            total_amount=Decimal('30000.00'), line_number=1
        )

        integration = PurchasingIntegrationService.integrate_vendor_bill(bill, user=self.user_a)
        self.assertEqual(integration.status, PurchasingAccountingStatus.READY)
        line = integration.lines.first()
        self.assertEqual(line.debit_account, custom_inv_acc)

    def test_04_expense_purchase_classification(self):
        """Test category mapping correctly resolves software service to an operating expense account."""
        PurchasingItemAccountMapping.objects.create(
            company=self.company_a, item_category=self.cat_software,
            account_classification='OPERATING_EXPENSE', debit_account=self.acc_software_exp, is_active=True
        )

        bill = ProcurementDocument.objects.create(
            company=self.company_a, document_type='VENDOR_INVOICE', status='POSTED',
            crm_entity=self.crm_vendor, vendor=self.vendor, document_date=date(2026, 9, 8),
            total_amount=Decimal('50000.00'), currency='PKR'
        )
        ProcurementLine.objects.create(
            company=self.company_a, document=bill, item=self.item_software,
            quantity=Decimal('1'), unit_price=Decimal('50000.00'),
            total_amount=Decimal('50000.00'), line_number=1
        )

        integration = PurchasingIntegrationService.integrate_vendor_bill(bill, user=self.user_a)
        self.assertEqual(integration.status, PurchasingAccountingStatus.READY)
        line = integration.lines.first()
        self.assertEqual(line.debit_account, self.acc_software_exp)

    def test_05_mixed_invoice_classification_and_dimensions(self):
        """Test mixed invoice (hardware inventory + software expense + tax) carries line accounts and dimensions."""
        PurchasingItemAccountMapping.objects.create(
            company=self.company_a, item_category=self.cat_software,
            account_classification='OPERATING_EXPENSE', debit_account=self.acc_software_exp, is_active=True
        )

        bill = ProcurementDocument.objects.create(
            company=self.company_a, document_type='VENDOR_INVOICE', status='POSTED',
            crm_entity=self.crm_vendor, vendor=self.vendor, warehouse=self.warehouse,
            document_date=date(2026, 9, 10), subtotal_amount=Decimal('65000.00'),
            tax_amount=Decimal('10400.00'), total_amount=Decimal('75400.00'),
            currency='PKR'
        )
        # Line 1: Camera (Inventory Asset) with Site & Cost Center
        ProcurementLine.objects.create(
            company=self.company_a, document=bill, item=self.item_camera,
            quantity=Decimal('1'), unit_price=Decimal('15000.00'), total_amount=Decimal('15000.00'),
            line_number=1, custom_fields={'cost_center_id': str(self.cost_center.id), 'site_id': str(self.site.id)}
        )
        # Line 2: Software License (Operating Expense)
        ProcurementLine.objects.create(
            company=self.company_a, document=bill, item=self.item_software,
            quantity=Decimal('1'), unit_price=Decimal('50000.00'), total_amount=Decimal('50000.00'),
            line_number=2
        )

        integration = PurchasingIntegrationService.integrate_vendor_bill(bill, user=self.user_a)
        self.assertEqual(integration.status, PurchasingAccountingStatus.READY)
        self.assertEqual(integration.lines.count(), 3)  # Line 1 + Line 2 + Tax line

        line1 = integration.lines.get(line_number=1)
        self.assertEqual(line1.debit_account, self.acc_inv)
        self.assertEqual(line1.cost_center, self.cost_center)
        self.assertEqual(line1.site, self.site)

        line2 = integration.lines.get(line_number=2)
        self.assertEqual(line2.debit_account, self.acc_software_exp)

        tax_line = integration.lines.get(is_tax_line=True)
        self.assertEqual(tax_line.debit_account, self.acc_tax)
        self.assertEqual(tax_line.amount, Decimal('10400.00'))

    def test_06_missing_mapping_becomes_blocked_with_reason(self):
        """Test item with no mapping and no config default marks integration BLOCKED."""
        self.sec_cfg_a.inventory_equipment_account = None
        self.sec_cfg_a.save()

        bill = ProcurementDocument.objects.create(
            company=self.company_a, document_type='VENDOR_INVOICE', status='POSTED',
            crm_entity=self.crm_vendor, vendor=self.vendor, document_date=date(2026, 9, 11),
            total_amount=Decimal('15000.00'), currency='PKR'
        )
        ProcurementLine.objects.create(
            company=self.company_a, document=bill, item=self.item_camera,
            quantity=Decimal('1'), unit_price=Decimal('15000.00'),
            total_amount=Decimal('15000.00'), line_number=1
        )

        integration = PurchasingIntegrationService.integrate_vendor_bill(bill, user=self.user_a)
        self.assertEqual(integration.status, PurchasingAccountingStatus.BLOCKED)
        self.assertIn("No debit account mapping found", integration.blocking_reason)

    def test_07_vendor_payment_links_existing_voucher(self):
        """Test vendor payment integration creates/links FinancialVoucher and sets Dr AP / Cr Bank."""
        payment = VendorPayment.objects.create(
            company=self.company_a, vendor=self.vendor, payment_date=date(2026, 9, 12),
            amount=Decimal('100000.00'), payment_method='BANK_TRANSFER',
            account=self.acc_bank_gl, currency='PKR', status='POSTED'
        )

        integration = PurchasingIntegrationService.integrate_vendor_payment(payment, user=self.user_a)
        self.assertEqual(integration.status, PurchasingAccountingStatus.READY)
        self.assertIsNotNone(integration.voucher)
        self.assertEqual(str(integration.voucher.source_document_id), str(payment.id))

        preview = PurchasingIntegrationService.get_accounting_preview_for_source(
            self.company_a, PurchasingIntegrationSourceType.VENDOR_PAYMENT, str(payment.id)
        )
        self.assertTrue(preview['exists'])
        self.assertTrue(preview['is_balanced'])
        self.assertEqual(preview['total_debits'], 100000.0)
        self.assertEqual(preview['total_credits'], 100000.0)

    def test_08_no_duplicate_voucher_or_payment_creation(self):
        """Test repeated integration calls are strictly idempotent."""
        payment = VendorPayment.objects.create(
            company=self.company_a, vendor=self.vendor, payment_date=date(2026, 9, 13),
            amount=Decimal('25000.00'), payment_method='BANK_TRANSFER',
            account=self.acc_bank_gl, currency='PKR', status='POSTED'
        )

        int1 = PurchasingIntegrationService.integrate_vendor_payment(payment, user=self.user_a)
        int2 = PurchasingIntegrationService.integrate_vendor_payment(payment, user=self.user_a)

        self.assertEqual(int1.id, int2.id)
        self.assertEqual(PurchasingAccountingIntegration.objects.filter(company=self.company_a, source_id=str(payment.id)).count(), 1)

    def test_09_purchase_return_accounting_reversal_preview(self):
        """Test purchase return generates reversal preview (Dr AP, Cr Inventory Asset)."""
        ret = PurchaseReturn.objects.create(
            company=self.company_a, vendor=self.vendor, warehouse=self.warehouse,
            return_date=date(2026, 9, 14), total_return_amount=Decimal('30000.00'),
            currency='PKR', status='POSTED'
        )
        PurchaseReturnLine.objects.create(
            company=self.company_a, purchase_return=ret, item=self.item_camera,
            return_quantity=Decimal('2'), unit_cost=Decimal('15000.00'),
            total_amount=Decimal('30000.00'), line_number=1
        )

        integration = PurchasingIntegrationService.integrate_purchase_return(ret, user=self.user_a)
        self.assertEqual(integration.status, PurchasingAccountingStatus.READY)
        line = integration.lines.first()
        self.assertEqual(line.debit_account, self.acc_ap)       # Reduces AP
        self.assertEqual(line.credit_account, self.acc_inv)     # Reduces Inventory

    def test_10_vendor_credit_note_handling(self):
        """Test vendor credit note creates unallocated credit classification without negative AP."""
        ret = PurchaseReturn.objects.create(
            company=self.company_a, vendor=self.vendor, warehouse=self.warehouse,
            return_date=date(2026, 9, 15), total_return_amount=Decimal('15000.00'),
            currency='PKR', status='POSTED'
        )
        cn = VendorCreditNote.objects.create(
            company=self.company_a, vendor=self.vendor, purchase_return=ret,
            credit_date=date(2026, 9, 15), amount=Decimal('15000.00'),
            unallocated_amount=Decimal('15000.00'), currency='PKR', status='POSTED'
        )

        integration = PurchasingIntegrationService.integrate_vendor_credit_note(cn, user=self.user_a)
        self.assertEqual(integration.status, PurchasingAccountingStatus.READY)
        self.assertEqual(integration.amount, Decimal('15000.00'))

    def test_11_reclassify_line_unblocks_integration(self):
        """Test finance user reclassifying an unresolved line changes integration from BLOCKED to READY."""
        self.sec_cfg_a.inventory_equipment_account = None
        self.sec_cfg_a.save()

        bill = ProcurementDocument.objects.create(
            company=self.company_a, document_type='VENDOR_INVOICE', status='POSTED',
            crm_entity=self.crm_vendor, vendor=self.vendor, document_date=date(2026, 9, 16),
            total_amount=Decimal('15000.00'), currency='PKR'
        )
        ProcurementLine.objects.create(
            company=self.company_a, document=bill, item=self.item_camera,
            quantity=Decimal('1'), unit_price=Decimal('15000.00'),
            total_amount=Decimal('15000.00'), line_number=1
        )

        integration = PurchasingIntegrationService.integrate_vendor_bill(bill, user=self.user_a)
        self.assertEqual(integration.status, PurchasingAccountingStatus.BLOCKED)

        line = integration.lines.first()
        self.assertTrue(line.is_unresolved)

        # Finance user corrects the mapping on the line
        PurchasingIntegrationService.reclassify_line(
            line=line,
            debit_account_id=str(self.acc_inv.id),
            user=self.user_a
        )

        integration.refresh_from_db()
        self.assertEqual(integration.status, PurchasingAccountingStatus.READY)
        self.assertEqual(integration.blocking_reason, "")

    def test_12_closed_accounting_period_protection(self):
        """Test transactions in a closed/locked period are marked BLOCKED."""
        # Close August 2026 period
        period_aug = AccountingPeriod.objects.filter(company=self.company_a, period_number=8).first()
        if period_aug:
            period_aug.status = PeriodStatus.CLOSED
            period_aug.save()

        bill = ProcurementDocument.objects.create(
            company=self.company_a, document_type='VENDOR_INVOICE', status='POSTED',
            crm_entity=self.crm_vendor, vendor=self.vendor, document_date=date(2026, 8, 15),
            total_amount=Decimal('10000.00'), currency='PKR'
        )
        ProcurementLine.objects.create(
            company=self.company_a, document=bill, item=self.item_camera,
            quantity=Decimal('1'), unit_price=Decimal('10000.00'),
            total_amount=Decimal('10000.00'), line_number=1
        )

        integration = PurchasingIntegrationService.integrate_vendor_bill(bill, user=self.user_a)
        self.assertEqual(integration.status, PurchasingAccountingStatus.BLOCKED)
        self.assertIn("Accounting Period closed/locked", integration.blocking_reason)

    def test_13_cross_tenant_account_mapping_blocked(self):
        """Test accounts belonging to another tenant cannot be used and block integration."""
        self.sec_cfg_a.accounts_payable_account = self.acc_ap_b  # Account from Company B
        self.sec_cfg_a.save()

        bill = ProcurementDocument.objects.create(
            company=self.company_a, document_type='VENDOR_INVOICE', status='POSTED',
            crm_entity=self.crm_vendor, vendor=self.vendor, document_date=date(2026, 9, 18),
            total_amount=Decimal('10000.00'), currency='PKR'
        )
        ProcurementLine.objects.create(
            company=self.company_a, document=bill, item=self.item_camera,
            quantity=Decimal('1'), unit_price=Decimal('10000.00'),
            total_amount=Decimal('10000.00'), line_number=1
        )

        integration = PurchasingIntegrationService.integrate_vendor_bill(bill, user=self.user_a)
        self.assertEqual(integration.status, PurchasingAccountingStatus.BLOCKED)
        self.assertIn("belongs to a different company", integration.blocking_reason)

    def test_14_header_account_blocked(self):
        """Test header/group accounts cannot be used as AP control account."""
        self.sec_cfg_a.accounts_payable_account = self.acc_header
        self.sec_cfg_a.save()

        bill = ProcurementDocument.objects.create(
            company=self.company_a, document_type='VENDOR_INVOICE', status='POSTED',
            crm_entity=self.crm_vendor, vendor=self.vendor, document_date=date(2026, 9, 19),
            total_amount=Decimal('10000.00'), currency='PKR'
        )
        ProcurementLine.objects.create(
            company=self.company_a, document=bill, item=self.item_camera,
            quantity=Decimal('1'), unit_price=Decimal('10000.00'),
            total_amount=Decimal('10000.00'), line_number=1
        )

        integration = PurchasingIntegrationService.integrate_vendor_bill(bill, user=self.user_a)
        self.assertEqual(integration.status, PurchasingAccountingStatus.BLOCKED)
        self.assertIn("header/group account", integration.blocking_reason)
