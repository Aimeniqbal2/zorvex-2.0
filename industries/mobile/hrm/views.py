from decimal import Decimal
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import viewsets, status, filters
from rest_framework.views import APIView
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from erp_core.views import TenantModelViewSet
from platform_core.views import _get_company_for_user
from hrm.models import Employee
from .models import (
    TechnicianProfile, MobileMonthlyAttendance, MobileMonthlyPayroll,
    MobileDepartment, CompanyPolicy, OnboardingCandidate,
    EmployeeLeaveRequest, EmployeeExitRequest, DEFAULT_SOFTECH_POLICY
)
from .serializers import (
    TechnicianProfileSerializer, MobileMonthlyAttendanceSerializer,
    MobileMonthlyPayrollSerializer, CompanyPolicySerializer,
    OnboardingCandidateSerializer, EmployeeLeaveRequestSerializer,
    EmployeeExitRequestSerializer
)
from .services.attendance_service import MobileAttendanceService
from .services.payroll_service import MobilePayrollService
from .services.payslip_pdf_service import MobilePayslipPDFService
from .services.appointment_pdf_service import MobileAppointmentPDFService
from .services.excel_seed_service import MobileExcelSeedService


def _resolve_request_company(request):
    """Safely extracts tenant Company model instance for the request."""
    comp, err = _get_company_for_user(request)
    return comp


class TechnicianProfileViewSet(TenantModelViewSet):
    """
    CRUD for Mobile Repair Technicians & Staff profiles.
    Tenant-isolated via TenantModelViewSet.
    """
    queryset = TechnicianProfile.objects.select_related(
        'employee', 'employee__department', 'company'
    ).filter(is_deleted=False)
    serializer_class = TechnicianProfileSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter]
    search_fields = [
        'employee__first_name',
        'employee__last_name',
        'employee__employee_code',
        'phone_1_model',
        'phone_1_imei_1',
    ]

    def get_queryset(self):
        qs = super().get_queryset()
        dept = self.request.query_params.get('department_type')
        if dept:
            qs = qs.filter(department_type=dept)
        return qs

    @action(detail=False, methods=['post'], url_path='clean-reset')
    def clean_reset(self, request):
        """
        Cleans existing duplicate technicians, attendance, payroll, and leave records for the tenant company,
        allowing a fresh, clean re-import of sample data or fresh employee entry.
        """
        company = _resolve_request_company(request)
        if not company:
            return Response({'detail': 'Company context required'}, status=status.HTTP_400_BAD_REQUEST)

        MobileMonthlyPayroll.objects.filter(company=company).delete()
        MobileMonthlyAttendance.objects.filter(company=company).delete()
        EmployeeLeaveRequest.objects.filter(company=company).delete()
        EmployeeExitRequest.objects.filter(company=company).delete()

        profiles = list(TechnicianProfile.objects.filter(company=company))
        emp_ids = [p.employee_id for p in profiles if p.employee_id]

        TechnicianProfile.objects.filter(company=company).delete()

        from hrm.models import EmployeeSalaryAssignment, Employee
        EmployeeSalaryAssignment.objects.filter(company=company, employee_id__in=emp_ids).delete()
        Employee.objects.filter(company=company, id__in=emp_ids).delete()

        return Response({
            'status': 'success',
            'message': 'Clean reset completed. All duplicate technician records, attendance, and payroll data have been cleared. You can now cleanly click Import Sample Data.'
        })

    @action(detail=True, methods=['post'], url_path='create-portal-user')
    def create_portal_user(self, request, pk=None):
        """
        Creates or updates a Django User login account for the technician's employee.
        Allows the staff member to log into Zorvex ERP and directly access their Self-Service Portal.
        """
        tech = self.get_object()
        company = _resolve_request_company(request)
        emp = tech.employee
        if not emp:
            return Response({'detail': 'Employee record missing for this technician profile'}, status=status.HTTP_400_BAD_REQUEST)

        username = request.data.get('username', '').strip()
        password = request.data.get('password', '').strip()
        role = request.data.get('role', '').strip()

        if not username:
            return Response({'detail': 'Username is required'}, status=status.HTTP_400_BAD_REQUEST)

        valid_roles = ['hardware_technician', 'software_technician', 'cashier', 'sales', 'staff', 'manager']
        if role not in valid_roles:
            role = 'hardware_technician' if tech.department_type == 'HARDWARE' else ('software_technician' if tech.department_type == 'SOFTWARE' else 'staff')

        from accounts.models import User
        existing_user = User._base_manager.filter(username__iexact=username).first()
        if existing_user and (not emp.user or str(existing_user.id) != str(emp.user.id)):
            return Response({'detail': f"Username '{username}' is already taken by another account."}, status=status.HTTP_400_BAD_REQUEST)

        if emp.user:
            u = emp.user
            u.username = username
            u.role = role
            u.company = company
            if password:
                u.set_password(password)
            u.is_active = True
            u.save()
        else:
            if not password:
                return Response({'detail': 'Password is required to create a new user account'}, status=status.HTTP_400_BAD_REQUEST)
            u = User.objects.create_user(
                username=username,
                password=password,
                role=role,
                company=company,
                is_staff=False,
                is_active=True
            )
            emp.user = u
            emp.save(update_fields=['user'])

        return Response({
            'status': 'success',
            'message': f"Portal account for {emp.first_name} configured successfully.",
            'username': u.username,
            'role': u.role,
            'user_id': str(u.id)
        })

    @action(detail=True, methods=['post'], url_path='upload-document', parser_classes=[MultiPartParser, FormParser])
    def upload_document(self, request, pk=None):
        """
        Uploads an employee document (CNIC, Certificate, Contract, Picture, etc.)
        and appends it to tech.document_urls.
        """
        import os
        import uuid
        from django.core.files.storage import default_storage
        from django.utils import timezone
        from django.utils.text import get_valid_filename

        tech = self.get_object()
        file_obj = request.FILES.get('file') or request.FILES.get('document')
        if not file_obj:
            return Response({'detail': 'No file provided for upload.'}, status=status.HTTP_400_BAD_REQUEST)

        title = (request.data.get('name') or request.data.get('title') or file_obj.name).strip()
        doc_type = request.data.get('doc_type', 'General').strip()

        clean_name = get_valid_filename(file_obj.name)
        storage_filename = f"{str(tech.id)[:8]}_{uuid.uuid4().hex[:6]}_{clean_name}"
        rel_dir = os.path.join('hrm', 'employee_documents')
        save_path = os.path.join(rel_dir, storage_filename)

        actual_path = default_storage.save(save_path, file_obj)
        file_url = f"/media/{actual_path.replace(os.sep, '/')}"

        doc_item = {
            'id': str(uuid.uuid4()),
            'name': title,
            'doc_type': doc_type,
            'url': file_url,
            'file_name': file_obj.name,
            'file_size': file_obj.size,
            'content_type': getattr(file_obj, 'content_type', ''),
            'uploaded_at': timezone.now().isoformat()
        }

        docs = list(tech.document_urls or [])
        docs.append(doc_item)
        tech.document_urls = docs

        update_fields = ['document_urls', 'updated_at']
        if doc_type in ['Picture / Photo', 'Photo', 'Profile Picture'] and not tech.photo_url:
            tech.photo_url = file_url
            update_fields.append('photo_url')

        tech.save(update_fields=update_fields)

        return Response({
            'status': 'success',
            'message': f"Document '{title}' uploaded successfully.",
            'document': doc_item,
            'documents': tech.document_urls
        })

    @action(detail=True, methods=['post'], url_path='delete-document')
    def delete_document(self, request, pk=None):
        """
        Removes a document from the technician's document_urls list.
        """
        tech = self.get_object()
        doc_id = request.data.get('doc_id')
        doc_url = request.data.get('url')

        if not doc_id and not doc_url:
            return Response({'detail': 'doc_id or url is required.'}, status=status.HTTP_400_BAD_REQUEST)

        docs = list(tech.document_urls or [])
        new_docs = [
            d for d in docs
            if (not doc_id or str(d.get('id')) != str(doc_id)) and (not doc_url or d.get('url') != doc_url)
        ]

        tech.document_urls = new_docs
        tech.save(update_fields=['document_urls', 'updated_at'])

        return Response({
            'status': 'success',
            'message': 'Document deleted successfully.',
            'documents': tech.document_urls
        })

    @action(detail=True, methods=['post'], url_path='upload-photo', parser_classes=[MultiPartParser, FormParser])
    def upload_photo(self, request, pk=None):
        """
        Uploads an employee profile photo / avatar.
        """
        import os
        import uuid
        from django.core.files.storage import default_storage
        from django.utils.text import get_valid_filename

        tech = self.get_object()
        photo_file = request.FILES.get('photo') or request.FILES.get('file')
        if not photo_file:
            return Response({'detail': 'No photo file provided.'}, status=status.HTTP_400_BAD_REQUEST)

        clean_name = get_valid_filename(photo_file.name)
        storage_filename = f"photo_{str(tech.id)[:8]}_{uuid.uuid4().hex[:6]}_{clean_name}"
        rel_dir = os.path.join('hrm', 'employee_photos')
        save_path = os.path.join(rel_dir, storage_filename)

        actual_path = default_storage.save(save_path, photo_file)
        file_url = f"/media/{actual_path.replace(os.sep, '/')}"

        tech.photo_url = file_url
        tech.save(update_fields=['photo_url', 'updated_at'])

        return Response({
            'status': 'success',
            'message': 'Profile photo uploaded successfully.',
            'photo_url': file_url
        })


class MobileAttendanceViewSet(viewsets.ViewSet):
    """
    30-Day Monthly Attendance Grid & Batch updater for Mobile Repair Staff.
    """
    permission_classes = [IsAuthenticated]

    def list(self, request):
        company = _resolve_request_company(request)
        if not company:
            return Response({'detail': 'Company context required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            year = int(request.query_params.get('year', 2026))
            month = int(request.query_params.get('month', 9))
        except (ValueError, TypeError):
            year, month = 2026, 9

        department = request.query_params.get('department')
        data = MobileAttendanceService.get_monthly_grid(company, year, month, department)
        return Response(data)

    @action(detail=False, methods=['post'], url_path='save-cell')
    def save_cell(self, request):
        company = _resolve_request_company(request)
        if not company:
            return Response({'detail': 'Company context required'}, status=status.HTTP_400_BAD_REQUEST)

        employee_id = request.data.get('employee_id')
        try:
            year = int(request.data.get('year', 2026))
            month = int(request.data.get('month', 9))
            day = int(request.data.get('day'))
        except (ValueError, TypeError):
            return Response({'detail': 'Invalid year, month, or day'}, status=status.HTTP_400_BAD_REQUEST)

        code = request.data.get('code', '')
        att = MobileAttendanceService.save_cell(company, employee_id, year, month, day, code)

        return Response({
            'status': 'success',
            'employee_id': employee_id,
            'day': day,
            'code': code,
            'totals': {
                'present': att.present_count,
                'late': att.late_count,
                'half_day': att.half_day_count,
                'holiday': att.holiday_count,
                'overtime': float(att.overtime_hours),
                'allowed_half_day': att.allowed_half_day_count,
                'allowed_holiday': att.allowed_holiday_count,
            }
        })

    @action(detail=False, methods=['post'], url_path='batch-save')
    def batch_save(self, request):
        company = _resolve_request_company(request)
        if not company:
            return Response({'detail': 'Company context required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            year = int(request.data.get('year', 2026))
            month = int(request.data.get('month', 9))
        except (ValueError, TypeError):
            return Response({'detail': 'Invalid year or month'}, status=status.HTTP_400_BAD_REQUEST)

        updates = request.data.get('updates', [])
        if not isinstance(updates, list):
            return Response({'detail': 'updates must be a list'}, status=status.HTTP_400_BAD_REQUEST)

        updated = MobileAttendanceService.batch_update_grid(company, year, month, updates)
        return Response({'status': 'success', 'updated_count': len(updated)})


class MobilePayrollViewSet(viewsets.ViewSet):
    """
    Mobile Repair Industry Monthly Salary Calculation, Disbursal & PDF Payslip.
    """
    permission_classes = [IsAuthenticated]

    def list(self, request):
        company = _resolve_request_company(request)
        if not company:
            return Response({'detail': 'Company context required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            year = int(request.query_params.get('year', 2026))
            month = int(request.query_params.get('month', 9))
        except (ValueError, TypeError):
            year, month = 2026, 9

        data = MobilePayrollService.get_monthly_payroll_overview(company, year, month)
        return Response(data)

    @action(detail=False, methods=['post'], url_path='calculate')
    def calculate(self, request):
        company = _resolve_request_company(request)
        if not company:
            return Response({'detail': 'Company context required'}, status=status.HTTP_400_BAD_REQUEST)

        employee_id = request.data.get('employee_id')
        if not employee_id:
            return Response({'detail': 'employee_id is required'}, status=status.HTTP_400_BAD_REQUEST)

        emp = get_object_or_404(Employee, id=employee_id, company=company, is_deleted=False)
        try:
            year = int(request.data.get('year', 2026))
            month = int(request.data.get('month', 9))
        except (ValueError, TypeError):
            year, month = 2026, 9

        basic_salary = request.data.get('basic_salary')
        loan_principal = Decimal(str(request.data.get('loan_principal', 0)))
        loan_deduction = Decimal(str(request.data.get('loan_deduction', 0)))
        damaged_parts = Decimal(str(request.data.get('damaged_parts', 0)))
        bill_deduction = Decimal(str(request.data.get('bill_deduction', 0)))
        overtime_hours = request.data.get('overtime_hours')

        calc = MobilePayrollService.calculate_employee_payroll(
            company=company,
            employee=emp,
            year=year,
            month=month,
            basic_salary=basic_salary,
            loan_principal=loan_principal,
            loan_deduction=loan_deduction,
            damaged_parts=damaged_parts,
            bill_deduction=bill_deduction,
            overtime_hours_override=overtime_hours
        )

        serialized_calc = {
            k: float(v) if isinstance(v, Decimal) else v for k, v in calc.items()
        }
        return Response(serialized_calc)

    @action(detail=False, methods=['post'], url_path='save-record')
    def save_record(self, request):
        company = _resolve_request_company(request)
        if not company:
            return Response({'detail': 'Company context required'}, status=status.HTTP_400_BAD_REQUEST)

        employee_id = request.data.get('employee_id')
        if not employee_id:
            return Response({'detail': 'employee_id is required'}, status=status.HTTP_400_BAD_REQUEST)

        emp = get_object_or_404(Employee, id=employee_id, company=company, is_deleted=False)
        try:
            year = int(request.data.get('year', 2026))
            month = int(request.data.get('month', 9))
        except (ValueError, TypeError):
            year, month = 2026, 9

        payroll = MobilePayrollService.save_or_update_payroll(company, emp, year, month, request.data)
        serializer = MobileMonthlyPayrollSerializer(payroll)
        return Response(serializer.data)

    @action(detail=False, methods=['get'], url_path='payslip-pdf')
    def payslip_pdf(self, request):
        company = _resolve_request_company(request)
        if not company:
            return Response({'detail': 'Company context required'}, status=status.HTTP_400_BAD_REQUEST)

        employee_id = request.query_params.get('employee_id')
        if not employee_id:
            return Response({'detail': 'employee_id is required'}, status=status.HTTP_400_BAD_REQUEST)

        emp = get_object_or_404(Employee, id=employee_id, company=company, is_deleted=False)
        try:
            year = int(request.query_params.get('year', 2026))
            month = int(request.query_params.get('month', 9))
        except (ValueError, TypeError):
            year, month = 2026, 9

        pdf_bytes = MobilePayslipPDFService.generate_payslip_pdf(company, emp, year, month)
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        filename = f"Salary_Slip_{emp.first_name}_{year}_{month:02d}.pdf"
        response['Content-Disposition'] = f'inline; filename="{filename}"'
        return response


class MobileSeedSampleView(APIView):
    """
    Seeds real-world Softech Mobile Services September 2026 sample data
    for the active company context.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        company = _resolve_request_company(request)
        if not company:
            return Response({'detail': 'Company context required'}, status=status.HTTP_400_BAD_REQUEST)

        res = MobileExcelSeedService.seed_softech_sample_data(company)
        return Response(res)


class CompanyPolicyViewSet(TenantModelViewSet):
    """
    CRUD for company rules & regulations policies.
    Provides /active/ endpoint for tenant auto-seeding and live updates.
    """
    queryset = CompanyPolicy.objects.filter(is_deleted=False)
    serializer_class = CompanyPolicySerializer
    permission_classes = [IsAuthenticated]

    @action(detail=False, methods=['get', 'post'], url_path='active')
    def active_policy(self, request):
        company = _resolve_request_company(request)
        if not company:
            return Response({'detail': 'Company context required'}, status=status.HTTP_400_BAD_REQUEST)

        if request.method == 'GET':
            policy = CompanyPolicy.objects.filter(company=company, is_active=True, is_deleted=False).first()
            if not policy:
                policy = CompanyPolicy.objects.create(
                    company=company,
                    title='Rules & Regulations',
                    content=DEFAULT_SOFTECH_POLICY,
                    version='1.0',
                    is_active=True,
                    created_by_name=request.user.get_full_name() or request.user.username
                )
            ser = self.get_serializer(policy)
            return Response(ser.data)

        # POST updates or creates new policy version
        title = request.data.get('title', 'Rules & Regulations')
        content = request.data.get('content', '')
        version = request.data.get('version', '1.1')
        policy = CompanyPolicy.objects.filter(company=company, is_active=True, is_deleted=False).first()
        if policy:
            policy.title = title
            policy.content = content
            policy.version = version
            policy.created_by_name = request.user.get_full_name() or request.user.username
            policy.save()
        else:
            policy = CompanyPolicy.objects.create(
                company=company,
                title=title,
                content=content,
                version=version,
                is_active=True,
                created_by_name=request.user.get_full_name() or request.user.username
            )
        ser = self.get_serializer(policy)
        return Response(ser.data)


class OnboardingCandidateViewSet(TenantModelViewSet):
    """
    Hiring & Onboarding pipeline: candidate tracking, Softech appointment letter PDF, and first-week checklist.
    """
    queryset = OnboardingCandidate.objects.filter(is_deleted=False)
    serializer_class = OnboardingCandidateSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter]
    search_fields = ['full_name', 'phone', 'position']

    @action(detail=True, methods=['post'], url_path='convert-to-employee')
    def convert_to_employee(self, request, pk=None):
        candidate = self.get_object()
        company = candidate.company

        names = candidate.full_name.strip().split(' ', 1)
        first_name = names[0]
        last_name = names[1] if len(names) > 1 else ''

        from hrm.models import Department, Designation
        dept_obj, _ = Department.objects.get_or_create(
            company=company,
            name=candidate.department_type.capitalize()
        )
        count = Employee.objects.filter(company=company).count() + 1
        emp_code = f"EMP{count:02d}"

        emp = Employee.objects.create(
            company=company,
            employee_code=emp_code,
            first_name=first_name,
            last_name=last_name,
            department=dept_obj,
            is_active=True,
            classification='DIRECT',
            employment_status='ACTIVE'
        )

        profile, _ = TechnicianProfile.objects.get_or_create(
            company=company,
            employee=emp,
            defaults={
                'department_type': candidate.department_type,
                'residential_address': candidate.address
            }
        )

        # Salary assignment with currency
        import datetime
        from finance.models import Currency
        from hrm.models import EmployeeSalaryAssignment
        currency, _ = Currency.objects.get_or_create(
            company=company, code='PKR', defaults={'name': 'Pakistani Rupee', 'symbol': 'Rs.'}
        )
        try:
            EmployeeSalaryAssignment.objects.update_or_create(
                company=company,
                employee=emp,
                status='ACTIVE',
                defaults={
                    'base_salary': candidate.offered_salary,
                    'currency': currency,
                    'effective_from': datetime.date(2026, 1, 1)
                }
            )
        except Exception:
            pass

        # Auto-create attendance and payroll records
        att, _ = MobileMonthlyAttendance.objects.get_or_create(
            company=company,
            employee=emp,
            year=2026,
            month=9,
            defaults={'days_data': {str(d): 'P' for d in range(1, 31)}}
        )
        att.recalculate_counters()
        att.save()

        MobilePayrollService.save_or_update_payroll(
            company=company,
            employee=emp,
            year=2026,
            month=9,
            data={'basic_salary': candidate.offered_salary}
        )

        candidate.status = 'HIRED'
        candidate.save()

        return Response({
            'status': 'success',
            'message': f"Candidate {candidate.full_name} converted to Employee {emp_code}",
            'employee_id': str(emp.id),
            'technician_id': str(profile.id)
        })

    @action(detail=True, methods=['get'], url_path='download-appointment-letter')
    def download_appointment_letter(self, request, pk=None):
        candidate = self.get_object()
        company = candidate.company
        pdf_bytes = MobileAppointmentPDFService.generate_appointment_pdf(company, candidate)
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        filename = f"Appointment_Letter_{candidate.full_name.replace(' ', '_')}.pdf"
        response['Content-Disposition'] = f'inline; filename="{filename}"'
        return response


class EmployeeLeaveRequestViewSet(TenantModelViewSet):
    """
    Leave & permission requests workflow (Casual, Sick, Half-day with relief, Emergency).
    """
    queryset = EmployeeLeaveRequest.objects.select_related('employee', 'company').filter(is_deleted=False)
    serializer_class = EmployeeLeaveRequestSerializer
    permission_classes = [IsAuthenticated]

    @action(detail=True, methods=['post'], url_path='approve')
    def approve_leave(self, request, pk=None):
        leave = self.get_object()
        leave.status = 'APPROVED'
        leave.admin_notes = request.data.get('admin_notes', leave.admin_notes)
        leave.save()

        # Update attendance grid cell
        req_date = leave.request_date
        year, month, day = req_date.year, req_date.month, req_date.day
        code = 'DA' if leave.leave_type == 'HALF_DAY' else 'HA'
        try:
            MobileAttendanceService.save_cell(leave.company, str(leave.employee_id), year, month, day, code)
            MobilePayrollService.save_or_update_payroll(leave.company, leave.employee, year, month)
        except Exception:
            pass

        ser = self.get_serializer(leave)
        return Response(ser.data)

    @action(detail=True, methods=['post'], url_path='reject')
    def reject_leave(self, request, pk=None):
        leave = self.get_object()
        leave.status = 'REJECTED'
        leave.admin_notes = request.data.get('admin_notes', leave.admin_notes)
        leave.save()
        ser = self.get_serializer(leave)
        return Response(ser.data)


class EmployeeExitRequestViewSet(TenantModelViewSet):
    """
    Resignation and exit workflow: 1-month notice period tracker and clearance checklist.
    """
    queryset = EmployeeExitRequest.objects.select_related('employee', 'company').filter(is_deleted=False)
    serializer_class = EmployeeExitRequestSerializer
    permission_classes = [IsAuthenticated]

    @action(detail=True, methods=['post'], url_path='update-clearance')
    def update_clearance(self, request, pk=None):
        exit_req = self.get_object()
        if 'handover_completed' in request.data:
            exit_req.handover_completed = bool(request.data['handover_completed'])
        if 'devices_returned' in request.data:
            exit_req.devices_returned = bool(request.data['devices_returned'])
        if 'clearance_status' in request.data:
            exit_req.clearance_status = request.data['clearance_status']
        if 'admin_remarks' in request.data:
            exit_req.admin_remarks = request.data['admin_remarks']
        exit_req.save()
        ser = self.get_serializer(exit_req)
        return Response(ser.data)


class EmployeeSelfServiceViewSet(viewsets.ViewSet):
    """
    Dedicated Employee Self-Service Portal view:
    Returns profile, monthly attendance, leave requests, exit request, active policies, and payroll slips.
    Enforces strict role-based isolation (staff cannot view others' profiles) and supports month/year filtering.
    """
    permission_classes = [IsAuthenticated]

    def list(self, request):
        company = _resolve_request_company(request)
        if not company:
            return Response({'detail': 'Company context required'}, status=status.HTTP_400_BAD_REQUEST)

        # Parse requested year and month (default to 2026, 9)
        try:
            year = int(request.query_params.get('year', 2026))
            month = int(request.query_params.get('month', 9))
        except (ValueError, TypeError):
            year, month = 2026, 9

        is_admin = getattr(request.user, 'role', '') in ('admin', 'super_admin', 'manager', 'owner', 'management')
        emp = None
        if is_admin:
            emp_id = request.query_params.get('employee_id')
            if emp_id:
                emp = Employee.objects.filter(company=company, id=emp_id, is_deleted=False).first()
            if not emp:
                emp = Employee.objects.filter(company=company, is_deleted=False).first()
        else:
            # Strictly scoped to logged-in user: cannot specify another employee_id to peek
            emp = getattr(request.user, 'employee_profile_new', None)
            if not emp:
                emp = Employee.objects.filter(company=company, user=request.user, is_deleted=False).first()
            if not emp and request.user.email:
                emp = Employee.objects.filter(company=company, work_email=request.user.email, is_deleted=False).first()

        if not emp:
            return Response(
                {'detail': 'No employee profile linked to your user account. Please contact your administrator.'},
                status=status.HTTP_404_NOT_FOUND
            )

        tech = getattr(emp, 'mobile_technician_profile', None)
        tech_data = TechnicianProfileSerializer(tech).data if tech else None

        policy = CompanyPolicy.objects.filter(company=company, is_active=True, is_deleted=False).first()
        if not policy:
            policy = CompanyPolicy.objects.create(
                company=company,
                title='Rules & Regulations',
                content=DEFAULT_SOFTECH_POLICY,
                version='1.0',
                is_active=True
            )
        policy_data = CompanyPolicySerializer(policy).data

        leaves = EmployeeLeaveRequest.objects.filter(company=company, employee=emp, is_deleted=False)
        leaves_data = EmployeeLeaveRequestSerializer(leaves, many=True).data

        exit_req = EmployeeExitRequest.objects.filter(company=company, employee=emp, is_deleted=False).first()
        exit_data = EmployeeExitRequestSerializer(exit_req).data if exit_req else None

        att = MobileMonthlyAttendance.objects.filter(company=company, employee=emp, year=year, month=month, is_deleted=False).first()
        att_data = {
            'year': year,
            'month': month,
            'days_data': att.days_data if att else {},
            'present_count': att.present_count if att else 0,
            'late_count': att.late_count if att else 0,
            'half_day_count': att.half_day_count if att else 0,
            'holiday_count': att.holiday_count if att else 0,
            'overtime_hours': float(att.overtime_hours) if att else 0.0,
            'allowed_half_day_count': att.allowed_half_day_count if att else 0,
            'allowed_holiday_count': att.allowed_holiday_count if att else 0,
        }

        payroll = MobileMonthlyPayroll.objects.filter(company=company, employee=emp, year=year, month=month, is_deleted=False).first()
        payroll_data = MobileMonthlyPayrollSerializer(payroll).data if payroll else None

        return Response({
            'employee': {
                'id': str(emp.id),
                'first_name': emp.first_name,
                'last_name': emp.last_name,
                'employee_code': emp.employee_code,
                'department': tech.get_department_type_display() if tech else 'Hardware',
                'joining_date': str(emp.hire_date) if emp.hire_date else '2025-06-01',
            },
            'profile': tech_data,
            'active_policy': policy_data,
            'leaves': leaves_data,
            'exit_request': exit_data,
            'attendance': att_data,
            'payroll': payroll_data,
            'selected_year': year,
            'selected_month': month,
        })

