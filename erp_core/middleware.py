import threading
from django.utils import timezone
from django.http import JsonResponse

_thread_locals = threading.local()

def get_current_company():
    """Retrieve the company ID associated with the current request from thread locals."""
    return getattr(_thread_locals, 'company', None)

class TenantMiddleware:
    """
    Middleware to detect the logged-in user's company and store it in thread locals.
    This enables global queryset-level tenant filtering as required for SaaS.
    It also natively blocks API access for expired companies (402 Payment Required).
    """
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        from subscriptions.models import CompanySubscription  # imported locally to avoid registry conflicts
        path = request.path
        
        _thread_locals.company = None
        company_id = None
        
        # Authenticate JWT for API requests so middleware can see request.user
        if not request.user.is_authenticated and 'HTTP_AUTHORIZATION' in request.META:
            from rest_framework_simplejwt.authentication import JWTAuthentication
            try:
                auth = JWTAuthentication()
                # JWTAuthentication expects a DRF request, but standard HttpRequest works 
                # if we pass it directly to authenticate() or use a mock
                auth_result = auth.authenticate(request)
                if auth_result:
                    request.user, request.auth = auth_result
            except Exception:
                pass
        
        if request.user.is_authenticated:
            if getattr(request.user, 'company_id', None):
                company_id = request.user.company_id
                _thread_locals.company = company_id
            elif request.user.is_superuser:
                x_company_id = request.META.get('HTTP_X_COMPANY_ID')
                if x_company_id:
                    # Optional: validate uuid here, but letting it pass is fine
                    # Queryset filtering will handle string vs uuid, or throw a 400 later.
                    company_id = x_company_id
                    _thread_locals.company = company_id
        
        if company_id:
            # SaaS Gatekeeper (Bypass Auth, Webhooks, and Admin panels)
            excluded_paths = ['/api/auth/', '/api/subscriptions/webhook/', '/admin/']
            if not any(path.startswith(ep) for ep in excluded_paths):
                active_sub = CompanySubscription.objects.filter(company_id=company_id, is_active=True).first()
                if not active_sub or active_sub.end_date < timezone.now().date():
                    return JsonResponse({'error': '402 Payment Required. SaaS Subscription Expired. Please use JazzCash/EasyPaisa portal to renew.'}, status=402)

        response = self.get_response(request)
        
        # Cleanup to avoid thread leaking
        if hasattr(_thread_locals, 'company'):
            del _thread_locals.company
            
        return response
