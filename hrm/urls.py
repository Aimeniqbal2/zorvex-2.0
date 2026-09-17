from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    CandidateViewSet, CandidateDocumentViewSet, CandidateVerificationViewSet,
    DepartmentViewSet, PositionViewSet, DesignationViewSet,
    EmployeeViewSet, EmploymentViewSet,
    EmployeeRecordViewSet, AttendanceViewSet,
    WorkforceAttendanceViewSet, ShiftViewSet, WorkScheduleViewSet, LeaveTypeViewSet, LeaveBalanceViewSet, LeaveRequestViewSet, HolidayViewSet, OvertimeRecordViewSet,
    SalaryComponentViewSet, SalaryStructureViewSet, SalaryStructureComponentViewSet,
    EmployeeSalaryAssignmentViewSet, PayrollPeriodViewSet, PayrollRunViewSet,
    PayslipViewSet, PayslipLineViewSet, PayrollAccountingConfigurationViewSet,
    StatutorySchemeViewSet, StatutoryRuleViewSet, EmployeeStatutoryEnrollmentViewSet,
    PayrollDisbursementViewSet, PayslipDisbursementViewSet, CompanyPayrollPolicyViewSet,
    EmployeeNextOfKinViewSet, EmployeeDocumentViewSet, EmployeeTrainingViewSet,
    EmploymentHistoryViewSet, StatutorySchemeRateHistoryViewSet
)

router = DefaultRouter()
router.register(r'departments', DepartmentViewSet, basename='department')
router.register(r'positions', PositionViewSet, basename='position')
router.register(r'designations', DesignationViewSet, basename='designation')
router.register(r'employees', EmployeeViewSet, basename='employee')
router.register(r'employments', EmploymentViewSet, basename='employment')
router.register(r'employeerecords', EmployeeRecordViewSet, basename='employeerecord')
router.register(r'attendances', AttendanceViewSet, basename='attendance')


router.register(r'workforce-attendance', WorkforceAttendanceViewSet, basename='workforceattendance')
router.register(r'shifts', ShiftViewSet, basename='shift')
router.register(r'work-schedules', WorkScheduleViewSet, basename='workschedule')
router.register(r'leave-types', LeaveTypeViewSet, basename='leavetype')
router.register(r'leave-balances', LeaveBalanceViewSet, basename='leavebalance')
router.register(r'leave-requests', LeaveRequestViewSet, basename='leaverequest')
router.register(r'holidays', HolidayViewSet, basename='holiday')
router.register(r'overtime', OvertimeRecordViewSet, basename='overtimerecord')

router.register(r'salary-components', SalaryComponentViewSet, basename='salarycomponent')
router.register(r'salary-structures', SalaryStructureViewSet, basename='salarystructure')
router.register(r'salary-structure-components', SalaryStructureComponentViewSet, basename='salarystructurecomponent')
router.register(r'employee-salary-assignments', EmployeeSalaryAssignmentViewSet, basename='employeesalaryassignment')
router.register(r'payroll-periods', PayrollPeriodViewSet, basename='payrollperiod')
router.register(r'payroll-runs', PayrollRunViewSet, basename='payrollrun')
router.register(r'payslips', PayslipViewSet, basename='payslip')
router.register(r'payslip-lines', PayslipLineViewSet, basename='payslipline')
router.register(r'payroll-accounting-config', PayrollAccountingConfigurationViewSet, basename='payrollaccountingconfig')

# C-1 URLs
router.register(r'candidates', CandidateViewSet, basename='candidate')
router.register(r'candidate-documents', CandidateDocumentViewSet, basename='candidatedocument')
router.register(r'candidate-verifications', CandidateVerificationViewSet, basename='candidateverification')

# PHASE C-6
router.register(r'statutory-schemes', StatutorySchemeViewSet, basename='statutoryscheme')
router.register(r'statutory-rules', StatutoryRuleViewSet, basename='statutoryrule')
router.register(r'employee-statutory-enrollments', EmployeeStatutoryEnrollmentViewSet, basename='employeestatutoryenrollment')
router.register(r'payroll-disbursements', PayrollDisbursementViewSet, basename='payrolldisbursement')
router.register(r'payslip-disbursements', PayslipDisbursementViewSet, basename='payslipdisbursement')
router.register(r'company-payroll-policy', CompanyPayrollPolicyViewSet, basename='company-payroll-policy')

# PHASE S-5A WORKFORCE
router.register(r'employee-next-of-kin', EmployeeNextOfKinViewSet, basename='employeenextofkin')
router.register(r'employee-documents', EmployeeDocumentViewSet, basename='employeedocument')
router.register(r'employee-trainings', EmployeeTrainingViewSet, basename='employeetraining')
router.register(r'employment-history', EmploymentHistoryViewSet, basename='employmenthistory')
router.register(r'statutory-scheme-rate-history', StatutorySchemeRateHistoryViewSet, basename='statutoryschemeratehistory')

urlpatterns = [
    path('', include(router.urls)),
]
