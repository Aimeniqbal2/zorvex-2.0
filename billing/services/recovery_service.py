"""
billing/services/recovery_service.py
------------------------------------
Handles Recovery follow-ups, dispute logging, promises to pay, escalation tracking,
and payment reminder email dispatches via the communications service.
"""
from decimal import Decimal
from django.utils import timezone
from django.core.exceptions import ValidationError
from django.db import transaction
from billing.models import (
    ClientInvoice,
    ClientInvoiceStatus,
    RecoveryActivity,
    RecoveryActivityType,
    RecoveryStatus,
)


class RecoveryService:
    """
    Service for recovery follow-up logging, promise-to-pay tracking, and payment reminders.
    """

    @classmethod
    def record_recovery_activity(
        cls,
        company,
        client,
        invoice=None,
        activity_type=RecoveryActivityType.PHONE_CALL,
        activity_date=None,
        notes='',
        assigned_to=None,
        promise_amount=None,
        promise_date=None,
        next_followup_date=None,
        recovery_status_outcome=None,
        created_by=None
    ) -> RecoveryActivity:
        """
        Records a recovery activity (call, meeting, reminder, dispute, promise to pay).
        Promise to pay is recorded as an operational commitment and DOES NOT modify invoice receivable balance.
        """
        if str(client.company_id) != str(company.id):
            raise ValidationError({'client': 'Client must belong to the active company.'})

        if invoice:
            if str(invoice.company_id) != str(company.id):
                raise ValidationError({'invoice': 'Invoice must belong to the active company.'})
            if str(invoice.client_id) != str(client.id):
                raise ValidationError({'invoice': 'Invoice must belong to the specified client.'})

        if promise_amount is not None:
            promise_amount = Decimal(str(promise_amount))
            if promise_amount <= Decimal('0.00'):
                raise ValidationError({'promise_amount': 'Promise amount must be strictly greater than zero.'})

        # Determine outcome if not explicitly provided
        if not recovery_status_outcome:
            if activity_type == RecoveryActivityType.PROMISE_TO_PAY:
                recovery_status_outcome = RecoveryStatus.PROMISE_TO_PAY
            elif activity_type == RecoveryActivityType.DISPUTE:
                recovery_status_outcome = RecoveryStatus.DISPUTED
            elif activity_type == RecoveryActivityType.ESCALATION:
                recovery_status_outcome = RecoveryStatus.ESCALATED
            else:
                recovery_status_outcome = RecoveryStatus.UNDER_FOLLOWUP

        with transaction.atomic():
            activity = RecoveryActivity.objects.create(
                company=company,
                client=client,
                invoice=invoice,
                activity_type=activity_type,
                activity_date=activity_date or timezone.now().date(),
                notes=notes,
                assigned_to=assigned_to,
                promise_amount=promise_amount,
                promise_date=promise_date,
                next_followup_date=next_followup_date,
                recovery_status_outcome=recovery_status_outcome,
                created_by=created_by
            )

            # Update invoice recovery status if attached
            if invoice and invoice.status not in [ClientInvoiceStatus.PAID, ClientInvoiceStatus.CANCELLED, ClientInvoiceStatus.CREDITED]:
                invoice.recovery_status = recovery_status_outcome
                invoice.save(update_fields=['recovery_status', 'updated_at'])

        return activity

    @classmethod
    def send_payment_reminder_email(
        cls,
        invoice: ClientInvoice,
        user,
        sender_identity,
        to_email: str,
        reminder_type: str = 'PAYMENT_REMINDER',
        custom_notes: str = ''
    ) -> RecoveryActivity:
        """
        Sends an automated/manual payment reminder email to the client using universal communications engine.
        """
        from communications.services import EmailDeliveryService
        from finance.models import SecurityFinanceConfiguration

        company = invoice.company
        outstanding = invoice.outstanding_amount

        # Fetch bank configuration for payment instructions
        fin_cfg = SecurityFinanceConfiguration.objects.filter(company=company, is_deleted=False).first()
        bank_details = f"Bank: {fin_cfg.bank_name} | Account: {fin_cfg.bank_account_number} | IBAN: {fin_cfg.bank_iban}" if fin_cfg else "Please contact finance for bank details."

        subject = f"Payment Reminder: Invoice {invoice.invoice_number} ({company.name})"
        if invoice.is_overdue:
            subject = f"OVERDUE PAYMENT NOTICE: Invoice {invoice.invoice_number} ({invoice.days_overdue} days overdue)"

        body_html = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; color: #1e293b; line-height: 1.6;">
            <h2 style="color: #0f172a; border-bottom: 2px solid #3b82f6; padding-bottom: 8px;">{company.name}</h2>
            <p>Dear {invoice.client.name},</p>
            <p>This is a payment reminder for invoice <strong>{invoice.invoice_number}</strong> issued for security services during the period <strong>{invoice.period_start} to {invoice.period_end}</strong>.</p>
            
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0; background-color: #f8fafc;">
                <tr><td style="padding: 8px; border: 1px solid #cbd5e1;"><strong>Invoice Number:</strong></td><td style="padding: 8px; border: 1px solid #cbd5e1;">{invoice.invoice_number}</td></tr>
                <tr><td style="padding: 8px; border: 1px solid #cbd5e1;"><strong>Invoice Date:</strong></td><td style="padding: 8px; border: 1px solid #cbd5e1;">{invoice.invoice_date}</td></tr>
                <tr><td style="padding: 8px; border: 1px solid #cbd5e1;"><strong>Due Date:</strong></td><td style="padding: 8px; border: 1px solid #cbd5e1;">{invoice.due_date}</td></tr>
                <tr><td style="padding: 8px; border: 1px solid #cbd5e1;"><strong>Grand Total:</strong></td><td style="padding: 8px; border: 1px solid #cbd5e1;">PKR {invoice.grand_total:,.2f}</td></tr>
                <tr><td style="padding: 8px; border: 1px solid #cbd5e1;"><strong>Paid Amount:</strong></td><td style="padding: 8px; border: 1px solid #cbd5e1;">PKR {invoice.paid_amount:,.2f}</td></tr>
                <tr style="background-color: #eff6ff;"><td style="padding: 8px; border: 1px solid #cbd5e1; color: #1e40af;"><strong>Outstanding Balance:</strong></td><td style="padding: 8px; border: 1px solid #cbd5e1; color: #1e40af; font-weight: bold;">PKR {outstanding:,.2f}</td></tr>
            </table>

            {f'<p style="background-color: #fffbeb; padding: 10px; border-left: 4px solid #f59e0b;"><strong>Note:</strong> {custom_notes}</p>' if custom_notes else ''}

            <h4 style="margin-top: 24px; color: #334155;">Bank Transfer Details:</h4>
            <p style="background-color: #f1f5f9; padding: 12px; border-radius: 4px; font-family: monospace;">{bank_details}</p>

            <p style="margin-top: 24px;">Thank you for your prompt attention to this matter.</p>
            <p>Sincerely,<br/><strong>Accounts Receivable Department</strong><br/>{company.name}</p>
        </div>
        """

        from communications.models import OutboundEmail, SenderIdentity
        from communications.services import EmailDeliveryService

        if not sender_identity:
            sender_identity = SenderIdentity.objects.filter(company=company, is_active=True, is_default=True).first()
            if not sender_identity:
                sender_identity = SenderIdentity.objects.filter(company=company, is_active=True).first()
        if not sender_identity:
            domain_name = getattr(company, 'domain', None) or 'zorvex.com'
            sender_identity, _ = SenderIdentity.objects.get_or_create(
                company=company,
                email_address=f"recovery@{domain_name}",
                defaults={
                    'name': f"{company.name} Accounts Receivable",
                    'provider_type': 'SYSTEM_DEFAULT',
                    'verification_status': 'USABLE',
                    'is_active': True,
                    'is_default': True,
                }
            )

        outbound_email = OutboundEmail.objects.create(
            company=company,
            sender_identity=sender_identity,
            to=to_email,
            subject=subject,
            body_html=body_html,
            body_text=f"Payment reminder for invoice {invoice.invoice_number} (Outstanding: PKR {outstanding:,.2f}) due on {invoice.due_date}.",
            status='QUEUED',
            context_type='client_invoice',
            context_id=str(invoice.id),
            created_by=user,
        )

        EmailDeliveryService.send_outbound_email(outbound_email)

        activity = cls.record_recovery_activity(
            company=company,
            client=invoice.client,
            invoice=invoice,
            activity_type=RecoveryActivityType.PAYMENT_REMINDER,
            activity_date=timezone.now().date(),
            notes=f"Dispatched payment reminder email to {to_email}. Notes: {custom_notes}".strip(),
            recovery_status_outcome=RecoveryStatus.UNDER_FOLLOWUP,
            created_by=user
        )

        activity.outbound_email = outbound_email
        activity.save(update_fields=['outbound_email', 'updated_at'])

        return activity

    @classmethod
    def get_recovery_worklist(cls, company, assigned_to=None, as_of_date=None):
        """
        Builds the active recovery queue for recovery officers:
        Invoices overdue or flagged with active recovery statuses.
        """
        as_of = as_of_date or timezone.now().date()
        invoices = ClientInvoice.objects.filter(
            company=company,
            is_deleted=False
        ).exclude(status__in=[ClientInvoiceStatus.PAID, ClientInvoiceStatus.CANCELLED, ClientInvoiceStatus.CREDITED]).select_related('client', 'contract')

        queue = []
        for inv in invoices:
            outstanding = inv.outstanding_amount
            if outstanding <= Decimal('0.00'):
                continue

            is_overdue = inv.is_overdue
            days_overdue = inv.days_overdue

            # Get latest recovery activity
            latest_act = inv.recovery_activities.filter(is_deleted=False).order_by('-activity_date', '-created_at').first()

            item = {
                'invoice_id': str(inv.id),
                'invoice_number': inv.invoice_number,
                'client_id': str(inv.client_id),
                'client_name': inv.client.name,
                'contract_id': str(inv.contract_id) if inv.contract_id else None,
                'contract_title': inv.contract.title if inv.contract else None,
                'invoice_date': inv.invoice_date,
                'due_date': inv.due_date,
                'grand_total': inv.grand_total,
                'paid_amount': inv.paid_amount,
                'outstanding_amount': outstanding,
                'is_overdue': is_overdue,
                'days_overdue': days_overdue,
                'recovery_status': inv.recovery_status,
                'latest_activity': {
                    'activity_type': latest_act.activity_type if latest_act else None,
                    'activity_date': latest_act.activity_date if latest_act else None,
                    'notes': latest_act.notes if latest_act else None,
                    'promise_amount': latest_act.promise_amount if latest_act else None,
                    'promise_date': latest_act.promise_date if latest_act else None,
                    'next_followup_date': latest_act.next_followup_date if latest_act else None,
                } if latest_act else None,
            }
            queue.append(item)

        # Sort queue: overdue with highest days first, then by outstanding amount descending
        queue.sort(key=lambda x: (1 if x['is_overdue'] else 0, x['days_overdue'], x['outstanding_amount']), reverse=True)
        return queue
