def get_journal_entry(instance):
    """
    Returns the associated Universal Finance JournalEntry for a legacy sales entity, if bridged.
    """
    return getattr(instance, 'journal_entry', None)

def resolve_sale(instance):
    """
    Given a JournalEntry, attempts to find the associated Sale.
    """
    from sales.models import Sale
    # Reverse lookup by journal_entry or by source_document_id
    sale = Sale.objects.filter(journal_entry=instance).first()
    if sale:
        return sale
    
    if hasattr(instance, 'source_module') and instance.source_module == 'sales':
        if hasattr(instance, 'source_document_type') and instance.source_document_type == 'Sale':
            return Sale.objects.filter(id=instance.source_document_id).first()
    return None

def resolve_customer_credit(instance):
    """
    Given a JournalEntry, attempts to find the associated CustomerCreditLedger entry.
    """
    from sales.models import CustomerCreditLedger
    credit = CustomerCreditLedger.objects.filter(journal_entry=instance).first()
    if credit:
        return credit
    
    if hasattr(instance, 'source_module') and instance.source_module == 'sales':
        if hasattr(instance, 'source_document_type') and instance.source_document_type == 'CustomerCreditLedger':
            return CustomerCreditLedger.objects.filter(id=instance.source_document_id).first()
    return None

def resolve_invoice(instance):
    """
    Given a JournalEntry, attempts to find the associated Invoice (if it exists).
    """
    # Currently no Invoice model in sales, return None
    return None

def resolve_sales_return(instance):
    """
    Given a JournalEntry, attempts to find the associated SalesReturn (if it exists).
    """
    # Currently no SalesReturn model in sales, return None
    return None

def resolve_finance_entity(instance):
    """
    Returns the Universal Finance entity (JournalEntry) associated with a legacy model.
    """
    return get_journal_entry(instance)

def get_architecture_state(instance):
    """
    Determines the current architecture state of the instance.
    Returns:
    - 'Universal Finance': If natively created in finance (not applicable for sales models usually)
    - 'Bridge': If it has a journal_entry attached.
    - 'Legacy': If it operates without Universal Finance ties.
    """
    if hasattr(instance, 'journal_entry') and instance.journal_entry:
        return 'Bridge'
    
    # If it's a JournalEntry itself
    if instance.__class__.__name__ == 'JournalEntry':
        return 'Universal Finance'
        
    return 'Legacy'
