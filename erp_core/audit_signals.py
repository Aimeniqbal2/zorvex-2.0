import logging
from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from django.contrib.contenttypes.models import ContentType
from django.contrib.admin.models import LogEntry, ADDITION, CHANGE, DELETION
from django.contrib.auth import get_user_model
from erp_core.middleware import get_current_user, get_current_request

logger = logging.getLogger(__name__)

# System models to exclude from auditing to prevent recursion and noise
EXCLUDED_MODELS = {
    'logentry',
    'session',
    'contenttype',
    'permission',
    'migration',
}

EXCLUDED_APPS = {
    'admin',
    'sessions',
    'contenttypes',
}

_audit_active = True

def record_model_audit_event(sender, instance, action_flag, message=""):
    """
    Safely record a modification event into django.contrib.admin.models.LogEntry.
    Captures exact timestamp (with seconds), user, model, and object representation.
    """
    global _audit_active
    if not _audit_active:
        return

    model_name = sender._meta.model_name
    app_label = sender._meta.app_label

    if model_name in EXCLUDED_MODELS or app_label in EXCLUDED_APPS:
        return

    # Django Admin already records LogEntry natively inside its own views
    req = get_current_request()
    if req and getattr(req, 'path', '').startswith('/admin/'):
        return

    try:
        user = get_current_user()
        if not user or not user.is_authenticated:
            # Fallback to primary superuser or system user
            User = get_user_model()
            user = User.objects.filter(is_superuser=True).first()

        if not user:
            return

        ct = ContentType.objects.get_for_model(sender)
        obj_pk = str(instance.pk) if instance.pk is not None else ''
        obj_repr = str(instance)[:200]

        LogEntry.objects.create(
            user=user,
            content_type=ct,
            object_id=obj_pk,
            object_repr=obj_repr,
            action_flag=action_flag,
            change_message=message or f"Action performed by {user.username} via API"
        )
    except Exception as e:
        logger.debug(f"Audit log recording skipped: {e}")


@receiver(post_save)
def auto_audit_post_save(sender, instance, created, **kwargs):
    if kwargs.get('raw', False):
        return

    # Check if soft-deleted
    if getattr(instance, 'is_deleted', False):
        record_model_audit_event(sender, instance, DELETION, "Soft-deleted (is_deleted=True)")
    elif created:
        record_model_audit_event(sender, instance, ADDITION, "Created entry")
    else:
        record_model_audit_event(sender, instance, CHANGE, "Updated / Edited entry")


@receiver(post_delete)
def auto_audit_post_delete(sender, instance, **kwargs):
    record_model_audit_event(sender, instance, DELETION, "Permanently deleted entry")
