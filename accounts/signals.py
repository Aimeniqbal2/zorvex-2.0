import logging
from django.db.models.signals import pre_save, post_save
from django.dispatch import receiver
from django.contrib.auth import get_user_model
from django.contrib.sessions.models import Session
from django.utils import timezone

logger = logging.getLogger(__name__)


def revoke_user_sessions_and_tokens(user, current_session_key=None):
    """
    Terminates all active login sessions for the given user across all devices:
    1. Deletes all active Django web/admin sessions in django.contrib.sessions.
    2. Logs the security action.
    (All JWT access and refresh tokens across all mobile/desktop devices are
    automatically rejected by SecurityJWTAuthentication because their embedded
    pwd_hash no longer matches user.get_session_auth_hash()).
    """
    if not user or not getattr(user, 'pk', None):
        return 0

    user_id_str = str(user.pk)
    deleted_count = 0

    try:
        sessions_to_delete = []
        # Query unexpired active sessions
        for session in Session.objects.filter(expire_date__gte=timezone.now()):
            # If current administrator changed their own password, keep current session alive
            if current_session_key and session.session_key == current_session_key:
                continue
            try:
                decoded = session.get_decoded()
                if str(decoded.get('_auth_user_id')) == user_id_str:
                    sessions_to_delete.append(session.session_key)
            except Exception:
                continue

        if sessions_to_delete:
            deleted_count = Session.objects.filter(session_key__in=sessions_to_delete).delete()[0]
            logger.info(
                f"Security: Revoked {deleted_count} active web sessions for user '{user.username}' "
                f"(ID: {user_id_str}) after password change."
            )
    except Exception as e:
        logger.warning(f"Error while flushing sessions for user {user.username}: {e}")

    return deleted_count


@receiver(pre_save)
def detect_password_change_pre_save(sender, instance, **kwargs):
    """
    Detects whether the password hash has been modified on an existing User.
    """
    User = get_user_model()
    if sender != User or not instance.pk:
        return

    try:
        old_record = User._base_manager.filter(pk=instance.pk).values('password').first()
        if old_record:
            old_password = old_record.get('password')
            # If password changed from existing value
            if old_password and instance.password and old_password != instance.password:
                instance._password_changed_detected = True
    except Exception:
        pass


@receiver(post_save)
def enforce_logout_on_password_change_post_save(sender, instance, created, **kwargs):
    """
    When password change is confirmed, flushes all active web sessions.
    Tokens are already invalidated via changed get_session_auth_hash().
    """
    User = get_user_model()
    if sender != User or created:
        return

    if getattr(instance, '_password_changed_detected', False):
        instance._password_changed_detected = False
        revoke_user_sessions_and_tokens(instance)
