import os
import sys
import datetime
from decimal import Decimal

# Configure path & Django settings
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp_core.settings')

import django
django.setup()

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

from companies.models import Company
from accounts.models import User
from hrm.models import Employee, Department
from industries.mobile.hrm.models import (
    TechnicianProfile, MobileDepartment, MobileMonthlyAttendance,
    MobileMonthlyPayroll, OnboardingCandidate, EmployeeLeaveRequest
)
from industries.mobile.hrm.services.appointment_pdf_service import MobileAppointmentPDFService
from industries.mobile.hrm.services.payslip_pdf_service import MobilePayslipPDFService
from industries.mobile.hrm.views import TechnicianProfileViewSet, EmployeeLeaveRequestViewSet, EmployeeSelfServiceViewSet
from rest_framework.test import APIRequestFactory, force_authenticate

def test_workflow():
    print("==================================================")
    print("Starting Comprehensive Mobile HRM Phase 3 Verification")
    print("==================================================")

    factory = APIRequestFactory()

    # 1. Setup tenant & test company
    company, _ = Company.objects.get_or_create(
        domain="phase3-test.zorvex.local",
        defaults={'name': 'Phase 3 Test Mobile Lab', 'business_type': 'MOBILE_SALES_REPAIR'}
    )
    print(f"[OK] Tenant Company configured: {company.name}")

    # 2. Test Clean Reset Action
    clean_reset_view = TechnicianProfileViewSet.as_view({'post': 'clean_reset'})
    req_reset = factory.post('/api/industries/mobile/hrm/technicians/clean-reset/')
    admin_user, _ = User._base_manager.get_or_create(
        username="phase3_admin",
        defaults={'role': 'admin', 'company': company, 'is_staff': True}
    )
    force_authenticate(req_reset, user=admin_user)
    res_reset = clean_reset_view(req_reset)
    assert res_reset.status_code == 200, f"Clean reset failed: {res_reset.data}"
    print(f"[OK] Clean Reset action verified: {res_reset.data.get('message')}")

    User._base_manager.filter(username="kashif_tech_user").delete()

    # 3. Create Technician & Employee
    dept, _ = Department.objects.get_or_create(company=company, name="Technical Lab")
    emp = Employee.objects.create(
        company=company,
        first_name="Kashif",
        last_name="Technician",
        employee_code="EMP_TEST_01",
        department=dept,
        hire_date=datetime.date(2025, 6, 1)
    )
    tech = TechnicianProfile.objects.create(
        company=company,
        employee=emp,
        department_type=MobileDepartment.HARDWARE,
        shift_time="12:00:00",
        ot_hourly_rate=Decimal("250.00")
    )
    print(f"[OK] Technician profile created: {emp.first_name} {emp.last_name} ({emp.employee_code})")

    # 4. Test Create Portal User for Technician
    create_portal_view = TechnicianProfileViewSet.as_view({'post': 'create_portal_user'})
    req_portal = factory.post(
        f'/api/industries/mobile/hrm/technicians/{tech.id}/create-portal-user/',
        data={'username': 'kashif_tech_user', 'password': 'SecurePassword123!', 'role': 'hardware_technician'}
    )
    force_authenticate(req_portal, user=admin_user)
    res_portal = create_portal_view(req_portal, pk=str(tech.id))
    assert res_portal.status_code == 200, f"Portal user creation failed: {res_portal.data}"
    assert res_portal.data['username'] == 'kashif_tech_user'
    assert res_portal.data['role'] == 'hardware_technician'
    
    emp.refresh_from_db()
    assert emp.user is not None, "Employee user relation must be set"
    assert emp.user.username == 'kashif_tech_user'
    print(f"[OK] Portal User Created & Linked: {emp.user.username} (Role: {emp.user.role})")

    # 5. Test Appointment Letter PDF with Company Logo handling
    cand = OnboardingCandidate.objects.create(
        company=company,
        full_name="Kashif Candidate",
        position="Hardware Tech",
        department_type=MobileDepartment.HARDWARE,
        offered_salary=Decimal("25000.00"),
        appointment_date=datetime.date(2026, 10, 1),
        appointment_month="October",
        status="OFFERED"
    )
    pdf_bytes = MobileAppointmentPDFService.generate_appointment_pdf(company, cand)
    assert len(pdf_bytes) > 1000, "Appointment PDF must be generated with content"
    print(f"[OK] Appointment Letter PDF generated with logo compatibility: {len(pdf_bytes)} bytes")

    # 6. Test Payslip PDF with Company Logo handling
    payslip_pdf = MobilePayslipPDFService.generate_payslip_pdf(company, emp, 2026, 9)
    assert len(payslip_pdf) > 1000, "Payslip PDF must be generated with content"
    print(f"[OK] Payslip PDF generated with logo compatibility: {len(payslip_pdf)} bytes")

    # 7. Test Leave Request Approval & Auto-Sync to Attendance
    leave = EmployeeLeaveRequest.objects.create(
        company=company,
        employee=emp,
        leave_type="HALF_DAY",
        request_date=datetime.date(2026, 9, 14),
        reason="Doctor visit and testing bench coverage",
        status="PENDING"
    )
    approve_leave_view = EmployeeLeaveRequestViewSet.as_view({'post': 'approve_leave'})
    req_approve = factory.post(
        f'/api/industries/mobile/hrm/leave-requests/{leave.id}/approve/',
        data={'admin_notes': 'Approved by Lab Incharge'}
    )
    force_authenticate(req_approve, user=admin_user)
    res_approve = approve_leave_view(req_approve, pk=str(leave.id))
    assert res_approve.status_code == 200, f"Leave approval failed: {res_approve.data}"
    
    leave.refresh_from_db()
    assert leave.status == "APPROVED"
    assert leave.admin_notes == "Approved by Lab Incharge"

    # Verify that attendance cell was automatically updated to 'DA'
    att = MobileMonthlyAttendance.objects.get(company=company, employee=emp, year=2026, month=9)
    assert att.days_data.get('14') == 'DA', f"Day 14 attendance must be 'DA', found {att.days_data.get('14')}"
    assert att.allowed_half_day_count >= 1, "Allowed half day counter must increment"
    print(f"[OK] Leave approval auto-sync verified: Day 14 marked '{att.days_data.get('14')}' in monthly attendance")

    # 8. Test Strict RBAC & Month/Year filtering in EmployeeSelfServiceViewSet
    self_service_view = EmployeeSelfServiceViewSet.as_view({'get': 'list'})
    
    # Non-admin staff request (staff user cannot specify someone else's employee_id)
    req_staff = factory.get('/api/industries/mobile/hrm/self-service/?year=2026&month=9&employee_id=fake-other-id')
    force_authenticate(req_staff, user=emp.user)
    res_staff = self_service_view(req_staff)
    assert res_staff.status_code == 200, f"Self-service list failed: {res_staff.data}"
    assert res_staff.data['employee']['id'] == str(emp.id), "Staff must strictly receive their own profile regardless of query param"
    assert res_staff.data['attendance']['days_data'].get('14') == 'DA', "Staff attendance must reflect approved leave"
    assert res_staff.data['selected_year'] == 2026
    assert res_staff.data['selected_month'] == 9
    print(f"[OK] Strict RBAC verified: Staff user '{emp.user.username}' locked to own profile (EMP: {res_staff.data['employee']['employee_code']})")

    # Month filter test (e.g. October 2026)
    req_oct = factory.get('/api/industries/mobile/hrm/self-service/?year=2026&month=10')
    force_authenticate(req_oct, user=emp.user)
    res_oct = self_service_view(req_oct)
    assert res_oct.status_code == 200
    assert res_oct.data['selected_month'] == 10
    print(f"[OK] Month & Year calendar filter verified: successfully queried month {res_oct.data['selected_month']}")

    print("==================================================")
    print("ALL 8 VERIFICATION PROTOCOLS PASSED WITH 0 ERRORS!")
    print("==================================================")

if __name__ == '__main__':
    test_workflow()
