from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from erp_core.views import TenantModelViewSet
from .models import Notification
from .serializers import NotificationSerializer

class NotificationViewSet(TenantModelViewSet):
    queryset = Notification.objects.all()
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        # If user is not superuser, filter to notifications addressed to them or global
        if not getattr(self.request.user, 'is_superuser', False):
            qs = qs.filter(user=self.request.user)
        return qs.order_by('-created_at')

    def perform_create(self, serializer):
        user = serializer.validated_data.get('user') or self.request.user
        company = getattr(self.request.user, 'company', None) or getattr(user, 'company', None)
        serializer.save(user=user, company=company)

    @action(detail=False, methods=['post'], url_path='mark-all-read')
    def mark_all_read(self, request):
        qs = self.get_queryset().filter(is_read=False)
        updated_count = qs.update(is_read=True)
        return Response({
            'success': True,
            'updated_count': updated_count,
            'message': 'All notifications marked as read.'
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='mark-read')
    def mark_read(self, request, pk=None):
        notif = self.get_object()
        notif.is_read = True
        notif.save(update_fields=['is_read'])
        return Response({'success': True, 'notification': self.get_serializer(notif).data})

