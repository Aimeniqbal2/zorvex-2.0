from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    TechnicianProfileViewSet,
    MobileAttendanceViewSet,
    MobilePayrollViewSet,
    MobileSeedSampleView
)

router = DefaultRouter()
router.register(r'technicians', TechnicianProfileViewSet, basename='mobile-technicians')
router.register(r'attendance', MobileAttendanceViewSet, basename='mobile-attendance')
router.register(r'payroll', MobilePayrollViewSet, basename='mobile-payroll')

urlpatterns = [
    path('seed-sample/', MobileSeedSampleView.as_view(), name='mobile-seed-sample'),
    path('', include(router.urls)),
]
