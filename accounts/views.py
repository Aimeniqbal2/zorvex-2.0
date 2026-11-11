from django.contrib.auth import update_session_auth_hash
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenObtainPairView
from subscriptions.models import CompanySubscription
from .models import User
from .serializers import (
    UserSerializer,
    UserProfileSerializer,
    VerifyPasswordSerializer,
    ChangePasswordSerializer,
    CustomTokenObtainPairSerializer,
)

class CustomTokenObtainPairView(TokenObtainPairView):
    """Enables generating our cryptographically complex role-embedded API tokens natively."""
    serializer_class = CustomTokenObtainPairSerializer

class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all()
    serializer_class = UserSerializer

    def get_queryset(self):
        user = self.request.user
        if not user.is_authenticated:
            return User.objects.none()
        
        # Superusers can see all if they physically aren't bound, but when natively testing an active tenancy, bind them securely.
        if user.company_id:
            return User.objects.filter(company_id=user.company_id)
        if user.is_superuser:
            return User.objects.all()
        return User.objects.none()

    def get_permissions(self):
        """
        Locks HR generation/destruction specifically to Admins.
        Permits safe Read-Only listing for dropdown assignments natively elsewhere.
        """
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            from erp_core.rbac import IsTenantAdmin
            return [IsAuthenticated(), IsTenantAdmin()]
        return [IsAuthenticated()]

    def perform_create(self, serializer):
        user = self.request.user
        company_id = getattr(user, 'company_id', None)
        
        if user.is_authenticated and company_id:
            # Check SaaS Subscription limits
            active_sub = CompanySubscription.objects.filter(company_id=company_id, is_active=True).first()
            if active_sub:
                max_users = active_sub.plan.max_users
                current_users = User.objects.filter(company_id=company_id).count()
                if current_users >= max_users:
                    raise PermissionDenied(f"Plan limit reached! Max {max_users} users allowed on the '{active_sub.plan.name}' plan.")
            
            serializer.save(company_id=company_id)
        else:
            # Fallback for superadmin or unassociated users
            serializer.save()

    @action(detail=False, methods=['get'], url_path='me', permission_classes=[IsAuthenticated])
    def me(self, request):
        """
        GET /api/accounts/users/me/
        Returns complete read-only profile details for the currently authenticated user.
        """
        current_user = (
            User._base_manager.select_related(
                'company',
                'company_role',
                'employee_profile_new',
                'employee_profile_new__department',
                'employee_profile_new__designation',
                'employee_profile_new__position',
                'employee_profile_new__branch',
            )
            .filter(pk=request.user.pk)
            .first()
        ) or request.user
        serializer = UserProfileSerializer(current_user, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'], url_path='verify-password', permission_classes=[IsAuthenticated])
    def verify_password(self, request):
        """
        POST /api/accounts/users/verify-password/
        Verifies that old_password matches the logged-in user's current password before unlocking password change.
        """
        serializer = VerifyPasswordSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        return Response({'valid': True, 'message': 'Current password verified.'}, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'], url_path='change-password', permission_classes=[IsAuthenticated])
    def change_password(self, request):
        """
        POST /api/accounts/users/change-password/
        Authenticates current/old password, validates new password, updates password for the logged-in user,
        and issues fresh JWT tokens so the active session continues uninterrupted.
        """
        serializer = ChangePasswordSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)

        current_user = User._base_manager.filter(pk=request.user.pk).first() or request.user
        current_user.set_password(serializer.validated_data['new_password'])
        current_user.save(update_fields=['password'])

        try:
            update_session_auth_hash(request, current_user)
        except Exception:
            pass

        refresh = CustomTokenObtainPairSerializer.get_token(current_user)
        return Response({
            'success': True,
            'message': 'Your password has been changed successfully.',
            'access': str(refresh.access_token),
            'refresh': str(refresh),
        }, status=status.HTTP_200_OK)
