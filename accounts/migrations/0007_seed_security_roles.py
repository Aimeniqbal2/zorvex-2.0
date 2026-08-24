
from django.db import migrations

def seed_roles(apps, schema_editor):
    CompanyRole = apps.get_model('accounts', 'CompanyRole')
    roles = [{'name': 'CEO', 'code': 'ceo', 'permissions': ['operations.read', 'operations.write', 'operations.all_sites', 'hrm.read', 'hrm.write', 'finance.read', 'finance.write', 'inventory.read', 'inventory.write', 'crm.read', 'crm.write']}, {'name': 'COO', 'code': 'coo', 'permissions': ['operations.read', 'operations.write', 'operations.all_sites', 'hrm.read', 'inventory.read']}, {'name': 'General Manager', 'code': 'gm', 'permissions': ['operations.read', 'operations.write', 'operations.all_sites', 'hrm.read', 'inventory.read']}, {'name': 'Operations Manager', 'code': 'ops_manager', 'permissions': ['operations.read', 'operations.write', 'operations.all_sites']}, {'name': 'HR Manager', 'code': 'hr_manager', 'permissions': ['hrm.read', 'hrm.write']}, {'name': 'Finance Manager', 'code': 'finance_manager', 'permissions': ['finance.read', 'finance.write']}, {'name': 'Warehouse Manager', 'code': 'warehouse_manager', 'permissions': ['inventory.read', 'inventory.write']}, {'name': 'Site Supervisor', 'code': 'site_supervisor', 'permissions': ['operations.read', 'operations.write', 'operations.assigned_sites']}]
    for i, role in enumerate(roles):
        CompanyRole.objects.create(
            name=role['name'],
            code=role['code'],
            permissions=role['permissions'],
            is_system=True,
            priority=100 - i
        )

class Migration(migrations.Migration):
    dependencies = [
        ('accounts', '0006_companyrole_user_company_role'),
    ]
    operations = [
        migrations.RunPython(seed_roles, reverse_code=migrations.RunPython.noop),
    ]
