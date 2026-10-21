import uuid
from decimal import Decimal
from rest_framework import serializers
from hrm.models import Employee, Department, Designation, EmployeeSalaryAssignment
from .models import TechnicianProfile, MobileMonthlyAttendance, MobileMonthlyPayroll, MobileDepartment

class TechnicianProfileSerializer(serializers.ModelSerializer):
    employee_name = serializers.SerializerMethodField(read_only=True)
    employee_code = serializers.CharField(source='employee.employee_code', read_only=True)
    department_display = serializers.CharField(source='get_department_type_display', read_only=True)
    basic_salary = serializers.SerializerMethodField(read_only=True)

    # Writable fields for updating / creating employee details
    first_name = serializers.CharField(write_only=True, required=False, allow_blank=True)
    last_name = serializers.CharField(write_only=True, required=False, allow_blank=True)
    emp_code = serializers.CharField(write_only=True, required=False, allow_blank=True)
    base_salary_input = serializers.DecimalField(
        write_only=True, required=False, max_digits=12, decimal_places=2
    )

    class Meta:
        model = TechnicianProfile
        fields = [
            'id',
            'employee',
            'employee_name',
            'employee_code',
            'department_type',
            'department_display',
            'shift_time',
            'late_grace_minutes',
            'half_day_cutoff_minutes',
            'allowed_half_days',
            'allowed_medical_half_days',
            'ot_hourly_rate',
            'basic_salary',
            'phone_1_model',
            'phone_1_imei_1',
            'phone_1_imei_2',
            'phone_2_model',
            'phone_2_imei_1',
            'phone_2_imei_2',
            'first_name',
            'last_name',
            'emp_code',
            'base_salary_input',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_employee_name(self, obj) -> str:
        if obj.employee:
            return f"{obj.employee.first_name} {obj.employee.last_name}".strip()
        return ''

    def get_basic_salary(self, obj) -> float:
        if not obj.employee:
            return 20000.0
        company = obj.company
        assignment = EmployeeSalaryAssignment.objects.filter(
            employee=obj.employee,
            company=company,
            status='ACTIVE',
            is_deleted=False
        ).first()
        if assignment and assignment.base_salary:
            return float(assignment.base_salary)
        return 20000.0

    def create(self, validated_data):
        first_name = validated_data.pop('first_name', '').strip()
        last_name = validated_data.pop('last_name', '').strip()
        emp_code = validated_data.pop('emp_code', '').strip()
        base_salary_input = validated_data.pop('base_salary_input', None)

        employee = validated_data.get('employee')
        company = validated_data.get('company')

        if not employee:
            if not first_name:
                raise serializers.ValidationError({"first_name": "First name is required to create a technician."})
            
            dept_type = validated_data.get('department_type', MobileDepartment.HARDWARE)
            dept_obj, _ = Department.objects.get_or_create(
                company=company,
                name=dept_type.capitalize()
            )
            
            employee = Employee.objects.create(
                company=company,
                employee_code=emp_code or f"EMP-{uuid.uuid4().hex[:5].upper()}",
                first_name=first_name,
                last_name=last_name,
                department=dept_obj,
                is_active=True,
                classification='DIRECT',
                employment_status='ACTIVE'
            )
            validated_data['employee'] = employee

        profile = super().create(validated_data)

        if base_salary_input is not None and company:
            EmployeeSalaryAssignment.objects.update_or_create(
                company=company,
                employee=employee,
                status='ACTIVE',
                defaults={'base_salary': base_salary_input}
            )

        return profile

    def update(self, instance, validated_data):
        first_name = validated_data.pop('first_name', None)
        last_name = validated_data.pop('last_name', None)
        emp_code = validated_data.pop('emp_code', None)
        base_salary_input = validated_data.pop('base_salary_input', None)

        emp = instance.employee
        if emp:
            emp_updated = False
            if first_name is not None and first_name.strip():
                emp.first_name = first_name.strip()
                emp_updated = True
            if last_name is not None:
                emp.last_name = last_name.strip()
                emp_updated = True
            if emp_code is not None and emp_code.strip():
                emp.employee_code = emp_code.strip()
                emp_updated = True
            if emp_updated:
                emp.save(update_fields=['first_name', 'last_name', 'employee_code', 'updated_at'])

            if base_salary_input is not None:
                EmployeeSalaryAssignment.objects.update_or_create(
                    company=instance.company,
                    employee=emp,
                    status='ACTIVE',
                    defaults={'base_salary': base_salary_input}
                )

        return super().update(instance, validated_data)


class MobileMonthlyAttendanceSerializer(serializers.ModelSerializer):
    employee_name = serializers.SerializerMethodField(read_only=True)
    employee_code = serializers.CharField(source='employee.employee_code', read_only=True)

    class Meta:
        model = MobileMonthlyAttendance
        fields = [
            'id',
            'employee',
            'employee_name',
            'employee_code',
            'year',
            'month',
            'days_data',
            'present_count',
            'late_count',
            'half_day_count',
            'holiday_count',
            'overtime_hours',
            'allowed_half_day_count',
            'allowed_holiday_count',
            'notes',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_employee_name(self, obj) -> str:
        if obj.employee:
            return f"{obj.employee.first_name} {obj.employee.last_name}".strip()
        return ''


class MobileMonthlyPayrollSerializer(serializers.ModelSerializer):
    employee_name = serializers.SerializerMethodField(read_only=True)
    employee_code = serializers.CharField(source='employee.employee_code', read_only=True)
    department = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = MobileMonthlyPayroll
        fields = [
            'id',
            'employee',
            'employee_name',
            'employee_code',
            'department',
            'year',
            'month',
            'basic_salary',
            'bonus_time',
            'bonus_zero_holiday',
            'overtime_hours',
            'overtime_rate',
            'overtime_pay',
            'pay_and_allowances',
            'late_count',
            'late_deduction',
            'half_day_count',
            'half_day_deduction',
            'holiday_count',
            'holiday_deduction',
            'penalty',
            'total_attendance_deduction',
            'loan_principal',
            'loan_deduction',
            'loan_balance',
            'damaged_parts',
            'bill_deduction',
            'total_other_deductions',
            'gross_total',
            'status',
            'disbursement_date',
            'notes',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_employee_name(self, obj) -> str:
        if obj.employee:
            return f"{obj.employee.first_name} {obj.employee.last_name}".strip()
        return ''

    def get_department(self, obj) -> str:
        if not obj.employee:
            return 'General'
        tech = getattr(obj.employee, 'mobile_technician_profile', None)
        if tech:
            return tech.get_department_type_display()
        return obj.employee.department.name if obj.employee.department else 'General'
