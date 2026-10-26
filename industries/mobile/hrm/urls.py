from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    TechnicianProfileViewSet,
    MobileAttendanceViewSet,
    MobilePayrollViewSet,
    MobileSeedSampleView,
    CompanyPolicyViewSet,
    OnboardingCandidateViewSet,
    EmployeeLeaveRequestViewSet,
    EmployeeExitRequestViewSet,
    EmployeeSelfServiceViewSet
)

router = DefaultRouter()
router.register(r'technicians', TechnicianProfileViewSet, basename='mobile-technicians')
router.register(r'attendance', MobileAttendanceViewSet, basename='mobile-attendance')
router.register(r'payroll', MobilePayrollViewSet, basename='mobile-payroll')
router.register(r'policies', CompanyPolicyViewSet, basename='mobile-policies')
router.register(r'candidates', OnboardingCandidateViewSet, basename='mobile-candidates')
router.register(r'leave-requests', EmployeeLeaveRequestViewSet, basename='mobile-leave-requests')
router.register(r'exit-requests', EmployeeExitRequestViewSet, basename='mobile-exit-requests')
router.register(r'self-service', EmployeeSelfServiceViewSet, basename='mobile-self-service')

urlpatterns = [
    path('seed-sample/', MobileSeedSampleView.as_view(), name='mobile-seed-sample'),
    path('', include(router.urls)),
]
