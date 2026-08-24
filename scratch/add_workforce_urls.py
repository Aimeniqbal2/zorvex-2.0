import os

with open('hrm/urls.py', 'r') as f:
    content = f.read()

# Add viewsets to imports
import_str = "    WorkforceAttendanceViewSet, ShiftViewSet, WorkScheduleViewSet, LeaveTypeViewSet, LeaveBalanceViewSet, LeaveRequestViewSet, HolidayViewSet, OvertimeRecordViewSet"
if import_str not in content:
    content = content.replace(
        "    EmployeeRecordViewSet, AttendanceViewSet",
        "    EmployeeRecordViewSet, AttendanceViewSet,\n" + import_str
    )

# Add routes
routes = """
router.register(r'workforce-attendance', WorkforceAttendanceViewSet, basename='workforceattendance')
router.register(r'shifts', ShiftViewSet, basename='shift')
router.register(r'work-schedules', WorkScheduleViewSet, basename='workschedule')
router.register(r'leave-types', LeaveTypeViewSet, basename='leavetype')
router.register(r'leave-balances', LeaveBalanceViewSet, basename='leavebalance')
router.register(r'leave-requests', LeaveRequestViewSet, basename='leaverequest')
router.register(r'holidays', HolidayViewSet, basename='holiday')
router.register(r'overtime', OvertimeRecordViewSet, basename='overtimerecord')
"""
if "workforce-attendance" not in content:
    content = content.replace("urlpatterns = [", routes + "\nurlpatterns = [")

with open('hrm/urls.py', 'w') as f:
    f.write(content)
