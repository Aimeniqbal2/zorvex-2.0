"""
Global registry for Industry Packages.
"""

_REGISTRY = {}

def register_industry_package(package_class):
    """Register an industry package class and store its singleton instance."""
    instance = package_class()
    _REGISTRY[instance.code] = instance
    return package_class

def get_industry_package(code: str):
    """Retrieve an installed industry package by its string code."""
    return _REGISTRY.get(code)

def get_all_industry_packages():
    """Return a list of all registered industry packages."""
    return list(_REGISTRY.values())
