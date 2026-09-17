import logging
from django.db import transaction
from platform_core.models import CompanyModule, ModuleDefinition
from .manifest import SecurityPackage
from companies.models import Company

logger = logging.getLogger(__name__)

@transaction.atomic
def install_security_package(company: Company):
    """
    Idempotent installer for the Security Industry package on a specific company.
    
    1. Sets the company's business_type to 'security' (if not already).
    2. Identifies all underlying universal engines required by Security capabilities.
    3. Enables these required CompanyModules.
    4. Preserves any existing enabled modules safely.
    """
    if company.business_type != 'security':
        company.business_type = 'security'
        company.save(update_fields=['business_type'])

    pkg = SecurityPackage()
    required_engine_codes = {cap.engine for cap in pkg.capabilities}

    logger.info(f"Installing Security package for company {company.id}. Required engines: {required_engine_codes}")

    # Ensure all required underlying engines are enabled
    for code in required_engine_codes:
        try:
            mod_def = ModuleDefinition.objects.get(code=code)
            # get_or_create ensures idempotency
            CompanyModule.objects.get_or_create(
                company=company,
                module=mod_def,
                defaults={'enabled': True}
            )
        except ModuleDefinition.DoesNotExist:
            logger.warning(f"Required universal engine '{code}' does not exist in ModuleDefinition.")

    logger.info(f"Successfully installed Security package for company {company.id}.")
    return True
