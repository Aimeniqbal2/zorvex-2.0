import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp_core.settings')
django.setup()

from django.test.utils import setup_test_environment, teardown_test_environment
from django.core.management import call_command
from rest_framework.test import APIClient
from hrm.models import Department
from companies.models import Company
from django.contrib.auth import get_user_model

User = get_user_model()

call_command('flush', '--noinput')

company_a = Company.objects.create(name="Company A")
user_a = User.objects.create_user(username="usera", email="usera@test.com", password="pwd", company=company_a, is_superuser=True)

Department.objects.create(company=company_a, name="DepA")

client = APIClient()
client.force_authenticate(user=user_a)

resp = client.get('/api/hrm/departments/')
print("STATUS:", resp.status_code)
print("DATA:", resp.content)
print("Company ID:", user_a.company_id)
