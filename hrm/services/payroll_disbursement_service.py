from django.db import transaction
from django.core.exceptions import ValidationError
from hrm.models import PayrollDisbursement, PayrollDisbursementStatus, PayslipDisbursement, Payslip
from finance.models import FinancialVoucher, VoucherType, VoucherStatus, FinancialVoucherLine

@transaction.atomic
def execute_payroll_disbursement(disbursement: PayrollDisbursement, user):
    if disbursement.status == PayrollDisbursementStatus.COMPLETED:
        raise ValidationError("Disbursement is already completed.")
        
    payroll_run = disbursement.payroll_run
    if payroll_run.status != 'FINALIZED':
        raise ValidationError("Payroll run must be FINALIZED before disbursement.")
        
    # Get all payslips that are unpaid for this run
    # (Assuming we only disburse unpaid payslips)
    payslips = payroll_run.payslips.exclude(
        disbursement_records__status=PayrollDisbursementStatus.COMPLETED
    )
    
    if not payslips.exists():
        raise ValidationError("No unpaid payslips found for this payroll run.")
        
    total_amount = sum(payslip.net_amount for payslip in payslips)
    
    # Check if a config exists to find the Payroll Payable account
    config = disbursement.company.payroll_accounting_configs.first()
    if not config:
        raise ValidationError("Payroll accounting configuration not found.")
        
    # Create Payment Voucher
    voucher = FinancialVoucher.objects.create(
        company=disbursement.company,
        voucher_type=VoucherType.PAYMENT,
        date=disbursement.disbursement_date,
        payment_account=disbursement.payment_account,
        description=f"Payroll Disbursement for {payroll_run.run_number}",
        total_amount=total_amount,
    )
    
    # Create Voucher Line for the payable account
    FinancialVoucherLine.objects.create(
        company=disbursement.company,
        voucher=voucher,
        account=config.salary_payable_account,
        amount=total_amount,
        description=f"Clearing payable for {payroll_run.run_number}"
    )
    
    # We leave the voucher in DRAFT status so it can be approved and posted separately, 
    # OR we can post it immediately. Let's leave it as Draft so the finance team can review/approve.
    
    disbursement.payment_voucher = voucher
    disbursement.total_amount = total_amount
    disbursement.status = PayrollDisbursementStatus.COMPLETED
    disbursement.save()
    
    # Create payslip disbursement records
    for payslip in payslips:
        PayslipDisbursement.objects.create(
            company=disbursement.company,
            disbursement=disbursement,
            payslip=payslip,
            amount=payslip.net_amount,
            status=PayrollDisbursementStatus.COMPLETED
        )
    
    return disbursement
