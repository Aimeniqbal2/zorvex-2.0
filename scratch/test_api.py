import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp_core.settings')
django.setup()

from django.test import Client
from django.contrib.auth import get_user_model
from companies.models import Company
from platform_core.models import ModuleDefinition, CompanyModule

User = get_user_model()
company = Company.objects.first()

mod, _ = ModuleDefinition.objects.get_or_create(code='inventory', defaults={'name': 'Inventory'})
CompanyModule.objects.get_or_create(company=company, module=mod, defaults={'enabled': True})

user = User.objects.filter(company=company).first()
print(f"Testing with user: {user.username}, role: {user.role}, company: {user.company.name}")

c = Client()
c.force_login(user)

r = c.get('/api/inventory/products/kpis/')
print("Status:", r.status_code)
print("Response:", r.content)
