from django.db import transaction
from django.core.exceptions import ValidationError
from finance.models import Cheque, ChequeStatus
from django.utils import timezone

@transaction.atomic
def mark_cheque_cleared(cheque: Cheque, user):
    if cheque.status == ChequeStatus.CLEARED:
        raise ValidationError("Cheque is already cleared.")
    if cheque.status in [ChequeStatus.BOUNCED, ChequeStatus.CANCELLED]:
        raise ValidationError(f"Cannot clear a cheque with status {cheque.status}.")
        
    cheque.status = ChequeStatus.CLEARED
    cheque.clearing_date = timezone.now().date()
    cheque.save()
    
    # Optionally: Trigger bank reconciliation matching or post additional journal
    # However, since the Voucher posting handled the ledger effect, 
    # marking it cleared is primarily for bank reconciliation status.
