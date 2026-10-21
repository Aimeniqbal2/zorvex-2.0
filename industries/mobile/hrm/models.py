import uuid
from decimal import Decimal, ROUND_HALF_UP
from django.db import models
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
