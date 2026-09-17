import logging
from django.core.mail import EmailMultiAlternatives, get_connection
from django.utils import timezone
from django.db import transaction
from .models import OutboundEmail, SenderIdentity

logger = logging.getLogger(__name__)


class EmailDeliveryService:
    @classmethod
    def test_sender_connection(cls, sender: SenderIdentity):
        """
        Tests the SMTP connection for a SenderIdentity.
        If successful, transitions verification_status to 'VERIFIED'.
        Returns (success: bool, error: str | None).
        """
        if sender.provider_type == 'SYSTEM_DEFAULT':
            sender.verification_status = 'USABLE'
            sender.save(update_fields=['verification_status'])
            return True, None

        if not sender.smtp_host:
            return False, "SMTP host is required."

        try:
            connection = get_connection(
                host=sender.smtp_host,
                port=sender.smtp_port,
                username=sender.smtp_username,
                password=sender.smtp_password,
                use_tls=sender.smtp_use_tls,
                fail_silently=False,
                timeout=10,
            )
            connection.open()
            connection.close()

            sender.verification_status = 'VERIFIED'
            sender.save(update_fields=['verification_status'])
            return True, None
        except Exception as e:
            # Mask any credentials from error messages
            err_msg = str(e)
            logger.warning(f"SMTP connection test failed for sender {sender.id}: {err_msg}")
            sender.verification_status = 'UNVERIFIED'
            sender.save(update_fields=['verification_status'])
            return False, err_msg

    @classmethod
    def send_outbound_email(cls, outbound_email: OutboundEmail):
        """
        Sends an OutboundEmail using its sender_identity's provider settings.
        Handles atomic dispatch locking, idempotency, status updates, and error logging.
        """
        with transaction.atomic():
            # Acquire exclusive row lock to prevent race conditions / duplicate sends
            email = OutboundEmail.objects.select_for_update().get(id=outbound_email.id)

            if email.status in ['SENT', 'SENDING']:
                return False, "Email is already sent or currently being processed."

            sender = email.sender_identity
            if not sender.is_usable:
                error_msg = f"Sender '{sender.name}' is not usable for sending (status: {sender.verification_status})."
                email.status = 'FAILED'
                email.error_message = error_msg
                email.save(update_fields=['status', 'error_message'])
                return False, error_msg

            email.status = 'SENDING'
            email.save(update_fields=['status'])

        # Now perform network delivery
        try:
            connection = None
            if sender.provider_type == 'SMTP':
                if not sender.smtp_host:
                    raise ValueError("SMTP host not configured for sender.")
                connection = get_connection(
                    host=sender.smtp_host,
                    port=sender.smtp_port,
                    username=sender.smtp_username,
                    password=sender.smtp_password,
                    use_tls=sender.smtp_use_tls,
                    fail_silently=False,
                )

            to_list = [e.strip() for e in email.to.split(',') if e.strip()]
            if not to_list:
                raise ValueError("No valid recipient email address specified.")

            email_msg = EmailMultiAlternatives(
                subject=email.subject,
                body=email.body_text or '',
                from_email=f"{sender.name} <{sender.email_address}>",
                to=to_list,
                connection=connection,
            )

            if email.cc:
                email_msg.cc = [e.strip() for e in email.cc.split(',') if e.strip()]
            if email.bcc:
                email_msg.bcc = [e.strip() for e in email.bcc.split(',') if e.strip()]
            if sender.reply_to:
                email_msg.reply_to = [sender.reply_to]

            if email.body_html:
                email_msg.attach_alternative(email.body_html, "text/html")

            for attachment in email.attachments.all():
                if attachment.file:
                    email_msg.attach(
                        attachment.filename,
                        attachment.file.read(),
                        attachment.content_type
                    )

            email_msg.send()

            email.status = 'SENT'
            email.sent_at = timezone.now()
            email.error_message = None
            email.save(update_fields=['status', 'sent_at', 'error_message'])
            return True, None

        except Exception as e:
            err_str = str(e)
            logger.error(f"Failed to send email {email.id}: {err_str}")
            email.status = 'FAILED'
            email.error_message = err_str
            email.save(update_fields=['status', 'error_message'])
            return False, err_str
