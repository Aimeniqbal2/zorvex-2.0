"""
operations/services/attendance_validation_service.py

Centralized Attendance Validation Service for Security Operations.
Enforces the complete business rules matrix across all operational locations:
1. P (Present): Exactly 1 primary normal shift per employee per date across all company locations.
2. O (Overtime): Exactly 1 overtime shift per employee per date. Requires a valid P at a DIFFERENT location.
3. PO (Present + Overtime): Normal shift + overtime shift at the SAME location. Consumes full 2-shift capacity; precludes any other duty.
4. WP (Worked on Week Off): Scheduled paid weekly holiday worked. Consumes full 2-shift capacity; precludes any other duty.
5. W (Weekly Off): Scheduled paid weekly holiday. Single location. Precludes active duty.
6. A (Absent): Genuine single daily absence. Single location. Precludes active duty.
7. L (Leave): Approved paid/unpaid leave. Precludes active duty.
8. Empty (''): Unrecorded/no duty at that specific location. Allowed across non-duty locations.
"""

from collections import defaultdict
from datetime import date
from django.core.exceptions import ValidationError

from hrm.models import Employee, AttendanceStatus, WorkforceAttendance
from operations.models import DailyDutyPay, DutyType, OperationalSite


CANONICAL_CODES = {'P', 'O', 'OD', 'PO', 'POD', 'WP', 'W', 'A', 'L', ''}


def normalize_attendance_code(raw_val: str) -> str:
    """
    Normalizes any entered code or keyboard alias into canonical code.
    Accepted aliases:
      'P', '1' -> 'P'
      'O', 'OT' -> 'O'
      'OD', 'DOZ', 'DOZING' -> 'OD'
      'PO', 'P+O', 'P+OT', 'POT' -> 'PO'
      'POD', 'P+OD', 'P+DOZ', 'PD' -> 'POD'
      'WP', 'WO+P', 'W+P', 'D', 'DS', 'WO+OT', '2' -> 'WP'
      'W', 'WO', 'OFF' -> 'W'
      'A', '0' -> 'A'
      'L', 'PL', 'SL' -> 'L'
      '' -> ''
    """
    if raw_val is None:
        return ''
    c = str(raw_val).strip().upper()
    if not c:
        return ''

    if c in ('POD', 'P+OD', 'P+DOZ', 'PD'):
        return 'POD'
    if c in ('OD', 'DOZ', 'DOZING'):
        return 'OD'
    if c in ('PO', 'P+O', 'P+OT', 'POT'):
        return 'PO'
    if c in ('P', '1'):
        return 'P'
    if c in ('O', 'OT'):
        return 'O'
    if c in ('WP', 'WO+P', 'W+P', 'D', 'DS', 'WO+OT', '2'):
        return 'WP'
    if c in ('W', 'WO', 'OFF'):
        return 'W'
    if c in ('A', '0'):
        return 'A'
    if c in ('L', 'PL', 'SL'):
        return 'L'

    # Fallback checks
    if c.endswith('OD') or c == 'OD':
        return 'OD'
    last_char = c[-1]
    if last_char in ('P', '1'):
        return 'P'
    if last_char == 'O':
        return 'O'
    if last_char == 'W':
        return 'W'
    if last_char == 'A':
        return 'A'
    if last_char == 'L':
        return 'L'

    return c


class AttendanceValidationService:
    """
    Authoritative backend validation service.
    Enforces cross-location anti-collision and shift capacity rules across batches and DB records.
    """

    @classmethod
    def validate_monthly_muster_batch(cls, company, year: int, month: int, updates: list) -> dict:
        """
        Validates an entire batch of cell updates against incoming batch and existing database state.
        Returns a dict of normalized updates: list of dicts.
        Raises ValidationError with clear, descriptive messages if any invariant is violated.
        """
        if not updates:
            return {'normalized_updates': []}

        # 1. Normalize all update codes
        normalized_updates = []
        # emp_day_incoming: (emp_id_str, day) -> dict of { site_id_str: canonical_code }
        emp_day_incoming = defaultdict(dict)
        emp_ids_touched = set()
        days_touched = set()
        sites_touched = set()

        for up in updates:
            site_id = str(up.get('site_id', '')).strip()
            emp_id = str(up.get('employee_id', '')).strip()
            day = int(up.get('day', 0))
            raw_code = up.get('code', '')
            code = normalize_attendance_code(raw_code)

            if code not in CANONICAL_CODES:
                raise ValidationError(
                    f"Invalid attendance code '{raw_code}'. Allowed codes: P (Present), O (Overtime), "
                    f"PO (Present + Overtime), WP (Worked Week Off), W (Week Off), A (Absent), L (Leave)."
                )

            normalized_updates.append({
                'site_id': site_id,
                'employee_id': emp_id,
                'day': day,
                'code': code,
            })

            emp_day_incoming[(emp_id, day)][site_id] = code
            emp_ids_touched.add(emp_id)
            days_touched.add(day)
            sites_touched.add(site_id)

        # 2. Preload employees and sites for informative error messages
        employees = {
            str(e.id): e
            for e in Employee.objects.filter(id__in=emp_ids_touched, company=company)
        }
        sites = {
            str(s.id): s
            for s in OperationalSite.objects.filter(id__in=sites_touched, company=company)
        }

        # 3. Pre-fetch existing database duties across OTHER sites for the touched (emp_id, day) pairs
        dates_to_check = [date(year, month, d) for d in days_touched]
        existing_duties_qs = DailyDutyPay.objects.filter(
            company=company,
            employee_id__in=emp_ids_touched,
            duty_date__in=dates_to_check,
            is_deleted=False
        ).select_related('site', 'employee')

        # Map existing DB duties by (emp_id_str, day) -> list of { site_id, code, site_name, duty_type }
        existing_db_duties = defaultdict(dict)
        for dp in existing_duties_qs:
            e_id = str(dp.employee_id)
            d_day = dp.duty_date.day
            s_id = str(dp.site_id) if dp.site_id else 'CENTRAL'
            s_name = dp.site.name if dp.site else 'Other Location'

            # Determine existing canonical code
            # Note: PO is stored as two DDP rows (PRIMARY and OVERTIME) at the same site.
            prev_entry = existing_db_duties[(e_id, d_day)].get(s_id)
            if prev_entry:
                if (prev_entry['code'] == 'P' and dp.attendance_status == AttendanceStatus.OVERTIME_DOZING) or (prev_entry['code'] == 'OD' and dp.duty_type == DutyType.PRIMARY):
                    code = 'POD'
                elif (prev_entry['code'] == 'P' and dp.duty_type == DutyType.OVERTIME) or (prev_entry['code'] == 'O' and dp.duty_type == DutyType.PRIMARY):
                    code = 'PO'
                else:
                    code = prev_entry['code']
            else:
                if dp.attendance_status == AttendanceStatus.OVERTIME_DOZING:
                    code = 'OD'
                elif dp.duty_type == DutyType.OVERTIME:
                    code = 'O'
                elif dp.attendance_status == AttendanceStatus.WORKED_WEEKLY_OFF:
                    code = 'WP'
                elif dp.attendance_status == AttendanceStatus.WEEKLY_OFF:
                    code = 'W'
                elif dp.attendance_status == AttendanceStatus.ABSENT:
                    code = 'A'
                elif dp.attendance_status in (AttendanceStatus.PAID_LEAVE, AttendanceStatus.UNPAID_LEAVE, AttendanceStatus.ON_LEAVE):
                    code = 'L'
                elif dp.attendance_status == AttendanceStatus.PRESENT:
                    code = 'P'
                else:
                    code = 'P'

            existing_db_duties[(e_id, d_day)][s_id] = {
                'code': code,
                'site_name': s_name,
            }

        # 4. Check each touched (emp_id, day) for cross-location invariants
        for (emp_id, day), incoming_sites_map in emp_day_incoming.items():
            emp = employees.get(emp_id)
            emp_name = f"{emp.first_name} ({emp.display_code})" if emp else f"ID {emp_id}"

            # Merge incoming updates with existing DB duties at un-touched sites
            effective_site_codes = {}
            for s_id, s_info in existing_db_duties.get((emp_id, day), {}).items():
                if s_id not in incoming_sites_map:
                    effective_site_codes[s_id] = s_info['code']

            # Overlay incoming batch updates
            for s_id, code in incoming_sites_map.items():
                effective_site_codes[s_id] = code

            # Filter out empty codes for active validation
            active_duties = {
                s_id: code for s_id, code in effective_site_codes.items() if code != ''
            }

            if not active_duties:
                continue

            active_codes = list(active_duties.values())

            def get_site_display(s_id):
                if s_id in sites:
                    return sites[s_id].name
                db_info = existing_db_duties.get((emp_id, day), {}).get(s_id)
                if db_info:
                    return db_info['site_name']
                return 'Another Location'

            # -------------------------------------------------------------
            # RULE 1: At most 1 Present (P) per employee per date
            # -------------------------------------------------------------
            p_sites = [s for s, c in active_duties.items() if c == 'P']
            if len(p_sites) > 1:
                site_names = [get_site_display(s) for s in p_sites]
                raise ValidationError(
                    f"Guard {emp_name} cannot be marked Present (P) at multiple locations on Day {day} ({', '.join(site_names)}). "
                    f"Only 1 primary shift is permitted per day. Mark Overtime (O/OD) for additional locations."
                )

            # -------------------------------------------------------------
            # RULE 2: Present + Overtime (PO/POD) exclusivity
            # -------------------------------------------------------------
            combo_sites = [s for s, c in active_duties.items() if c in ('PO', 'POD')]
            if len(combo_sites) > 1:
                raise ValidationError(
                    f"Guard {emp_name} cannot be marked Present + Overtime (PO/POD) at multiple locations on Day {day}."
                )
            if len(combo_sites) == 1 and len(active_duties) > 1:
                combo_site_name = get_site_display(combo_sites[0])
                combo_code = active_duties[combo_sites[0]]
                other_sites = [get_site_display(s) for s in active_duties.keys() if s != combo_sites[0]]
                raise ValidationError(
                    f"Guard {emp_name} is marked {combo_code} at '{combo_site_name}' on Day {day}, which consumes their full 2-shift daily capacity. "
                    f"No conflicting duties can be marked at {', '.join(other_sites)}."
                )

            # -------------------------------------------------------------
            # RULE 3: Worked on Week Off (WP) exclusivity
            # -------------------------------------------------------------
            wp_sites = [s for s, c in active_duties.items() if c == 'WP']
            if len(wp_sites) > 1:
                raise ValidationError(
                    f"Guard {emp_name} cannot be marked Worked on Week Off (WP) at multiple locations on Day {day}."
                )
            if len(wp_sites) == 1 and len(active_duties) > 1:
                wp_site_name = get_site_display(wp_sites[0])
                other_sites = [get_site_display(s) for s in active_duties.keys() if s != wp_sites[0]]
                raise ValidationError(
                    f"Guard {emp_name} is marked Worked on Week Off (WP) at '{wp_site_name}' on Day {day}, which consumes their full daily capacity. "
                    f"No additional duties can be marked at {', '.join(other_sites)}."
                )

            # -------------------------------------------------------------
            # RULE 4: Overtime (O or OD) requires a valid P at a DIFFERENT location
            # -------------------------------------------------------------
            ot_sites = [s for s, c in active_duties.items() if c in ('O', 'OD')]
            if len(ot_sites) > 1:
                raise ValidationError(
                    f"Guard {emp_name} cannot have multiple Overtime (O/OD) shifts on Day {day}. Maximum 1 overtime shift allowed per day."
                )
            if len(ot_sites) == 1:
                ot_site_id = ot_sites[0]
                ot_site_name = get_site_display(ot_site_id)
                ot_code = active_duties[ot_site_id]

                if len(p_sites) == 0:
                    raise ValidationError(
                        f"Guard {emp_name} cannot be marked Overtime ({ot_code}) at '{ot_site_name}' on Day {day} without a valid primary Present (P) shift at another location."
                    )
                if ot_site_id in p_sites:
                    raise ValidationError(
                        f"Guard {emp_name} cannot be marked both Present (P) and Overtime ({ot_code}) separately at the same location ('{ot_site_name}') on Day {day}. "
                        f"Use '{'POD' if ot_code == 'OD' else 'PO'}' instead."
                    )

            # -------------------------------------------------------------
            # RULE 5: Absent (A) exclusivity
            # -------------------------------------------------------------
            a_sites = [s for s, c in active_duties.items() if c == 'A']
            if len(a_sites) > 1:
                raise ValidationError(
                    f"Guard {emp_name} cannot be marked Absent (A) at multiple locations on Day {day}. Absence is recorded against their primary duty location only."
                )
            if len(a_sites) == 1 and len(active_duties) > 1:
                a_site_name = get_site_display(a_sites[0])
                other_sites = [get_site_display(s) for s in active_duties.keys() if s != a_sites[0]]
                raise ValidationError(
                    f"Guard {emp_name} is marked Absent (A) at '{a_site_name}' on Day {day}. Cannot coexist with active duty at {', '.join(other_sites)}."
                )

            # -------------------------------------------------------------
            # RULE 6: Weekly Off (W) exclusivity
            # -------------------------------------------------------------
            w_sites = [s for s, c in active_duties.items() if c == 'W']
            if len(w_sites) > 1:
                raise ValidationError(
                    f"Guard {emp_name} cannot be marked Weekly Off (W) at multiple locations on Day {day}. Weekly off is recorded against their primary duty location only."
                )
            if len(w_sites) == 1 and len(active_duties) > 1:
                w_site_name = get_site_display(w_sites[0])
                other_sites = [get_site_display(s) for s in active_duties.keys() if s != w_sites[0]]
                raise ValidationError(
                    f"Guard {emp_name} is on Weekly Off (W) at '{w_site_name}' on Day {day}. If they worked on their off day, mark 'WP' (Worked Week Off) instead of combining W with active duty at {', '.join(other_sites)}."
                )

            # -------------------------------------------------------------
            # RULE 7: Leave (L) exclusivity
            # -------------------------------------------------------------
            l_sites = [s for s, c in active_duties.items() if c == 'L']
            if len(l_sites) >= 1 and any(c in ('P', 'O', 'OD', 'PO', 'POD', 'WP') for c in active_codes):
                raise ValidationError(
                    f"Guard {emp_name} is on Leave (L) on Day {day}. Cannot assign active duty (P/O/OD/PO/POD/WP) while on leave."
                )

        return {'normalized_updates': normalized_updates}
