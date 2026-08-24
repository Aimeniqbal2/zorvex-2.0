import uuid
from decimal import Decimal
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from hrm.models import PayrollRun, PayrollRunStatus, PayrollAccountingConfiguration
from finance.models import Journal, JournalEntry, JournalEntryLine, AccountingPeriod

def preview_payroll_journal(payroll_run):
    config = PayrollAccountingConfiguration.objects.filter(
        company_id=payroll_run.company_id, 
        is_active=True
    ).first()
    
    if not config:
        raise ValidationError({'detail': 'Payroll accounting configuration is missing for this company.'})

    total_gross = Decimal('0.00')
    total_net = Decimal('0.00')
    total_tax = Decimal('0.00')
    total_deduction = Decimal('0.00')

    for payslip in payroll_run.payslips.all():
        total_gross += payslip.gross_amount
        total_net += payslip.net_amount
        total_tax += payslip.tax_amount
        total_deduction += payslip.deduction_amount

    lines = []
    
    if total_gross > 0:
        lines.append({
            'account': config.salary_expense_account,
            'description': f'Gross Salary Expense for Run {payroll_run.run_number}',
            'debit': total_gross,
            'credit': Decimal('0.00'),
        })

    if total_net > 0:
        lines.append({
            'account': config.salary_payable_account,
            'description': f'Net Salary Payable for Run {payroll_run.run_number}',
            'debit': Decimal('0.00'),
            'credit': total_net,
        })
        
    if total_tax > 0:
        if not config.tax_payable_account:
            raise ValidationError({'detail': 'Tax payable account is required because tax deductions exist.'})
        lines.append({
            'account': config.tax_payable_account,
            'description': f'Tax Payable for Run {payroll_run.run_number}',
            'debit': Decimal('0.00'),
            'credit': total_tax,
        })

    other_deductions = total_deduction - total_tax
    if other_deductions > Decimal('0.00'):
        if not config.deduction_clearing_account:
            raise ValidationError({'detail': 'Other deductions exist but deduction_clearing_account is not configured.'})
        lines.append({
            'account': config.deduction_clearing_account,
            'description': f'Other Deductions Clearing for Run {payroll_run.run_number}',
            'debit': Decimal('0.00'),
            'credit': other_deductions,
        })

    return lines

@transaction.atomic
def post_payroll_to_finance(payroll_run_id, user_id):
    try:
        run = PayrollRun.objects.select_for_update().get(id=payroll_run_id)
    except PayrollRun.DoesNotExist:
        raise ValidationError({'detail': 'Payroll run not found.'})

    if run.status != PayrollRunStatus.FINALIZED:
        raise ValidationError({'detail': 'Only finalized payroll runs can be posted to finance.'})
        
    if run.journal_entry_id:
        return run.journal_entry

    company_id = run.company_id
    date = run.payroll_period.end_date
    period = AccountingPeriod.objects.filter(
        company_id=company_id,
        start_date__lte=date,
        end_date__gte=date,
        is_deleted=False
    ).first()

    if not period:
        raise ValidationError({'detail': 'No accounting period found for the payroll period end date.'})
    
    if period.status != 'OPEN':
        raise ValidationError({'detail': f'Accounting period {period.month} is {period.status}.'})

    journal = Journal.objects.filter(company_id=company_id, is_deleted=False).first()
    if not journal:
        raise ValidationError({'detail': 'No active journal found for the company.'})
        
    preview_lines = preview_payroll_journal(run)
    
    if not preview_lines:
        raise ValidationError({'detail': 'No accounting lines generated for this payroll run.'})

    total_debit = sum(l['debit'] for l in preview_lines)
    total_credit = sum(l['credit'] for l in preview_lines)
    if total_debit != total_credit:
        raise ValidationError({'detail': f'Unbalanced journal generated. Debit: {total_debit}, Credit: {total_credit}'})
        
    first_payslip = run.payslips.first()
    if not first_payslip:
        raise ValidationError({'detail': 'No payslips found in the payroll run.'})
    currency = first_payslip.currency

    # Format lines for post_journal_entry
    from finance.services.journal import post_journal_entry
    journal_lines = []
    for line in preview_lines:
        journal_lines.append({
            'account': line['account'],
            'description': line['description'],
            'debit': line['debit'],
            'credit': line['credit'],
            'currency': currency,
        })

    journal_entry = post_journal_entry(
        company=run.company,
        journal=journal,
        entry_date=date,
        description=f"Payroll Run - {run.payroll_period.name}",
        lines=journal_lines,
        reference=run.run_number,
        source_module='hrm',
        source_document_type='PayrollRun',
        source_document_id=run.id,
        created_by_id=user_id,
    )

    run.journal_entry = journal_entry
    run.save(update_fields=['journal_entry'])

    return journal_entry
