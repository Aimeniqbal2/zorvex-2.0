import os

with open('hrm/models.py', 'a') as f:
    f.write('''
class AttendanceStatus(models.TextChoices):
    PRESENT = 'PRESENT', 'Present'
    ABSENT = 'ABSENT', 'Absent'
    LATE = 'LATE', 'Late'
    HALF_DAY = 'HALF_DAY', 'Half Day'
    ON_LEAVE = 'ON_LEAVE', 'On Leave'
    HOLIDAY = 'HOLIDAY', 'Holiday'
    OFF_DAY = 'OFF_DAY', 'Off Day'

class WorkforceAttendance(BaseModel):
    employee = models.ForeignKey(Employee, on_delete=models.RESTRICT, related_name='workforce_attendance')
    employment = models.ForeignKey(Employment, on_delete=models.SET_NULL, null=True, blank=True, related_name='workforce_attendance')
    date = models.DateField()
    check_in = models.DateTimeField(null=True, blank=True)
    check_out = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=AttendanceStatus.choices, default=AttendanceStatus.PRESENT)
    notes = models.TextField(blank=True, default='')
    source = models.CharField(max_length=50, blank=True, default='SYSTEM')
    
    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['company', 'employee', 'date'],
                condition=models.Q(is_deleted=False),
                name='unique_active_workforce_attendance'
            )
        ]
        
    def clean(self):
        super().clean()
        if self.employee_id and self.employee.company_id != self.company_id:
            raise ValidationError({'employee': 'Employee must belong to the same company.'})
        if self.employment_id and self.employment.company_id != self.company_id:
            raise ValidationError({'employment': 'Employment must belong to the same company.'})
        if self.employment_id and self.employee_id and self.employment.employee_id != self.employee_id:
            raise ValidationError({'employment': 'Employment must belong to the given employee.'})
        if self.check_in and self.check_out and self.check_out < self.check_in:
            raise ValidationError({'check_out': 'Check out cannot be before check in.'})

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.employee} - {self.date}"

class Shift(BaseModel):
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=30)
    start_time = models.TimeField()
    end_time = models.TimeField()
    break_duration = models.DurationField(null=True, blank=True)
    grace_period = models.DurationField(null=True, blank=True)
    is_overnight = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    
    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['company', 'name'],
                condition=models.Q(is_deleted=False),
                name='unique_active_shift_name'
            ),
            models.UniqueConstraint(
                fields=['company', 'code'],
                condition=models.Q(is_deleted=False),
                name='unique_active_shift_code'
            )
        ]
        
    def clean(self):
        super().clean()
        if self.start_time and self.end_time:
            if self.start_time > self.end_time and not self.is_overnight:
                raise ValidationError({'is_overnight': 'Shift must be overnight if start time > end time.'})

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name

class WorkSchedule(BaseModel):
    employee = models.ForeignKey(Employee, on_delete=models.RESTRICT, related_name='work_schedules')
    employment = models.ForeignKey(Employment, on_delete=models.SET_NULL, null=True, blank=True)
    shift = models.ForeignKey(Shift, on_delete=models.RESTRICT)
    effective_from = models.DateField()
    effective_to = models.DateField(null=True, blank=True)
    days_of_week = models.JSONField(default=list)
    is_active = models.BooleanField(default=True)
    
    def clean(self):
        super().clean()
        if self.employee_id and self.employee.company_id != self.company_id:
            raise ValidationError({'employee': 'Employee must belong to the same company.'})
        if self.employment_id and self.employment.company_id != self.company_id:
            raise ValidationError({'employment': 'Employment must belong to the same company.'})
        if self.shift_id and self.shift.company_id != self.company_id:
            raise ValidationError({'shift': 'Shift must belong to the same company.'})
        if self.effective_from and self.effective_to and self.effective_to < self.effective_from:
            raise ValidationError({'effective_to': 'Effective to cannot be before effective from.'})

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

class LeaveType(BaseModel):
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=30)
    description = models.TextField(blank=True, default='')
    is_paid = models.BooleanField(default=True)
    annual_allocation = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    carry_forward_allowed = models.BooleanField(default=False)
    max_carry_forward = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    requires_approval = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['company', 'name'],
                condition=models.Q(is_deleted=False),
                name='unique_active_leave_type_name'
            ),
            models.UniqueConstraint(
                fields=['company', 'code'],
                condition=models.Q(is_deleted=False),
                name='unique_active_leave_type_code'
            )
        ]

    def __str__(self):
        return self.name

class LeaveBalance(BaseModel):
    employee = models.ForeignKey(Employee, on_delete=models.RESTRICT, related_name='leave_balances')
    employment = models.ForeignKey(Employment, on_delete=models.SET_NULL, null=True, blank=True)
    leave_type = models.ForeignKey(LeaveType, on_delete=models.RESTRICT)
    year = models.IntegerField()
    allocated = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    carried_forward = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    used = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    pending = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    remaining = models.DecimalField(max_digits=5, decimal_places=2, default=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['company', 'employee', 'leave_type', 'year'],
                condition=models.Q(is_deleted=False),
                name='unique_active_leave_balance'
            )
        ]

    def clean(self):
        super().clean()
        if self.employee_id and self.employee.company_id != self.company_id:
            raise ValidationError({'employee': 'Employee must belong to the same company.'})
        if self.leave_type_id and self.leave_type.company_id != self.company_id:
            raise ValidationError({'leave_type': 'Leave type must belong to the same company.'})
        
        self.remaining = (self.allocated or 0) + (self.carried_forward or 0) - (self.used or 0) - (self.pending or 0)

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

class LeaveRequestStatus(models.TextChoices):
    DRAFT = 'DRAFT', 'Draft'
    PENDING = 'PENDING', 'Pending'
    APPROVED = 'APPROVED', 'Approved'
    REJECTED = 'REJECTED', 'Rejected'
    CANCELLED = 'CANCELLED', 'Cancelled'

class LeaveRequest(BaseModel):
    employee = models.ForeignKey(Employee, on_delete=models.RESTRICT, related_name='leave_requests')
    employment = models.ForeignKey(Employment, on_delete=models.SET_NULL, null=True, blank=True)
    leave_type = models.ForeignKey(LeaveType, on_delete=models.RESTRICT)
    start_date = models.DateField()
    end_date = models.DateField()
    requested_days = models.DecimalField(max_digits=5, decimal_places=2)
    reason = models.TextField(blank=True, default='')
    status = models.CharField(max_length=20, choices=LeaveRequestStatus.choices, default=LeaveRequestStatus.PENDING)
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='approved_leaves')
    approved_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True, default='')
    
    def clean(self):
        super().clean()
        if self.employee_id and self.employee.company_id != self.company_id:
            raise ValidationError({'employee': 'Employee must belong to the same company.'})
        if self.leave_type_id and self.leave_type.company_id != self.company_id:
            raise ValidationError({'leave_type': 'Leave type must belong to the same company.'})
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValidationError({'end_date': 'End date cannot be earlier than start date.'})
        if self.approved_by_id and hasattr(self.approved_by, "company_id") and self.approved_by.company_id != self.company_id:
            raise ValidationError({'approved_by': 'Approver must belong to the same company.'})

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

class Holiday(BaseModel):
    name = models.CharField(max_length=100)
    date = models.DateField()
    description = models.TextField(blank=True, default='')
    is_optional = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    
    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['company', 'date'],
                condition=models.Q(is_deleted=False),
                name='unique_active_holiday_date'
            )
        ]

class OvertimeStatus(models.TextChoices):
    PENDING = 'PENDING', 'Pending'
    APPROVED = 'APPROVED', 'Approved'
    REJECTED = 'REJECTED', 'Rejected'
    CANCELLED = 'CANCELLED', 'Cancelled'

class OvertimeRecord(BaseModel):
    employee = models.ForeignKey(Employee, on_delete=models.RESTRICT, related_name='overtime_records')
    employment = models.ForeignKey(Employment, on_delete=models.SET_NULL, null=True, blank=True)
    attendance = models.ForeignKey(WorkforceAttendance, on_delete=models.RESTRICT, null=True, blank=True)
    date = models.DateField()
    start_time = models.TimeField(null=True, blank=True)
    end_time = models.TimeField(null=True, blank=True)
    hours = models.DecimalField(max_digits=5, decimal_places=2)
    reason = models.TextField(blank=True, default='')
    status = models.CharField(max_length=20, choices=OvertimeStatus.choices, default=OvertimeStatus.PENDING)
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='approved_overtime')
    approved_at = models.DateTimeField(null=True, blank=True)
    
    def clean(self):
        super().clean()
        if self.employee_id and self.employee.company_id != self.company_id:
            raise ValidationError({'employee': 'Employee must belong to the same company.'})
        if self.attendance_id and self.attendance.company_id != self.company_id:
            raise ValidationError({'attendance': 'Attendance must belong to the same company.'})
        if self.attendance_id and self.attendance.employee_id != self.employee_id:
            raise ValidationError({'attendance': 'Attendance must belong to the same employee.'})
        if self.start_time and self.end_time and self.end_time <= self.start_time:
            raise ValidationError({'end_time': 'End time must be after start time.'})
        if self.approved_by_id and hasattr(self.approved_by, "company_id") and self.approved_by.company_id != self.company_id:
            raise ValidationError({'approved_by': 'Approver must belong to the same company.'})

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)
''')
