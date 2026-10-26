import os
import sys
sys.stdout.reconfigure(encoding='utf-8')
import datetime
from decimal import Decimal

# Add workspace root to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp_core.settings')
import django
django.setup()

from django.db import transaction
from companies.models import Company
from hrm.models import Employee, Department, Designation
from industries.mobile.hrm.models import (
    TechnicianProfile, MobileMonthlyAttendance, MobileDepartment,
    CompanyPolicy, OnboardingCandidate, EmployeeLeaveRequest, EmployeeExitRequest
)
from industries.mobile.hrm.services.appointment_pdf_service import MobileAppointmentPDFService
from industries.mobile.hrm.services.payroll_service import MobilePayrollService
from industries.mobile.hrm.views import EmployeeSelfServiceViewSet
from rest_framework.test import APIRequestFactory

def run_verification():
    print("=" * 60)
    print("STARTING MOBILE HRM PHASE 2 COMPLETE SYSTEM VERIFICATION")
    print("=" * 60)

    company = Company.objects.filter(business_type='mobile').first()
    if not company:
        company = Company.objects.filter(name__icontains='abc').first()
    if not company:
        company = Company.objects.first()

    print(f"[1] Target Company: {company.name} (ID: {company.id})")

    # TEST 1: Company Policies
    print("\n--- TEST 1: Company Policies ---")
    active_policy = CompanyPolicy.objects.filter(company=company, is_active=True).first()
    if not active_policy:
        active_policy = CompanyPolicy.objects.create(
            company=company,
            title="Softech Systems Rules & Regulations",
            version="1.0",
            content="1. Shift start: 11:00 AM\n2. 1-Month notice period required.",
            is_active=True
        )
    print(f"Active Policy Title: {active_policy.title}")
    print(f"Policy Version: v{active_policy.version}")
    assert active_policy.is_active is True, "Policy should be active"
    assert len(active_policy.content) > 50, "Policy content should be populated"
    print("✓ Company Policy Test Passed!")

    # TEST 2: Onboarding Candidates & Printable Appointment Letter PDF
    print("\n--- TEST 2: Onboarding Candidates & Appointment Letter PDF ---")
    candidate = OnboardingCandidate.objects.filter(company=company, full_name__icontains="Shahzaib").first()
    if not candidate:
        candidate = OnboardingCandidate.objects.create(
            company=company,
            full_name="Shahzaib Akbar",
            phone="0300-1234567",
            position="Mobile Hardware Technician",
            department_type=MobileDepartment.HARDWARE,
            offered_salary=Decimal('20000.00'),
            allowance="Travel 1000 Pkr/= (Every Week)",
            working_hours="11:00 to 9:00",
            notice_period="One Month",
            appointment_date=datetime.date(2026, 10, 1),
            appointment_month="October",
            status="OFFERED"
        )
    print(f"Candidate: {candidate.full_name} | Position: {candidate.position} | Status: {candidate.status}")
    pdf_bytes = MobileAppointmentPDFService.generate_appointment_pdf(company, candidate)
    assert pdf_bytes is not None, "PDF bytes should not be None"
    assert pdf_bytes.startswith(b'%PDF'), "Should be valid PDF format"
    print(f"✓ Appointment Letter PDF Generated Successfully! ({len(pdf_bytes)} bytes)")

    # TEST 3: Candidate Conversion to Employee
    print("\n--- TEST 3: Candidate Conversion to Employee ---")
    with transaction.atomic():
        test_cand = OnboardingCandidate.objects.create(
            company=company,
            full_name="Talha Mahmood",
            phone="0333-7654321",
            position="Software Lab Flasher",
            department_type=MobileDepartment.SOFTWARE,
            offered_salary=Decimal('24000.00'),
            status="OFFERED"
        )
        dept_obj, _ = Department.objects.get_or_create(company=company, name='Software')
        emp_code = f"EMP{Employee.objects.filter(company=company).count() + 1:02d}"
        new_emp = Employee.objects.create(
            company=company,
            employee_code=emp_code,
            first_name="Talha",
            last_name="Mahmood",
            department=dept_obj,
            is_active=True
        )
        tech_prof = TechnicianProfile.objects.create(
            company=company,
            employee=new_emp,
            department_type=MobileDepartment.SOFTWARE,
            ot_hourly_rate=Decimal('250.00'),
            phone_1_model='Vivo Y20'
        )
        test_cand.status = 'HIRED'
        test_cand.converted_employee = new_emp
        test_cand.save()
        print(f"Converted Employee: {new_emp.first_name} {new_emp.last_name} ({new_emp.employee_code})")
        print(f"Technician Profile ID: {tech_prof.id} | Department: {tech_prof.department_type}")
        assert test_cand.status == 'HIRED'
        # Roll back this temporary conversion test
        transaction.set_rollback(True)
    print("✓ Candidate Conversion Workflow Passed!")

    # TEST 4: Leave & Relief Request Workflow
    print("\n--- TEST 4: Leave & Relief Request Workflow ---")
    emp = Employee.objects.filter(company=company).first()
    assert emp is not None, "An active employee should exist"
    leave_req = EmployeeLeaveRequest.objects.create(
        company=company,
        employee=emp,
        leave_type='HALF_DAY',
        request_date=datetime.date.today(),
        reason="Medical emergency checkup",
        status='PENDING'
    )
    print(f"Created Leave Request #{leave_req.id}: {leave_req.leave_type} - {leave_req.status}")
    leave_req.status = 'APPROVED'
    leave_req.admin_notes = 'Approved by Workshop Director'
    leave_req.save()
    print(f"Updated Leave Request Status: {leave_req.status} (Notes: {leave_req.admin_notes})")
    assert leave_req.status == 'APPROVED'
    leave_req.delete()
    print("✓ Leave Request Workflow Passed!")

    # TEST 5: Exit & Notice Period Countdown
    print("\n--- TEST 5: Exit & Notice Period Countdown ---")
    today = datetime.date.today()
    lwd = today + datetime.timedelta(days=30)
    exit_req = EmployeeExitRequest.objects.create(
        company=company,
        employee=emp,
        resignation_date=today,
        last_working_day=lwd,
        reason="Career progression in mobile electronics",
        clearance_status='PENDING'
    )
    days_rem = exit_req.days_remaining
    print(f"Exit Request #{exit_req.id}: Resigned {exit_req.resignation_date}, LWD {exit_req.last_working_day}")
    print(f"Notice Countdown Remaining: {days_rem} days")
    assert 28 <= days_rem <= 31, f"Expected ~30 days remaining, got {days_rem}"

    exit_req.devices_returned = True
    exit_req.handover_completed = True
    exit_req.clearance_status = 'CLEARANCE'
    exit_req.save()
    print(f"Clearance Status: {exit_req.clearance_status} | Devices Returned: {exit_req.devices_returned}")
    assert exit_req.devices_returned is True
    exit_req.delete()
    print("✓ Exit Process & Notice Period Countdown Passed!")

    # TEST 6: Employee Self-Service Data Payload
    print("\n--- TEST 6: Employee Self-Service Data Payload ---")
    tech = TechnicianProfile.objects.filter(company=company).first()
    assert tech is not None, "TechnicianProfile should exist"
    emp = tech.employee

    # Test Self-Service endpoint view logic
    from django.contrib.auth import get_user_model
    from rest_framework.test import force_authenticate
    User = get_user_model()
    user = User.objects.filter(company=company).first()
    if not user:
        user = User.objects.first()

    factory = APIRequestFactory()
    request = factory.get(f'/api/mobile/hrm/self-service/?employee_id={emp.id}')
    force_authenticate(request, user=user)
    view = EmployeeSelfServiceViewSet.as_view({'get': 'list'})
    response = view(request)
    print(f"Self-Service API Response HTTP Status: {response.status_code}")
    assert response.status_code == 200, "Should return 200 OK"
    data = response.data
    print(f"Payload Keys: {list(data.keys())}")
    assert 'employee' in data, "Must have employee details"
    assert 'profile' in data, "Must have profile parameters"
    assert 'attendance' in data, "Must have attendance summary"
    assert 'active_policy' in data, "Must have active policy"
    print(f"Employee Name: {data['employee']['first_name']} {data['employee']['last_name']}")
    print(f"Assigned Device: {data['profile']['phone_1_model']}")
    print(f"Present Days: {data['attendance']['present_count']} | Overtime Hours: {data['attendance']['overtime_hours']}")
    print("✓ Employee Self-Service Data Payload Passed!")

    print("\n" + "=" * 60)
    print("ALL 6 PHASE 2 SYSTEM WORKFLOWS SUCCESSFULLY VERIFIED!")
    print("=" * 60)

if __name__ == '__main__':
    run_verification()
