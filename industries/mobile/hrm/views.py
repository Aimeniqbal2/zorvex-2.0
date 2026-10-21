from decimal import Decimal
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import viewsets, status, filters
from rest_framework.views import APIView
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from erp_core.views import TenantModelViewSet
from platform_core.views import _get_company_for_user
from hrm.models import Employee
from .models import (
    TechnicianProfile, MobileMonthlyAttendance, MobileMonthlyPayroll,
    MobileDepartment
)
from .serializers import (
    TechnicianProfileSerializer, MobileMonthlyAttendanceSerializer,
    MobileMonthlyPayrollSerializer
)
from .services.attendance_service import MobileAttendanceService
from .services.payroll_service import MobilePayrollService
from .services.payslip_pdf_service import MobilePayslipPDFService
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
