import logging
from django.contrib import admin
from django.contrib.admin.models import LogEntry, ADDITION, CHANGE, DELETION
from django.contrib.contenttypes.models import ContentType
from django.utils.html import format_html
from django.utils.safestring import mark_safe
from django.urls import reverse
from django.utils import timezone

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# 1. Executive Master System Audit Log in Django Admin (LogEntryAdmin)
# ---------------------------------------------------------------------------

class LogEntryAdmin(admin.ModelAdmin):
    """
    Master Audit Log Viewer in Django Admin.
    Provides complete visibility into every single addition, update, edit, and deletion
    across all ERP models with date, time, second, user, and change details.
    """
    list_display = (
        'action_time_formatted',
        'user_badge',
        'action_badge',
        'content_type_display',
        'object_link',
        'change_message_display',
    )
    list_filter = (
        'action_flag',
        'content_type',
        'user',
        ('action_time', admin.DateFieldListFilter),
    )
    search_fields = (
        'object_repr',
        'change_message',
        'user__username',
        'user__email',
        'object_id',
    )
    date_hierarchy = 'action_time'
    list_per_page = 50

    def get_queryset(self, request):
        return super().get_queryset(request).select_related('user', 'content_type')

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    @admin.display(description='Date & Time (Seconds)', ordering='action_time')
    def action_time_formatted(self, obj):
        if not obj.action_time:
            return '-'
        # Convert to local time if timezone aware
        local_time = timezone.localtime(obj.action_time) if timezone.is_aware(obj.action_time) else obj.action_time
        return format_html(
            '<span style="font-family: monospace; font-weight: 600; color: #0f172a; white-space: nowrap;">{}</span>',
            local_time.strftime('%Y-%m-%d %H:%M:%S')
        )

    @admin.display(description='User', ordering='user')
    def user_badge(self, obj):
        if not obj.user:
            return mark_safe('<span style="color: #94a3b8; font-style: italic;">System / Automated</span>')
        username = obj.user.username
        full_name = f"{getattr(obj.user, 'first_name', '')} {getattr(obj.user, 'last_name', '')}".strip()
        display = f"{username} ({full_name})" if full_name else username
        return format_html(
            '<span style="background: #e0e7ff; color: #3730a3; padding: 3px 8px; border-radius: 6px; font-weight: 500; font-size: 12px; white-space: nowrap;">'
            '👤 {}</span>',
            display
        )

    @admin.display(description='Action', ordering='action_flag')
    def action_badge(self, obj):
        if obj.action_flag == ADDITION:
            return mark_safe(
                '<span style="background: #dcfce7; color: #166534; padding: 3px 8px; border-radius: 6px; font-weight: 600; font-size: 11px; white-space: nowrap;">'
                '🟢 CREATED / ADDED</span>'
            )
        elif obj.action_flag == CHANGE:
            return mark_safe(
                '<span style="background: #fef3c7; color: #92400e; padding: 3px 8px; border-radius: 6px; font-weight: 600; font-size: 11px; white-space: nowrap;">'
                '🟡 EDITED / UPDATED</span>'
            )
        elif obj.action_flag == DELETION:
            return mark_safe(
                '<span style="background: #fee2e2; color: #991b1b; padding: 3px 8px; border-radius: 6px; font-weight: 600; font-size: 11px; white-space: nowrap;">'
                '🔴 DELETED</span>'
            )
        return format_html('<span>{}</span>', obj.get_action_flag_display())

    @admin.display(description='Model / Resource', ordering='content_type')
    def content_type_display(self, obj):
        if not obj.content_type:
            return '-'
        return format_html(
            '<span style="color: #475569; font-size: 12px; font-weight: 500;">{}.<strong>{}</strong></span>',
            obj.content_type.app_label,
            obj.content_type.model.title()
        )

    @admin.display(description='Object / Record')
    def object_link(self, obj):
        if not obj.content_type or not obj.object_id:
            return obj.object_repr or '-'
        try:
            url = reverse(f"admin:{obj.content_type.app_label}_{obj.content_type.model}_change", args=[obj.object_id])
            return format_html(
                '<a href="{}" style="font-weight: 500; color: #2563eb; text-decoration: none;" title="View record">'
                '{} <span style="font-size: 10px; color: #64748b;">(ID: {})</span></a>',
                url, obj.object_repr, str(obj.object_id)[:8]
            )
        except Exception:
            return format_html(
                '<span style="color: #64748b;">{} <span style="font-size: 10px;">(ID: {})</span></span>',
                obj.object_repr, str(obj.object_id)[:8]
            )

    @admin.display(description='Change Details')
    def change_message_display(self, obj):
        return obj.change_message or '-'


# ---------------------------------------------------------------------------
# 2. Universal Audit Mixin for EVERY single data entry in Django Admin
# ---------------------------------------------------------------------------

class UniversalAuditMixin:
    """
    Mixin applied to ModelAdmin classes that injects:
    1. Exact Created Date, Time, Second
    2. Exact Updated Date, Time, Second
    3. Created By User (with badge)
    4. Last Updated By User (with badge)
    5. Complete Chronological Audit Trail & Activity History Table
    """

    @admin.display(description='Created At (Sec)', ordering='created_at')
    def audit_created_sec(self, obj):
        dt = getattr(obj, 'created_at', None)
        if dt:
            local_dt = timezone.localtime(dt) if timezone.is_aware(dt) else dt
            return local_dt.strftime('%Y-%m-%d %H:%M:%S')
        return '-'

    @admin.display(description='Updated At (Sec)', ordering='updated_at')
    def audit_updated_sec(self, obj):
        dt = getattr(obj, 'updated_at', None)
        if dt:
            local_dt = timezone.localtime(dt) if timezone.is_aware(dt) else dt
            return local_dt.strftime('%Y-%m-%d %H:%M:%S')
        return '-'

    @admin.display(description='Created Date & Time (Seconds)')
    def audit_created_at_display(self, obj):
        if not obj:
            return '-'
        dt = getattr(obj, 'created_at', None)
        if dt:
            local_dt = timezone.localtime(dt) if timezone.is_aware(dt) else dt
            return format_html(
                '<span style="font-family: monospace; font-size: 13px; font-weight: 600; color: #0f172a;">🕒 {}</span>',
                local_dt.strftime('%Y-%m-%d %H:%M:%S')
            )
        # Fallback to earliest LogEntry
        try:
            ct = ContentType.objects.get_for_model(obj.__class__)
            entry = LogEntry.objects.filter(content_type=ct, object_id=str(obj.pk), action_flag=ADDITION).order_by('action_time').first()
            if entry and entry.action_time:
                local_dt = timezone.localtime(entry.action_time) if timezone.is_aware(entry.action_time) else entry.action_time
                return format_html(
                    '<span style="font-family: monospace; font-size: 13px; font-weight: 600; color: #0f172a;">🕒 {}</span>',
                    local_dt.strftime('%Y-%m-%d %H:%M:%S')
                )
        except Exception:
            pass
        return '-'

    @admin.display(description='Updated Date & Time (Seconds)')
    def audit_updated_at_display(self, obj):
        if not obj:
            return '-'
        dt = getattr(obj, 'updated_at', None)
        if dt:
            local_dt = timezone.localtime(dt) if timezone.is_aware(dt) else dt
            return format_html(
                '<span style="font-family: monospace; font-size: 13px; font-weight: 600; color: #0f172a;">🕒 {}</span>',
                local_dt.strftime('%Y-%m-%d %H:%M:%S')
            )
        # Fallback to latest LogEntry
        try:
            ct = ContentType.objects.get_for_model(obj.__class__)
            entry = LogEntry.objects.filter(content_type=ct, object_id=str(obj.pk)).order_by('-action_time').first()
            if entry and entry.action_time:
                local_dt = timezone.localtime(entry.action_time) if timezone.is_aware(entry.action_time) else entry.action_time
                return format_html(
                    '<span style="font-family: monospace; font-size: 13px; font-weight: 600; color: #0f172a;">🕒 {}</span>',
                    local_dt.strftime('%Y-%m-%d %H:%M:%S')
                )
        except Exception:
            pass
        return '-'

    @admin.display(description='Created By User')
    def audit_created_by_display(self, obj):
        if not obj:
            return '-'
        # 1. Model field check
        u = getattr(obj, 'created_by', None)
        if u:
            return self._format_user_badge(u, 'Created By')

        # 2. LogEntry check for ADDITION
        try:
            ct = ContentType.objects.get_for_model(obj.__class__)
            entry = LogEntry.objects.filter(content_type=ct, object_id=str(obj.pk), action_flag=ADDITION).order_by('action_time').first()
            if entry and entry.user:
                return self._format_user_badge(entry.user, 'Created By')
            # If only CHANGE exists, check earliest
            entry = LogEntry.objects.filter(content_type=ct, object_id=str(obj.pk)).order_by('action_time').first()
            if entry and entry.user:
                return self._format_user_badge(entry.user, 'Initial Entry By')
        except Exception:
            pass
        return mark_safe('<span style="color: #94a3b8; font-style: italic;">System / Not Recorded</span>')

    @admin.display(description='Last Edited / Updated By User')
    def audit_updated_by_display(self, obj):
        if not obj:
            return '-'
        # 1. Model field check
        u = getattr(obj, 'updated_by', None)
        if u:
            return self._format_user_badge(u, 'Updated By')

        # 2. LogEntry check for latest CHANGE
        try:
            ct = ContentType.objects.get_for_model(obj.__class__)
            entry = LogEntry.objects.filter(content_type=ct, object_id=str(obj.pk), action_flag=CHANGE).order_by('-action_time').first()
            if entry and entry.user:
                return self._format_user_badge(entry.user, 'Last Updated By')
            # Fallback to latest entry
            entry = LogEntry.objects.filter(content_type=ct, object_id=str(obj.pk)).order_by('-action_time').first()
            if entry and entry.user:
                return self._format_user_badge(entry.user, 'Last Modified By')
        except Exception:
            pass
        return mark_safe('<span style="color: #94a3b8; font-style: italic;">No edits recorded</span>')

    @admin.display(description='Complete Record Modification History')
    def audit_history_table(self, obj):
        if not obj or not obj.pk:
            return mark_safe('<div style="color: #94a3b8;">History will be recorded after the record is saved.</div>')

        try:
            ct = ContentType.objects.get_for_model(obj.__class__)
            entries = LogEntry.objects.filter(content_type=ct, object_id=str(obj.pk)).select_related('user').order_by('-action_time')[:25]
            if not entries.exists():
                return mark_safe(
                    '<div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; color: #64748b; font-size: 13px;">'
                    'No modification history records logged for this item yet. Future edits, updates, and deletes will appear here in real-time.'
                    '</div>'
                )

            rows = []
            for entry in entries:
                local_time = timezone.localtime(entry.action_time) if timezone.is_aware(entry.action_time) else entry.action_time
                time_str = local_time.strftime('%Y-%m-%d %H:%M:%S')

                user_str = entry.user.username if entry.user else 'System'
                user_full = f"{getattr(entry.user, 'first_name', '')} {getattr(entry.user, 'last_name', '')}".strip() if entry.user else ''
                user_label = f"{user_str} ({user_full})" if user_full else user_str

                if entry.action_flag == ADDITION:
                    action_html = '<span style="background: #dcfce7; color: #166534; padding: 2px 6px; border-radius: 4px; font-weight: 600; font-size: 11px;">🟢 CREATED</span>'
                elif entry.action_flag == CHANGE:
                    action_html = '<span style="background: #fef3c7; color: #92400e; padding: 2px 6px; border-radius: 4px; font-weight: 600; font-size: 11px;">🟡 EDITED / UPDATED</span>'
                elif entry.action_flag == DELETION:
                    action_html = '<span style="background: #fee2e2; color: #991b1b; padding: 2px 6px; border-radius: 4px; font-weight: 600; font-size: 11px;">🔴 DELETED</span>'
                else:
                    action_html = f'<span>{entry.get_action_flag_display()}</span>'

                msg = entry.change_message or '-'

                rows.append(f"""
                    <tr style="border-bottom: 1px solid #f1f5f9;">
                        <td style="padding: 8px 10px; font-family: monospace; font-size: 12px; font-weight: 600; color: #1e293b; white-space: nowrap;">{time_str}</td>
                        <td style="padding: 8px 10px; font-size: 12.5px; font-weight: 500; color: #3730a3; white-space: nowrap;">👤 {user_label}</td>
                        <td style="padding: 8px 10px; white-space: nowrap;">{action_html}</td>
                        <td style="padding: 8px 10px; font-size: 12.5px; color: #334155;">{msg}</td>
                    </tr>
                """)

            table_html = f"""
                <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; margin-top: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                    <div style="background: #f8fafc; padding: 10px 14px; border-bottom: 1px solid #e2e8f0; font-weight: 600; font-size: 13px; color: #1e293b; display: flex; justify-content: space-between; align-items: center;">
                        <span>Record Modification History & User Audit Trail</span>
                        <span style="font-size: 11.5px; color: #64748b; font-weight: normal;">Showing last {len(entries)} action(s) with exact seconds</span>
                    </div>
                    <table style="width: 100%; border-collapse: collapse; text-align: left;">
                        <thead>
                            <tr style="background: #f1f5f9; border-bottom: 2px solid #cbd5e1; font-size: 12px; color: #475569;">
                                <th style="padding: 8px 10px;">Date & Time (Seconds)</th>
                                <th style="padding: 8px 10px;">User</th>
                                <th style="padding: 8px 10px;">Action</th>
                                <th style="padding: 8px 10px;">Change Description / Details</th>
                            </tr>
                        </thead>
                        <tbody>
                            {''.join(rows)}
                        </tbody>
                    </table>
                </div>
            """
            return mark_safe(table_html)
        except Exception as e:
            return format_html('<div style="color: #ef4444;">Could not load history: {}</div>', str(e))

    def _format_user_badge(self, user, role_prefix=""):
        username = getattr(user, 'username', str(user))
        first_name = getattr(user, 'first_name', '')
        last_name = getattr(user, 'last_name', '')
        full = f"{first_name} {last_name}".strip()
        email = getattr(user, 'email', '')
        display = f"{username} ({full})" if full else username
        if email:
            display += f" &lt;{email}&gt;"
        return format_html(
            '<span style="background: #dbeafe; color: #1e40af; padding: 4px 10px; border-radius: 6px; font-weight: 600; font-size: 12.5px;">'
            '👤 {}</span>',
            display
        )


# ---------------------------------------------------------------------------
# 3. Dynamic Universal Registration & Enhancement
# ---------------------------------------------------------------------------

_enhanced = False

def enhance_all_registered_admins():
    """
    Automatically enhances all ModelAdmin classes registered in admin.site._registry
    so that EVERY single data entry in Django Admin shows created/updated time with seconds,
    user who created/edited/deleted, and full modification history.
    Also registers LogEntryAdmin for global audit browsing.
    """
    global _enhanced
    if _enhanced:
        return
    _enhanced = True

    # 1. Register LogEntry in admin.site if not already registered
    try:
        if LogEntry in admin.site._registry:
            admin.site.unregister(LogEntry)
        admin.site.register(LogEntry, LogEntryAdmin)
    except Exception as e:
        logger.warning(f"Could not register LogEntryAdmin: {e}")

    # 2. Universal injection into all registered ModelAdmins
    audit_fields = (
        'audit_created_at_display',
        'audit_updated_at_display',
        'audit_created_by_display',
        'audit_updated_by_display',
        'audit_history_table',
    )

    for model, model_admin in list(admin.site._registry.items()):
        if model == LogEntry:
            continue

        admin_cls = model_admin.__class__

        # Attach mixin methods to admin class if not present
        for attr in dir(UniversalAuditMixin):
            if not attr.startswith('__') and not hasattr(admin_cls, attr):
                setattr(admin_cls, attr, getattr(UniversalAuditMixin, attr))

        # Wrap get_readonly_fields to always include audit fields
        original_get_readonly_fields = admin_cls.get_readonly_fields

        def make_get_readonly_fields(orig_func):
            def custom_get_readonly_fields(self, request, obj=None):
                existing = list(orig_func(self, request, obj))
                if obj:
                    for f in audit_fields:
                        if f not in existing:
                            existing.append(f)
                return tuple(existing)
            return custom_get_readonly_fields

        admin_cls.get_readonly_fields = make_get_readonly_fields(original_get_readonly_fields)

        # Wrap get_fieldsets to append Audit Information fieldset when viewing an object
        original_get_fieldsets = admin_cls.get_fieldsets

        def make_get_fieldsets(orig_func):
            def custom_get_fieldsets(self, request, obj=None):
                fieldsets = list(orig_func(self, request, obj))
                if obj:
                    # Check if audit fieldset already exists
                    has_audit_fieldset = any(
                        isinstance(fs, (list, tuple)) and len(fs) > 0 and 'Audit Trail' in str(fs[0])
                        for fs in fieldsets
                    )
                    if not has_audit_fieldset:
                        fieldsets.append((
                            'Audit Trail & User Activity (Created, Updated, Timestamps & Actions)',
                            {
                                'fields': (
                                    ('audit_created_at_display', 'audit_created_by_display'),
                                    ('audit_updated_at_display', 'audit_updated_by_display'),
                                    'audit_history_table',
                                ),
                                'description': 'Full audit visibility into who created and last modified this record, with timestamps down to the exact second.'
                            }
                        ))
                return fieldsets
            return custom_get_fieldsets

        admin_cls.get_fieldsets = make_get_fieldsets(original_get_fieldsets)

        # Wrap get_list_display to include formatted timestamps with seconds
        original_get_list_display = admin_cls.get_list_display

        def make_get_list_display(orig_func):
            def custom_get_list_display(self, request):
                cols = list(orig_func(self, request))
                if hasattr(self.model, 'created_at') and 'audit_created_sec' not in cols and 'created_at' not in cols:
                    cols.append('audit_created_sec')
                if hasattr(self.model, 'updated_at') and 'audit_updated_sec' not in cols and 'updated_at' not in cols:
                    cols.append('audit_updated_sec')
                return tuple(cols)
            return custom_get_list_display

        admin_cls.get_list_display = make_get_list_display(original_get_list_display)
