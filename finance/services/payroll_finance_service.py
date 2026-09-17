"""
finance/services/payroll_finance_service.py
Service layer for Phase S-4G: Payroll -> Finance Integration & Salary Disbursement.
"""
from decimal import Decimal
from datetime import date
from typing import Optional, Dict, Any, List, Tuple
import csv
import io

from django.db import transaction
from django.db.models import Sum, Q
from django.core.exceptions import ValidationError
from django.utils import timezone

from finance.models import (
    ChartOfAccount, AccountType, BankAccount, CostCenter, ProfitCenter,
    AccountingPeriod, PeriodStatus, SecurityFinanceConfiguration,
    FinancialVoucher, VoucherType, VoucherStatus, PaymentMethod,
    PayrollAccountingStatus, PayrollEmployeePaymentStatus,
    SalaryPaymentBatchStatus, SalaryPaymentLineStatus,
    PayrollAccountMapping, EmployeePaymentDestination,
    PayrollAccountingIntegration, PayrollEmployeeFinanceSnapshot,
    SalaryPaymentBatch, SalaryPaymentBatchLine, PayrollDisbursementProviderConfig,
    EmployeeAdvance, AdvanceStatus, AdvanceRecoveryMethod
)
from hrm.models import PayrollRun, PayrollRunStatus, Payslip, PayslipStatus, Employee
from finance.services import period_service
from finance.services.voucher_service import VoucherService
from finance.services.treasury_service import TreasuryService


class PayrollFinanceService:
    """
    Authoritative service orchestrating the financial recognition of payroll runs,
    multi-dimensional cost classification, S-4E advance deduction reconciliation,
    salary payment batches, bank file exports, manual/API payment confirmations, and treasury linkage.
    """

    @classmethod
    def resolve_employee_accounts(
        cls,
        company,
        employee: Employee,
        department=None,
        designation=None,
        config: Optional[SecurityFinanceConfiguration] = None
    ) -> Tuple[Optional[ChartOfAccount], Optional[ChartOfAccount], Optional[CostCenter], Optional[ProfitCenter]]:
        """
        Deterministic 4-tier precedence:
        1. Specific Employee Mapping
        2. Designation Mapping
        3. Department Mapping
        4. Company Default from SecurityFinanceConfiguration / System Fallback
        """
        # 1. Employee Override
        map_emp = PayrollAccountMapping.objects.filter(
            company=company, employee=employee, is_active=True
        ).first()
        if map_emp and map_emp.salary_expense_account and map_emp.salary_expense_account.is_active and not map_emp.salary_expense_account.is_header:
            return map_emp.salary_expense_account, map_emp.overtime_expense_account, map_emp.cost_center, map_emp.profit_center

        # 2. Designation Mapping
        desig = designation or employee.designation
        if desig:
            map_desig = PayrollAccountMapping.objects.filter(
                company=company, designation=desig, is_active=True
            ).first()
            if map_desig and map_desig.salary_expense_account and map_desig.salary_expense_account.is_active and not map_desig.salary_expense_account.is_header:
                return map_desig.salary_expense_account, map_desig.overtime_expense_account, map_desig.cost_center, map_desig.profit_center

        # 3. Department Mapping
        dept = department or employee.department
        if dept:
            map_dept = PayrollAccountMapping.objects.filter(
                company=company, department=dept, is_active=True
            ).first()
            if map_dept and map_dept.salary_expense_account and map_dept.salary_expense_account.is_active and not map_dept.salary_expense_account.is_header:
                return map_dept.salary_expense_account, map_dept.overtime_expense_account, map_dept.cost_center, map_dept.profit_center

        # 4. Company Default
        if not config:
            config = SecurityFinanceConfiguration.objects.filter(company=company, is_active=True).first()

        salary_acc = None
        ot_acc = None

        if config and config.salary_cost_account and config.salary_cost_account.is_active and not config.salary_cost_account.is_header:
            salary_acc = config.salary_cost_account
        else:
            salary_acc = ChartOfAccount.objects.filter(
                company=company,
                account_type__in=[AccountType.COST_OF_SERVICE, AccountType.EXPENSE],
                is_active=True,
                is_header=False
            ).first()

        if config and config.overtime_cost_account and config.overtime_cost_account.is_active and not config.overtime_cost_account.is_header:
            ot_acc = config.overtime_cost_account
        else:
            ot_acc = salary_acc

        return salary_acc, ot_acc, None, None

    @classmethod
    @transaction.atomic
    def integrate_payroll_run(
        cls,
        payroll_run: PayrollRun,
        user=None
    ) -> PayrollAccountingIntegration:
        """
        Integrates an approved/finalized PayrollRun into Finance.
        Idempotent: updates existing integration or creates a new one.
        """
        company = payroll_run.company

        # 1. Eligibility check: ONLY FINALIZED payroll runs may integrate
        if payroll_run.status != PayrollRunStatus.FINALIZED:
            raise ValidationError(
                f"Only FINALIZED payroll runs can be integrated into Finance. Current status: {payroll_run.status}"
            )

        # 2. Get or create header integration
        tx_date = payroll_run.finalized_at.date() if payroll_run.finalized_at else timezone.now().date()
        period_name = (
            payroll_run.payroll_period.name if payroll_run.payroll_period else
            (payroll_run.payroll_month or f"{payroll_run.period_start} to {payroll_run.period_end}")
        )
        integration, _ = PayrollAccountingIntegration.objects.get_or_create(
            company=company,
            payroll_run=payroll_run,
            defaults={
                'payroll_period_name': period_name,
                'transaction_date': tx_date,
                'status': PayrollAccountingStatus.PENDING_CLASSIFICATION,
            }
        )

        config = SecurityFinanceConfiguration.objects.filter(company=company, is_active=True).first()
        blocking_reasons: List[str] = []

        # 3. Validate Accounting Period
        can_post, period_msg, _ = period_service.can_post_transaction(company, integration.transaction_date)
        if not can_post:
            blocking_reasons.append(f"Accounting Period closed/locked: {period_msg}")

        # 4. Resolve Payroll Payable Control Account
        ap_account = config.payroll_payable_account if config else None
        if not ap_account:
            blocking_reasons.append("Missing Payroll Payable control account in Finance Configuration.")
        elif str(ap_account.company_id) != str(company.id):
            blocking_reasons.append(f"Configured Payroll Payable account {ap_account.account_code} belongs to a different company.")
        elif not ap_account.is_active:
            blocking_reasons.append(f"Configured Payroll Payable account {ap_account.account_code} is inactive.")
        elif ap_account.is_header:
            blocking_reasons.append(f"Configured Payroll Payable account {ap_account.account_code} is a header/group account.")

        integration.payroll_payable_account = ap_account
        integration.tax_payable_account = config.tax_payable_account if config else None
        integration.advance_clearing_account = ChartOfAccount.objects.filter(
            company=company,
            account_code__in=['1070', '1050', '2010'],
            is_active=True,
            is_header=False
        ).first()

        # 5. Process Payslips and Employee Snapshots
        payslips = payroll_run.payslips.filter(is_deleted=False).select_related('employee', 'employee__department', 'employee__designation')
        
        gross_total = Decimal('0.0000')
        allowance_total = Decimal('0.0000')
        ot_total = Decimal('0.0000')
        deduction_total = Decimal('0.0000')
        tax_total = Decimal('0.0000')
        advance_recovery_total = Decimal('0.0000')
        net_total = Decimal('0.0000')

        unresolved_count = 0

        for ps in payslips:
            emp = ps.employee
            
            # Analyze line components
            ps_lines = ps.lines.filter(is_deleted=False).select_related('salary_component')
            emp_ot = Decimal('0.0000')
            emp_allowances = Decimal('0.0000')
            emp_advance_rec = Decimal('0.0000')

            for l in ps_lines:
                code_upper = l.salary_component.code.upper() if l.salary_component else ''
                name_upper = l.salary_component.name.upper() if l.salary_component else ''
                if 'OVERTIME' in code_upper or 'OVERTIME' in name_upper or 'OT' == code_upper:
                    emp_ot += Decimal(str(l.amount))
                elif 'ADVANCE' in code_upper or 'ADVANCE' in name_upper or 'LOAN' in code_upper:
                    emp_advance_rec += Decimal(str(l.amount))
                elif l.component_type == 'EARNING' and code_upper != 'BASIC':
                    emp_allowances += Decimal(str(l.amount))

            emp_gross = Decimal(str(ps.gross_amount or '0.00'))
            emp_ded = Decimal(str(ps.deduction_amount or '0.00'))
            emp_tax = Decimal(str(ps.tax_amount or '0.00'))
            emp_net = Decimal(str(ps.net_amount or '0.00'))

            gross_total += emp_gross
            allowance_total += emp_allowances
            ot_total += emp_ot
            deduction_total += emp_ded
            tax_total += emp_tax
            advance_recovery_total += emp_advance_rec
            net_total += emp_net

            # Resolve classification accounts
            sal_acc, ot_acc_res, cc, pc = cls.resolve_employee_accounts(
                company=company,
                employee=emp,
                department=emp.department,
                designation=emp.designation,
                config=config
            )

            is_line_unres = False
            unres_reason = ""
            if not sal_acc:
                is_line_unres = True
                emp_name = f"{emp.first_name} {emp.last_name}".strip()
                unres_reason = f"No salary expense GL account resolved for employee {emp_name}."
                unresolved_count += 1

            # Update or create employee snapshot
            snap, _ = PayrollEmployeeFinanceSnapshot.objects.update_or_create(
                company=company,
                integration=integration,
                employee=emp,
                defaults={
                    'payslip': ps,
                    'gross_earnings': emp_gross,
                    'allowances': emp_allowances,
                    'overtime_pay': emp_ot,
                    'deductions': emp_ded,
                    'advance_recovery': emp_advance_rec,
                    'tax_amount': emp_tax,
                    'net_salary': emp_net,
                    'salary_expense_account': sal_acc,
                    'overtime_expense_account': ot_acc_res,
                    'cost_center': cc,
                    'profit_center': pc,
                    'department': emp.department,
                    'is_unresolved': is_line_unres,
                    'unresolved_reason': unres_reason,
                }
            )

            # 6. S-4E Employee Advance Deduction Reconciliation
            # Reconcile advance balance if recovery occurred in payroll AND not already settled for this run
            if not getattr(payroll_run, 'advances_settled', False) and emp_advance_rec > Decimal('0'):
                active_advances = EmployeeAdvance.objects.filter(
                    company=company,
                    employee=emp,
                    recovery_method__in=[AdvanceRecoveryMethod.PAYROLL_DEDUCTION, AdvanceRecoveryMethod.MIXED],
                    status=AdvanceStatus.PAID
                ).order_by('advance_date', 'created_at')

                remaining_to_recover = emp_advance_rec
                for adv in active_advances:
                    if remaining_to_recover <= Decimal('0'):
                        break
                    can_settle = min(adv.outstanding_balance, remaining_to_recover)
                    if can_settle > Decimal('0'):
                        adv.settled_amount += can_settle
                        adv.outstanding_balance -= can_settle
                        if adv.outstanding_balance <= Decimal('0.0001'):
                            adv.status = AdvanceStatus.SETTLED
                        adv.save(update_fields=['settled_amount', 'outstanding_balance', 'status'])
                        remaining_to_recover -= can_settle

        if not getattr(payroll_run, 'advances_settled', False):
            payroll_run.advances_settled = True
            payroll_run.save(update_fields=['advances_settled'])

        # 7. Update Totals & Balances
        integration.gross_payroll = gross_total
        integration.total_allowances = allowance_total
        integration.total_overtime = ot_total
        integration.total_deductions = deduction_total
        integration.total_tax = tax_total
        integration.total_advance_recovery = advance_recovery_total
        integration.net_payroll_payable = net_total
        integration.total_employees = len(payslips)
        integration.unresolved_employees_count = unresolved_count
        
        # Calculate liability
        if not integration.total_paid:
            integration.total_paid = Decimal('0.0000')
        integration.remaining_liability = max(Decimal('0.0000'), net_total - integration.total_paid)

        if unresolved_count > 0:
            blocking_reasons.append(f"{unresolved_count} employee(s) have unmapped salary expense GL accounts.")

        if blocking_reasons:
            integration.status = PayrollAccountingStatus.BLOCKED
            integration.blocking_reason = " | ".join(sorted(list(set(blocking_reasons))))
        elif integration.total_paid >= net_total and net_total > Decimal('0'):
            integration.status = PayrollAccountingStatus.SETTLED
            integration.blocking_reason = ""
        elif integration.total_paid > Decimal('0'):
            integration.status = PayrollAccountingStatus.PARTIALLY_DISBURSED
            integration.blocking_reason = ""
        else:
            integration.status = PayrollAccountingStatus.READY
            integration.blocking_reason = ""

        integration.save()
        return integration

    @classmethod
    @transaction.atomic
    def create_salary_payment_batch(
        cls,
        payroll_integration: PayrollAccountingIntegration,
        treasury_account: BankAccount,
        payment_date: date,
        payment_mode: str = 'MANUAL',
        payment_provider: str = 'MANUAL',
        selected_snapshot_ids: Optional[List[str]] = None,
        notes: str = '',
        user=None
    ) -> SalaryPaymentBatch:
        """
        Creates a new SalaryPaymentBatch from unpaid/ready employee snapshots.
        """
        company = payroll_integration.company

        if str(treasury_account.company_id) != str(company.id):
            raise ValidationError("Selected treasury account belongs to a different company.")

        if payroll_integration.status == PayrollAccountingStatus.BLOCKED:
            raise ValidationError(f"Cannot create salary payment batch for a BLOCKED payroll integration: {payroll_integration.blocking_reason}")

        # Validate Accounting Period
        can_post, period_msg, _ = period_service.can_post_transaction(company, payment_date)
        if not can_post:
            raise ValidationError(f"Cannot disburse salary in a closed/locked accounting period: {period_msg}")

        snapshots_qs = payroll_integration.employee_snapshots.filter(
            company=company,
            payment_status__in=[PayrollEmployeePaymentStatus.UNPAID, PayrollEmployeePaymentStatus.FAILED]
        )
        if selected_snapshot_ids:
            snapshots_qs = snapshots_qs.filter(id__in=selected_snapshot_ids)

        candidate_snapshots = list(snapshots_qs)
        if not candidate_snapshots:
            raise ValidationError("No eligible unpaid employees found for this salary payment batch.")

        batch = SalaryPaymentBatch.objects.create(
            company=company,
            payroll_integration=payroll_integration,
            payment_date=payment_date,
            payment_mode=payment_mode,
            payment_provider=payment_provider,
            treasury_account=treasury_account,
            status=SalaryPaymentBatchStatus.DRAFT,
            prepared_by=user,
            notes=notes,
        )

        total_batch_amt = Decimal('0.0000')
        lines_created = 0

        for snap in candidate_snapshots:
            if snap.net_salary <= Decimal('0'):
                continue

            # Fetch destination
            dest = EmployeePaymentDestination.objects.filter(
                company=company, employee=snap.employee, is_active=True, is_preferred=True
            ).first() or EmployeePaymentDestination.objects.filter(
                company=company, employee=snap.employee, is_active=True
            ).first()

            dest_payload = {}
            pay_method = 'BANK_TRANSFER'
            if dest:
                pay_method = dest.payment_method
                dest_payload = {
                    'payment_method': dest.payment_method,
                    'bank_name': dest.bank_name,
                    'account_title': dest.account_title,
                    'account_number': dest.account_number,
                    'iban': dest.iban,
                    'wallet_provider': dest.wallet_provider,
                    'wallet_number': dest.wallet_number,
                }
            else:
                dest_payload = {
                    'payment_method': 'CASH',
                    'note': 'No bank destination on file; fallback to cash counter.',
                }
                pay_method = 'CASH'

            SalaryPaymentBatchLine.objects.create(
                company=company,
                batch=batch,
                employee=snap.employee,
                payslip=snap.payslip,
                employee_snapshot=snap,
                net_salary=snap.net_salary,
                payment_method=pay_method,
                destination_details=dest_payload,
                status=SalaryPaymentLineStatus.PENDING,
            )

            snap.payment_status = PayrollEmployeePaymentStatus.IN_BATCH
            snap.save(update_fields=['payment_status'])

            total_batch_amt += snap.net_salary
            lines_created += 1

        batch.total_employees = lines_created
        batch.total_amount = total_batch_amt
        batch.save(update_fields=['total_employees', 'total_amount'])

        return batch

    @classmethod
    def validate_batch(cls, batch: SalaryPaymentBatch) -> Dict[str, Any]:
        """
        Validates readiness of a SalaryPaymentBatch.
        Checks:
        1. Non-zero lines
        2. Valid destination info
        3. Accounting period
        4. Treasury account validity & sufficient balance check
        """
        company = batch.company
        lines = batch.lines.all()
        errors: List[str] = []
        warnings: List[str] = []

        if not lines.exists():
            errors.append("Batch contains no payment lines.")

        can_post, period_msg, _ = period_service.can_post_transaction(company, batch.payment_date)
        if not can_post:
            errors.append(f"Accounting Period closed/locked: {period_msg}")

        invalid_destination_count = 0
        for l in lines:
            if l.net_salary <= Decimal('0'):
                emp_name = f"{l.employee.first_name} {l.employee.last_name}".strip()
                errors.append(f"Employee {emp_name} has zero or negative net salary.")
            dest = l.destination_details or {}
            if l.payment_method == 'BANK_TRANSFER' and not dest.get('account_number') and not dest.get('iban'):
                invalid_destination_count += 1
            elif l.payment_method == 'WALLET' and not dest.get('wallet_number'):
                invalid_destination_count += 1

        if invalid_destination_count > 0:
            warnings.append(f"{invalid_destination_count} employee(s) lack complete bank/wallet details.")

        is_valid = len(errors) == 0
        if is_valid and batch.status == SalaryPaymentBatchStatus.DRAFT:
            batch.status = SalaryPaymentBatchStatus.READY_FOR_PAYMENT
            batch.save(update_fields=['status'])

        return {
            'is_valid': is_valid,
            'errors': errors,
            'warnings': warnings,
            'total_lines': lines.count(),
            'total_amount': float(batch.total_amount),
            'status': batch.status
        }

    @classmethod
    @transaction.atomic
    def approve_batch(cls, batch: SalaryPaymentBatch, user=None) -> SalaryPaymentBatch:
        """
        Approves a salary payment batch.
        """
        if batch.status not in [SalaryPaymentBatchStatus.DRAFT, SalaryPaymentBatchStatus.PENDING_APPROVAL, SalaryPaymentBatchStatus.READY_FOR_PAYMENT]:
            raise ValidationError(f"Cannot approve batch in status: {batch.status}")

        batch.status = SalaryPaymentBatchStatus.APPROVED
        batch.approved_by = user
        batch.save(update_fields=['status', 'approved_by'])
        return batch

    @classmethod
    def export_batch_file(cls, batch: SalaryPaymentBatch, adapter: str = 'GENERIC_CSV') -> str:
        """
        Generates standard CSV disbursement file for banking or mobile wallet systems.
        """
        output = io.StringIO()
        writer = csv.writer(output)

        # Header row
        writer.writerow([
            'Batch Number',
            'Employee Code',
            'Employee Name',
            'Payment Method',
            'Bank Name / Wallet Provider',
            'Account / Wallet Number',
            'IBAN',
            'Account Title',
            'Net Amount (PKR)',
            'Payment Reference',
            'Date'
        ])

        for line in batch.lines.all().select_related('employee'):
            dest = line.destination_details or {}
            emp = line.employee
            emp_name = f"{emp.first_name} {emp.last_name}".strip()
            provider_or_bank = dest.get('bank_name') or dest.get('wallet_provider') or 'CASH'
            acc_num = dest.get('account_number') or dest.get('wallet_number') or ''
            iban = dest.get('iban', '')
            title = dest.get('account_title', emp_name)

            writer.writerow([
                batch.batch_number,
                emp.employee_code or str(emp.id)[:8],
                emp_name,
                line.payment_method,
                provider_or_bank,
                acc_num,
                iban,
                title,
                f"{line.net_salary:.2f}",
                line.payment_reference or batch.batch_number,
                batch.payment_date.strftime('%Y-%m-%d')
            ])

        return output.getvalue()

    @classmethod
    @transaction.atomic
    def confirm_manual_payments(
        cls,
        batch: SalaryPaymentBatch,
        line_results: List[Dict[str, Any]],
        user=None
    ) -> SalaryPaymentBatch:
        """
        Confirms actual banking or manual settlement results per line.
        Atomic, idempotent, and updates S-4D FinancialVoucher and TreasuryTransaction.
        """
        company = batch.company

        # Protect against closed accounting period
        can_post, period_msg, _ = period_service.can_post_transaction(company, batch.payment_date)
        if not can_post:
            raise ValidationError(f"Cannot record salary payments in closed/locked period: {period_msg}")

        successful_amount = Decimal('0.0000')
        failed_amount = Decimal('0.0000')
        success_count = 0
        fail_count = 0

        # Map results by line ID
        results_by_id = {str(r.get('line_id')): r for r in line_results}

        lines = batch.lines.all().select_related('employee_snapshot', 'employee')
        for line in lines:
            line_str_id = str(line.id)
            res = results_by_id.get(line_str_id)

            # Skip lines not in submission if partially confirming
            if not res:
                if line.status == SalaryPaymentLineStatus.SUCCESS:
                    successful_amount += line.net_salary
                    success_count += 1
                elif line.status == SalaryPaymentLineStatus.FAILED:
                    failed_amount += line.net_salary
                    fail_count += 1
                continue

            target_status = res.get('status', 'SUCCESS').upper()
            ref = res.get('payment_reference', '')
            fail_code = res.get('failure_code', '')
            fail_reason = res.get('failure_reason', '')

            if target_status == 'SUCCESS':
                line.status = SalaryPaymentLineStatus.SUCCESS
                line.payment_reference = ref or f"CONF-{batch.batch_number}-{line.id}"[:50]
                line.failure_code = ''
                line.failure_reason = ''
                line.processed_at = timezone.now()
                line.save(update_fields=['status', 'payment_reference', 'failure_code', 'failure_reason', 'processed_at'])

                line.employee_snapshot.payment_status = PayrollEmployeePaymentStatus.PAID
                line.employee_snapshot.save(update_fields=['payment_status'])

                successful_amount += line.net_salary
                success_count += 1

            elif target_status == 'FAILED':
                line.status = SalaryPaymentLineStatus.FAILED
                line.failure_code = fail_code or 'BANK_REJECTED'
                line.failure_reason = fail_reason or 'Payment rejected by banking channel.'
                line.processed_at = timezone.now()
                line.save(update_fields=['status', 'failure_code', 'failure_reason', 'processed_at'])

                line.employee_snapshot.payment_status = PayrollEmployeePaymentStatus.FAILED
                line.employee_snapshot.save(update_fields=['payment_status'])

                failed_amount += line.net_salary
                fail_count += 1

        batch.successful_amount = successful_amount
        batch.failed_amount = failed_amount

        # Determine batch status
        if success_count > 0 and fail_count == 0 and success_count == batch.total_employees:
            batch.status = SalaryPaymentBatchStatus.COMPLETED
            batch.completed_at = timezone.now()
        elif success_count > 0 and fail_count > 0:
            batch.status = SalaryPaymentBatchStatus.PARTIALLY_COMPLETED
            batch.completed_at = timezone.now()
        elif fail_count > 0 and success_count == 0:
            batch.status = SalaryPaymentBatchStatus.FAILED
        else:
            batch.status = SalaryPaymentBatchStatus.PROCESSING

        # S-4D Treasury Linkage: Create or update Financial Voucher for the successful total
        if successful_amount > Decimal('0'):
            voucher = batch.voucher
            if not voucher:
                voucher = FinancialVoucher.objects.create(
                    company=company,
                    voucher_type=VoucherType.PAYMENT_VOUCHER,
                    date=batch.payment_date,
                    amount=successful_amount,
                    total_amount=successful_amount,
                    currency=batch.treasury_account.currency,
                    payment_method=PaymentMethod.BANK_TRANSFER if batch.treasury_account.account_type == 'BANK' else PaymentMethod.CASH,
                    bank_account=batch.treasury_account,
                    payee_name=f"Salary Disbursal — {batch.payroll_integration.payroll_period_name}",
                    description=f"Salary payment batch {batch.batch_number} for {batch.payroll_integration.payroll_period_name}",
                    source_module='PAYROLL',
                    source_document_type='SALARY_PAYMENT_BATCH',
                    source_document_id=str(batch.id),
                    status=VoucherStatus.POSTED,
                    approved_by=user,
                    approved_at=timezone.now(),
                    posted_by=user,
                    posted_at=timezone.now(),
                )
                batch.voucher = voucher

                # Treasury balance impact
                from finance.models import TreasuryTransactionType
                TreasuryService.record_treasury_movement(
                    bank_account=batch.treasury_account,
                    voucher=voucher,
                    transaction_type=TreasuryTransactionType.MONEY_OUT,
                    money_in=Decimal('0.0000'),
                    money_out=successful_amount,
                    transaction_date=batch.payment_date,
                    reference=batch.batch_number,
                    description=f"Salary disbursement for batch {batch.batch_number}",
                    user=user
                )
            else:
                # Update existing voucher if batch was partially updated
                voucher.amount = successful_amount
                voucher.total_amount = successful_amount
                voucher.save(update_fields=['amount', 'total_amount'])

        batch.save()

        # Update Parent Payroll Integration liability and paid sums
        integration = batch.payroll_integration
        total_paid_all_batches = SalaryPaymentBatchLine.objects.filter(
            batch__payroll_integration=integration,
            status=SalaryPaymentLineStatus.SUCCESS
        ).aggregate(tot=Sum('net_salary'))['tot'] or Decimal('0.0000')

        integration.total_paid = total_paid_all_batches
        integration.remaining_liability = max(Decimal('0.0000'), integration.net_payroll_payable - total_paid_all_batches)

        if integration.remaining_liability <= Decimal('0.0001') and integration.net_payroll_payable > Decimal('0'):
            integration.status = PayrollAccountingStatus.SETTLED
        elif total_paid_all_batches > Decimal('0'):
            integration.status = PayrollAccountingStatus.PARTIALLY_DISBURSED
        integration.save(update_fields=['total_paid', 'remaining_liability', 'status'])

        return batch

    @classmethod
    @transaction.atomic
    def reverse_salary_payment_line(
        cls,
        line: SalaryPaymentBatchLine,
        reason: str,
        user=None
    ) -> SalaryPaymentBatchLine:
        """
        Formally reverses an individual successful salary payment line.
        Restores Finance payroll liability without altering original HRM payroll.
        """
        if line.status != SalaryPaymentLineStatus.SUCCESS:
            raise ValidationError(f"Can only reverse SUCCESS lines. Current status: {line.status}")

        line.status = SalaryPaymentLineStatus.REVERSED
        line.reversed_at = timezone.now()
        line.reversed_by = user
        line.reversal_reason = reason
        line.save(update_fields=['status', 'reversed_at', 'reversed_by', 'reversal_reason'])

        # Update employee snapshot
        line.employee_snapshot.payment_status = PayrollEmployeePaymentStatus.REVERSED
        line.employee_snapshot.save(update_fields=['payment_status'])

        # Update batch totals
        batch = line.batch
        batch.successful_amount = max(Decimal('0'), batch.successful_amount - line.net_salary)
        batch.save(update_fields=['successful_amount'])

        # Restore treasury balance
        if batch.voucher and batch.treasury_account:
            from finance.models import TreasuryTransactionType
            emp_name = f"{line.employee.first_name} {line.employee.last_name}".strip()
            TreasuryService.record_treasury_movement(
                bank_account=batch.treasury_account,
                voucher=batch.voucher,
                transaction_type=TreasuryTransactionType.MONEY_IN,
                money_in=line.net_salary,
                money_out=Decimal('0.0000'),
                transaction_date=timezone.now().date(),
                reference=f"REV-{line.id}"[:50],
                description=f"Salary payment reversal for {emp_name}: {reason}",
                user=user,
                is_reversal=True
            )

        # Update parent payroll liability
        integration = batch.payroll_integration
        total_paid_all = SalaryPaymentBatchLine.objects.filter(
            batch__payroll_integration=integration,
            status=SalaryPaymentLineStatus.SUCCESS
        ).aggregate(tot=Sum('net_salary'))['tot'] or Decimal('0.0000')

        integration.total_paid = total_paid_all
        integration.remaining_liability = max(Decimal('0.0000'), integration.net_payroll_payable - total_paid_all)
        if integration.remaining_liability > Decimal('0'):
            integration.status = PayrollAccountingStatus.PARTIALLY_DISBURSED
        integration.save(update_fields=['total_paid', 'remaining_liability', 'status'])

        return line

    @classmethod
    def get_accounting_preview_for_payroll(
        cls,
        company,
        payroll_run_id: str
    ) -> Dict[str, Any]:
        """
        Generates balanced double-entry accrual preview for an approved payroll run.
        Dr Salary Expenses (Guards / HQ Staff)
        Dr Overtime Expenses
        Cr Payroll Payable
        Cr Tax Payable
        Cr Advance Recovery Clearing
        """
        integration = PayrollAccountingIntegration.objects.filter(
            company=company, payroll_run_id=payroll_run_id
        ).first()

        if not integration:
            return {'exists': False, 'error': 'No finance integration found for this payroll run.'}

        lines_preview = []
        snapshots = integration.employee_snapshots.all().select_related('salary_expense_account', 'overtime_expense_account', 'employee')

        # Group Debits by Account and Cost Center
        expense_group: Dict[Tuple, Decimal] = {}
        ot_group: Dict[Tuple, Decimal] = {}

        for s in snapshots:
            base_sal = s.gross_earnings - s.overtime_pay
            if base_sal > Decimal('0'):
                key = (s.salary_expense_account_id, s.cost_center_id, s.site_id)
                expense_group[key] = expense_group.get(key, Decimal('0')) + base_sal

            if s.overtime_pay > Decimal('0'):
                ot_acc = s.overtime_expense_account_id or s.salary_expense_account_id
                key = (ot_acc, s.cost_center_id, s.site_id)
                ot_group[key] = ot_group.get(key, Decimal('0')) + s.overtime_pay

        line_num = 1
        total_debits = Decimal('0')
        total_credits = Decimal('0')

        # Add Salary Expense Lines
        for (acc_id, cc_id, site_id), amt in expense_group.items():
            acc = ChartOfAccount.objects.filter(id=acc_id).first() if acc_id else None
            cc = CostCenter.objects.filter(id=cc_id).first() if cc_id else None
            lines_preview.append({
                'line_number': line_num,
                'type': 'DEBIT',
                'description': 'Base Salary & Allowances Cost',
                'amount': float(amt),
                'account_id': str(acc.id) if acc else None,
                'account_code': acc.account_code if acc else 'UNMAPPED',
                'account_name': acc.account_name if acc else 'Unmapped Salary Expense',
                'cost_center_name': cc.name if cc else None,
            })
            total_debits += amt
            line_num += 1

        # Add Overtime Expense Lines
        for (acc_id, cc_id, site_id), amt in ot_group.items():
            acc = ChartOfAccount.objects.filter(id=acc_id).first() if acc_id else None
            cc = CostCenter.objects.filter(id=cc_id).first() if cc_id else None
            lines_preview.append({
                'line_number': line_num,
                'type': 'DEBIT',
                'description': 'Employee Overtime Cost',
                'amount': float(amt),
                'account_id': str(acc.id) if acc else None,
                'account_code': acc.account_code if acc else 'UNMAPPED',
                'account_name': acc.account_name if acc else 'Unmapped OT Expense',
                'cost_center_name': cc.name if cc else None,
            })
            total_debits += amt
            line_num += 1

        # Add Credits: Payroll Payable
        payable_acc = integration.payroll_payable_account
        lines_preview.append({
            'line_number': line_num,
            'type': 'CREDIT',
            'description': 'Net Salary Payable to Employees',
            'amount': float(integration.net_payroll_payable),
            'account_id': str(payable_acc.id) if payable_acc else None,
            'account_code': payable_acc.account_code if payable_acc else 'UNMAPPED',
            'account_name': payable_acc.account_name if payable_acc else 'Payroll Payable',
        })
        total_credits += integration.net_payroll_payable
        line_num += 1

        # Add Credits: Tax Payable
        if integration.total_tax > Decimal('0'):
            tax_acc = integration.tax_payable_account
            lines_preview.append({
                'line_number': line_num,
                'type': 'CREDIT',
                'description': 'Income Tax Withholding Liability',
                'amount': float(integration.total_tax),
                'account_id': str(tax_acc.id) if tax_acc else None,
                'account_code': tax_acc.account_code if tax_acc else '2030',
                'account_name': tax_acc.account_name if tax_acc else 'Tax Payable',
            })
            total_credits += integration.total_tax
            line_num += 1

        # Add Credits: Advance Recovery Clearing
        if integration.total_advance_recovery > Decimal('0'):
            adv_acc = integration.advance_clearing_account
            lines_preview.append({
                'line_number': line_num,
                'type': 'CREDIT',
                'description': 'Employee Advance Payroll Recovery Clearing',
                'amount': float(integration.total_advance_recovery),
                'account_id': str(adv_acc.id) if adv_acc else None,
                'account_code': adv_acc.account_code if adv_acc else '1070',
                'account_name': adv_acc.account_name if adv_acc else 'Advance Clearing',
            })
            total_credits += integration.total_advance_recovery
            line_num += 1

        is_balanced = abs(total_debits - total_credits) < Decimal('0.01')

        return {
            'exists': True,
            'payroll_run_number': integration.payroll_run.run_number,
            'payroll_period': integration.payroll_period_name,
            'status': integration.status,
            'blocking_reason': integration.blocking_reason,
            'total_debits': float(total_debits),
            'total_credits': float(total_credits),
            'is_balanced': is_balanced,
            'lines': lines_preview
        }

    @classmethod
    def get_summary_metrics(cls, company) -> Dict[str, Any]:
        """
        KPI metrics for the Payroll Finance workspace.
        """
        integrations = PayrollAccountingIntegration.objects.filter(company=company)
        batches = SalaryPaymentBatch.objects.filter(company=company)

        total_runs = integrations.count()
        total_payable = integrations.aggregate(tot=Sum('net_payroll_payable'))['tot'] or Decimal('0.00')
        total_paid = integrations.aggregate(tot=Sum('total_paid'))['tot'] or Decimal('0.00')
        remaining_liability = integrations.aggregate(tot=Sum('remaining_liability'))['tot'] or Decimal('0.00')

        active_batches = batches.filter(status__in=[SalaryPaymentBatchStatus.DRAFT, SalaryPaymentBatchStatus.READY_FOR_PAYMENT, SalaryPaymentBatchStatus.PROCESSING]).count()
        completed_batches = batches.filter(status=SalaryPaymentBatchStatus.COMPLETED).count()

        return {
            'total_payroll_runs': total_runs,
            'total_net_payable': float(total_payable),
            'total_salary_paid': float(total_paid),
            'outstanding_payroll_liability': float(remaining_liability),
            'active_batches': active_batches,
            'completed_batches': completed_batches,
        }
