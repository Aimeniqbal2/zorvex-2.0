from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import SenderIdentityViewSet, EmailTemplateViewSet, OutboundEmailViewSet, UserEmailSignatureViewSet

router = DefaultRouter()
router.register(r'senders', SenderIdentityViewSet)
router.register(r'templates', EmailTemplateViewSet)
router.register(r'emails', OutboundEmailViewSet)
router.register(r'signatures', UserEmailSignatureViewSet)

urlpatterns = [
    path('', include(router.urls)),
]

