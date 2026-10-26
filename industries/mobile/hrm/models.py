import uuid
from decimal import Decimal, ROUND_HALF_UP
from django.db import models
from django.utils import timezone
from erp_core.models import BaseModel

class MobileDepartment(models.TextChoices):
    HARDWARE = 'HARDWARE', 'Hardware'
    SOFTWARE = 'SOFTWARE', 'Software'
    PANEL_GLASS = 'PANEL_GLASS', 'Panel / Glass'
    SALES = 'SALES', 'Sales / W.O'
    MANAGEMENT = 'MANAGEMENT', 'Management'


class TechnicianProfile(BaseModel):
    """
    Mobile Repair & Services Technician / Staff Extension.
    Tracks specialized shop attributes: department, shifts, grace periods,
    allowed medical/half days, overtime rate, and assigned test phones/IMEIs.
    """
    employee = models.OneToOneField(
        'hrm.Employee',
        on_delete=models.CASCADE,
        related_name='mobile_technician_profile'
    )
    department_type = models.CharField(
        max_length=50,
        choices=MobileDepartment.choices,
        default=MobileDepartment.HARDWARE
    )
    shift_time = models.TimeField(
        default='12:00:00',
        help_text="Standard shift start time (e.g. 12:00:00)"
    )
    late_grace_minutes = models.PositiveIntegerField(
        default=10,
        help_text="Grace period in minutes. Arrival after shift_time + grace_minutes is marked Late (L)"
    )
    half_day_cutoff_minutes = models.PositiveIntegerField(
        default=60,
        help_text="Cut-off in minutes (e.g. 60 mins). Arrival after cutoff is marked Half Day (D)"
    )
    allowed_half_days = models.PositiveIntegerField(
        default=0,
        help_text="Monthly allowed half days quota"
    )
    allowed_medical_half_days = models.PositiveIntegerField(
        default=1,
        help_text="Monthly allowed medical half days quota"
    )
    ot_hourly_rate = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal('250.00'),
        help_text="Overtime rate per hour (default 150 for basic <= 18000, 250 for basic > 18000)"
    )

    # Assigned Testing Phones & Device Inventory (from Softech shop standards)
    phone_1_model = models.CharField(max_length=100, blank=True, default='')
    phone_1_imei_1 = models.CharField(max_length=50, blank=True, default='')
    phone_1_imei_2 = models.CharField(max_length=50, blank=True, default='')
    phone_2_model = models.CharField(max_length=100, blank=True, default='')
    phone_2_imei_1 = models.CharField(max_length=50, blank=True, default='')
    phone_2_imei_2 = models.CharField(max_length=50, blank=True, default='')

    # Extended Personal Details & Shop Records
    cnic = models.CharField(max_length=30, blank=True, default='')
    emergency_contact_name = models.CharField(max_length=100, blank=True, default='')
    emergency_contact_phone = models.CharField(max_length=50, blank=True, default='')
    residential_address = models.TextField(blank=True, default='')
    blood_group = models.CharField(max_length=10, blank=True, default='')
    photo_url = models.CharField(max_length=500, blank=True, default='')
    document_urls = models.JSONField(default=list, blank=True, help_text="Uploaded docs: [{'name': 'CNIC Front', 'url': '...'}, ...]")

    class Meta:
        ordering = ['employee__first_name']

    def __str__(self):
        return f"{self.employee.first_name} ({self.get_department_type_display()}) - {self.company.name if self.company else ''}"


class MobileAttendanceCode(models.TextChoices):
    PRESENT = 'P', 'Present (On Time)'
    LATE = 'L', 'Late'
    HALF_DAY = 'D', 'Half Day (Unapproved)'
    HOLIDAY = 'H', 'Holiday / Absent (Unapproved)'
    OVERTIME = 'O', 'Overtime'
    HALF_DAY_ALLOW = 'DA', 'Half Day (Allowed / Medical)'
    HOLIDAY_ALLOW = 'HA', 'Holiday (Allowed / Off Day)'


class MobileMonthlyAttendance(BaseModel):
    """
    30-Day Monthly Attendance Grid for Mobile Repair Staff.
    Stores daily attendance codes ('P', 'L', 'D', 'H', 'O', 'DA', 'HA')
    and aggregate summary counts matching Softech's Data Sheet.
    """
    employee = models.ForeignKey(
        'hrm.Employee',
        on_delete=models.CASCADE,
        related_name='mobile_attendance_records'
    )
    year = models.PositiveIntegerField()
    month = models.PositiveIntegerField()
    days_data = models.JSONField(
        default=dict,
        help_text="Day map: {'1': 'P', '2': 'P', '3': 'HA', ...}"
    )

    # Aggregate summaries
    present_count = models.PositiveIntegerField(default=0)
    late_count = models.PositiveIntegerField(default=0)
    half_day_count = models.PositiveIntegerField(default=0)
    holiday_count = models.PositiveIntegerField(default=0)
    overtime_hours = models.DecimalField(max_digits=6, decimal_places=2, default=Decimal('0.00'))
    allowed_half_day_count = models.PositiveIntegerField(default=0)
    allowed_holiday_count = models.PositiveIntegerField(default=0)

    notes = models.TextField(blank=True, default='')

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['company', 'employee', 'year', 'month'],
                condition=models.Q(is_deleted=False),
                name='unique_mobile_monthly_attendance'
            )
        ]
        ordering = ['-year', '-month', 'employee__first_name']

    def __str__(self):
        return f"{self.employee.first_name} Attendance {self.year}-{self.month:02d}"

    def recalculate_counters(self):
        """Tally attendance codes directly from days_data dictionary."""
        p_count = 0
        l_count = 0
        d_count = 0
        h_count = 0
        o_count = Decimal('0.00')
        da_count = 0
        ha_count = 0

        for day_val in self.days_data.values():
            code = str(day_val).strip().upper()
            if code == 'P':
                p_count += 1
            elif code == 'L':
                l_count += 1
            elif code == 'D':
                d_count += 1
            elif code == 'H':
                h_count += 1
            elif code == 'O':
                o_count += Decimal('1.00')
            elif code == 'DA':
                da_count += 1
            elif code == 'HA':
                ha_count += 1

        self.present_count = p_count
        self.late_count = l_count
        self.half_day_count = d_count
        self.holiday_count = h_count
        self.overtime_hours = o_count
        self.allowed_half_day_count = da_count
        self.allowed_holiday_count = ha_count


class MobileMonthlyPayroll(BaseModel):
    """
    Mobile Repair Industry Monthly Salary Calculation & Slip Record.
    Implements Softech's exact formula matrix:
      - Bonus - Time: Rs. 1,000 if late < 3 and holiday == 0
      - Bonus - Zero Holiday: Rs. 1,000 if half_days < 3 and holiday == 0
      - Overtime: hours * (150 if basic <= 18000 else 250)
      - Late Deduction: if late > 2: (basic / 30) * (late / 3)
      - Half Day Deduction: (basic / 30) * (half_days / 2)
      - Holiday Deduction: (basic / 30) * holiday
      - Penalty: Rs. 1,000 if holiday >= 1
      - Damaged parts, loan deduction, and net gross total
    """
    STATUS_CHOICES = (
        ('DRAFT', 'Draft / Calculated'),
        ('APPROVED', 'Approved'),
        ('PAID', 'Disbursed / Paid'),
    )

    employee = models.ForeignKey(
        'hrm.Employee',
        on_delete=models.CASCADE,
        related_name='mobile_payroll_records'
    )
    year = models.PositiveIntegerField()
    month = models.PositiveIntegerField()

    # Section 1: Allowance & Facilities
    basic_salary = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    bonus_time = models.DecimalField(
        max_digits=12, decimal_places=2, default=Decimal('0.00'),
        help_text="Bonus - Time: Rs. 1,000 if late < 3 and unapproved holiday == 0"
    )
    bonus_zero_holiday = models.DecimalField(
        max_digits=12, decimal_places=2, default=Decimal('0.00'),
        help_text="Bonus - Zero Holiday: Rs. 1,000 if half_days < 3 and unapproved holiday == 0"
    )
    overtime_hours = models.DecimalField(max_digits=6, decimal_places=2, default=Decimal('0.00'))
    overtime_rate = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('250.00'))
    overtime_pay = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    pay_and_allowances = models.DecimalField(
        max_digits=12, decimal_places=2, default=Decimal('0.00'),
        help_text="Sum of Basic + Bonus Time + Bonus Zero Holiday + Overtime Pay"
    )

    # Section 2: Attendance Chart & Deductions
    late_count = models.PositiveIntegerField(default=0)
    late_deduction = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    half_day_count = models.PositiveIntegerField(default=0)
    half_day_deduction = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    holiday_count = models.PositiveIntegerField(default=0)
    holiday_deduction = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    penalty = models.DecimalField(
        max_digits=12, decimal_places=2, default=Decimal('0.00'),
        help_text="Flat penalty Rs. 1,000 if unapproved holiday >= 1"
    )
    total_attendance_deduction = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))

    # Section 3: Loan & Incident Deductions
    loan_principal = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    loan_deduction = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    loan_balance = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    damaged_parts = models.DecimalField(
        max_digits=12, decimal_places=2, default=Decimal('0.00'),
        help_text="Damaged displays, glass, or parts charged to technician"
    )
    bill_deduction = models.DecimalField(
        max_digits=12, decimal_places=2, default=Decimal('0.00'),
        help_text="Utility / Phone bill"
    )
    total_other_deductions = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))

    # Section 4: Net Pay
    gross_total = models.DecimalField(
        max_digits=12, decimal_places=2, default=Decimal('0.00'),
        help_text="Net Take-Home = Pay & Allowance - Total Attendance Deduction - Total Other Deductions"
    )

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='DRAFT')
    disbursement_date = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True, default='')

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['company', 'employee', 'year', 'month'],
                condition=models.Q(is_deleted=False),
                name='unique_mobile_monthly_payroll'
            )
        ]
        ordering = ['-year', '-month', 'employee__first_name']

    def __str__(self):
        return f"{self.employee.first_name} Payroll {self.year}-{self.month:02d}: Net Rs. {self.gross_total}"


DEFAULT_SOFTECH_POLICY = """SOFTECH MOBILE (SERVICE & SALE)
Rules & Regulations

1. If An Employee comes whole month on time (1 or 2 Late) with 0 Uninformed holiday in a month, they will be rewarded with Rs. 1,000 Bonus Amount with salary.
2. If An Employee comes whole month with Zero Holiday, they will be Rewarded 1 Full Day of Salary.
3. Employees have relief of 10 minutes in their shift time before being marked Late (L).
4. Last time to enter in lab is 01:00 hour after shift start time for Technical / W.O Staff.
5. 1 Half Day quota per month is allowed with prior approval and confirmation.
6. Request permission 2 days before for Half Day. Once administration approves, confirmation will be issued. (Consistent late or non-punctuality will lead to warnings).
7. Example for Half Day: Request permission on 01 January or before for Half Day required on 03 January.
8. Penalty of Rs. 1,000 will be imposed on unapproved holiday / absence.
9. Saturday unapproved holiday will mark Sunday holiday as well.
10. Personal private work is strictly not allowed at the work place.
11. Personal mobile phones will be repaired free of cost (labour charge waived).
12. Friday / Ramzan prayers will be offered in groups, one technician from each table at a time.
13. No PD & Salary Advances / Loans will be provided without executive management approval.
14. External mobile phones / customer devices are not allowed in the work area except assigned testing devices. Any unauthorized device found will be dealt with strictly.
15. All departments are divided (Hardware, Software, Panel/Glass, Sales, Management); staff should focus strictly on their designated departmental duties.
16. Consistent lateness and uninformed holidays will result in formal disciplinary warnings."""


class CompanyPolicy(BaseModel):
    """
    Company-wide Rules & Regulations policy.
    Editable by Company Admin, branded with company logo and name, auto-propagates across tenant.
    """
    title = models.CharField(max_length=255, default='Rules & Regulations')
    content = models.TextField(default=DEFAULT_SOFTECH_POLICY)
    effective_date = models.DateField(default=timezone.localdate)
    version = models.CharField(max_length=20, default='1.0')
    is_active = models.BooleanField(default=True)
    created_by_name = models.CharField(max_length=100, default='Administration')

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.title} v{self.version} - {self.company.name if self.company else ''}"


class OnboardingStatus(models.TextChoices):
    APPLIED = 'APPLIED', 'Applied'
    INTERVIEWING = 'INTERVIEWING', 'Interviewing'
    OFFERED = 'OFFERED', 'Offered'
    HIRED = 'HIRED', 'Hired / Converted'
    REJECTED = 'REJECTED', 'Rejected'


class OnboardingCandidate(BaseModel):
    """
    Hiring & Onboarding pipeline for workshop technicians and staff.
    Stores interview terms, appointment letter parameters (Softech template), and first-week checklist.
    """
    full_name = models.CharField(max_length=150)
    phone = models.CharField(max_length=50, blank=True, default='')
    email = models.EmailField(blank=True, default='')
    address = models.TextField(blank=True, default='1st floor Shop#169 Star City Mall, Saddar, Karachi.')
    position = models.CharField(max_length=100, default='Mobile Hardware Technician')
    department_type = models.CharField(
        max_length=50,
        choices=MobileDepartment.choices,
        default=MobileDepartment.HARDWARE
    )
    offered_salary = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('20000.00'))
    allowance = models.CharField(max_length=150, blank=True, default='-')
    backup_work = models.CharField(max_length=150, blank=True, default='-')
    working_hours = models.CharField(max_length=100, default='11:00 to 9:00 (Closing)')
    notice_period = models.CharField(max_length=100, default='One Month')
    appointment_date = models.DateField(null=True, blank=True)
    appointment_month = models.CharField(max_length=50, blank=True, default='June')
    ceo_name = models.CharField(max_length=100, default='Sheikh Muhammad Afnan')
    director_name = models.CharField(max_length=100, default='Shahzaib Ali')
    status = models.CharField(
        max_length=30,
        choices=OnboardingStatus.choices,
        default=OnboardingStatus.APPLIED
    )
    first_week_checklist = models.JSONField(
        default=dict,
        help_text="Checklist: {'shop_induction': true, 'toolset_issued': false, 'policy_signed': false, 'login_created': false}"
    )
    notes = models.TextField(blank=True, default='')

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.full_name} ({self.position}) - {self.status}"


class LeaveType(models.TextChoices):
    CASUAL = 'CASUAL', 'Casual Leave'
    SICK = 'SICK', 'Sick / Medical'
    HALF_DAY = 'HALF_DAY', 'Half Day (Relief)'
    EMERGENCY = 'EMERGENCY', 'Emergency Leave'


class LeaveRequestStatus(models.TextChoices):
    PENDING = 'PENDING', 'Pending Admin Review'
    APPROVED = 'APPROVED', 'Approved'
    REJECTED = 'REJECTED', 'Rejected'


class EmployeeLeaveRequest(BaseModel):
    """
    Employee permission & leave request workflow.
    Submitted by staff (self-service) and reviewed by Company Admin.
    """
    employee = models.ForeignKey(
        'hrm.Employee',
        on_delete=models.CASCADE,
        related_name='mobile_leave_requests'
    )
    leave_type = models.CharField(
        max_length=30,
        choices=LeaveType.choices,
        default=LeaveType.HALF_DAY
    )
    request_date = models.DateField()
    advance_notice_days = models.PositiveIntegerField(
        default=2,
        help_text="Days in advance notification (e.g. 2 days)"
    )
    reason = models.TextField()
    status = models.CharField(
        max_length=20,
        choices=LeaveRequestStatus.choices,
        default=LeaveRequestStatus.PENDING
    )
    admin_notes = models.TextField(blank=True, default='')

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.employee.first_name} - {self.get_leave_type_display()} on {self.request_date} ({self.status})"


class ExitClearanceStatus(models.TextChoices):
    PENDING = 'PENDING', 'Notice Period Active'
    CLEARANCE = 'CLEARANCE', 'Under Clearance'
    COMPLETED = 'COMPLETED', 'Exit Completed / Relieved'
    WITHDRAWN = 'WITHDRAWN', 'Withdrawn'


class EmployeeExitRequest(BaseModel):
    """
    Resignation and exit workflow with 1-month notice period countdown and handover checklist.
    """
    employee = models.ForeignKey(
        'hrm.Employee',
        on_delete=models.CASCADE,
        related_name='mobile_exit_requests'
    )
    resignation_date = models.DateField()
    last_working_day = models.DateField()
    reason = models.TextField()
    handover_completed = models.BooleanField(default=False)
    devices_returned = models.BooleanField(default=False)
    clearance_status = models.CharField(
        max_length=20,
        choices=ExitClearanceStatus.choices,
        default=ExitClearanceStatus.PENDING
    )
    admin_remarks = models.TextField(blank=True, default='')

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.employee.first_name} Exit ({self.clearance_status}) - LWD {self.last_working_day}"

    @property
    def days_remaining(self) -> int:
        import datetime
        if not self.last_working_day:
            return 0
        diff = (self.last_working_day - datetime.date.today()).days
        return max(0, diff)

