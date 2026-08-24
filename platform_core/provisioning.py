import logging
from django.db import transaction
from .models import BusinessType, Warehouse
from companies.models import Company
from accounts.models import User
from .services import enable_module

logger = logging.getLogger(__name__)

# Registry of industry templates and their recommended module defaults
INDUSTRY_TEMPLATES = {
    BusinessType.SECURITY: {
        'recommended_modules': ['crm', 'hr', 'inventory', 'payroll', 'finance', 'reports', 'security_ops'],
        'required_modules': ['crm', 'hr'],  # security_ops relies heavily on CRM and HR
        'optional_modules': ['inventory', 'payroll', 'finance', 'reports', 'security_ops'],
    },
    # Default template for unspecified/other business types
    'DEFAULT': {
        'recommended_modules': ['crm', 'hr', 'finance'],
        'required_modules': ['crm'],
        'optional_modules': ['hr', 'finance'],
    }
}

# Hard dependencies enforced by the backend
MODULE_DEPENDENCIES = {
    'security_ops': ['crm', 'hr'],
    # Expand here based on actual architecture requirements
}

def get_template_for_business_type(business_type):
    return INDUSTRY_TEMPLATES.get(business_type, INDUSTRY_TEMPLATES['DEFAULT'])

def validate_module_selection(selected_modules):
    """
    Ensure that hard dependencies are met across the selected modules.
    """
    selected_set = set(selected_modules)
    for mod in selected_modules:
        deps = MODULE_DEPENDENCIES.get(mod, [])
        for dep in deps:
            if dep not in selected_set:
                raise ValueError(f"Module '{mod}' requires '{dep}', which was not selected.")

@transaction.atomic
def provision_company(
    name: str,
    business_type: str,
    admin_username: str,
    admin_password: str,
    admin_email: str,
    selected_modules: list,
    **kwargs
):
    """
    Atomic provisioning of a new ZORVEX tenant.
    
    Creates the Company, assigns enabled CompanyModules, sets up default operational
    structures (like warehouses if inventory is enabled), and provisions the initial
    Company Administrator with the 'admin' role.
    """
    validate_module_selection(selected_modules)

    # 1. Create Company
    company = Company.objects.create(
        name=name,
        business_type=business_type,
        domain=kwargs.get('domain', None),
        phone=kwargs.get('phone', ''),
        address=kwargs.get('address', '')
    )

    # 2. Assign selected modules
    for mod_code in selected_modules:
        enable_module(company, mod_code)

    # 3. Create Default Warehouse if inventory is enabled
    if 'inventory' in selected_modules:
        Warehouse.objects.get_or_create(
            company=company,
            name="Main Warehouse",
            defaults={'is_active': True}
        )

    # 4. Create Initial Administrator
    if User.objects.filter(username=admin_username).exists():
        raise ValueError(f"Username '{admin_username}' is already taken.")
        
    admin_user = User.objects.create_user(
        username=admin_username,
        email=admin_email,
        password=admin_password,
        company=company,
        role='admin'
    )

    return company, admin_user
