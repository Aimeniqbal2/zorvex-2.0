import os
import django
import sys
import json

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp_core.settings')
django.setup()

from platform_core.models import ModuleDefinition, CompanyModule
from companies.models import Company
from django.contrib.auth import get_user_model
CustomUser = get_user_model()
from django.test.client import Client
from django.urls import reverse

def run_audit():
    print("=== CHECK 1: VERIFY ALL 22 MODULE CODES ===")
    
    # DB consistency
    modules = ModuleDefinition.objects.all().order_by('code')
    print(f"Total modules in DB: {modules.count()}")
    
    codes = []
    duplicates = set()
    for m in modules:
        if m.code in codes:
            duplicates.add(m.code)
        codes.append(m.code)
        
    print(f"Duplicate codes: {duplicates}")
    print(f"List of codes: {codes}")
    
    # API response
    client = Client()
    # Need to authenticate to hit module-state
    # Find a test user or create one
    company = Company.objects.first()
    if not company:
        company = Company.objects.create(name="Audit Company")
    user = CustomUser.objects.filter(company=company).first()
    if not user:
        user = CustomUser.objects.create(username="audituser@example.com", email="audituser@example.com", company=company, role='admin')
        user.set_password("password")
        user.save()
    
    client.force_login(user)
    try:
        response = client.get('/api/platform/module-state/')
        print(f"API /api/platform/module-state/ Status Code: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            if isinstance(data, dict) and 'modules' in data:
                api_codes = list(data['modules'].keys())
                print(f"API Returned Modules count: {len(api_codes)}")
                print(f"API Returned Modules: {api_codes}")
            else:
                print(f"API Returned Modules: {list(data.keys())} or custom format")
        else:
            print(f"API Error: {response.content}")
    except Exception as e:
        print(f"API Error exception: {e}")

    print("\n=== CHECK 2: VERIFY SUPERADMIN BYPASS ===")
    superadmin = CustomUser.objects.filter(is_superuser=True).first()
    if not superadmin:
        superadmin = CustomUser.objects.create(username="audit_super@example.com", email="audit_super@example.com", is_superuser=True, is_staff=True)
        superadmin.set_password("password")
        superadmin.save()
        
    print(f"Superadmin found/created: {superadmin.username} (company: {superadmin.company})")
    
    # Let's see if we can hit an API as superadmin. 
    # Usually superadmin bypasses module gating. But does it bypass tenant isolation?
    # We will test tenant isolation by fetching items or something tenant specific.
    from inventory.models import Item
    
    # Create item for audit company
    Item.objects.create(name="Audit Item", sku="AUDIT01", company=company)
    
    # Create item for another company
    company2 = Company.objects.create(name="Audit Company 2")
    Item.objects.create(name="Audit Item 2", sku="AUDIT02", company=company2)
    
    print(f"Total items in DB: {Item.objects.count()}")
    
    # If superadmin requests items, what do they see?
    client.force_login(superadmin)
    
    try:
        # Assuming item list endpoint is /api/inventory/items/
        # Or something similar. Let's just test the queryset directly using TenantUserManager
        print("Testing Tenant Isolation via Middleware / Current Company...")
        # Tenant isolation requires middleware to set thread local.
        response = client.get('/api/inventory/items/')
        print(f"Superadmin items API status: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            # Django REST typically returns list or dict with 'results'
            items = data.get('results', data) if isinstance(data, dict) else data
            print(f"Superadmin items returned: {len(items)}")
        else:
            print(f"Superadmin items API error/unauthorized: {response.content}")
            
    except Exception as e:
        print(f"Error checking superadmin: {e}")
        
if __name__ == '__main__':
    run_audit()
