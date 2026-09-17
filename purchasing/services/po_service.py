from decimal import Decimal
from django.utils import timezone
from django.core.exceptions import ValidationError
from django.db import transaction
from purchasing.models import (
    ProcurementDocument, ProcurementLine, ApprovalHistory,
    ProcurementAuditTrail, ApprovalWorkflow, ApprovalStep
)




def check_approval_permission(user, document):
    """
    Verify if the user has authorization to approve purchase orders.
    Enforces that regular users cannot approve purchase orders unless
    they possess admin role or explicit purchasing approval permissions.
    """
    if not user.is_authenticated:
        return False
    if user.company_id != document.company_id:
        return False
    if user.is_superuser or user.role in ['admin', 'super_admin']:
        return True
    
    # Check permissions list if assigned
    perms = getattr(user, 'permissions', []) or []
    if 'purchasing.approve' in perms or 'purchasing.manage' in perms or 'purchasing.all' in perms:
        return True
    return False



@transaction.atomic
def recalculate_po_totals(po: ProcurementDocument) -> ProcurementDocument:
    """
    Compute subtotal, discount, tax, and grand total based on PO lines.
    Ensures backend totals are the single source of truth.
    """
    lines = po.lines.all()
    subtotal = Decimal('0.00')
    discount = Decimal('0.00')
    tax = Decimal('0.00')

    for line in lines:
        qty = Decimal(str(line.quantity or 0))
        price = Decimal(str(line.unit_price or 0))
        l_disc = Decimal(str(line.discount_amount or 0)).quantize(Decimal('0.01'))
        l_tax = Decimal(str(line.tax_amount or 0)).quantize(Decimal('0.01'))
        
        l_sub = (qty * price).quantize(Decimal('0.01'))
        l_tot = max(Decimal('0.00'), l_sub - l_disc + l_tax).quantize(Decimal('0.01'))
        if line.total_amount != l_tot or line.discount_amount != l_disc or line.tax_amount != l_tax:
            line.total_amount = l_tot
            line.discount_amount = l_disc
            line.tax_amount = l_tax
            line.save(update_fields=['total_amount', 'discount_amount', 'tax_amount'])

        subtotal += l_sub
        discount += l_disc
        tax += l_tax

    grand_total = max(Decimal('0.00'), subtotal - discount + tax).quantize(Decimal('0.01'))
    po.subtotal_amount = subtotal.quantize(Decimal('0.01'))
    po.discount_amount = discount.quantize(Decimal('0.01'))
    po.tax_amount = tax.quantize(Decimal('0.01'))
    po.total_amount = grand_total
    po.save(update_fields=['subtotal_amount', 'discount_amount', 'tax_amount', 'total_amount'])
    return po



@transaction.atomic
def submit_po_for_approval(po: ProcurementDocument, user) -> ProcurementDocument:
    """
    Transitions PO from DRAFT to PENDING_APPROVAL.
    Validates that PO has at least one line with quantity > 0.
    """
    if po.status not in ['DRAFT', 'REJECTED']:
        raise ValidationError(f"Cannot submit PO in '{po.status}' status. Only DRAFT or REJECTED POs can be submitted.")

    lines_count = po.lines.filter(quantity__gt=0).count()
    if lines_count == 0:
        raise ValidationError("Cannot submit a PO with no line items or zero quantities.")

    recalculate_po_totals(po)

    po.status = 'PENDING_APPROVAL'
    po.rejection_reason = ''
    po.save(update_fields=['status', 'rejection_reason'])

    # Record in ApprovalHistory for universal audit
    ApprovalHistory.objects.create(
        company=po.company,
        document_model='ProcurementDocument',
        document_id=po.id,
        action='SUBMITTED',
        action_by=user,
        comments='Submitted for approval.'
    )

    ProcurementAuditTrail.objects.create(
        company=po.company,
        document=po,
        user=user,
        event='STATUS_CHANGE',
        details=f"Document {po.number} submitted for approval by {user.username}."
    )
    return po


@transaction.atomic
def approve_po(po: ProcurementDocument, user, approval_notes: str = '') -> ProcurementDocument:
    """
    Approves a PENDING_APPROVAL document / PO.
    Supports multi-step ApprovalWorkflow if configured, or direct approval if authorized.
    """
    if po.status != 'PENDING_APPROVAL':
        raise ValidationError(f"Cannot approve document in '{po.status}' status. It must be in PENDING_APPROVAL.")

    # Check for configured multi-step workflow
    workflow = ApprovalWorkflow.objects.filter(
        company_id=po.company_id,
        active=True,
        document_type=po.document_type
    ).first()

    if workflow and workflow.steps.exists():
        steps = list(workflow.steps.order_by('step_number'))
        # Determine current step from approval history count
        prev_approvals = ApprovalHistory.objects.filter(
            document_id=po.id,
            action='APPROVED'
        ).count()
        
        current_step_idx = prev_approvals
        if current_step_idx >= len(steps):
            raise ValidationError("All approval steps already completed.")

        current_step = steps[current_step_idx]
        
        # Check authorization for this specific step
        is_step_authorized = False
        if current_step.approver_user_id and current_step.approver_user_id == user.id:
            is_step_authorized = True
        elif current_step.approver_role:
            user_role = getattr(user, 'role', '')
            if user_role == current_step.approver_role:
                is_step_authorized = True
        
        if not is_step_authorized:
            raise ValidationError(f"User is not authorized to approve Step {current_step.step_number} ({current_step.name}).")

        # Record step approval
        ApprovalHistory.objects.create(
            company=po.company,
            document_model='ProcurementDocument',
            document_id=po.id,
            action='APPROVED',
            action_by=user,
            comments=approval_notes or f"Approved {current_step.name}."
        )

        is_final_step = (current_step_idx + 1) >= len(steps)
        if is_final_step:
            recalculate_po_totals(po)
            po.status = 'APPROVED'
            po.approved_by = user
            po.approved_at = timezone.now()
            po.approval_notes = approval_notes or ''
            po.save(update_fields=['status', 'approved_by', 'approved_at', 'approval_notes'])
        else:
            po.save(update_fields=['updated_at'])

        ProcurementAuditTrail.objects.create(
            company=po.company,
            document=po,
            user=user,
            event='APPROVED',
            details=f"Step {current_step.step_number} approved by {user.username}. Final: {is_final_step}"
        )
        return po

    # Default approval without multi-step workflow
    if not check_approval_permission(user, po):
        raise ValidationError("User does not have permission to approve Purchase Orders.")

    recalculate_po_totals(po)

    po.status = 'APPROVED'
    po.approved_by = user
    po.approved_at = timezone.now()
    po.approval_notes = approval_notes or ''
    po.save(update_fields=['status', 'approved_by', 'approved_at', 'approval_notes'])

    # Record in ApprovalHistory
    ApprovalHistory.objects.create(
        company=po.company,
        document_model='ProcurementDocument',
        document_id=po.id,
        action='APPROVED',
        action_by=user,
        comments=approval_notes or 'Approved purchase order.'
    )

    # Record in AuditTrail
    ProcurementAuditTrail.objects.create(
        company=po.company,
        document=po,
        user=user,
        event='APPROVED',
        details=f"PO {po.number} approved by {user.username}. Notes: {approval_notes or 'None'}"
    )
    return po


@transaction.atomic
def reject_po(po: ProcurementDocument, user, reason: str = '') -> ProcurementDocument:
    """
    Rejects a PENDING_APPROVAL PO.
    For Purchase Orders, reverts status back to DRAFT with recorded reason.
    For other procurement documents (e.g. PR), sets status to REJECTED.
    """
    if po.status != 'PENDING_APPROVAL':
        raise ValidationError(f"Cannot reject PO in '{po.status}' status. It must be in PENDING_APPROVAL.")

    if not check_approval_permission(user, po):
        raise ValidationError("User does not have permission to reject Purchase Orders.")

    if not reason.strip():
        raise ValidationError("A rejection reason is required.")

    if po.document_type == 'PURCHASE_ORDER':
        po.status = 'DRAFT'
    else:
        po.status = 'REJECTED'

    po.rejection_reason = reason.strip()
    po.save(update_fields=['status', 'rejection_reason'])

    ApprovalHistory.objects.create(
        company=po.company,
        document_model='ProcurementDocument',
        document_id=po.id,
        action='REJECTED',
        action_by=user,
        comments=reason.strip()
    )

    ProcurementAuditTrail.objects.create(
        company=po.company,
        document=po,
        user=user,
        event='REJECTED',
        details=f"Document {po.number} rejected by {user.username}. Reason: {reason.strip()}"
    )
    return po



@transaction.atomic
def send_po(po: ProcurementDocument, user) -> ProcurementDocument:
    """
    Transitions an APPROVED PO to SENT (dispatched / confirmed with vendor).
    """
    if po.status != 'APPROVED':
        raise ValidationError(f"Cannot send PO in '{po.status}' status. It must be APPROVED first.")

    po.status = 'SENT'
    po.save(update_fields=['status'])

    ProcurementAuditTrail.objects.create(
        company=po.company,
        document=po,
        user=user,
        event='STATUS_CHANGE',
        details=f"PO {po.number} marked as SENT to vendor by {user.username}."
    )
    return po


@transaction.atomic
def cancel_po(po: ProcurementDocument, user, reason: str = '') -> ProcurementDocument:
    """
    Cancels a PO. Blocked if items have already been received.
    """
    if po.status in ['RECEIVED', 'CLOSED', 'CANCELLED']:
        raise ValidationError(f"Cannot cancel PO in '{po.status}' status.")

    # Check if any quantity has been received
    has_receipts = po.lines.filter(received_quantity__gt=0).exists()
    if has_receipts:
        raise ValidationError("Cannot cancel a PO that has already received items. Use purchase returns instead.")

    po.status = 'CANCELLED'
    if reason:
        po.notes = f"{po.notes}\n[Cancellation Reason]: {reason.strip()}".strip()
    po.save(update_fields=['status', 'notes'])

    ProcurementAuditTrail.objects.create(
        company=po.company,
        document=po,
        user=user,
        event='STATUS_CHANGE',
        details=f"PO {po.number} cancelled by {user.username}. Reason: {reason or 'N/A'}"
    )
    return po
