import os

with open('hrm/serializers.py', 'a') as f:
    f.write('''
from .models import (
    WorkforceAttendance, Shift, WorkSchedule, LeaveType, LeaveBalance, LeaveRequest, Holiday, OvertimeRecord
)

class WorkforceAttendanceSerializer(BaseTenantSerializer):
    class Meta:
        model = WorkforceAttendance
        fields = '__all__'
        read_only_fields = ['id', 'company', 'created_at', 'updated_at', 'is_deleted']

class ShiftSerializer(BaseTenantSerializer):
    class Meta:
        model = Shift
        fields = '__all__'
        read_only_fields = ['id', 'company', 'created_at', 'updated_at', 'is_deleted']

class WorkScheduleSerializer(BaseTenantSerializer):
    class Meta:
        model = WorkSchedule
        fields = '__all__'
        read_only_fields = ['id', 'company', 'created_at', 'updated_at', 'is_deleted']

class LeaveTypeSerializer(BaseTenantSerializer):
    class Meta:
        model = LeaveType
        fields = '__all__'
        read_only_fields = ['id', 'company', 'created_at', 'updated_at', 'is_deleted']

class LeaveBalanceSerializer(BaseTenantSerializer):
    class Meta:
        model = LeaveBalance
        fields = '__all__'
        read_only_fields = ['id', 'company', 'created_at', 'updated_at', 'is_deleted', 'remaining']

class LeaveRequestSerializer(BaseTenantSerializer):
    class Meta:
        model = LeaveRequest
        fields = '__all__'
        read_only_fields = ['id', 'company', 'created_at', 'updated_at', 'is_deleted', 'status', 'approved_by', 'approved_at', 'rejection_reason']

class HolidaySerializer(BaseTenantSerializer):
    class Meta:
        model = Holiday
        fields = '__all__'
        read_only_fields = ['id', 'company', 'created_at', 'updated_at', 'is_deleted']

class OvertimeRecordSerializer(BaseTenantSerializer):
    class Meta:
        model = OvertimeRecord
        fields = '__all__'
        read_only_fields = ['id', 'company', 'created_at', 'updated_at', 'is_deleted', 'status', 'approved_by', 'approved_at']
''')
