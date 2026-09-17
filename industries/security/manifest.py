from industries.common.base import IndustryPackage, Capability
from industries.common.registry import register_industry_package

@register_industry_package
class SecurityPackage(IndustryPackage):
    code = "security"
    name = "Security Services"
    version = "1.0"
    
    capabilities = [
        Capability("clients_contracts", "Clients & Contracts", "crm"),
        Capability("guards_staff", "Guards & Staff", "hr"),
        Capability("finance", "Finance", "finance"),
        Capability("vendors_purchasing", "Purchasing & Vendors", "purchasing"),
        Capability("store_equipment", "Store & Equipment", "inventory"),
        Capability("operations", "Operations", "security_ops"),
    ]
