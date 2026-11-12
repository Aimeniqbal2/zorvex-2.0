"""
finance/services/advance_sheet_service.py

Operations -> Finance Monthly Advance Sheet engine:
- Auto-populates all employees with deployed locations dynamically derived from
  where Present attendance is marked in the selected month (falling back to active Deployment).
- Supports draft entry per month, immutable monthly AdvanceSheet generation,
  Finance batch/selective Pay (with FinancialVoucher + Treasury MONEY_OUT + EmployeeAdvance)
  and Reject actions, plus automatic Salary Deduction status tracking ('NOT_DEDUCTED' / 'CLEARED').
"""
import calendar
from collections import Counter, defaultdict
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Dict, List, Optional, Tuple

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Q
from django.utils import timezone


def _round_pkr(val: Any) -> Decimal:
    if val is None:
        return Decimal('0')
    d = Decimal(str(val)) if not isinstance(val, Decimal) else val
    return d.quantize(Decimal('1'), rounding=ROUND_HALF_UP)


class AdvanceSheetService:
    ABSENT_OR_OFF_STATUSES = {'ABSENT', 'A', 'UNPAID_LEAVE', 'LEAVE', 'L', 'WEEK_OFF', 'W'}

    @classmethod
    def resolve_month_context(
        cls,
        company,
        month_param: Optional[str] = None,
    ) -> Tuple[str, str, List[str], date, date]:
        from operations.models import DailyDutyPay
        from finance.models import AdvanceSheet, AdvanceDraftInput

        today = timezone.now().date()
        current_month = f"{today.year:04d}-{today.month:02d}"
        if today.month == 1:
            prev_month = f"{today.year - 1:04d}-12"
        else:
            prev_month = f"{today.year:04d}-{today.month - 1:02d}"

        avail_set = {current_month, prev_month}
        for d in DailyDutyPay.objects.filter(company=company, is_deleted=False).dates('duty_date', 'month', order='DESC')[:24]:
            avail_set.add(f"{d.year:04d}-{d.month:02d}")
        for m in AdvanceSheet.objects.filter(company=company, is_deleted=False).values_list('month', flat=True):
            if m and len(str(m)) == 7:
                avail_set.add(str(m))
        for m in AdvanceDraftInput.objects.filter(company=company, is_deleted=False).values_list('month', flat=True):
            if m and len(str(m)) == 7:
                avail_set.add(str(m))

        selected_month = (month_param or '').strip()
        if not selected_month or selected_month.upper() == 'AUTO':
            selected_month = current_month

        try:
            year_val, month_val = map(int, selected_month.split('-'))
            if month_val < 1 or month_val > 12:
                raise ValueError
        except Exception:
            year_val, month_val = int(current_month[:4]), int(current_month[5:7])
            selected_month = current_month

        days_in_month = calendar.monthrange(year_val, month_val)[1]
        period_start = date(year_val, month_val, 1)
        period_end = date(year_val, month_val, days_in_month)
        available_months = sorted(avail_set | {selected_month}, reverse=True)

        return selected_month, current_month, available_months, period_start, period_end

    @classmethod
    def _compute_auto_locations(cls, company, period_start: date, period_end: date, emp_ids: List[str]) -> Dict[str, str]:
        """
        Determines each employee's deployed location automatically from Present attendance
        in the selected month (Ordered by most recent / most frequent site worked),
        falling back to active Deployment.site.
        """
        from operations.models import DailyDutyPay, Deployment

        present_sites_by_emp: Dict[str, Counter] = defaultdict(Counter)
        latest_site_by_emp: Dict[str, Tuple[date, str]] = {}

        dp_rows = (
            DailyDutyPay.objects.filter(
                company=company,
                employee_id__in=emp_ids,
                duty_date__gte=period_start,
                duty_date__lte=period_end,
                is_deleted=False,
                site__isnull=False,
            )
            .values_list('employee_id', 'site__name', 'attendance_status', 'duty_date')
            .order_by('duty_date')
        )

        for emp_id, site_name, att_status, d_date in dp_rows:
            att = str(att_status or '').upper().strip()
            if att in cls.ABSENT_OR_OFF_STATUSES:
                continue
            s_name = (site_name or '').strip()
            if not s_name:
                continue
            eid = str(emp_id)
            present_sites_by_emp[eid][s_name] += 1
            prev = latest_site_by_emp.get(eid)
            if prev is None or d_date >= prev[0]:
                latest_site_by_emp[eid] = (d_date, s_name)

        active_dep_by_emp: Dict[str, str] = {}
        for d_eid, s_name in Deployment.objects.filter(
            company=company,
            employee_id__in=emp_ids,
            is_deleted=False,
            status='ACTIVE',
            site__isnull=False,
        ).values_list('employee_id', 'site__name'):
            eid = str(d_eid)
            if eid not in active_dep_by_emp and s_name:
                active_dep_by_emp[eid] = s_name.strip()

        resolved: Dict[str, str] = {}
        for eid in emp_ids:
            counts = present_sites_by_emp.get(eid)
            if counts:
                ordered_sites = [s for s, _cnt in counts.most_common()]
                # Ensure latest site appears cleanly if worked across multiple locations
                resolved[eid] = ', '.join(ordered_sites)
            elif eid in active_dep_by_emp:
                resolved[eid] = active_dep_by_emp[eid]
            else:
                resolved[eid] = 'Unassigned'
        return resolved

    @classmethod
    def build_live_advance_builder(cls, company, month_param: Optional[str] = None) -> Dict[str, Any]:
        from hrm.models import Employee
        from finance.models import AdvanceDraftInput, AdvanceSheet, AdvanceSheetLine

        selected_month, current_month, available_months, period_start, period_end = cls.resolve_month_context(
            company, month_param
        )

        # Include all active employees plus anyone with drafts/attendance/advance lines in this month
        draft_rows = {
            str(d.employee_id): d
            for d in AdvanceDraftInput.objects.filter(
                company=company, month=selected_month, is_deleted=False
            )
        }

        submitted_lines_by_emp: Dict[str, List[AdvanceSheetLine]] = defaultdict(list)
        for ln in (
            AdvanceSheetLine.objects.filter(
                company=company,
                advance_sheet__month=selected_month,
                advance_sheet__is_deleted=False,
                is_deleted=False,
            )
            .select_related('advance_sheet')
            .order_by('-created_at')
        ):
            submitted_lines_by_emp[str(ln.employee_id)].append(ln)

        extra_emp_ids = list(set(draft_rows.keys()) | set(submitted_lines_by_emp.keys()))
        employees = list(
            Employee.objects.filter(company=company, is_deleted=False)
            .filter(Q(is_active=True, employment_status='ACTIVE') | Q(id__in=extra_emp_ids))
            .select_related('designation')
        )

        def _code_sort_key(emp_obj):
            raw = getattr(emp_obj, 'display_code', None) or getattr(emp_obj, 'employee_code', '') or ''
            digits = ''.join(ch for ch in str(raw) if ch.isdigit())
            return (0, int(digits), str(raw)) if digits else (1, 0, (emp_obj.first_name or '').lower())

        employees.sort(key=_code_sort_key)
        emp_ids = [str(e.id) for e in employees]

        locations_map = cls._compute_auto_locations(company, period_start, period_end, emp_ids)

        existing_sheets = list(
            AdvanceSheet.objects.filter(
                company=company, month=selected_month, is_deleted=False
            ).order_by('-created_at')
        )

        rows: List[Dict[str, Any]] = []
        total_draft_amount = Decimal('0')
        total_submitted_amount = Decimal('0')

        for idx, emp in enumerate(employees, start=1):
            eid = str(emp.id)
            draft = draft_rows.get(eid)
            draft_amt = _round_pkr(draft.amount) if draft else Decimal('0')
            emp_lines = submitted_lines_by_emp.get(eid, [])

            sub_total = sum((_round_pkr(l.amount) for l in emp_lines), Decimal('0'))
            paid_total = sum((_round_pkr(l.amount) for l in emp_lines if l.payment_status == 'PAID'), Decimal('0'))
            pending_total = sum((_round_pkr(l.amount) for l in emp_lines if l.payment_status == 'PENDING'), Decimal('0'))
            rejected_total = sum((_round_pkr(l.amount) for l in emp_lines if l.payment_status == 'REJECTED'), Decimal('0'))
            cleared_any = any(l.deduction_status == 'CLEARED' for l in emp_lines)
            latest_line = emp_lines[0] if emp_lines else None

            total_draft_amount += draft_amt
            total_submitted_amount += sub_total

            oss_code = getattr(emp, 'display_code', None) or emp.employee_code or eid[:6]
            emp_name = f"{emp.first_name} {emp.last_name}".strip()

            rows.append({
                'serial_no': idx,
                'employee_id': eid,
                'oss_code': oss_code,
                'employee_name': emp_name,
                'father_name': emp.father_name or '',
                'designation_name': emp.designation.name if emp.designation else 'Security Guard',
                'location_deployed': locations_map.get(eid, 'Unassigned'),
                'draft_amount': float(draft_amt),
                'notes': draft.notes if draft else '',
                'submitted_total': float(sub_total),
                'paid_total': float(paid_total),
                'pending_total': float(pending_total),
                'rejected_total': float(rejected_total),
                'latest_payment_status': latest_line.payment_status if latest_line else None,
                'latest_deduction_status': ('CLEARED' if cleared_any else latest_line.deduction_status) if latest_line else None,
            })

        return {
            'month': selected_month,
            'current_month': current_month,
            'available_months': available_months,
            'period_start': period_start.isoformat(),
            'period_end': period_end.isoformat(),
            'employee_count': len(rows),
            'total_draft_amount': float(total_draft_amount),
            'total_submitted_amount': float(total_submitted_amount),
            'existing_sheets': [
                {
                    'id': str(s.id),
                    'sheet_number': s.sheet_number,
                    'status': s.status,
                    'total_employees': s.total_employees,
                    'total_requested_amount': float(s.total_requested_amount),
                    'total_paid_amount': float(s.total_paid_amount),
                }
                for s in existing_sheets
            ],
            'rows': rows,
        }

    @classmethod
    @transaction.atomic
    def update_draft(cls, company, month: str, employee_id: str, amount: Any, notes: str = '') -> Dict[str, Any]:
        from hrm.models import Employee
        from finance.models import AdvanceDraftInput

        month = (month or '').strip()
        if not month or not employee_id:
            raise ValidationError("month and employee_id are required.")

        emp = Employee.objects.filter(id=employee_id, company=company, is_deleted=False).first()
        if not emp:
            raise ValidationError("Employee not found.")

        amt = max(Decimal('0'), _round_pkr(amount))
        draft, _ = AdvanceDraftInput.objects.get_or_create(
            company=company, employee=emp, month=month, defaults={'is_deleted': False}
        )
        draft.amount = amt
        if notes is not None:
            draft.notes = str(notes)
        draft.save()
        return {'success': True, 'employee_id': str(emp.id), 'month': month, 'amount': float(amt)}

    @classmethod
    @transaction.atomic
    def make_advance_sheet(
        cls,
        company,
        user,
        month_param: str,
        overrides: Optional[List[Dict[str, Any]]] = None,
        notes: str = '',
    ) -> 'AdvanceSheet':
        from finance.models import AdvanceDraftInput, AdvanceSheet, AdvanceSheetLine

        selected_month, _, _, period_start, period_end = cls.resolve_month_context(company, month_param)

        if overrides:
            for ov in overrides:
                if ov.get('employee_id') is not None:
                    cls.update_draft(
                        company,
                        selected_month,
                        ov['employee_id'],
                        ov.get('amount', 0),
                        ov.get('notes', ''),
                    )

        drafts = list(
            AdvanceDraftInput.objects.filter(
                company=company, month=selected_month, is_deleted=False, amount__gt=0
            ).select_related('employee', 'employee__designation')
        )
        if not drafts:
            raise ValidationError(f"Please enter an Advance Amount (> 0) for at least one employee for {selected_month}.")

        def _code_sort_key(d):
            raw = getattr(d.employee, 'display_code', None) or getattr(d.employee, 'employee_code', '') or ''
            digits = ''.join(ch for ch in str(raw) if ch.isdigit())
            return (0, int(digits), str(raw)) if digits else (1, 0, (d.employee.first_name or '').lower())

        drafts.sort(key=_code_sort_key)
        emp_ids = [str(d.employee_id) for d in drafts]
        locations_map = cls._compute_auto_locations(company, period_start, period_end, emp_ids)

        year_val, month_val = map(int, selected_month.split('-'))
        month_label = date(year_val, month_val, 1).strftime('%B-%Y').upper()
        prepared_by_name = ''
        if user:
            prepared_by_name = (user.get_full_name() or '').strip() or getattr(user, 'username', '') or getattr(user, 'email', '')

        sheet = AdvanceSheet.objects.create(
            company=company,
            month=selected_month,
            title=f"ADVANCE SHEET FOR THE MONTH OF {month_label}",
            period_start=period_start,
            period_end=period_end,
            status='SUBMITTED',
            prepared_by=user,
            prepared_by_name=prepared_by_name,
            total_employees=len(drafts),
            notes=notes or '',
        )

        lines_to_create = []
        total_req = Decimal('0')
        for idx, d in enumerate(drafts, start=1):
            emp = d.employee
            amt = _round_pkr(d.amount)
            total_req += amt
            oss_code = getattr(emp, 'display_code', None) or emp.employee_code or str(emp.id)[:6]
            emp_name = f"{emp.first_name} {emp.last_name}".strip()
            lines_to_create.append(
                AdvanceSheetLine(
                    company=company,
                    advance_sheet=sheet,
                    employee=emp,
                    serial_no=idx,
                    oss_code=oss_code,
                    employee_name=emp_name,
                    father_name=emp.father_name or '',
                    designation_name=emp.designation.name if emp.designation else 'Security Guard',
                    location_deployed=locations_map.get(str(emp.id), 'Unassigned'),
                    amount=amt,
                    payment_status='PENDING',
                    deduction_status='NOT_DEDUCTED',
                    notes=d.notes or '',
                )
            )

        AdvanceSheetLine.objects.bulk_create(lines_to_create, batch_size=500)
        sheet.total_requested_amount = total_req
        sheet.save(update_fields=['total_requested_amount'])

        # Clear drafts so they cannot accidentally be re-submitted twice
        AdvanceDraftInput.objects.filter(
            company=company, month=selected_month, is_deleted=False, amount__gt=0
        ).update(amount=Decimal('0'))

        return sheet

    @classmethod
    @transaction.atomic
    def delete_advance_sheet(cls, company, sheet_id: str) -> Dict[str, Any]:
        from finance.models import AdvanceSheet

        sheet = AdvanceSheet.objects.filter(id=sheet_id, company=company, is_deleted=False).first()
        if not sheet:
            raise ValidationError("Advance Sheet not found.")
        if sheet.lines.filter(payment_status='PAID', is_deleted=False).exists() or (sheet.total_paid_amount or 0) > 0:
            raise ValidationError("Cannot delete an Advance Sheet that already has PAID disbursements.")

        sheet_number = sheet.sheet_number
        month = sheet.month
        sheet.lines.all().delete()
        sheet.delete()
        return {'success': True, 'deleted_sheet_number': sheet_number, 'deleted_month': month}

    @classmethod
    @transaction.atomic
    def process_lines(
        cls,
        company,
        user,
        sheet_id: str,
        action_type: str,
        line_ids: Optional[List[str]] = None,
        treasury_account_id: Optional[str] = None,
        payment_date_str: Optional[str] = None,
        payment_reference: str = '',
        rejection_reason: str = '',
    ) -> Dict[str, Any]:
        from finance.models import (
            AdvanceSheet,
            AdvanceSheetLine,
            AdvanceRecoveryMethod,
            AdvanceStatus,
            BankAccount,
            EmployeeAdvance,
            EmployeeAdvanceType,
            FinancialVoucher,
            PaymentMethod,
            TreasuryTransactionType,
            VoucherStatus,
            VoucherType,
        )
        from finance.services.period_service import ensure_open_period_and_foundation
        from finance.services.treasury_service import TreasuryService

        sheet = AdvanceSheet.objects.filter(id=sheet_id, company=company, is_deleted=False).first()
        if not sheet:
            raise ValidationError("Advance Sheet not found.")

        act = (action_type or '').strip().upper()
        if act not in ('PAY', 'REJECT'):
            raise ValidationError("action must be PAY or REJECT.")

        lines_qs = AdvanceSheetLine.objects.filter(
            advance_sheet=sheet, company=company, is_deleted=False, payment_status='PENDING'
        ).select_related('employee')

        if line_ids:
            lines_qs = lines_qs.filter(id__in=line_ids)

        target_lines = [ln for ln in lines_qs if (ln.amount or 0) > 0]
        if not target_lines:
            raise ValidationError("No pending advance lines selected.")

        now_ts = timezone.now()

        if act == 'REJECT':
            reason = (rejection_reason or '').strip() or 'Rejected by Finance'
            for ln in target_lines:
                ln.payment_status = 'REJECTED'
                ln.rejected_at = now_ts
                ln.rejected_by = user
                ln.rejection_reason = reason
                ln.save(update_fields=['payment_status', 'rejected_at', 'rejected_by', 'rejection_reason'])

            cls._refresh_sheet_totals(sheet)
            return {
                'success': True,
                'action': 'REJECT',
                'processed_count': len(target_lines),
                'sheet_status': sheet.status,
                'message': f"Rejected {len(target_lines)} advance request(s) in {sheet.sheet_number}.",
            }

        # act == 'PAY': Treasury deduction + Voucher + EmployeeAdvance (for Salary Sheet deduction)
        pay_date = date.fromisoformat(payment_date_str) if payment_date_str else timezone.now().date()
        ensure_open_period_and_foundation(company, pay_date)

        treasury_acc = None
        if treasury_account_id:
            treasury_acc = BankAccount.objects.filter(id=treasury_account_id, company=company, is_deleted=False).first()
        if not treasury_acc:
            treasury_acc = BankAccount.objects.filter(company=company, is_active=True, is_deleted=False).first()
        if not treasury_acc:
            raise ValidationError("No active Bank or Cash Treasury account found. Please configure one in Vouchers & Treasury.")

        total_paid = sum((Decimal(str(ln.amount)) for ln in target_lines), Decimal('0.00'))
        if treasury_acc.account_type == 'CASH':
            v_type = VoucherType.CASH_PAYMENT
            p_method = PaymentMethod.CASH
        elif treasury_acc.account_type == 'PETTY_CASH':
            v_type = VoucherType.PETTY_CASH_VOUCHER
            p_method = PaymentMethod.CASH
        else:
            v_type = VoucherType.BANK_PAYMENT
            p_method = PaymentMethod.BANK_TRANSFER

        voucher = FinancialVoucher.objects.create(
            company=company,
            voucher_type=v_type,
            date=pay_date,
            amount=total_paid,
            total_amount=total_paid,
            currency=treasury_acc.currency,
            payment_method=p_method,
            bank_account=treasury_acc,
            payee_name=f"Advance Sheet {sheet.sheet_number} ({sheet.month})",
            description=f"Operations Advance Sheet {sheet.sheet_number} disbursement ({len(target_lines)} employees)",
            source_module='FINANCE_ADVANCE',
            source_document_type='ADVANCE_SHEET',
            source_document_id=str(sheet.id),
            status=VoucherStatus.POSTED,
            approved_by=user,
            approved_at=now_ts,
            posted_by=user,
            posted_at=now_ts,
        )

        TreasuryService.record_treasury_movement(
            bank_account=treasury_acc,
            voucher=voucher,
            transaction_type=TreasuryTransactionType.MONEY_OUT,
            money_in=Decimal('0.0000'),
            money_out=total_paid,
            transaction_date=pay_date,
            reference=payment_reference or sheet.sheet_number,
            description=f"Advance Sheet disbursement for {sheet.sheet_number} ({sheet.month})",
            user=user,
        )

        for idx, ln in enumerate(target_lines, start=1):
            amt_dec = Decimal(str(ln.amount)).quantize(Decimal('0.0001'))
            emp_adv = EmployeeAdvance.objects.create(
                company=company,
                employee=ln.employee,
                advance_type=EmployeeAdvanceType.OPERATIONAL_ADVANCE,
                amount=amt_dec,
                settled_amount=Decimal('0.0000'),
                returned_amount=Decimal('0.0000'),
                outstanding_balance=amt_dec,
                advance_date=pay_date,
                expected_settlement_date=sheet.period_end,
                recovery_method=AdvanceRecoveryMethod.PAYROLL_DEDUCTION,
                purpose=f"Advance Sheet {sheet.sheet_number} ({sheet.month}) - {ln.location_deployed}",
                status=AdvanceStatus.PAID,
                bank_account=treasury_acc,
                voucher=voucher,
                payroll_deduction_ready=True,
                created_by=user,
                approved_by=user,
                approved_at=now_ts,
                paid_by=user,
                paid_at=now_ts,
            )

            ln.employee_advance = emp_adv
            ln.payment_status = 'PAID'
            ln.paid_at = now_ts
            ln.paid_by = user
            ln.payment_reference = payment_reference or f"{voucher.voucher_number}-{idx}"
            ln.treasury_account = treasury_acc
            ln.voucher = voucher
            ln.save(
                update_fields=[
                    'employee_advance',
                    'payment_status',
                    'paid_at',
                    'paid_by',
                    'payment_reference',
                    'treasury_account',
                    'voucher',
                ]
            )

        cls._refresh_sheet_totals(sheet)
        return {
            'success': True,
            'action': 'PAY',
            'processed_count': len(target_lines),
            'total_paid': float(total_paid),
            'voucher_number': voucher.voucher_number,
            'sheet_status': sheet.status,
            'message': f"Approved & Paid PKR {total_paid:,.0f} across {len(target_lines)} employee(s) ({voucher.voucher_number}). Advances will auto-deduct in {sheet.month} Salary Sheet.",
        }

    @classmethod
    def _refresh_sheet_totals(cls, sheet) -> None:
        all_lines = list(sheet.lines.filter(is_deleted=False))
        paid_amt = sum((Decimal(str(l.amount)) for l in all_lines if l.payment_status == 'PAID'), Decimal('0'))
        rej_amt = sum((Decimal(str(l.amount)) for l in all_lines if l.payment_status == 'REJECTED'), Decimal('0'))
        has_pending = any(l.payment_status == 'PENDING' for l in all_lines)
        has_processed = any(l.payment_status in ('PAID', 'REJECTED') for l in all_lines)

        sheet.total_paid_amount = paid_amt
        sheet.total_rejected_amount = rej_amt
        if not has_pending:
            sheet.status = 'PROCESSED'
        elif has_processed:
            sheet.status = 'PARTIALLY_PROCESSED'
        else:
            sheet.status = 'SUBMITTED'
        sheet.save(update_fields=['total_paid_amount', 'total_rejected_amount', 'status'])

