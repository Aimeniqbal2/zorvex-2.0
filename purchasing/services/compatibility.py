from purchasing.models import ProcurementDocument, ProcurementLine
from inventory.models import PurchaseOrder, PurchaseOrderItem, VendorLedger, Vendor
from crm.services.compatibility import resolve_vendor as crm_resolve_vendor


def get_architecture_state(instance):
    """
    Returns the architecture state of a procurement record for monitoring:
    'Legacy', 'Bridge', or 'Universal Purchasing'.
    """
    if isinstance(instance, (ProcurementDocument, ProcurementLine)):
        return "Universal Purchasing"
    if getattr(instance, 'procurement_document', None) is not None or getattr(instance, 'procurement_line', None) is not None:
        return "Bridge"
    return "Legacy"


def get_procurement_document(instance):
    """
    Returns the ProcurementDocument for a given instance, gracefully handling
    Legacy-only, Bridge, and Universal Purchasing records.
    """
    if isinstance(instance, ProcurementDocument):
        return instance
    if getattr(instance, 'procurement_document', None):
        return instance.procurement_document
        
    po = getattr(instance, 'purchase_order', None)
    if po and getattr(po, 'procurement_document', None):
        return po.procurement_document

    return None


def resolve_purchase_order(instance):
    """
    Resolves the legacy PurchaseOrder record if possible.
    Returns the legacy PurchaseOrder, or None.
    """
    if isinstance(instance, PurchaseOrder):
        return instance
    if getattr(instance, 'purchase_order', None):
        return instance.purchase_order

    proc_doc = getattr(instance, 'procurement_document', None)
    if proc_doc:
        return PurchaseOrder.objects.filter(procurement_document=proc_doc, company_id=proc_doc.company_id).first()

    if isinstance(instance, ProcurementDocument):
        return PurchaseOrder.objects.filter(procurement_document=instance, company_id=instance.company_id).first()

    return None


def resolve_vendor(instance):
    """
    Resolves the legacy Vendor record using CRM compatibility helpers.
    """
    return crm_resolve_vendor(instance)


def resolve_procurement_line(instance):
    """
    Returns the ProcurementLine for a given instance.
    """
    if isinstance(instance, ProcurementLine):
        return instance
    if getattr(instance, 'procurement_line', None):
        return instance.procurement_line

    return None


def resolve_purchase_order_item(instance):
    """
    Resolves the legacy PurchaseOrderItem record if possible.
    """
    if isinstance(instance, PurchaseOrderItem):
        return instance
    if getattr(instance, 'purchase_order_item', None):
        return instance.purchase_order_item

    proc_line = getattr(instance, 'procurement_line', None)
    if proc_line:
        return PurchaseOrderItem.objects.filter(procurement_line=proc_line, company_id=proc_line.company_id).first()

    if isinstance(instance, ProcurementLine):
        return PurchaseOrderItem.objects.filter(procurement_line=instance, company_id=instance.company_id).first()

    return None


def resolve_procurement_entity(instance):
    """
    Unified procurement resolver: returns ProcurementDocument/Line if available,
    else falls back to PurchaseOrder/PurchaseOrderItem/Vendor.
    """
    proc_doc = get_procurement_document(instance)
    if proc_doc:
        return proc_doc

    proc_line = resolve_procurement_line(instance)
    if proc_line:
        return proc_line

    po = resolve_purchase_order(instance)
    if po:
        return po

    poi = resolve_purchase_order_item(instance)
    if poi:
        return poi

    vendor = resolve_vendor(instance)
    if vendor:
        return vendor

    if isinstance(instance, (ProcurementDocument, ProcurementLine, PurchaseOrder, PurchaseOrderItem, Vendor)):
        return instance

    return None
