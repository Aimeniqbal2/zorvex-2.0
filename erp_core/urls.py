from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
from django.views.static import serve
from rest_framework_simplejwt.views import TokenRefreshView
from accounts.views import CustomTokenObtainPairView
from erp_core.search_views import GlobalSearchView
from django.views.generic import RedirectView

urlpatterns = [
    # Redirect Django root to the React application (Vite 5173 in dev, /app/ in production)
    path('', RedirectView.as_view(url='http://localhost:5173/app/' if getattr(settings, 'DEBUG', True) else '/app/', permanent=False), name='root_redirect'),

    path('admin/', admin.site.urls),
    
    # JWT Auth Endpoints
    path('api/auth/login/', CustomTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    
    # ERP Module Endpoints
    path('api/companies/', include('companies.urls')),
    path('api/accounts/', include('accounts.urls')),
    path('api/subscriptions/', include('subscriptions.urls')),
    path('api/inventory/', include('inventory.urls')),
    path('api/services/', include('services.urls')),
    path('api/sales/', include('sales.urls')),
    path('api/hrm/', include('hrm.urls')),
    path('api/finance/', include('finance.urls')),
    path('api/notifications/', include('notifications.urls')),
    path('api/reports/', include('reports.urls')),
    path('api/crm/', include('crm.urls')),
    path('api/purchasing/', include('purchasing.urls')),
    path('api/operations/', include('operations.urls')),
    path('api/billing/', include('billing.urls')),
    path('api/communications/', include('communications.urls')),
    path('api/platform/', include('platform_core.urls', namespace='platform_core')),
    path('api/security/crm/', include('security_crm.urls', namespace='security_crm')),

    # Global cross-module search
    path('api/search/', GlobalSearchView.as_view(), name='global_search'),
]

from django.http import HttpResponseForbidden

def block_sensitive_media(request, path):
    return HttpResponseForbidden("Direct access to sensitive attachments is forbidden. Please use the authenticated API endpoint.")

import os

urlpatterns += [
    # Employee profile photos for roster, identity badge & modal display (routed via both /media/ and /api/hrm/ for reverse proxy compatibility)
    re_path(r'^media/hrm/employee_photos/(?P<path>.*)$', serve, {'document_root': os.path.join(str(settings.MEDIA_ROOT), 'hrm', 'employee_photos')}),
    re_path(r'^api/hrm/employee_photos/(?P<path>.*)$', serve, {'document_root': os.path.join(str(settings.MEDIA_ROOT), 'hrm', 'employee_photos')}),
    re_path(r'^media/crm/(?P<path>.*)$', block_sensitive_media),
    re_path(r'^media/operations/incidents/(?P<path>.*)$', block_sensitive_media),
    re_path(r'^media/finance/(?P<path>.*)$', block_sensitive_media),
    re_path(r'^media/purchasing/(?P<path>.*)$', block_sensitive_media),
    re_path(r'^media/hrm/(?P<path>.*)$', block_sensitive_media),
    re_path(r'^media/(?P<path>.*)$', serve, {'document_root': settings.MEDIA_ROOT}),
]
