import uuid
from decimal import Decimal
from rest_framework import serializers
from hrm.models import Employee, Department, Designation, EmployeeSalaryAssignment
from .models import (
    TechnicianProfile, MobileMonthlyAttendance, MobileMonthlyPayroll, MobileDepartment,
    CompanyPolicy, OnboardingCandidate, EmployeeLeaveRequest, EmployeeExitRequest
)

class TechnicianProfileSerializer(serializers.ModelSerializer):
    employee = serializers.PrimaryKeyRelatedField(
        queryset=Employee.objects.all(),
        required=False,
        allow_null=True
    )
    employee_name = serializers.SerializerMethodField(read_only=True)
    employee_code = serializers.CharField(source='employee.employee_code', read_only=True)
    department_display = serializers.CharField(source='get_department_type_display', read_only=True)
    basic_salary = serializers.SerializerMethodField(read_only=True)
    has_portal_access = serializers.SerializerMethodField(read_only=True)
    portal_username = serializers.SerializerMethodField(read_only=True)
    portal_role = serializers.SerializerMethodField(read_only=True)

    email = serializers.CharField(required=False, allow_blank=True, default='')
    phone = serializers.CharField(required=False, allow_blank=True, default='')

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
            'email',
            'phone',
            'department_type',
            'department_display',
            'shift_time',
            'late_grace_minutes',
            'half_day_cutoff_minutes',
            'allowed_half_days',
            'allowed_medical_half_days',
            'ot_hourly_rate',
            'basic_salary',
            'has_portal_access',
            'portal_username',
            'portal_role',
            'phone_1_model',
            'phone_1_imei_1',
            'phone_1_imei_2',
            'phone_2_model',
            'phone_2_imei_1',
            'phone_2_imei_2',
            'cnic',
            'emergency_contact_name',
            'emergency_contact_phone',
            'residential_address',
            'blood_group',
            'photo_url',
            'document_urls',
            'first_name',
            'last_name',
            'emp_code',
            'base_salary_input',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_has_portal_access(self, obj) -> bool:
        return bool(obj.employee and obj.employee.user and obj.employee.user.is_active)

    def get_portal_username(self, obj) -> str:
        if obj.employee and obj.employee.user:
            return obj.employee.user.username
        return ''

    def get_portal_role(self, obj) -> str:
        if obj.employee and obj.employee.user:
            return obj.employee.user.role
        return ''

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

    def to_representation(self, instance):
        data = super().to_representation(instance)
        emp = instance.employee
        if emp:
            if not data.get('cnic') and emp.cnic_number:
                data['cnic'] = emp.cnic_number
            if not data.get('residential_address') and emp.current_address:
                data['residential_address'] = emp.current_address
            data['email'] = emp.email or ''
            data['phone'] = emp.phone or ''
        return data

    def create(self, validated_data):
        first_name = validated_data.pop('first_name', '').strip()
        last_name = validated_data.pop('last_name', '').strip()
        emp_code = validated_data.pop('emp_code', '').strip()
        base_salary_input = validated_data.pop('base_salary_input', None)
        email = validated_data.pop('email', '').strip()
        phone = validated_data.pop('phone', '').strip()
        cnic = validated_data.get('cnic', '').strip()
        residential_address = validated_data.get('residential_address', '').strip()

        employee = validated_data.get('employee')
        company = validated_data.get('company')
        if not company and 'company_id' in validated_data:
            from companies.models import Company
            company = Company.objects.filter(id=validated_data['company_id']).first()
            validated_data['company'] = company
        if not company:
            from platform_core.models import get_current_company
            company = get_current_company()
            if company:
                validated_data['company'] = company

        if not employee:
            if not first_name:
                raise serializers.ValidationError({"first_name": "First name is required to register employee/technician."})
            
            dept_type = validated_data.get('department_type', MobileDepartment.HARDWARE)
            dept_obj, _ = Department.objects.get_or_create(
                company=company,
                name=dept_type.capitalize()
            )
            if not emp_code:
                count = Employee.objects.filter(company=company).count() + 1
                emp_code = f"EMP{count:02d}"

            employee = Employee.objects.create(
                company=company,
                employee_code=emp_code,
                first_name=first_name,
                last_name=last_name,
                email=email,
                phone=phone,
                cnic_number=cnic,
                current_address=residential_address,
                department=dept_obj,
                is_active=True,
                classification='DIRECT',
                employment_status='ACTIVE'
            )
            validated_data['employee'] = employee

        profile = super().create(validated_data)

        if company and employee:
            import datetime
            from finance.models import Currency
            currency, _ = Currency.objects.get_or_create(
                company=company,
                code='PKR',
                defaults={'name': 'Pakistani Rupee', 'symbol': 'Rs.'}
            )

            salary_val = base_salary_input if base_salary_input is not None else Decimal('20000.00')
            try:
                EmployeeSalaryAssignment.objects.update_or_create(
                    company=company,
                    employee=employee,
                    status='ACTIVE',
                    defaults={
                        'base_salary': salary_val,
                        'currency': currency,
                        'effective_from': datetime.date(2026, 1, 1)
                    }
                )
            except Exception as e:
                pass

            # Auto-create attendance and payroll for current session (2026, 9)
            try:
                from .models import MobileMonthlyAttendance
                from .services.payroll_service import MobilePayrollService
                att, _ = MobileMonthlyAttendance.objects.get_or_create(
                    company=company,
                    employee=employee,
                    year=2026,
                    month=9,
                    defaults={'days_data': {str(d): 'P' for d in range(1, 31)}}
                )
                att.recalculate_counters()
                att.save()

                MobilePayrollService.save_or_update_payroll(
                    company=company,
                    employee=employee,
                    year=2026,
                    month=9,
                    data={'basic_salary': salary_val}
                )
            except Exception as e:
                pass

        return profile

    def update(self, instance, validated_data):
        first_name = validated_data.pop('first_name', None)
        last_name = validated_data.pop('last_name', None)
        emp_code = validated_data.pop('emp_code', None)
        base_salary_input = validated_data.pop('base_salary_input', None)
        email = validated_data.pop('email', None)
        phone = validated_data.pop('phone', None)
        cnic = validated_data.get('cnic', None)
        residential_address = validated_data.get('residential_address', None)

        emp = instance.employee
        if emp:
            emp_updated = False
            fields_to_update = ['updated_at']
            if first_name is not None and first_name.strip():
                emp.first_name = first_name.strip()
                fields_to_update.append('first_name')
                emp_updated = True
            if last_name is not None:
                emp.last_name = last_name.strip()
                fields_to_update.append('last_name')
                emp_updated = True
            if emp_code is not None and emp_code.strip():
                emp.employee_code = emp_code.strip()
                fields_to_update.append('employee_code')
                emp_updated = True
            if email is not None:
                emp.email = email.strip()
                fields_to_update.append('email')
                emp_updated = True
            if phone is not None:
                emp.phone = phone.strip()
                fields_to_update.append('phone')
                emp_updated = True
            if cnic is not None and cnic.strip():
                emp.cnic_number = cnic.strip()
                fields_to_update.append('cnic_number')
                emp_updated = True
            if residential_address is not None and residential_address.strip():
                emp.current_address = residential_address.strip()
                fields_to_update.append('current_address')
                emp_updated = True
            if emp_updated:
                emp.save(update_fields=fields_to_update)

            if base_salary_input is not None and instance.company:
                import datetime
                from finance.models import Currency
                currency, _ = Currency.objects.get_or_create(
                    company=instance.company,
                    code='PKR',
                    defaults={'name': 'Pakistani Rupee', 'symbol': 'Rs.'}
                )
                try:
                    EmployeeSalaryAssignment.objects.update_or_create(
                        company=instance.company,
                        employee=emp,
                        status='ACTIVE',
                        defaults={
                            'base_salary': base_salary_input,
                            'currency': currency,
                            'effective_from': datetime.date(2026, 1, 1)
                        }
                    )
                except Exception as e:
                    pass

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


class CompanyPolicySerializer(serializers.ModelSerializer):
    effective_date = serializers.SerializerMethodField()

    class Meta:
        model = CompanyPolicy
        fields = [
            'id',
            'title',
            'content',
            'effective_date',
            'version',
            'is_active',
            'created_by_name',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_effective_date(self, obj):
        if not obj.effective_date:
            return None
        if hasattr(obj.effective_date, 'date'):
            return obj.effective_date.date().isoformat()
        return str(obj.effective_date)


class OnboardingCandidateSerializer(serializers.ModelSerializer):
    department_display = serializers.CharField(source='get_department_type_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = OnboardingCandidate
        fields = [
            'id',
            'full_name',
            'phone',
            'email',
            'address',
            'position',
            'department_type',
            'department_display',
            'offered_salary',
            'allowance',
            'backup_work',
            'working_hours',
            'notice_period',
            'appointment_date',
            'appointment_month',
            'ceo_name',
            'director_name',
            'status',
            'status_display',
            'first_week_checklist',
            'notes',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class EmployeeLeaveRequestSerializer(serializers.ModelSerializer):
    employee_name = serializers.SerializerMethodField(read_only=True)
    employee_code = serializers.CharField(source='employee.employee_code', read_only=True)
    department_display = serializers.SerializerMethodField(read_only=True)
    leave_type_display = serializers.CharField(source='get_leave_type_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = EmployeeLeaveRequest
        fields = [
            'id',
            'employee',
            'employee_name',
            'employee_code',
            'department_display',
            'leave_type',
            'leave_type_display',
            'request_date',
            'advance_notice_days',
            'reason',
            'status',
            'status_display',
            'admin_notes',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_employee_name(self, obj) -> str:
        if obj.employee:
            return f"{obj.employee.first_name} {obj.employee.last_name}".strip()
        return ''

    def get_department_display(self, obj) -> str:
        if obj.employee and hasattr(obj.employee, 'mobile_technician_profile'):
            return obj.employee.mobile_technician_profile.get_department_type_display()
        return 'General'


class EmployeeExitRequestSerializer(serializers.ModelSerializer):
    employee_name = serializers.SerializerMethodField(read_only=True)
    employee_code = serializers.CharField(source='employee.employee_code', read_only=True)
    clearance_status_display = serializers.CharField(source='get_clearance_status_display', read_only=True)
    days_remaining = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = EmployeeExitRequest
        fields = [
            'id',
            'employee',
            'employee_name',
            'employee_code',
            'resignation_date',
            'last_working_day',
            'reason',
            'handover_completed',
            'devices_returned',
            'clearance_status',
            'clearance_status_display',
            'admin_remarks',
            'days_remaining',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_employee_name(self, obj) -> str:
        if obj.employee:
            return f"{obj.employee.first_name} {obj.employee.last_name}".strip()
        return ''

    def get_days_remaining(self, obj) -> int:
        if not obj.last_working_day:
            return 0
        from datetime import date
        today = date.today()
        diff = (obj.last_working_day - today).days
        return max(diff, 0)

