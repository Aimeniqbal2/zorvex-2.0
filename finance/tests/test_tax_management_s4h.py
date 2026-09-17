import uuid
from decimal import Decimal
from datetime import date, timedelta
from django.test import TestCase
from django.utils import timezone
from django.core.exceptions import ValidationError

from companies.models import Company
from accounts.models import User
from crm.models import CRMEntity
from operations.models import ServiceContract
from billing.models import ClientInvoice, ClientInvoiceStatus
from purchasing.models import Vendor, ProcurementDocument
from finance.models import (
    ChartOfAccount, AccountType, NormalBalance, Currency,
    FiscalYear, AccountingPeriod, PeriodStatus, BankAccount, BankAccountType,
    FinancialVoucher, VoucherType, VoucherStatus, TreasuryTransaction,
    SecurityFinanceConfiguration,
    TaxAuthority, CompanyTaxProfile, TaxCode, TaxCategory, TaxRecoverability,
    TaxPeriod, TaxPeriodStatus, TaxTransaction, TaxTransactionSourceType,
    TaxTransactionStatus, TaxDirection, ClientWithholdingCertificate,
    WithholdingVerificationStatus, VendorWithholdingRecord, VendorWithholdingStatus,
    TaxPaymentVoucher, TaxVoucherStatus, TaxPaymentType, TaxAdjustment, TaxAdjustmentType,
    PayrollAccountingIntegration, PayrollAccountingStatus, Expense, ExpenseCategory
)
from finance.services.security_coa_template import provision_security_chart_of_accounts
from finance.services.tax_service import TaxService
from finance.services.treasury_service import TreasuryService


class TaxManagementS4HTestCase(TestCase):
    """
    Rigorously tests Phase S-4H Tax Management, Tax Invoices, Withholding & Tax Vouchers.
    """

    def setUp(self):
        # 1. Companies
        self.company_a = Company.objects.create(name="Alpha Security Services Ltd", is_active=True)
        self.company_b = Company.objects.create(name="Beta Guard Corp", is_active=True)

        # 2. Users
        self.user_a = User.objects.create_user(username="fin_alpha", email="fin@alpha.com", password="password", company=self.company_a)
        self.user_b = User.objects.create_user(username="fin_beta", email="fin@beta.com", password="password", company=self.company_b)

        # 3. Currency
        self.pkr_a = Currency.objects.create(company=self.company_a, code="PKR", name="Pakistani Rupee", symbol="Rs", is_base_currency=True)
        self.pkr_b = Currency.objects.create(company=self.company_b, code="PKR", name="Pakistani Rupee", symbol="Rs", is_base_currency=True)

        # 4. Provision Security COA
        provision_security_chart_of_accounts(self.company_a)
        provision_security_chart_of_accounts(self.company_b)

        # 5. Fiscal Year & Accounting Period
        self.today = timezone.now().date()
        self.fy_a = FiscalYear.objects.filter(company=self.company_a, is_current=True).first()
        self.period_a = AccountingPeriod.objects.filter(company=self.company_a).first()
        if not self.period_a:
            self.period_a = AccountingPeriod.objects.create(
                company=self.company_a, fiscal_year=self.fy_a, month=self.today.month,
                period_number=self.today.month, start_date=date(2026, self.today.month, 1),
                end_date=date(2026, self.today.month, 28), status=PeriodStatus.OPEN
            )
        else:
            self.period_a.status = PeriodStatus.OPEN
            self.period_a.start_date = date(2026, 1, 1)
            self.period_a.end_date = date(2026, 12, 31)
            self.period_a.save()

        # 6. Accounts
        self.acc_output_tax, _ = ChartOfAccount.objects.get_or_create(
            company=self.company_a, account_code='2300',
            defaults={'account_name': 'Tax Payable (WHT / Sales Tax)', 'account_type': AccountType.LIABILITY, 'normal_balance': NormalBalance.CREDIT}
        )
        self.acc_input_tax, _ = ChartOfAccount.objects.get_or_create(
            company=self.company_a, account_code='1400',
            defaults={'account_name': 'Advance Tax / Tax Recoverable', 'account_type': AccountType.ASSET, 'normal_balance': NormalBalance.DEBIT}
        )
        self.acc_wht_pay, _ = ChartOfAccount.objects.get_or_create(
            company=self.company_a, account_code='2310',
            defaults={'account_name': 'Withholding Tax Payable', 'account_type': AccountType.LIABILITY, 'normal_balance': NormalBalance.CREDIT}
        )
        self.acc_wht_rec, _ = ChartOfAccount.objects.get_or_create(
            company=self.company_a, account_code='1410',
            defaults={'account_name': 'Withholding Tax Deducted by Clients', 'account_type': AccountType.ASSET, 'normal_balance': NormalBalance.DEBIT}
        )

        # 7. Bank Account
        self.bank_account_a = BankAccount.objects.filter(company=self.company_a).first()
        if not self.bank_account_a:
            self.acc_bank_asset, _ = ChartOfAccount.objects.get_or_create(
                company=self.company_a, account_code='1120',
                defaults={'account_name': 'Operating Bank', 'account_type': AccountType.ASSET, 'normal_balance': NormalBalance.DEBIT}
            )
            self.bank_account_a = BankAccount.objects.create(
                company=self.company_a, account_title="HBL Tax Clearing Account",
                account_type=BankAccountType.BANK, chart_of_account=self.acc_bank_asset,
                current_balance=Decimal('2000000.0000')
            )
        else:
            self.bank_account_a.current_balance = Decimal('2000000.0000')
            self.bank_account_a.save()

        # 8. Tax Authority & Tax Codes
        self.tax_auth_srb = TaxAuthority.objects.create(
            company=self.company_a, name="Sindh Revenue Board (SRB)",
            code="SRB", jurisdiction="Sindh"
        )
        self.tax_auth_fbr = TaxAuthority.objects.create(
            company=self.company_a, name="Federal Board of Revenue (FBR)",
            code="FBR", jurisdiction="Federal"
        )

        self.tax_code_sales = TaxCode.objects.create(
            company=self.company_a, code="SST-13", name="Sindh Sales Tax on Security Services (13%)",
            rate=Decimal('13.0000'), tax_category=TaxCategory.OUTPUT_TAX,
            tax_authority=self.tax_auth_srb, output_tax_account=self.acc_output_tax,
            effective_from=date(2026, 1, 1)
        )

        self.tax_code_input = TaxCode.objects.create(
            company=self.company_a, code="GST-18", name="General Sales Tax on Goods (18%)",
            rate=Decimal('18.0000'), tax_category=TaxCategory.INPUT_TAX,
            tax_authority=self.tax_auth_fbr, input_tax_account=self.acc_input_tax,
            recoverability=TaxRecoverability.RECOVERABLE,
            effective_from=date(2026, 1, 1)
        )

        self.tax_code_wht_rec = TaxCode.objects.create(
            company=self.company_a, code="WHT-CLIENT-4", name="Client Withholding Tax (4%)",
            rate=Decimal('4.0000'), tax_category=TaxCategory.WITHHOLDING_RECEIVABLE,
            is_withholding=True, withholding_receivable_account=self.acc_wht_rec,
            effective_from=date(2026, 1, 1)
        )

        self.tax_code_wht_pay = TaxCode.objects.create(
            company=self.company_a, code="WHT-VENDOR-5", name="Vendor Withholding Tax (5%)",
            rate=Decimal('5.0000'), tax_category=TaxCategory.WITHHOLDING_PAYABLE,
            is_withholding=True, withholding_payable_account=self.acc_wht_pay,
            effective_from=date(2026, 1, 1)
        )

        # 9. Company Tax Profile
        self.tax_profile_a = CompanyTaxProfile.objects.create(
            company=self.company_a, ntn_number="1234567-8", strn_number="9876543-2",
            default_sales_tax_code=self.tax_code_sales,
            default_purchase_tax_code=self.tax_code_input,
            default_client_wht_code=self.tax_code_wht_rec,
            default_vendor_wht_code=self.tax_code_wht_pay
        )

        # 10. Tax Period
        self.tax_period_a = TaxPeriod.objects.create(
            company=self.company_a, name="SRB July 2026",
            period_start=date(2026, 7, 1), period_end=date(2026, 7, 31),
            tax_authority=self.tax_auth_srb, tax_category=TaxCategory.OUTPUT_TAX
        )

        # 11. Counterparties
        self.client_a = CRMEntity.objects.create(
            company=self.company_a, name="Habib Metropolitan Bank", entity_type="CUSTOMER"
        )
        self.vendor_a = Vendor.objects.create(
            company=self.company_a, name="Apex Uniforms & Weapons Ltd"
        )

    def test_01_effective_dated_tax_rate_resolution(self):
        """Test rate resolution preserves historical stability."""
        old_date = date(2026, 3, 1)
        rate = TaxService.resolve_effective_tax_rate(self.tax_code_sales, old_date)
        self.assertEqual(rate, Decimal('13.0000'))

    def test_02_sync_client_invoice_output_tax_and_withholding(self):
        """Test client invoice creates separate Output Tax and Client Withholding transactions."""
        inv = ClientInvoice.objects.create(
            company=self.company_a, client=self.client_a,
            invoice_date=date(2026, 7, 15), due_date=date(2026, 8, 15),
            period_start=date(2026, 7, 1), period_end=date(2026, 7, 31),
            billing_month="2026-07",
            subtotal=Decimal('1000000.00'),
            tax_amount=Decimal('130000.00'),
            grand_total=Decimal('1130000.00'),
            status=ClientInvoiceStatus.ISSUED
        )

        out_tx, wht_tx = TaxService.sync_client_invoice_tax(
            inv,
            tax_code=self.tax_code_sales,
            withholding_tax_code=self.tax_code_wht_rec
        )

        self.assertIsNotNone(out_tx)
        self.assertEqual(out_tx.tax_category, TaxCategory.OUTPUT_TAX)
        self.assertEqual(out_tx.direction, TaxDirection.OUTPUT)
        self.assertEqual(out_tx.tax_amount, Decimal('130000.00'))
        self.assertEqual(out_tx.gl_account, self.acc_output_tax)

        self.assertIsNotNone(wht_tx)
        self.assertEqual(wht_tx.tax_category, TaxCategory.WITHHOLDING_RECEIVABLE)
        self.assertEqual(wht_tx.direction, TaxDirection.WITHHOLDING_IN)
        self.assertEqual(wht_tx.tax_amount, Decimal('40000.00')) # 4% of 1,000,000
        self.assertEqual(wht_tx.gl_account, self.acc_wht_rec)

    def test_03_client_withholding_certificate_verification(self):
        """Test recording and verifying a client withholding tax certificate."""
        inv = ClientInvoice.objects.create(
            company=self.company_a, client=self.client_a,
            invoice_date=date(2026, 7, 15), due_date=date(2026, 8, 15),
            period_start=date(2026, 7, 1), period_end=date(2026, 7, 31),
            billing_month="2026-07", subtotal=Decimal('500000.00'),
            tax_amount=Decimal('65000.00'), grand_total=Decimal('565000.00')
        )
        TaxService.sync_client_invoice_tax(inv, withholding_tax_code=self.tax_code_wht_rec)

        cert = TaxService.record_client_withholding_certificate(
            company=self.company_a,
            client=self.client_a,
            certificate_number="CERT-2026-001",
            certificate_date=date(2026, 7, 20),
            withheld_amount=Decimal('20000.00'),
            tax_code=self.tax_code_wht_rec,
            client_invoice=inv,
            cpr_challan_no="CPR-889900",
            user=self.user_a
        )
        self.assertEqual(cert.verification_status, WithholdingVerificationStatus.PENDING_VERIFICATION)

        verified = TaxService.verify_client_withholding_certificate(cert, user=self.user_a)
        self.assertEqual(verified.verification_status, WithholdingVerificationStatus.VERIFIED)

        tx = TaxTransaction.objects.get(
            company=self.company_a,
            source_type=TaxTransactionSourceType.CLIENT_RECEIPT,
            source_id=str(inv.id)
        )
        self.assertEqual(tx.status, TaxTransactionStatus.POSTED_SOURCE)

    def test_04_vendor_input_tax_recoverability_classification(self):
        """Test vendor bill input tax classification separates recoverable from expense."""
        bill = ProcurementDocument.objects.create(
            company=self.company_a, document_type='VENDOR_INVOICE',
            number="BILL-99001", document_date=date(2026, 7, 10),
            vendor=self.vendor_a, total_amount=Decimal('118000.00'),
            tax_amount=Decimal('18000.00'), status='POSTED'
        )

        input_tx = TaxService.sync_vendor_bill_tax(bill, tax_code=self.tax_code_input)
        self.assertIsNotNone(input_tx)
        self.assertEqual(input_tx.tax_category, TaxCategory.INPUT_TAX)
        self.assertEqual(input_tx.direction, TaxDirection.INPUT)
        self.assertTrue(input_tx.is_recoverable)
        self.assertEqual(input_tx.gl_account, self.acc_input_tax)
        self.assertEqual(input_tx.tax_amount, Decimal('18000.00'))

    def test_05_vendor_withholding_recording_and_liability(self):
        """Test recording vendor WHT generates Withholding Payable liability."""
        bill = ProcurementDocument.objects.create(
            company=self.company_a, document_type='VENDOR_INVOICE',
            number="BILL-500", document_date=date(2026, 7, 10),
            vendor=self.vendor_a, total_amount=Decimal('500000.00'),
            tax_amount=Decimal('0.00'), status='POSTED'
        )

        record, tx = TaxService.record_vendor_withholding(
            company=self.company_a,
            vendor=self.vendor_a,
            taxable_amount=Decimal('500000.00'),
            tax_rate=Decimal('5.0000'),
            withheld_amount=Decimal('25000.00'),
            tax_code=self.tax_code_wht_pay,
            vendor_bill=bill,
            cpr_number="CPR-VENDOR-500",
            notes="5% income tax deducted at vendor payment"
        )

        self.assertEqual(record.status, VendorWithholdingStatus.DEDUCTED)
        self.assertEqual(tx.tax_category, TaxCategory.WITHHOLDING_PAYABLE)
        self.assertEqual(tx.direction, TaxDirection.WITHHOLDING_OUT)
        self.assertEqual(tx.tax_amount, Decimal('25000.00'))
        self.assertEqual(tx.gl_account, self.acc_wht_pay)

    def test_06_payroll_tax_liability_sync(self):
        """Test consuming employee tax deduction from PayrollAccountingIntegration."""
        from hrm.models import PayrollPeriod, PayrollRun, PayrollRunStatus
        p_period = PayrollPeriod.objects.create(
            company=self.company_a, name="July 2026",
            start_date=date(2026, 7, 1), end_date=date(2026, 7, 31),
            payment_date=date(2026, 7, 31)
        )
        p_run = PayrollRun.objects.create(
            company=self.company_a, payroll_period=p_period, run_number="PR-202607-001",
            status=PayrollRunStatus.FINALIZED
        )

        pi = PayrollAccountingIntegration.objects.create(
            company=self.company_a,
            payroll_run=p_run,
            payroll_period_name="July 2026 Guards",
            transaction_date=date(2026, 7, 31),
            gross_payroll=Decimal('800000.00'),
            total_tax=Decimal('35000.00'),
            net_payroll_payable=Decimal('765000.00'),
            remaining_liability=Decimal('765000.00'),
            tax_payable_account=self.acc_output_tax,
            status=PayrollAccountingStatus.READY
        )

        tx = TaxService.sync_payroll_tax(pi)
        self.assertIsNotNone(tx)
        self.assertEqual(tx.tax_category, TaxCategory.PAYROLL_TAX)
        self.assertEqual(tx.tax_amount, Decimal('35000.00'))
        self.assertEqual(tx.direction, TaxDirection.OUTPUT)

    def test_07_expense_input_tax_sync(self):
        """Test syncing input tax from an Expense record."""
        exp_cat = ExpenseCategory.objects.create(company=self.company_a, name="Office Supplies")
        exp = Expense.objects.create(
            company=self.company_a,
            expense_number="EXP-001",
            category=exp_cat,
            amount=Decimal('10000.00'),
            tax_amount=Decimal('1500.00'),
            expense_date=date(2026, 7, 12),
            status='PAID'
        )

        tx = TaxService.sync_expense_tax(exp)
        self.assertIsNotNone(tx)
        self.assertEqual(tx.tax_category, TaxCategory.INPUT_TAX)
        self.assertEqual(tx.tax_amount, Decimal('1500.00'))

    def test_08_duplicate_sync_is_blocked_idempotently(self):
        """Test repeated synchronization does not duplicate tax transactions."""
        inv = ClientInvoice.objects.create(
            company=self.company_a, client=self.client_a,
            invoice_date=date(2026, 7, 15), due_date=date(2026, 8, 15),
            period_start=date(2026, 7, 1), period_end=date(2026, 7, 31),
            billing_month="2026-07", subtotal=Decimal('200000.00'),
            tax_amount=Decimal('26000.00'), grand_total=Decimal('226000.00')
        )

        TaxService.sync_client_invoice_tax(inv, tax_code=self.tax_code_sales)
        TaxService.sync_client_invoice_tax(inv, tax_code=self.tax_code_sales)
        TaxService.sync_client_invoice_tax(inv, tax_code=self.tax_code_sales)

        tx_count = TaxTransaction.objects.filter(
            company=self.company_a,
            source_type=TaxTransactionSourceType.CLIENT_INVOICE,
            source_id=str(inv.id)
        ).count()
        self.assertEqual(tx_count, 1)

    def test_09_tax_payment_voucher_creation_and_payment(self):
        """Test Tax Payment Voucher generates posted FinancialVoucher and impacts Treasury."""
        initial_balance = self.bank_account_a.current_balance

        voucher = TaxService.create_tax_payment_voucher(
            company=self.company_a,
            tax_authority=self.tax_auth_srb,
            treasury_account=self.bank_account_a,
            amount=Decimal('100000.00'),
            payment_date=date(2026, 7, 25),
            tax_type=TaxPaymentType.SALES_TAX,
            tax_period=self.tax_period_a,
            psid_number="PSID-998877",
            user=self.user_a
        )
        self.assertEqual(voucher.status, TaxVoucherStatus.DRAFT)

        TaxService.approve_tax_payment_voucher(voucher, user=self.user_a)
        self.assertEqual(voucher.status, TaxVoucherStatus.APPROVED)

        paid_voucher = TaxService.pay_tax_payment_voucher(voucher, cpr_number="CPR-SRB-100K", user=self.user_a)
        self.assertEqual(paid_voucher.status, TaxVoucherStatus.PAID)
        self.assertIsNotNone(paid_voucher.voucher)
        self.assertEqual(paid_voucher.voucher.status, VoucherStatus.POSTED)
        self.assertEqual(paid_voucher.voucher.amount, Decimal('100000.00'))

        # Check Treasury balance update
        self.bank_account_a.refresh_from_db()
        self.assertEqual(self.bank_account_a.current_balance, initial_balance - Decimal('100000.00'))

        # Check treasury transaction
        ttx = TreasuryTransaction.objects.filter(voucher=paid_voucher.voucher).first()
        self.assertIsNotNone(ttx)
        self.assertEqual(ttx.money_out, Decimal('100000.00'))

    def test_10_tax_payment_creates_only_one_treasury_voucher(self):
        """Test idempotency of tax payment voucher."""
        voucher = TaxService.create_tax_payment_voucher(
            company=self.company_a,
            tax_authority=self.tax_auth_srb,
            treasury_account=self.bank_account_a,
            amount=Decimal('50000.00'),
            payment_date=date(2026, 7, 25),
            user=self.user_a
        )
        TaxService.approve_tax_payment_voucher(voucher, user=self.user_a)
        TaxService.pay_tax_payment_voucher(voucher, user=self.user_a)

        # Duplicate payment call raises ValidationError
        with self.assertRaises(ValidationError):
            TaxService.pay_tax_payment_voucher(voucher, user=self.user_a)

        self.assertEqual(FinancialVoucher.objects.filter(reference=voucher.voucher_number).count(), 1)

    def test_11_audited_tax_adjustment(self):
        """Test audited tax adjustments create adjustments and tax transactions."""
        adj = TaxService.create_tax_adjustment(
            company=self.company_a,
            tax_code=self.tax_code_sales,
            adjustment_type=TaxAdjustmentType.INCREASE_LIABILITY,
            amount=Decimal('15000.00'),
            reason="Audit finding — Under-declared sales tax",
            tax_date=date(2026, 7, 28),
            user=self.user_a
        )
        self.assertEqual(adj.status, 'APPROVED')

        tx = TaxTransaction.objects.filter(
            company=self.company_a,
            source_type=TaxTransactionSourceType.ADJUSTMENT,
            source_id=str(adj.id)
        ).first()
        self.assertIsNotNone(tx)
        self.assertEqual(tx.tax_amount, Decimal('15000.00'))
        self.assertEqual(tx.direction, TaxDirection.OUTPUT)

    def test_12_closed_accounting_period_blocks_tax_payment(self):
        """Test closed accounting period blocks tax payment execution."""
        self.period_a.status = PeriodStatus.CLOSED
        self.period_a.save()

        voucher = TaxService.create_tax_payment_voucher(
            company=self.company_a,
            tax_authority=self.tax_auth_srb,
            treasury_account=self.bank_account_a,
            amount=Decimal('50000.00'),
            payment_date=self.period_a.start_date,
            user=self.user_a
        )

        with self.assertRaises(ValidationError) as ctx:
            TaxService.pay_tax_payment_voucher(voucher, user=self.user_a)
        self.assertIn("closed/locked", str(ctx.exception))

    def test_13_multi_tenant_isolation(self):
        """Test cross-company tax operations are strictly blocked."""
        with self.assertRaises(ValidationError):
            TaxService.create_tax_payment_voucher(
                company=self.company_a,
                tax_authority=self.tax_auth_srb,
                treasury_account=BankAccount.objects.create(
                    company=self.company_b, account_title="Beta Bank",
                    chart_of_account=ChartOfAccount.objects.filter(company=self.company_b).first()
                ),
                amount=Decimal('10000.00'),
                payment_date=date(2026, 7, 25),
                user=self.user_a
            )
