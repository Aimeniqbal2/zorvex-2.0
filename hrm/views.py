from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from erp_core.views import TenantModelViewSet
from erp_core.permissions import RolePermission
from platform_core.permissions import ModulePermission
from .models import (
    Department, Position, Designation, Employee, Employment,
    EmployeeRecord, Attendance
)
from .serializers import (
    DepartmentSerializer, PositionSerializer, DesignationSerializer,
    EmployeeSerializer, EmploymentSerializer,
    EmployeeRecordSerializer, AttendanceSerializer
)

class DepartmentViewSet(TenantModelViewSet):
    required_module = 'hr'
    queryset = Department.objects.all()
    serializer_class = DepartmentSerializer
    permission_classes = [IsAuthenticated, ModulePermission]

class PositionViewSet(TenantModelViewSet):
    required_module = 'hr'
    queryset = Position.objects.select_related('department').all()
    serializer_class = PositionSerializer
    permission_classes = [IsAuthenticated, ModulePermission]

class DesignationViewSet(TenantModelViewSet):
    required_module = 'hr'
    queryset = Designation.objects.all()
    serializer_class = DesignationSerializer
    permission_classes = [IsAuthenticated, ModulePermission]

class EmployeeViewSet(TenantModelViewSet):
    required_module = 'hr'
    queryset = Employee.objects.select_related(
        'user', 'crm_entity', 'department', 'position', 'designation', 'branch'
    ).all()
    serializer_class = EmployeeSerializer
    permission_classes = [IsAuthenticated, ModulePermission]

class EmploymentViewSet(TenantModelViewSet):
    required_module = 'hr'
    queryset = Employment.objects.select_related(
        'employee', 'department', 'position', 'designation', 'branch'
    ).all()
    serializer_class = EmploymentSerializer
    permission_classes = [IsAuthenticated, ModulePermission]

class EmployeeRecordViewSet(TenantModelViewSet):
    required_module = 'hr'
    queryset = EmployeeRecord.objects.select_related('user', 'crm_entity', 'department').all()
    serializer_class = EmployeeRecordSerializer
    permission_classes = [IsAuthenticated, ModulePermission]

    def create(self, request, *args, **kwargs):
        from hrm.models import Employee, Employment, EmployeeRecord
        from crm.models import CRMEntity
        from django.utils import timezone
        
        company_id = request.user.company_id
        
        # We need to bridge legacy create to Universal
        # Standard legacy payload has 'user', 'department', 'salary' etc.
        data = request.data
        
        user_id = data.get('user')
        department_id = data.get('department')
        
        first_name = data.get('first_name', 'Employee')
        last_name = data.get('last_name', 'Unknown')
        
        # 1. Create Universal Employee
        employee = Employee.objects.create(
            company_id=company_id,
            user_id=user_id,
            department_id=department_id,
            first_name=first_name,
            last_name=last_name,
            is_active=True
        )
        
        # 2. Create Universal Employment
        employment = Employment.objects.create(
            company_id=company_id,
            employee=employee,
            department_id=department_id,
            employment_status='ACTIVE',
            employment_type='FULL_TIME',
            start_date=timezone.now().date(),
            is_current=True
        )
        
        # 3. Create the historical EmployeeRecord
        legacy_record = super().create(request, *args, **kwargs)
        record = EmployeeRecord.objects.get(id=legacy_record.data['id'])
        record.employee = employee
        record.save(update_fields=['employee'])
        
        legacy_record.data['id'] = record.id
        return legacy_record

class AttendanceViewSet(TenantModelViewSet):
    required_module = 'hr'
    queryset = Attendance.objects.select_related('employee').all()
    serializer_class = AttendanceSerializer
    permission_classes = [IsAuthenticated, ModulePermission]

    def create(self, request, *args, **kwargs):
        from hrm.models import WorkforceAttendance, Attendance
        from django.utils import timezone
        import datetime
        
        # We need to bridge legacy create to Universal
        data = request.data
        employee_id = data.get('employee')
        
        # 1. Create the legacy attendance
        legacy_response = super().create(request, *args, **kwargs)
        legacy = Attendance.objects.get(id=legacy_response.data['id'])
        
        # 2. Bridge to WorkforceAttendance
        if legacy.employee and legacy.employee.employee:
            new_att = WorkforceAttendance.objects.create(
                company_id=legacy.company_id,
                employee=legacy.employee.employee,
                date=legacy.date,
                check_in=datetime.datetime.combine(legacy.date, legacy.check_in) if legacy.check_in else None,
                check_out=datetime.datetime.combine(legacy.date, legacy.check_out) if legacy.check_out else None,
                source='MIGRATION'
            )
            legacy.workforce_attendance = new_att
            legacy.save(update_fields=['workforce_attendance'])
            
        return legacy_response

from .models import (
    WorkforceAttendance, Shift, WorkSchedule, LeaveType, LeaveBalance, LeaveRequest, Holiday, OvertimeRecord
)
from .serializers import (
    WorkforceAttendanceSerializer, ShiftSerializer, WorkScheduleSerializer, LeaveTypeSerializer, 
    LeaveBalanceSerializer, LeaveRequestSerializer, HolidaySerializer, OvertimeRecordSerializer
)

class WorkforceAttendanceViewSet(TenantModelViewSet):
    queryset = WorkforceAttendance.objects.select_related('employee', 'employment').all()
    serializer_class = WorkforceAttendanceSerializer

class ShiftViewSet(TenantModelViewSet):
    queryset = Shift.objects.all()
    serializer_class = ShiftSerializer

class WorkScheduleViewSet(TenantModelViewSet):
    queryset = WorkSchedule.objects.select_related('employee', 'employment', 'shift').all()
    serializer_class = WorkScheduleSerializer

class LeaveTypeViewSet(TenantModelViewSet):
    queryset = LeaveType.objects.all()
    serializer_class = LeaveTypeSerializer

class LeaveBalanceViewSet(TenantModelViewSet):
    queryset = LeaveBalance.objects.select_related('employee', 'employment', 'leave_type').all()
    serializer_class = LeaveBalanceSerializer

class LeaveRequestViewSet(TenantModelViewSet):
    queryset = LeaveRequest.objects.select_related('employee', 'employment', 'leave_type', 'approved_by').all()
    serializer_class = LeaveRequestSerializer

class HolidayViewSet(TenantModelViewSet):
    queryset = Holiday.objects.all()
    serializer_class = HolidaySerializer

class OvertimeRecordViewSet(TenantModelViewSet):
    queryset = OvertimeRecord.objects.select_related('employee', 'employment', 'attendance', 'approved_by').all()
    serializer_class = OvertimeRecordSerializer


# ============================================================================
# PHASE 7D: UNIVERSAL PAYROLL FOUNDATION VIEWS
# ============================================================================

from hrm.models import (
    SalaryComponent, SalaryStructure, SalaryStructureComponent, EmployeeSalaryAssignment,
    PayrollPeriod, PayrollRun, Payslip, PayslipLine
)
from hrm.serializers import (
    SalaryComponentSerializer, SalaryStructureSerializer, SalaryStructureComponentSerializer,
    EmployeeSalaryAssignmentSerializer, PayrollPeriodSerializer, PayrollRunSerializer,
    PayslipSerializer, PayslipLineSerializer
)

class SalaryComponentViewSet(TenantModelViewSet):
    queryset = SalaryComponent.objects.filter(is_deleted=False)
    serializer_class = SalaryComponentSerializer
    module_name = 'HRM'

class SalaryStructureViewSet(TenantModelViewSet):
    queryset = SalaryStructure.objects.filter(is_deleted=False)
    serializer_class = SalaryStructureSerializer
    module_name = 'HRM'

class SalaryStructureComponentViewSet(TenantModelViewSet):
    queryset = SalaryStructureComponent.objects.filter(is_deleted=False)
    serializer_class = SalaryStructureComponentSerializer
    module_name = 'HRM'

class EmployeeSalaryAssignmentViewSet(TenantModelViewSet):
    queryset = EmployeeSalaryAssignment.objects.filter(is_deleted=False)
    serializer_class = EmployeeSalaryAssignmentSerializer
    module_name = 'HRM'

class PayrollPeriodViewSet(TenantModelViewSet):
    queryset = PayrollPeriod.objects.filter(is_deleted=False)
    serializer_class = PayrollPeriodSerializer
    module_name = 'HRM'

from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework import status
from hrm.services.payroll_calculation import calculate_payroll_for_run, finalize_payroll_run, PayrollCalculationError

class PayrollRunViewSet(TenantModelViewSet):
    queryset = PayrollRun.objects.filter(is_deleted=False)
    serializer_class = PayrollRunSerializer
    module_name = 'HRM'
    permission_classes = [IsAuthenticated, RolePermission]
    required_read_permissions = ['hrm.read']
    required_write_permissions = ['hrm.write']
    allowed_roles = ['admin', 'manager']
    allowed_reads = ['admin', 'manager', 'staff']
    
    @action(detail=True, methods=['post'], url_path='calculate', url_name='calculate')
    def calculate_payroll(self, request, pk=None):
        payroll_run = self.get_object()
        try:
            results = calculate_payroll_for_run(
                company_id=request.user.company_id,
                run_id=payroll_run.id,
                user_id=request.user.id
            )
            # ExtraDuty reinjection
            try:
                from operations.services.payroll_bridge import reinject_approved_bridges_for_run
                reinject_results = reinject_approved_bridges_for_run(
                    payroll_run_id=payroll_run.id,
                    company_id=request.user.company_id
                )
                results['extra_duty_reinjection'] = reinject_results
            except ImportError:
                pass
            return Response({'status': 'calculation complete', 'results': results}, status=status.HTTP_200_OK)
        except PayrollCalculationError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({'error': f'Unexpected error: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['post'], url_path='finalize', url_name='finalize')
    def finalize_payroll(self, request, pk=None):
        payroll_run = self.get_object()
        try:
            finalize_payroll_run(
                company_id=request.user.company_id,
                run_id=payroll_run.id,
                user_id=request.user.id
            )
            return Response({'status': 'payroll finalized'}, status=status.HTTP_200_OK)
        except PayrollCalculationError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({'error': f'Unexpected error: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['get', 'post'], url_path='preview-finance', url_name='preview-finance')
    def preview_finance(self, request, pk=None):
        payroll_run = self.get_object()
        try:
            from hrm.services.finance_integration import preview_payroll_journal
            from rest_framework.exceptions import ValidationError
            lines = preview_payroll_journal(payroll_run)
            return Response({'status': 'preview generated', 'lines': [
                {
                    'account_id': l['account'].id,
                    'account_name': l['account'].name,
                    'description': l['description'],
                    'debit': str(l['debit']),
                    'credit': str(l['credit']),
                } for l in lines
            ]}, status=status.HTTP_200_OK)
        except ValidationError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({'error': f'Unexpected error: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['post'], url_path='post-finance', url_name='post-finance')
    def post_finance(self, request, pk=None):
        payroll_run = self.get_object()
        try:
            from hrm.services.finance_integration import post_payroll_to_finance
            from rest_framework.exceptions import ValidationError
            journal_entry = post_payroll_to_finance(payroll_run.id, request.user.id)
            return Response({'status': 'finance posted', 'journal_entry_id': journal_entry.id}, status=status.HTTP_200_OK)
        except ValidationError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({'error': f'Unexpected error: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class PayslipViewSet(TenantModelViewSet):
    queryset = Payslip.objects.filter(is_deleted=False)
    serializer_class = PayslipSerializer
    module_name = 'HRM'

class PayslipLineViewSet(TenantModelViewSet):
    queryset = PayslipLine.objects.filter(is_deleted=False)
    serializer_class = PayslipLineSerializer
    module_name = 'HRM'

from hrm.models import PayrollAccountingConfiguration
from hrm.serializers import PayrollAccountingConfigurationSerializer

class PayrollAccountingConfigurationViewSet(TenantModelViewSet):
    queryset = PayrollAccountingConfiguration.objects.all()
    serializer_class = PayrollAccountingConfigurationSerializer
    module_name = 'HRM'


# ============================================================================
# PHASE C-1: RECRUITMENT & VETTING
# ============================================================================
from .models import Candidate, CandidateDocument, CandidateVerification
from .serializers import CandidateSerializer, CandidateDocumentSerializer, CandidateVerificationSerializer
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db import transaction
import datetime
from django.http import HttpResponseForbidden, FileResponse

class CandidateViewSet(TenantModelViewSet):
    queryset = Candidate.objects.all()
    serializer_class = CandidateSerializer
    filterset_fields = ['status', 'applied_designation']
    search_fields = ['candidate_number', 'first_name', 'last_name', 'national_id', 'phone']

    @action(detail=True, methods=['post'])
    def select(self, request, pk=None):
        candidate = self.get_object()
        if candidate.status not in ['APPLIED', 'SCREENING', 'VERIFICATION']:
            return Response({'error': 'Invalid status transition'}, status=400)
        candidate.status = 'SELECTED'
        candidate.selection_date = datetime.date.today()
        candidate.selected_by = request.user
        candidate.save()
        return Response(CandidateSerializer(candidate).data)

    @action(detail=True, methods=['post'])
    def hire(self, request, pk=None):
        candidate = self.get_object()
        if candidate.status != 'SELECTED' and candidate.status != 'VERIFICATION':
            return Response({'error': 'Candidate must be SELECTED or VERIFICATION to hire'}, status=400)
        
        if candidate.converted_employee:
            return Response({'error': 'Candidate already hired'}, status=400)

        with transaction.atomic():
            from .models import Employee, Employment
            employee = Employee.objects.create(
                company=request.company,
                first_name=candidate.first_name,
                last_name=candidate.last_name,
                email=candidate.email,
                phone=candidate.phone,
                date_of_birth=candidate.date_of_birth,
                hire_date=datetime.date.today(),
                designation=candidate.applied_designation,
                is_active=True
            )
            
            employment = Employment.objects.create(
                company=request.company,
                employee=employee,
                employment_type='FULL_TIME',
                employment_status='ACTIVE',
                designation=candidate.applied_designation,
                start_date=datetime.date.today(),
                is_current=True
            )
            
            candidate.converted_employee = employee
            candidate.status = 'HIRED'
            candidate.save()

        return Response(CandidateSerializer(candidate).data)

class CandidateDocumentViewSet(TenantModelViewSet):
    queryset = CandidateDocument.objects.all()
    serializer_class = CandidateDocumentSerializer
    filterset_fields = ['candidate', 'document_type']

    @action(detail=True, methods=['get'])
    def download(self, request, pk=None):
        doc = self.get_object()
        if not doc.attachment:
            return Response({'error': 'No attachment'}, status=404)
        return FileResponse(doc.attachment.open('rb'), as_attachment=True, filename=doc.attachment.name)

class CandidateVerificationViewSet(TenantModelViewSet):
    queryset = CandidateVerification.objects.all()
    serializer_class = CandidateVerificationSerializer
    filterset_fields = ['candidate', 'status', 'verification_type']

    @action(detail=True, methods=['get'])
    def download(self, request, pk=None):
        ver = self.get_object()
        if not ver.attachment:
            return Response({'error': 'No attachment'}, status=404)
        return FileResponse(ver.attachment.open('rb'), as_attachment=True, filename=ver.attachment.name)

# ==============================================================================
# PHASE C-6: STATUTORY PAYROLL & PAYROLL DISBURSEMENT
# ==============================================================================
from .models import (
    StatutoryScheme, StatutoryRule, EmployeeStatutoryEnrollment,
    PayslipStatutoryDeduction, PayrollDisbursement, PayslipDisbursement
)
from .serializers import (
    StatutorySchemeSerializer, StatutoryRuleSerializer, EmployeeStatutoryEnrollmentSerializer,
    PayslipStatutoryDeductionSerializer, PayrollDisbursementSerializer, PayslipDisbursementSerializer
)

class StatutorySchemeViewSet(TenantModelViewSet):
    queryset = StatutoryScheme.objects.all()
    serializer_class = StatutorySchemeSerializer

class StatutoryRuleViewSet(TenantModelViewSet):
    queryset = StatutoryRule.objects.all()
    serializer_class = StatutoryRuleSerializer

class EmployeeStatutoryEnrollmentViewSet(TenantModelViewSet):
    queryset = EmployeeStatutoryEnrollment.objects.all()
    serializer_class = EmployeeStatutoryEnrollmentSerializer

class PayrollDisbursementViewSet(TenantModelViewSet):
    queryset = PayrollDisbursement.objects.all()
    serializer_class = PayrollDisbursementSerializer

    @action(detail=True, methods=['post'])
    def process_disbursement(self, request, pk=None):
        disbursement = self.get_object()
        from .services.payroll_disbursement_service import execute_payroll_disbursement
        try:
            execute_payroll_disbursement(disbursement, request.user)
            return Response({'status': 'Disbursement completed successfully.'})
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

class PayslipDisbursementViewSet(TenantModelViewSet):
    queryset = PayslipDisbursement.objects.all()
    serializer_class = PayslipDisbursementSerializer
