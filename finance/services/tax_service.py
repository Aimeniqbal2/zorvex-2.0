import logging
from decimal import Decimal
from typing import Optional, Dict, Any, List, Tuple
from datetime import date

from django.db import transaction
from django.db.models import Sum, Q
from django.utils import timezone
from django.core.exceptions import ValidationError

from finance.models import (
    TaxCode,
    TaxAuthority,
    CompanyTaxProfile,
    TaxPeriod,
    TaxPeriodStatus,
    TaxTransaction,
    TaxTransactionSourceType,
    TaxTransactionStatus,
    TaxDirection,
    TaxCategory,
    TaxRecoverability,
    ClientWithholdingCertificate,
    WithholdingVerificationStatus,
    VendorWithholdingRecord,
    VendorWithholdingStatus,
    TaxPaymentVoucher,
    TaxVoucherStatus,
    TaxPaymentType,
    TaxAdjustment,
    TaxAdjustmentType,
    FinancialVoucher,
    VoucherType,
    VoucherStatus,
    BankAccount,
    ChartOfAccount,
    SecurityFinanceConfiguration,
    TreasuryTransactionType,
)
from finance.services.period_service import can_post_transaction
from finance.services.treasury_service import TreasuryService

logger = logging.getLogger(__name__)


class TaxService:
    """
    Core Domain Service for Phase S-4H Tax Management:
    - Universal tax code and effective-dated rate resolution
    - Client Invoice tax & withholding tracking
    - Client withholding certificate verification
    - Vendor bill input tax & vendor withholding management
    - Payroll tax liability & expense tax synchronization
    - Tax payment voucher & treasury integration
    - Audited tax adjustments & operational tax summaries
    """

    @classmethod
    def resolve_effective_tax_rate(
        cls,
        tax_code: TaxCode,
        target_date: Optional[date] = None
    ) -> Decimal:
        """
        Resolves the applicable tax rate for a given tax code on target_date.
        Ensures historical rate stability.
        """
        if not target_date:
            target_date = timezone.now().date()

        if tax_code.effective_from and target_date < tax_code.effective_from:
            logger.warning(f"Target date {target_date} is prior to tax code {tax_code.code} effective_from {tax_code.effective_from}")

        if tax_code.effective_to and target_date > tax_code.effective_to:
            logger.warning(f"Target date {target_date} is after tax code {tax_code.code} effective_to {tax_code.effective_to}")

        return tax_code.rate or Decimal('0.0000')

    @classmethod
    @transaction.atomic
    def sync_client_invoice_tax(
        cls,
        client_invoice,
        tax_code: Optional[TaxCode] = None,
        withholding_tax_code: Optional[TaxCode] = None,
        withholding_rate: Optional[Decimal] = None
    ) -> Tuple[Optional[TaxTransaction], Optional[TaxTransaction]]:
        """
        Synchronizes Output Tax (Sales Tax) and expected Client Withholding Tax from a ClientInvoice.
        Idempotent: updates existing transaction snapshots or creates new ones.
        """
        company = client_invoice.company
        tax_date = client_invoice.invoice_date or timezone.now().date()

        # 1. Resolve Output Sales Tax Code
        if not tax_code:
            profile = CompanyTaxProfile.objects.filter(company=company, is_active=True).first()
            if profile and profile.default_sales_tax_code:
                tax_code = profile.default_sales_tax_code
            else:
                tax_code = TaxCode.objects.filter(
                    company=company,
                    tax_category=TaxCategory.OUTPUT_TAX,
                    is_active=True
                ).first()

        output_tx = None
        if tax_code and client_invoice.tax_amount and client_invoice.tax_amount > 0:
            rate = cls.resolve_effective_tax_rate(tax_code, tax_date)
            gl_acc = tax_code.output_tax_account
            if not gl_acc:
                sec_cfg = SecurityFinanceConfiguration.objects.filter(company=company, is_active=True).first()
                if sec_cfg:
                    gl_acc = sec_cfg.tax_payable_account

            output_tx, _ = TaxTransaction.objects.update_or_create(
                company=company,
                source_type=TaxTransactionSourceType.CLIENT_INVOICE,
                source_id=str(client_invoice.id),
                tax_code=tax_code,
                defaults={
                    'source_number': client_invoice.invoice_number,
                    'tax_category': TaxCategory.OUTPUT_TAX,
                    'tax_date': tax_date,
                    'counterparty_name': getattr(client_invoice.client, 'name', 'Client'),
                    'counterparty_tax_id': getattr(client_invoice.client, 'tax_number', '') or '',
                    'taxable_amount': client_invoice.subtotal or Decimal('0.0000'),
                    'tax_rate': rate,
                    'tax_amount': client_invoice.tax_amount,
                    'is_recoverable': False,
                    'direction': TaxDirection.OUTPUT,
                    'gl_account': gl_acc,
                    'status': TaxTransactionStatus.POSTED_SOURCE if client_invoice.status in ['ISSUED', 'SENT', 'PAID', 'PARTIALLY_PAID'] else TaxTransactionStatus.CALCULATED,
                    'notes': f"Output Sales Tax on Invoice #{client_invoice.invoice_number}",
                }
            )

        # 2. Handle Client Withholding (if configured or provided)
        wht_tx = None
        if withholding_tax_code or withholding_rate:
            if not withholding_tax_code:
                withholding_tax_code = TaxCode.objects.filter(
                    company=company,
                    tax_category=TaxCategory.WITHHOLDING_RECEIVABLE,
                    is_active=True
                ).first()

            if withholding_tax_code:
                wht_rate = withholding_rate if withholding_rate is not None else cls.resolve_effective_tax_rate(withholding_tax_code, tax_date)
                taxable = client_invoice.subtotal or Decimal('0.0000')
                wht_amount = (taxable * (wht_rate / Decimal('100'))).quantize(Decimal('0.01'))

                if wht_amount > 0:
                    wht_tx, _ = TaxTransaction.objects.update_or_create(
                        company=company,
                        source_type=TaxTransactionSourceType.CLIENT_RECEIPT,
                        source_id=str(client_invoice.id),
                        tax_code=withholding_tax_code,
                        defaults={
                            'source_number': f"WHT-{client_invoice.invoice_number}",
                            'tax_category': TaxCategory.WITHHOLDING_RECEIVABLE,
                            'tax_date': tax_date,
                            'counterparty_name': getattr(client_invoice.client, 'name', 'Client'),
                            'counterparty_tax_id': getattr(client_invoice.client, 'tax_number', '') or '',
                            'taxable_amount': taxable,
                            'tax_rate': wht_rate,
                            'tax_amount': wht_amount,
                            'is_recoverable': True,
                            'direction': TaxDirection.WITHHOLDING_IN,
                            'gl_account': withholding_tax_code.withholding_receivable_account,
                            'status': TaxTransactionStatus.CALCULATED,
                            'notes': f"Expected Client WHT Deduction on #{client_invoice.invoice_number}",
                        }
                    )

        return output_tx, wht_tx

    @classmethod
    @transaction.atomic
    def record_client_withholding_certificate(
        cls,
        company,
        client,
        certificate_number: str,
        certificate_date: date,
        withheld_amount: Decimal,
        tax_code: TaxCode,
        gross_taxable_amount: Decimal = Decimal('0.0000'),
        client_invoice=None,
        tax_period: Optional[TaxPeriod] = None,
        cpr_challan_no: str = "",
        attachment=None,
        notes: str = "",
        user=None
    ) -> ClientWithholdingCertificate:
        """
        Records client withholding tax deduction evidence (Tax Deducted at Source Certificate).
        """
        if tax_code.company_id != company.id:
            raise ValidationError("Tax code must belong to the same company.")
        if client and str(client.company_id) != str(company.id):
            raise ValidationError("Client must belong to the same company.")

        cert, created = ClientWithholdingCertificate.objects.get_or_create(
            company=company,
            client=client,
            certificate_number=certificate_number,
            defaults={
                'client_invoice': client_invoice,
                'tax_code': tax_code,
                'tax_period': tax_period,
                'withheld_amount': withheld_amount,
                'gross_taxable_amount': gross_taxable_amount,
                'certificate_date': certificate_date,
                'cpr_challan_no': cpr_challan_no,
                'verification_status': WithholdingVerificationStatus.PENDING_VERIFICATION,
                'attachment': attachment,
                'notes': notes,
            }
        )

        if not created:
            cert.client_invoice = client_invoice
            cert.tax_code = tax_code
            cert.tax_period = tax_period
            cert.withheld_amount = withheld_amount
            cert.gross_taxable_amount = gross_taxable_amount
            cert.certificate_date = certificate_date
            cert.cpr_challan_no = cpr_challan_no
            if attachment:
                cert.attachment = attachment
            cert.notes = notes
            cert.save()

        return cert

    @classmethod
    @transaction.atomic
    def verify_client_withholding_certificate(
        cls,
        certificate: ClientWithholdingCertificate,
        status: str = WithholdingVerificationStatus.VERIFIED,
        user=None
    ) -> ClientWithholdingCertificate:
        """
        Formally verifies client tax certificate.
        Transitions related TaxTransaction from CALCULATED to POSTED_SOURCE / PAID.
        """
        certificate.verification_status = status
        certificate.verified_by = user
        certificate.verified_at = timezone.now()
        certificate.save(update_fields=['verification_status', 'verified_by', 'verified_at'])

        # Update linked TaxTransaction if invoice exists
        if certificate.client_invoice:
            TaxTransaction.objects.filter(
                company=certificate.company,
                source_type=TaxTransactionSourceType.CLIENT_RECEIPT,
                source_id=str(certificate.client_invoice.id),
                tax_code=certificate.tax_code
            ).update(status=TaxTransactionStatus.POSTED_SOURCE if status == WithholdingVerificationStatus.VERIFIED else TaxTransactionStatus.CANCELLED)

        return certificate

    @classmethod
    @transaction.atomic
    def sync_vendor_bill_tax(
        cls,
        vendor_invoice,
        tax_code: Optional[TaxCode] = None
    ) -> Optional[TaxTransaction]:
        """
        Synchronizes Input Tax from a Vendor Invoice (Bill).
        Separates Recoverable vs Non-Recoverable Tax.
        """
        company = vendor_invoice.company
        tax_date = vendor_invoice.document_date or timezone.now().date()

        if not vendor_invoice.tax_amount or vendor_invoice.tax_amount <= 0:
            return None

        # Resolve Purchase Tax Code
        if not tax_code:
            profile = CompanyTaxProfile.objects.filter(company=company, is_active=True).first()
            if profile and profile.default_purchase_tax_code:
                tax_code = profile.default_purchase_tax_code
            else:
                tax_code = TaxCode.objects.filter(
                    company=company,
                    tax_category=TaxCategory.INPUT_TAX,
                    is_active=True
                ).first()

        if not tax_code:
            # Fallback dummy tax code if none provisioned
            tax_code, _ = TaxCode.objects.get_or_create(
                company=company,
                code='INPUT-DEFAULT',
                defaults={
                    'name': 'Input Tax / Recoverable VAT',
                    'tax_category': TaxCategory.INPUT_TAX,
                    'tax_type': 'PURCHASE',
                    'rate': Decimal('15.0000'),
                    'recoverability': TaxRecoverability.RECOVERABLE,
                }
            )

        rate = cls.resolve_effective_tax_rate(tax_code, tax_date)
        is_recoverable = (tax_code.recoverability == TaxRecoverability.RECOVERABLE)
        gl_acc = tax_code.input_tax_account

        tx, _ = TaxTransaction.objects.update_or_create(
            company=company,
            source_type=TaxTransactionSourceType.VENDOR_BILL,
            source_id=str(vendor_invoice.id),
            tax_code=tax_code,
            defaults={
                'source_number': vendor_invoice.number,
                'tax_category': TaxCategory.INPUT_TAX,
                'tax_date': tax_date,
                'counterparty_name': getattr(vendor_invoice.vendor, 'name', 'Vendor'),
                'counterparty_tax_id': getattr(vendor_invoice.vendor, 'ntn', '') or '',
                'taxable_amount': (vendor_invoice.total_amount - vendor_invoice.tax_amount) if vendor_invoice.total_amount else Decimal('0.0000'),
                'tax_rate': rate,
                'tax_amount': vendor_invoice.tax_amount,
                'is_recoverable': is_recoverable,
                'direction': TaxDirection.INPUT,
                'gl_account': gl_acc,
                'status': TaxTransactionStatus.POSTED_SOURCE if vendor_invoice.status in ['POSTED', 'MATCHED', 'CLOSED'] else TaxTransactionStatus.CALCULATED,
                'notes': f"Input Purchase Tax on Vendor Bill #{vendor_invoice.number} (Recoverable: {is_recoverable})",
            }
        )
        return tx

    @classmethod
    @transaction.atomic
    def record_vendor_withholding(
        cls,
        company,
        vendor,
        taxable_amount: Decimal,
        tax_rate: Decimal,
        withheld_amount: Decimal,
        tax_code: TaxCode,
        withheld_date: Optional[date] = None,
        vendor_bill=None,
        vendor_payment=None,
        tax_period: Optional[TaxPeriod] = None,
        cpr_number: str = "",
        challan_reference: str = "",
        notes: str = ""
    ) -> Tuple[VendorWithholdingRecord, TaxTransaction]:
        """
        Records vendor withholding tax deducted from a vendor payment, and generates
        a corresponding WITHHOLDING_PAYABLE TaxTransaction.
        """
        if tax_code.company_id != company.id:
            raise ValidationError("Tax code must belong to the same company.")
        if vendor and str(vendor.company_id) != str(company.id):
            raise ValidationError("Vendor must belong to the same company.")

        if not withheld_date:
            withheld_date = timezone.now().date()

        record = VendorWithholdingRecord.objects.create(
            company=company,
            vendor=vendor,
            vendor_bill=vendor_bill,
            vendor_payment=vendor_payment,
            tax_code=tax_code,
            tax_period=tax_period,
            taxable_amount=taxable_amount,
            tax_rate=tax_rate,
            withheld_amount=withheld_amount,
            withheld_date=withheld_date,
            status=VendorWithholdingStatus.DEDUCTED,
            cpr_number=cpr_number,
            challan_reference=challan_reference,
            notes=notes,
        )

        source_id = str(vendor_payment.id) if vendor_payment else str(record.id)
        source_num = getattr(vendor_payment, 'payment_number', f"V-WHT-{record.id}")

        tx, _ = TaxTransaction.objects.update_or_create(
            company=company,
            source_type=TaxTransactionSourceType.VENDOR_PAYMENT,
            source_id=source_id,
            tax_code=tax_code,
            defaults={
                'source_number': source_num,
                'tax_category': TaxCategory.WITHHOLDING_PAYABLE,
                'tax_date': withheld_date,
                'tax_period': tax_period,
                'counterparty_name': vendor.name,
                'counterparty_tax_id': getattr(vendor, 'ntn', '') or '',
                'taxable_amount': taxable_amount,
                'tax_rate': tax_rate,
                'tax_amount': withheld_amount,
                'is_recoverable': False,
                'direction': TaxDirection.WITHHOLDING_OUT,
                'gl_account': tax_code.withholding_payable_account,
                'status': TaxTransactionStatus.PAYABLE,
                'notes': f"WHT deducted from vendor {vendor.name} on payment {source_num}",
            }
        )

        return record, tx

    @classmethod
    @transaction.atomic
    def sync_payroll_tax(
        cls,
        payroll_integration,
        tax_code: Optional[TaxCode] = None
    ) -> Optional[TaxTransaction]:
        """
        Consumes employee income tax liability from a finalized PayrollAccountingIntegration record.
        """
        company = payroll_integration.company
        tax_date = payroll_integration.transaction_date or timezone.now().date()

        if not payroll_integration.total_tax or payroll_integration.total_tax <= 0:
            return None

        if not tax_code:
            tax_code = TaxCode.objects.filter(
                company=company,
                tax_category=TaxCategory.PAYROLL_TAX,
                is_active=True
            ).first()

        if not tax_code:
            tax_code, _ = TaxCode.objects.get_or_create(
                company=company,
                code='PAYROLL-TAX',
                defaults={
                    'name': 'Employee Payroll Income Tax (WHT)',
                    'tax_category': TaxCategory.PAYROLL_TAX,
                    'tax_type': 'WITHHOLDING',
                    'rate': Decimal('0.0000'),
                    'is_withholding': True,
                }
            )

        gl_acc = tax_code.output_tax_account or payroll_integration.tax_payable_account

        source_num = getattr(payroll_integration.payroll_run, 'run_number', str(payroll_integration.id)) if payroll_integration.payroll_run else str(payroll_integration.id)

        tx, _ = TaxTransaction.objects.update_or_create(
            company=company,
            source_type=TaxTransactionSourceType.PAYROLL,
            source_id=str(payroll_integration.id),
            tax_code=tax_code,
            defaults={
                'source_number': source_num,
                'tax_category': TaxCategory.PAYROLL_TAX,
                'tax_date': tax_date,
                'counterparty_name': 'Employees Payroll Deductions',
                'counterparty_tax_id': '',
                'taxable_amount': payroll_integration.gross_payroll or Decimal('0.0000'),
                'tax_rate': Decimal('0.0000'),
                'tax_amount': payroll_integration.total_tax,
                'is_recoverable': False,
                'direction': TaxDirection.OUTPUT,
                'gl_account': gl_acc,
                'status': TaxTransactionStatus.PAYABLE,
                'notes': f"Payroll Tax Deductions for Period {payroll_integration.payroll_period_name}",
            }
        )
        return tx

    @classmethod
    @transaction.atomic
    def sync_expense_tax(
        cls,
        expense,
        tax_code: Optional[TaxCode] = None
    ) -> Optional[TaxTransaction]:
        """
        Synchronizes Input Tax from an Expense record.
        """
        company = expense.company
        tax_date = expense.expense_date or timezone.now().date()

        if not expense.tax_amount or expense.tax_amount <= 0:
            return None

        if not tax_code:
            tax_code = TaxCode.objects.filter(
                company=company,
                tax_category=TaxCategory.INPUT_TAX,
                is_active=True
            ).first()

        if not tax_code:
            tax_code, _ = TaxCode.objects.get_or_create(
                company=company,
                code='EXP-TAX',
                defaults={
                    'name': 'Expense Input Tax',
                    'tax_category': TaxCategory.INPUT_TAX,
                    'tax_type': 'PURCHASE',
                    'rate': Decimal('15.0000'),
                }
            )

        rate = cls.resolve_effective_tax_rate(tax_code, tax_date)
        payee_name = getattr(expense, 'payee', '') or getattr(expense, 'payee_name', '') or 'Expense Payee'

        tx, _ = TaxTransaction.objects.update_or_create(
            company=company,
            source_type=TaxTransactionSourceType.EXPENSE,
            source_id=str(expense.id),
            tax_code=tax_code,
            defaults={
                'source_number': expense.expense_number,
                'tax_category': TaxCategory.INPUT_TAX,
                'tax_date': tax_date,
                'counterparty_name': payee_name,
                'counterparty_tax_id': '',
                'taxable_amount': expense.amount or Decimal('0.0000'),
                'tax_rate': rate,
                'tax_amount': expense.tax_amount,
                'is_recoverable': True,
                'direction': TaxDirection.INPUT,
                'gl_account': tax_code.input_tax_account,
                'status': TaxTransactionStatus.POSTED_SOURCE if expense.status in ['PAID', 'APPROVED'] else TaxTransactionStatus.CALCULATED,
                'notes': f"Input Tax on Expense #{expense.expense_number}",
            }
        )
        return tx

    @classmethod
    @transaction.atomic
    def sync_all_source_taxes(cls, company) -> Dict[str, int]:
        """
        Synchronizes all client invoices, vendor bills, payroll runs, and expenses for a company.
        """
        counts = {'client_invoices': 0, 'vendor_bills': 0, 'payroll_runs': 0, 'expenses': 0}

        # 1. Client Invoices
        from billing.models import ClientInvoice
        for inv in ClientInvoice.objects.filter(company=company, is_deleted=False):
            cls.sync_client_invoice_tax(inv)
            counts['client_invoices'] += 1

        # 2. Vendor Bills
        from purchasing.models import ProcurementDocument
        for bill in ProcurementDocument.objects.filter(company=company, document_type='VENDOR_INVOICE', is_deleted=False):
            cls.sync_vendor_bill_tax(bill)
            counts['vendor_bills'] += 1

        # 3. Payroll Integrations
        from finance.models import PayrollAccountingIntegration
        for pi in PayrollAccountingIntegration.objects.filter(company=company, is_deleted=False):
            cls.sync_payroll_tax(pi)
            counts['payroll_runs'] += 1

        # 4. Expenses
        from finance.models import Expense
        for exp in Expense.objects.filter(company=company, is_deleted=False):
            cls.sync_expense_tax(exp)
            counts['expenses'] += 1

        return counts

    @classmethod
    @transaction.atomic
    def create_tax_payment_voucher(
        cls,
        company,
        tax_authority: TaxAuthority,
        treasury_account: BankAccount,
        amount: Decimal,
        payment_date: date,
        tax_type: str = TaxPaymentType.SALES_TAX,
        tax_period: Optional[TaxPeriod] = None,
        psid_number: str = "",
        challan_number: str = "",
        cpr_number: str = "",
        notes: str = "",
        user=None
    ) -> TaxPaymentVoucher:
        """
        Creates a draft Tax Payment Voucher to deposit taxes to the Government Authority.
        """
        if tax_authority.company_id != company.id:
            raise ValidationError("Tax authority must belong to the same company.")
        if treasury_account.company_id != company.id:
            raise ValidationError("Treasury account must belong to the same company.")
        if amount <= Decimal('0.0000'):
            raise ValidationError("Tax payment amount must be strictly positive.")

        voucher = TaxPaymentVoucher.objects.create(
            company=company,
            tax_authority=tax_authority,
            treasury_account=treasury_account,
            amount=amount,
            payment_date=payment_date,
            tax_type=tax_type,
            tax_period=tax_period,
            psid_number=psid_number,
            challan_number=challan_number,
            cpr_number=cpr_number,
            status=TaxVoucherStatus.DRAFT,
            prepared_by=user,
            notes=notes,
        )
        return voucher

    @classmethod
    @transaction.atomic
    def approve_tax_payment_voucher(
        cls,
        voucher: TaxPaymentVoucher,
        user=None
    ) -> TaxPaymentVoucher:
        """
        Approves a draft tax payment voucher.
        """
        if voucher.status != TaxVoucherStatus.DRAFT:
            raise ValidationError(f"Can only approve DRAFT vouchers. Current status: {voucher.status}")

        voucher.status = TaxVoucherStatus.APPROVED
        voucher.approved_by = user
        voucher.save(update_fields=['status', 'approved_by'])
        return voucher

    @classmethod
    @transaction.atomic
    def pay_tax_payment_voucher(
        cls,
        voucher: TaxPaymentVoucher,
        cpr_number: str = "",
        user=None
    ) -> TaxPaymentVoucher:
        """
        Executes and records tax deposit:
        1. Checks accounting period locking.
        2. Generates posted S-4D FinancialVoucher (PAYMENT_VOUCHER).
        3. Records Treasury movement (MONEY_OUT) impacting Bank Account balance.
        4. Updates status to PAID.
        """
        if voucher.status in [TaxVoucherStatus.PAID, TaxVoucherStatus.FILED]:
            raise ValidationError("Tax voucher is already paid.")
        if voucher.status == TaxVoucherStatus.CANCELLED:
            raise ValidationError("Cannot pay a cancelled tax voucher.")

        company = voucher.company

        # 1. Accounting Period Lock Check
        can_post, period_msg, _ = can_post_transaction(company, voucher.payment_date)
        if not can_post:
            raise ValidationError(f"Cannot execute tax payment in closed/locked fiscal period: {period_msg}")

        # 2. Generate S-4D FinancialVoucher (Idempotent: only creates 1 voucher)
        if not voucher.voucher:
            fin_voucher = FinancialVoucher.objects.create(
                company=company,
                voucher_type=VoucherType.PAYMENT_VOUCHER,
                date=voucher.payment_date,
                amount=voucher.amount,
                total_amount=voucher.amount,
                bank_account=voucher.treasury_account,
                status=VoucherStatus.POSTED,
                payee_name=voucher.tax_authority.name,
                description=f"Tax Payment {voucher.get_tax_type_display()} to {voucher.tax_authority.name} (Challan #{voucher.challan_number or voucher.psid_number})",
                reference=voucher.voucher_number,
                created_by=user,
                approved_by=user,
                posted_by=user,
                posted_at=timezone.now(),
            )
            voucher.voucher = fin_voucher

            # 3. Treasury Movement Impact
            TreasuryService.record_treasury_movement(
                bank_account=voucher.treasury_account,
                voucher=fin_voucher,
                transaction_type=TreasuryTransactionType.MONEY_OUT,
                money_in=Decimal('0.0000'),
                money_out=voucher.amount,
                transaction_date=voucher.payment_date,
                reference=voucher.voucher_number,
                description=f"Tax Payment Challan #{voucher.challan_number or voucher.voucher_number} - {voucher.tax_authority.name}",
                user=user
            )

        if cpr_number:
            voucher.cpr_number = cpr_number

        voucher.status = TaxVoucherStatus.PAID
        voucher.paid_at = timezone.now()
        voucher.save()

        # Update linked period or vendor withholdings if applicable
        if voucher.tax_period:
            TaxTransaction.objects.filter(
                company=company,
                tax_period=voucher.tax_period,
                direction=TaxDirection.OUTPUT
            ).update(status=TaxTransactionStatus.PAID)

        return voucher

    @classmethod
    @transaction.atomic
    def mark_tax_voucher_filed(
        cls,
        voucher: TaxPaymentVoucher,
        cpr_number: str = "",
        user=None
    ) -> TaxPaymentVoucher:
        """
        Marks tax payment voucher as filed with government tax portal.
        """
        if voucher.status not in [TaxVoucherStatus.PAID, TaxVoucherStatus.APPROVED]:
            raise ValidationError("Voucher must be PAID or APPROVED before filing.")

        if cpr_number:
            voucher.cpr_number = cpr_number
        voucher.status = TaxVoucherStatus.FILED
        voucher.filed_at = timezone.now()
        voucher.save()
        return voucher

    @classmethod
    @transaction.atomic
    def create_tax_adjustment(
        cls,
        company,
        tax_code: TaxCode,
        adjustment_type: str,
        amount: Decimal,
        reason: str,
        tax_date: Optional[date] = None,
        tax_period: Optional[TaxPeriod] = None,
        user=None
    ) -> TaxAdjustment:
        """
        Creates an audited tax adjustment record without silently mutating historical documents.
        """
        if tax_code.company_id != company.id:
            raise ValidationError("Tax code must belong to the same company.")
        if amount <= Decimal('0.0000'):
            raise ValidationError("Adjustment amount must be positive.")

        if not tax_date:
            tax_date = timezone.now().date()

        # Check Accounting Period
        can_post, period_msg, _ = can_post_transaction(company, tax_date)
        if not can_post:
            raise ValidationError(f"Cannot adjust tax in closed/locked period: {period_msg}")

        adj = TaxAdjustment.objects.create(
            company=company,
            tax_code=tax_code,
            tax_period=tax_period,
            adjustment_type=adjustment_type,
            amount=amount,
            tax_date=tax_date,
            reason=reason,
            created_by=user,
            status='APPROVED',
            approved_by=user,
        )

        # Record corresponding TaxTransaction
        direction = TaxDirection.OUTPUT if 'LIABILITY' in adjustment_type else TaxDirection.INPUT
        TaxTransaction.objects.create(
            company=company,
            tax_code=tax_code,
            tax_category=tax_code.tax_category,
            source_type=TaxTransactionSourceType.ADJUSTMENT,
            source_id=str(adj.id),
            source_number=adj.adjustment_number,
            tax_date=tax_date,
            tax_period=tax_period,
            counterparty_name="Tax Adjustment",
            taxable_amount=amount,
            tax_rate=Decimal('0.0000'),
            tax_amount=amount,
            is_recoverable=(direction == TaxDirection.INPUT),
            direction=direction,
            gl_account=tax_code.output_tax_account if direction == TaxDirection.OUTPUT else tax_code.input_tax_account,
            status=TaxTransactionStatus.POSTED_SOURCE,
            notes=f"Tax Adjustment: {reason}",
        )

        return adj

    @classmethod
    def get_tax_summary_metrics(cls, company) -> Dict[str, Any]:
        """
        Calculates operational tax positions across Output, Input, Withholding, and Payroll.
        """
        txs = TaxTransaction.objects.filter(company=company, is_deleted=False).exclude(status=TaxTransactionStatus.CANCELLED)

        # Output Tax (Sales Tax on Revenue)
        output_tax = txs.filter(
            tax_category=TaxCategory.OUTPUT_TAX,
            direction=TaxDirection.OUTPUT
        ).aggregate(tot=Sum('tax_amount'))['tot'] or Decimal('0.0000')

        # Input Tax (Recoverable Purchase Tax)
        input_recoverable_tax = txs.filter(
            tax_category=TaxCategory.INPUT_TAX,
            direction=TaxDirection.INPUT,
            is_recoverable=True
        ).aggregate(tot=Sum('tax_amount'))['tot'] or Decimal('0.0000')

        # Net Sales Tax Position (Output - Input Recoverable)
        net_tax_position = output_tax - input_recoverable_tax
        net_tax_payable = max(Decimal('0.0000'), net_tax_position)
        net_tax_credit = max(Decimal('0.0000'), -net_tax_position)

        # Withholding Payable (Deducted from vendors)
        wht_payable = txs.filter(
            tax_category=TaxCategory.WITHHOLDING_PAYABLE,
            direction=TaxDirection.WITHHOLDING_OUT
        ).aggregate(tot=Sum('tax_amount'))['tot'] or Decimal('0.0000')

        # Withholding Receivable (Deducted by clients)
        wht_receivable = txs.filter(
            tax_category=TaxCategory.WITHHOLDING_RECEIVABLE,
            direction=TaxDirection.WITHHOLDING_IN
        ).aggregate(tot=Sum('tax_amount'))['tot'] or Decimal('0.0000')

        # Payroll Tax Liability (Deducted from staff)
        payroll_tax = txs.filter(
            tax_category=TaxCategory.PAYROLL_TAX,
            direction=TaxDirection.OUTPUT
        ).aggregate(tot=Sum('tax_amount'))['tot'] or Decimal('0.0000')

        # Total Tax Paid to Treasury
        total_paid = TaxPaymentVoucher.objects.filter(
            company=company,
            is_deleted=False,
            status__in=[TaxVoucherStatus.PAID, TaxVoucherStatus.FILED]
        ).aggregate(tot=Sum('amount'))['tot'] or Decimal('0.0000')

        # Total Outstanding Tax Due
        total_gross_due = net_tax_payable + wht_payable + payroll_tax
        total_outstanding = max(Decimal('0.0000'), total_gross_due - total_paid)

        return {
            'total_output_tax': float(output_tax),
            'total_input_recoverable_tax': float(input_recoverable_tax),
            'net_tax_payable': float(net_tax_payable),
            'net_tax_credit': float(net_credit := net_tax_credit),
            'total_withholding_payable': float(wht_payable),
            'total_withholding_receivable': float(wht_receivable),
            'total_payroll_tax': float(payroll_tax),
            'total_tax_paid': float(total_paid),
            'total_tax_outstanding': float(total_outstanding),
            'active_tax_codes_count': TaxCode.objects.filter(company=company, is_active=True, is_deleted=False).count(),
            'open_periods_count': TaxPeriod.objects.filter(company=company, status=TaxPeriodStatus.OPEN, is_deleted=False).count(),
        }
