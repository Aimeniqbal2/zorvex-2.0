import os

with open('hrm/models.py', 'a') as f:
    f.write('''

# ============================================================================
# PHASE 7D: UNIVERSAL PAYROLL FOUNDATION
# ============================================================================

class ComponentType(models.TextChoices):
    EARNING = 'EARNING', 'Earning'
    DEDUCTION = 'DEDUCTION', 'Deduction'

class CalculationType(models.TextChoices):
    FIXED = 'FIXED', 'Fixed Amount'
    PERCENTAGE = 'PERCENTAGE', 'Percentage'
    FORMULA = 'FORMULA', 'Formula'

class SalaryComponent(BaseModel):
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=30)
    description = models.TextField(blank=True, default='')
    component_type = models.CharField(max_length=20, choices=ComponentType.choices, default=ComponentType.EARNING)
    calculation_type = models.CharField(max_length=20, choices=CalculationType.choices, default=CalculationType.FIXED)
    is_taxable = models.BooleanField(default=True)
    is_recurring = models.BooleanField(default=True)
    display_order = models.IntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['display_order', 'name']
        constraints = [
            models.UniqueConstraint(
                fields=['company', 'code'],
                condition=models.Q(is_deleted=False),
                name='unique_active_salary_component_code'
            )
        ]

    def __str__(self):
        return f"{self.name} ({self.code})"

class SalaryStructure(BaseModel):
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=30)
    description = models.TextField(blank=True, default='')
    currency = models.ForeignKey('finance.Currency', on_delete=models.RESTRICT)
    effective_from = models.DateField()
    effective_to = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['-effective_from']
        constraints = [
            models.UniqueConstraint(
                fields=['company', 'code'],
                condition=models.Q(is_deleted=False),
                name='unique_active_salary_structure_code'
            )
        ]

    def clean(self):
        super().clean()
        if self.currency_id and self.currency.company_id != self.company_id:
            raise ValidationError({'currency': 'Currency must belong to the same company.'})
        if self.effective_from and self.effective_to and self.effective_to < self.effective_from:
            raise ValidationError({'effective_to': 'Effective to cannot be before effective from.'})

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.name} ({self.code})"

class SalaryStructureComponent(BaseModel):
    salary_structure = models.ForeignKey(SalaryStructure, on_delete=models.CASCADE, related_name='components')
    salary_component = models.ForeignKey(SalaryComponent, on_delete=models.RESTRICT, related_name='structure_components')
    sequence = models.IntegerField(default=0)
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    percentage = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    effective_from = models.DateField(null=True, blank=True)
    effective_to = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['sequence']

    def clean(self):
        super().clean()
        if self.salary_structure_id and self.salary_structure.company_id != self.company_id:
            raise ValidationError({'salary_structure': 'Salary structure must belong to the same company.'})
        if self.salary_component_id and self.salary_component.company_id != self.company_id:
            raise ValidationError({'salary_component': 'Salary component must belong to the same company.'})
        if self.effective_from and self.effective_to and self.effective_to < self.effective_from:
            raise ValidationError({'effective_to': 'Effective to cannot be before effective from.'})

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.salary_structure} - {self.salary_component}"


class EmployeeSalaryAssignment(BaseModel):
    employee = models.ForeignKey('Employee', on_delete=models.RESTRICT, related_name='salary_assignments')
    employment = models.ForeignKey('Employment', on_delete=models.SET_NULL, null=True, blank=True, related_name='salary_assignments')
    salary_structure = models.ForeignKey(SalaryStructure, on_delete=models.RESTRICT)
    currency = models.ForeignKey('finance.Currency', on_delete=models.RESTRICT)
    base_salary = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    effective_from = models.DateField()
    effective_to = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=20, default='ACTIVE')
    notes = models.TextField(blank=True, default='')

    class Meta:
        ordering = ['-effective_from']

    def clean(self):
        super().clean()
        if self.employee_id and self.employee.company_id != self.company_id:
            raise ValidationError({'employee': 'Employee must belong to the same company.'})
        if self.employment_id and self.employment.company_id != self.company_id:
            raise ValidationError({'employment': 'Employment must belong to the same company.'})
        if self.employment_id and self.employee_id and self.employment.employee_id != self.employee_id:
            raise ValidationError({'employment': 'Employment must belong to the given employee.'})
        if self.salary_structure_id and self.salary_structure.company_id != self.company_id:
            raise ValidationError({'salary_structure': 'Salary structure must belong to the same company.'})
        if self.currency_id and self.currency.company_id != self.company_id:
            raise ValidationError({'currency': 'Currency must belong to the same company.'})
        if self.effective_from and self.effective_to and self.effective_to < self.effective_from:
            raise ValidationError({'effective_to': 'Effective to cannot be before effective from.'})
        
        # Check overlapping active assignments
        if self.status == 'ACTIVE' and self.employee_id and self.effective_from:
            qs = EmployeeSalaryAssignment.objects.filter(
                company_id=self.company_id,
                employee_id=self.employee_id,
                status='ACTIVE',
                is_deleted=False
            ).exclude(pk=self.pk)
            for other in qs:
                if not (
                    (self.effective_to and other.effective_from and self.effective_to < other.effective_from) or
                    (self.effective_from and other.effective_to and self.effective_from > other.effective_to)
                ):
                    raise ValidationError('Overlapping active salary assignments are not allowed for the same employee.')

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)


class PayrollPeriodStatus(models.TextChoices):
    DRAFT = 'DRAFT', 'Draft'
    OPEN = 'OPEN', 'Open'
    PROCESSING = 'PROCESSING', 'Processing'
    FINALIZED = 'FINALIZED', 'Finalized'
    CLOSED = 'CLOSED', 'Closed'

class PayrollPeriod(BaseModel):
    name = models.CharField(max_length=100)
    start_date = models.DateField()
    end_date = models.DateField()
    payment_date = models.DateField()
    status = models.CharField(max_length=20, choices=PayrollPeriodStatus.choices, default=PayrollPeriodStatus.DRAFT)

    class Meta:
        ordering = ['-start_date']

    def clean(self):
        super().clean()
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValidationError({'end_date': 'End date cannot be earlier than start date.'})
        if self.payment_date and self.end_date and self.payment_date < self.end_date:
            raise ValidationError({'payment_date': 'Payment date cannot be earlier than end date.'})
        
        # Overlap prevention
        if self.start_date and self.end_date and self.status != PayrollPeriodStatus.CLOSED:
            qs = PayrollPeriod.objects.filter(
                company_id=self.company_id,
                is_deleted=False
            ).exclude(status=PayrollPeriodStatus.CLOSED).exclude(pk=self.pk)
            for other in qs:
                if not (self.end_date < other.start_date or self.start_date > other.end_date):
                    raise ValidationError('Overlapping active payroll periods are not allowed.')

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.name} ({self.start_date} to {self.end_date})"


class PayrollRunStatus(models.TextChoices):
    DRAFT = 'DRAFT', 'Draft'
    PROCESSING = 'PROCESSING', 'Processing'
    CALCULATED = 'CALCULATED', 'Calculated'
    FINALIZED = 'FINALIZED', 'Finalized'
    CANCELLED = 'CANCELLED', 'Cancelled'

class PayrollRun(BaseModel):
    payroll_period = models.ForeignKey(PayrollPeriod, on_delete=models.RESTRICT, related_name='runs')
    run_number = models.CharField(max_length=50)
    status = models.CharField(max_length=20, choices=PayrollRunStatus.choices, default=PayrollRunStatus.DRAFT)
    processed_at = models.DateTimeField(null=True, blank=True)
    finalized_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True, default='')
    finalized_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='finalized_payrolls')

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['company', 'run_number'],
                condition=models.Q(is_deleted=False),
                name='unique_active_payroll_run_number'
            )
        ]

    def clean(self):
        super().clean()
        if self.payroll_period_id and self.payroll_period.company_id != self.company_id:
            raise ValidationError({'payroll_period': 'Payroll period must belong to the same company.'})
        if self.finalized_by_id and hasattr(self.finalized_by, "company_id") and self.finalized_by.company_id != self.company_id:
            raise ValidationError({'finalized_by': 'User must belong to the same company.'})
        
        # In a finalized run, don't allow modifying core fields
        if self.pk:
            try:
                orig = PayrollRun.objects.get(pk=self.pk)
                if orig.status == PayrollRunStatus.FINALIZED and self.status != PayrollRunStatus.FINALIZED:
                     raise ValidationError({'status': 'Cannot un-finalize a finalized payroll run.'})
            except PayrollRun.DoesNotExist:
                pass

    def save(self, *args, **kwargs):
        from erp_core.models import DocumentSequence
        if not self.run_number:
            prefix = f"PR-{self.payroll_period.start_date.strftime('%Y%m')}"
            self.run_number = DocumentSequence.get_next_number(self.company, "PAYROLL_RUN", prefix)
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.run_number} - {self.payroll_period.name}"


class PayslipStatus(models.TextChoices):
    DRAFT = 'DRAFT', 'Draft'
    CALCULATED = 'CALCULATED', 'Calculated'
    FINALIZED = 'FINALIZED', 'Finalized'
    PAID = 'PAID', 'Paid'

class Payslip(BaseModel):
    payroll_run = models.ForeignKey(PayrollRun, on_delete=models.RESTRICT, related_name='payslips')
    employee = models.ForeignKey('Employee', on_delete=models.RESTRICT, related_name='payslips')
    employment = models.ForeignKey('Employment', on_delete=models.SET_NULL, null=True, blank=True)
    salary_assignment = models.ForeignKey(EmployeeSalaryAssignment, on_delete=models.RESTRICT)
    payslip_number = models.CharField(max_length=50)
    status = models.CharField(max_length=20, choices=PayslipStatus.choices, default=PayslipStatus.DRAFT)
    currency = models.ForeignKey('finance.Currency', on_delete=models.RESTRICT)
    gross_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    deduction_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    net_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['company', 'payslip_number'],
                condition=models.Q(is_deleted=False),
                name='unique_active_payslip_number'
            ),
            models.UniqueConstraint(
                fields=['company', 'payroll_run', 'employee'],
                condition=models.Q(is_deleted=False),
                name='unique_active_payslip_per_run'
            )
        ]

    def clean(self):
        super().clean()
        if self.payroll_run_id and self.payroll_run.company_id != self.company_id:
            raise ValidationError({'payroll_run': 'Payroll run must belong to the same company.'})
        if self.employee_id and self.employee.company_id != self.company_id:
            raise ValidationError({'employee': 'Employee must belong to the same company.'})
        if self.employment_id and self.employment.company_id != self.company_id:
            raise ValidationError({'employment': 'Employment must belong to the same company.'})
        if self.salary_assignment_id and self.salary_assignment.company_id != self.company_id:
            raise ValidationError({'salary_assignment': 'Salary assignment must belong to the same company.'})
        if self.currency_id and self.currency.company_id != self.company_id:
            raise ValidationError({'currency': 'Currency must belong to the same company.'})
            
        if self.pk:
            try:
                orig = Payslip.objects.get(pk=self.pk)
                if orig.status == PayslipStatus.FINALIZED and self.status not in (PayslipStatus.FINALIZED, PayslipStatus.PAID):
                    raise ValidationError({'status': 'Cannot revert a finalized payslip.'})
            except Payslip.DoesNotExist:
                pass

    def save(self, *args, **kwargs):
        from erp_core.models import DocumentSequence
        if not self.payslip_number:
            prefix = f"PS-{self.payroll_run.payroll_period.start_date.strftime('%Y%m')}"
            self.payslip_number = DocumentSequence.get_next_number(self.company, "PAYSLIP", prefix)
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.payslip_number} - {self.employee}"


class PayslipLine(BaseModel):
    payslip = models.ForeignKey(Payslip, on_delete=models.CASCADE, related_name='lines')
    salary_component = models.ForeignKey(SalaryComponent, on_delete=models.RESTRICT)
    description = models.CharField(max_length=255, blank=True, default='')
    component_type = models.CharField(max_length=20, choices=ComponentType.choices)
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    sequence = models.IntegerField(default=0)

    class Meta:
        ordering = ['sequence']

    def clean(self):
        super().clean()
        if self.payslip_id and self.payslip.company_id != self.company_id:
            raise ValidationError({'payslip': 'Payslip must belong to the same company.'})
        if self.salary_component_id and self.salary_component.company_id != self.company_id:
            raise ValidationError({'salary_component': 'Salary component must belong to the same company.'})

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)
''')
