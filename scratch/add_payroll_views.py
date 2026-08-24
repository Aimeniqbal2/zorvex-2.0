import os

with open('hrm/views.py', 'a') as f:
    f.write('''

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

class PayrollRunViewSet(TenantModelViewSet):
    queryset = PayrollRun.objects.filter(is_deleted=False)
    serializer_class = PayrollRunSerializer
    module_name = 'HRM'

class PayslipViewSet(TenantModelViewSet):
    queryset = Payslip.objects.filter(is_deleted=False)
    serializer_class = PayslipSerializer
    module_name = 'HRM'

class PayslipLineViewSet(TenantModelViewSet):
    queryset = PayslipLine.objects.filter(is_deleted=False)
    serializer_class = PayslipLineSerializer
    module_name = 'HRM'
''')
