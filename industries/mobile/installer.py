import logging
from django.db import transaction
from platform_core.models import CompanyModule, ModuleDefinition
from .manifest import MobilePackage
from companies.models import Company

logger = logging.getLogger(__name__)

@transaction.atomic
def install_mobile_package(company: Company):
    """
    Idempotent installer for the Mobile Services Industry package on a specific company.
    
    1. Sets the company's business_type to 'mobile' (if not already).
    2. Identifies all underlying universal engines required by Mobile capabilities (hr, services, pos, inventory, finance).
    3. Enables these required CompanyModules.
    4. Preserves any existing enabled modules safely.
    """
    if company.business_type != 'mobile':
        company.business_type = 'mobile'
        company.save(update_fields=['business_type'])

    pkg = MobilePackage()
    required_engine_codes = {cap.engine for cap in pkg.capabilities}

    logger.info(f"Installing Mobile Services package for company {company.id}. Required engines: {required_engine_codes}")

    for code in required_engine_codes:
        try:
            mod_def = ModuleDefinition.objects.get(code=code)
            CompanyModule.objects.get_or_create(
                company=company,
                module=mod_def,
                defaults={'enabled': True}
            )
        except ModuleDefinition.DoesNotExist:
            logger.warning(f"Required universal engine '{code}' does not exist in ModuleDefinition.")

    logger.info(f"Successfully installed Mobile Services package for company {company.id}.")
    return True
