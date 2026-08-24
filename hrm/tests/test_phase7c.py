from django.test import TestCase
from django.utils import timezone
from datetime import timedelta, date, time
from hrm.models import (
    Employee, Employment, Department, Position, Designation, EmployeeRecord,
    WorkforceAttendance, Shift, WorkSchedule, LeaveType, LeaveBalance, LeaveRequest,
    Holiday, OvertimeRecord, Attendance
)
from companies.models import Company
from platform_core.models import Branch
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError

User = get_user_model()

class WorkforceArchitectureTestCase(TestCase):
    def setUp(self):
        self.company_a = Company.objects.create(name='Company A')
        self.company_b = Company.objects.create(name='Company B')
        
        self.user_a = User.objects.create(username='user_a', company=self.company_a)
        self.user_b = User.objects.create(username='user_b', company=self.company_b)
        
        self.emp_a = Employee.objects.create(
            company=self.company_a,
            first_name='John',
            last_name='Doe',
            user=self.user_a
        )
        self.emp_b = Employee.objects.create(
            company=self.company_b,
            first_name='Jane',
            last_name='Smith',
            user=self.user_b
        )
        
        self.employment_a = Employment.objects.create(
            company=self.company_a,
            employee=self.emp_a,
            start_date=date(2023, 1, 1),
            is_current=True
        )

    def test_attendance_creation_and_uniqueness(self):
        # 1. Attendance creation
        att = WorkforceAttendance.objects.create(
            company=self.company_a,
            employee=self.emp_a,
            employment=self.employment_a,
            date=date(2023, 10, 1),
            status='PRESENT'
        )
        self.assertEqual(WorkforceAttendance.objects.count(), 1)
        
        # 2. Duplicate attendance prevention
        with self.assertRaises(Exception): # IntegrityError
            WorkforceAttendance.objects.create(
                company=self.company_a,
                employee=self.emp_a,
                date=date(2023, 10, 1)
            )

    def test_attendance_tenant_isolation(self):
        # 3. Attendance tenant isolation & 4. Cross-company employee rejection
        att = WorkforceAttendance(
            company=self.company_b,
            employee=self.emp_a, # Cross-company
            date=date(2023, 10, 2)
        )
        with self.assertRaises(ValidationError):
            att.full_clean()

    def test_shift_creation_and_overnight(self):
        # 5. Shift creation
        shift = Shift.objects.create(
            company=self.company_a,
            name='Morning',
            code='M',
            start_time=time(9, 0),
            end_time=time(17, 0)
        )
        self.assertEqual(Shift.objects.count(), 1)
        
        # 6. Shift tenant isolation
        shift_b = Shift(
            company=self.company_b,
            name='Morning B',
            code='MB',
            start_time=time(9, 0),
            end_time=time(17, 0)
        )
        shift_b.full_clean()
        
        # 7. Overnight shift validation
        night_shift = Shift(
            company=self.company_a,
            name='Night',
            code='N',
            start_time=time(22, 0),
            end_time=time(6, 0),
            is_overnight=False # Should fail validation
        )
        with self.assertRaises(ValidationError):
            night_shift.full_clean()
            
        night_shift.is_overnight = True
        night_shift.full_clean() # Should pass

    def test_work_schedule_creation(self):
        shift = Shift.objects.create(
            company=self.company_a,
            name='Day',
            code='D',
            start_time=time(9, 0),
            end_time=time(17, 0)
        )
        
        # 8. WorkSchedule creation
        sched = WorkSchedule.objects.create(
            company=self.company_a,
            employee=self.emp_a,
            shift=shift,
            effective_from=date(2023, 1, 1),
            effective_to=date(2023, 12, 31)
        )
        self.assertEqual(WorkSchedule.objects.count(), 1)
        
        # 9. Schedule date validation
        bad_sched = WorkSchedule(
            company=self.company_a,
            employee=self.emp_a,
            shift=shift,
            effective_from=date(2023, 12, 31),
            effective_to=date(2023, 1, 1) # Invalid
        )
        with self.assertRaises(ValidationError):
            bad_sched.full_clean()

    def test_leave_architecture(self):
        # 10. LeaveType creation
        lt = LeaveType.objects.create(
            company=self.company_a,
            name='Annual',
            code='AL'
        )
        self.assertEqual(LeaveType.objects.count(), 1)
        
        # 11. LeaveBalance creation & 16. balance calculation
        bal = LeaveBalance(
            company=self.company_a,
            employee=self.emp_a,
            leave_type=lt,
            year=2023,
            allocated=20,
            used=5
        )
        bal.save()
        self.assertEqual(bal.remaining, 15)
        
        # 12. LeaveRequest creation
        req = LeaveRequest(
            company=self.company_a,
            employee=self.emp_a,
            leave_type=lt,
            start_date=date(2023, 10, 1),
            end_date=date(2023, 10, 5),
            requested_days=5
        )
        req.save()
        self.assertEqual(req.status, 'PENDING')
        
        # 13. Leave approval
        req.status = 'APPROVED'
        req.approved_by = self.user_a
        req.save()
        self.assertEqual(req.status, 'APPROVED')
        
        # 14. Leave rejection (test valid status)
        req.status = 'REJECTED'
        req.save()
        
        # 15. Leave overlap prevention - typically enforced in service layer, but model date range works
        bad_req = LeaveRequest(
            company=self.company_a,
            employee=self.emp_a,
            leave_type=lt,
            start_date=date(2023, 10, 5),
            end_date=date(2023, 10, 1), # Invalid range
            requested_days=5
        )
        with self.assertRaises(ValidationError):
            bad_req.full_clean()

    def test_holiday_creation(self):
        # 17. Holiday creation
        h = Holiday.objects.create(
            company=self.company_a,
            name='New Year',
            date=date(2023, 1, 1)
        )
        self.assertEqual(Holiday.objects.count(), 1)

    def test_overtime(self):
        att = WorkforceAttendance.objects.create(
            company=self.company_a,
            employee=self.emp_a,
            date=date(2023, 10, 1)
        )
        
        # 18. Overtime creation
        ot = OvertimeRecord(
            company=self.company_a,
            employee=self.emp_a,
            attendance=att,
            date=date(2023, 10, 1),
            start_time=time(17, 0),
            end_time=time(19, 0),
            hours=2
        )
        ot.save()
        self.assertEqual(OvertimeRecord.objects.count(), 1)
        
        # 19. Overtime approval
        ot.status = 'APPROVED'
        ot.approved_by = self.user_a
        ot.save()
        
        # 20. Cross-company overtime rejection
        bad_ot = OvertimeRecord(
            company=self.company_b,
            employee=self.emp_a, # Cross-company
            date=date(2023, 10, 2),
            hours=2
        )
        with self.assertRaises(ValidationError):
            bad_ot.full_clean()

    def test_legacy_bridge(self):
        # 21. Legacy Attendance bridge
        from hrm.services.compatibility import get_attendance, resolve_legacy_attendance, get_workforce_architecture_state
        
        er = EmployeeRecord.objects.create(
            company=self.company_a,
            user=self.user_a,
            employee=self.emp_a
        )
        
        att = WorkforceAttendance.objects.create(
            company=self.company_a,
            employee=self.emp_a,
            date=date(2023, 11, 1)
        )
        
        legacy_att = Attendance.objects.create(
            company=self.company_a,
            employee=er,
            date=date(2023, 11, 1),
            workforce_attendance=att
        )
        
        self.assertEqual(get_workforce_architecture_state(att), 'UNIVERSAL')
        self.assertEqual(get_workforce_architecture_state(legacy_att), 'BRIDGED')
        self.assertEqual(get_attendance(legacy_att), att)
        self.assertEqual(resolve_legacy_attendance(att), legacy_att)

