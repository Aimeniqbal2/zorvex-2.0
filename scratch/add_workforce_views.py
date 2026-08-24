import os

with open('hrm/views.py', 'a') as f:
    f.write('''
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
''')
