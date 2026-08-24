from crm.models import CRMEntity
from sales.models import Customer
from inventory.models import Vendor
from hrm.models import EmployeeRecord

def get_architecture_state(instance):
    """
    Returns the architecture state of the record for admin monitoring:
    'Legacy', 'Bridge', or 'Universal CRM'.
    """
    if isinstance(instance, CRMEntity):
        return "Universal CRM"
    if getattr(instance, 'crm_entity', None) is not None:
        return "Bridge"
    return "Legacy"

def get_crm_entity(instance):
    """
    Returns the CRMEntity for a given instance, gracefully handling
    Legacy-only, Bridge, and Future CRM-only records.
    """
    if getattr(instance, 'crm_entity', None):
        return instance.crm_entity
        
    # If instance is a Customer
    if isinstance(instance, Customer) and hasattr(instance, 'crm_entity'):
        return instance.crm_entity
        
    # If instance is a Vendor
    if isinstance(instance, Vendor) and hasattr(instance, 'crm_entity'):
        return instance.crm_entity
        
    # If instance is an EmployeeRecord
    if isinstance(instance, EmployeeRecord) and hasattr(instance, 'crm_entity'):
        return instance.crm_entity

    # If instance has a customer fallback
    customer = getattr(instance, 'customer', None)
    if customer and getattr(customer, 'crm_entity', None):
        return customer.crm_entity

    # If instance has a vendor fallback
    vendor = getattr(instance, 'vendor', None)
    if vendor and getattr(vendor, 'crm_entity', None):
        return vendor.crm_entity

    # If instance has an employee fallback
    employee = getattr(instance, 'employee', None)
    if isinstance(employee, EmployeeRecord) and getattr(employee, 'crm_entity', None):
        return employee.crm_entity
    elif employee and getattr(employee, 'employee_record', None):
        employee_rec = employee.employee_record
        if getattr(employee_rec, 'crm_entity', None):
            return employee_rec.crm_entity

    employee_record = getattr(instance, 'employee_record', None)
    if employee_record and getattr(employee_record, 'crm_entity', None):
        return employee_record.crm_entity

    return None

def resolve_customer(instance):
    """
    Resolves the legacy Customer record if possible.
    Returns the legacy Customer, or None.
    """
    if isinstance(instance, Customer):
        return instance
    if getattr(instance, 'customer', None):
        return instance.customer
    
    # Try reversing from crm_entity if present
    crm_entity = getattr(instance, 'crm_entity', None)
    if crm_entity:
        return Customer.objects.filter(crm_entity=crm_entity, company_id=crm_entity.company_id).first()

    if isinstance(instance, CRMEntity):
        return Customer.objects.filter(crm_entity=instance, company_id=instance.company_id).first()
        
    return None
    
def resolve_vendor(instance):
    """
    Resolves the legacy Vendor record if possible.
    Returns the legacy Vendor, or None.
    """
    if isinstance(instance, Vendor):
        return instance
    if getattr(instance, 'vendor', None):
        return instance.vendor
    
    # Try reversing from crm_entity if present
    crm_entity = getattr(instance, 'crm_entity', None)
    if crm_entity:
        return Vendor.objects.filter(crm_entity=crm_entity, company_id=crm_entity.company_id).first()

    if isinstance(instance, CRMEntity):
        return Vendor.objects.filter(crm_entity=instance, company_id=instance.company_id).first()
        
    return None

def resolve_employee(instance):
    """
    Resolves the legacy EmployeeRecord if possible.
    Returns the legacy EmployeeRecord, or None.
    """
    if isinstance(instance, EmployeeRecord):
        return instance
        
    employee_record = getattr(instance, 'employee_record', None)
    if isinstance(employee_record, EmployeeRecord):
        return employee_record
        
    employee = getattr(instance, 'employee', None)
    if isinstance(employee, EmployeeRecord):
        return employee
    elif employee:
        emp_rec = getattr(employee, 'employee_record', None)
        if isinstance(emp_rec, EmployeeRecord):
            return emp_rec
            
    # Try reversing from crm_entity if present
    crm_entity = getattr(instance, 'crm_entity', None)
    if crm_entity:
        return EmployeeRecord.objects.filter(crm_entity=crm_entity, company_id=crm_entity.company_id).first()
        
    # Also check if instance IS a CRMEntity
    if isinstance(instance, CRMEntity):
        return EmployeeRecord.objects.filter(crm_entity=instance, company_id=instance.company_id).first()
        
    return None

def resolve_entity(instance):
    """
    Unified resolver: returns CRMEntity if available, else falls back
    to Customer or Vendor depending on what's available.
    """
    crm_entity = get_crm_entity(instance)
    if crm_entity:
        return crm_entity
        
    if getattr(instance, 'customer', None):
        return instance.customer
        
    if getattr(instance, 'vendor', None):
        return instance.vendor
        
    if getattr(instance, 'employee', None):
        return instance.employee
        
    if getattr(instance, 'employee_record', None):
        return instance.employee_record

    if isinstance(instance, (Customer, Vendor, EmployeeRecord, CRMEntity)):
        return instance
        
    return None
