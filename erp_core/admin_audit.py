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
    Mixin dynamically injected into all ModelAdmin classes across all 151+ ERP models.
    Guarantees:
    1. Exact Created Date, Time & Second (YYYY-MM-DD HH:MM:SS)
    2. Exact Created By User (Username, Full Name badge)
    3. Exact Updated Date, Time & Second (YYYY-MM-DD HH:MM:SS)
    4. Exact Last Updated / Edited / Deleted By User (Action & Username badge)
    5. Complete Chronological Audit Trail & Activity History Table on Detail Views
    """

    def _resolve_creator_user(self, obj):
        if not obj:
            return None
        # 1. Direct model attribute check
        for attr in ('created_by', 'recorded_by', 'assigned_by', 'author', 'user'):
            u = getattr(obj, attr, None)
            if u:
                return u
        # 2. LogEntry check for ADDITION
        try:
            ct = ContentType.objects.get_for_model(obj.__class__)
            entry = LogEntry.objects.filter(
                content_type=ct, object_id=str(obj.pk), action_flag=ADDITION
            ).select_related('user').order_by('action_time').first()
            if entry and entry.user:
                return entry.user
            # Earliest LogEntry of any flag
            entry = LogEntry.objects.filter(
                content_type=ct, object_id=str(obj.pk)
            ).select_related('user').order_by('action_time').first()
            if entry and entry.user:
                return entry.user
        except Exception:
            pass
        return None

    def _resolve_updater_user(self, obj):
        if not obj:
            return None
        # 1. Direct model attribute check
        for attr in ('updated_by', 'modified_by'):
            u = getattr(obj, attr, None)
            if u:
                return u
        # 2. LogEntry check for latest CHANGE or DELETION
        try:
            ct = ContentType.objects.get_for_model(obj.__class__)
            entry = LogEntry.objects.filter(
                content_type=ct, object_id=str(obj.pk), action_flag__in=[CHANGE, DELETION]
            ).select_related('user').order_by('-action_time').first()
            if entry and entry.user:
                return (entry.user, entry.action_flag)
            # Latest LogEntry of any flag
            entry = LogEntry.objects.filter(
                content_type=ct, object_id=str(obj.pk)
            ).select_related('user').order_by('-action_time').first()
            if entry and entry.user:
                return (entry.user, entry.action_flag)
        except Exception:
            pass
        return None

    def _format_user_badge(self, user, role_prefix=""):
        if not user:
            return mark_safe('<span style="background: #f1f5f9; color: #475569; padding: 2px 7px; border-radius: 5px; font-size: 11px; font-weight: 500; white-space: nowrap;">👤 System (Initial Import)</span>')
        username = getattr(user, 'username', str(user))
        first_name = getattr(user, 'first_name', '')
        last_name = getattr(user, 'last_name', '')
        full = f"{first_name} {last_name}".strip()
        email = getattr(user, 'email', '')
        display = f"{username} ({full})" if full else username
        title_text = f"{display} &lt;{email}&gt;" if email else display
        prefix_html = f"<strong>{role_prefix}:</strong> " if role_prefix else ""
        return format_html(
            '<span style="background: #e0e7ff; color: #3730a3; padding: 2px 7px; border-radius: 5px; font-weight: 500; font-size: 11px; white-space: nowrap;" title="{}">'
            '👤 {}{}</span>',
            title_text, prefix_html, display
        )

    # -----------------------------------------------------------------------
    # Table List Display Columns (Visible in ChangeList Table for Every Model)
    # -----------------------------------------------------------------------

    @admin.display(description='Created At (Sec)', ordering='created_at')
    def audit_created_sec(self, obj):
        dt = getattr(obj, 'created_at', None) or getattr(obj, 'created_on', None) or getattr(obj, 'date_created', None) or getattr(obj, 'timestamp', None)
        if dt:
            local_dt = timezone.localtime(dt) if timezone.is_aware(dt) else dt
            return local_dt.strftime('%Y-%m-%d %H:%M:%S')
        try:
            ct = ContentType.objects.get_for_model(obj.__class__)
            entry = LogEntry.objects.filter(content_type=ct, object_id=str(obj.pk)).order_by('action_time').first()
            if entry and entry.action_time:
                local_dt = timezone.localtime(entry.action_time) if timezone.is_aware(entry.action_time) else entry.action_time
                return local_dt.strftime('%Y-%m-%d %H:%M:%S')
        except Exception:
            pass
        return '-'

    @admin.display(description='Created By')
    def audit_created_by_user(self, obj):
        u = self._resolve_creator_user(obj)
        return self._format_user_badge(u)

    @admin.display(description='Updated At (Sec)', ordering='updated_at')
    def audit_updated_sec(self, obj):
        dt = getattr(obj, 'updated_at', None) or getattr(obj, 'updated_on', None) or getattr(obj, 'date_updated', None) or getattr(obj, 'modified_at', None)
        if dt:
            local_dt = timezone.localtime(dt) if timezone.is_aware(dt) else dt
            return local_dt.strftime('%Y-%m-%d %H:%M:%S')
        try:
            ct = ContentType.objects.get_for_model(obj.__class__)
            entry = LogEntry.objects.filter(content_type=ct, object_id=str(obj.pk)).order_by('-action_time').first()
            if entry and entry.action_time:
                local_dt = timezone.localtime(entry.action_time) if timezone.is_aware(entry.action_time) else entry.action_time
                return local_dt.strftime('%Y-%m-%d %H:%M:%S')
        except Exception:
            pass
        return '-'

    @admin.display(description='Updated / Action By')
    def audit_updated_by_user(self, obj):
        if getattr(obj, 'is_deleted', False):
            updater_res = self._resolve_updater_user(obj)
            u = updater_res[0] if isinstance(updater_res, tuple) else updater_res
            u_str = getattr(u, 'username', 'System') if u else 'System'
            return format_html(
                '<span style="background: #fee2e2; color: #991b1b; padding: 2px 7px; border-radius: 5px; font-weight: 600; font-size: 11px; white-space: nowrap;">'
                '🔴 DELETED by {}</span>',
                u_str
            )
        updater_res = self._resolve_updater_user(obj)
        if updater_res:
            u = updater_res[0] if isinstance(updater_res, tuple) else updater_res
            return self._format_user_badge(u)
        return mark_safe('<span style="color: #64748b; font-size: 11px; font-style: italic;">Original (No edits)</span>')

    # -----------------------------------------------------------------------
    # Detail Change Form Section (Visible on Detail Page of Every Single Entry)
    # -----------------------------------------------------------------------

    @admin.display(description='Created Date & Time (Seconds)')
    def audit_created_at_display(self, obj):
        if not obj:
            return '-'
        dt = getattr(obj, 'created_at', None) or getattr(obj, 'created_on', None) or getattr(obj, 'date_created', None)
        if dt:
            local_dt = timezone.localtime(dt) if timezone.is_aware(dt) else dt
            return format_html(
                '<span style="font-family: monospace; font-size: 13px; font-weight: 600; color: #0f172a;">🕒 {}</span>',
                local_dt.strftime('%Y-%m-%d %H:%M:%S')
            )
        try:
            ct = ContentType.objects.get_for_model(obj.__class__)
            entry = LogEntry.objects.filter(content_type=ct, object_id=str(obj.pk)).order_by('action_time').first()
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
        dt = getattr(obj, 'updated_at', None) or getattr(obj, 'updated_on', None) or getattr(obj, 'modified_at', None)
        if dt:
            local_dt = timezone.localtime(dt) if timezone.is_aware(dt) else dt
            return format_html(
                '<span style="font-family: monospace; font-size: 13px; font-weight: 600; color: #0f172a;">🕒 {}</span>',
                local_dt.strftime('%Y-%m-%d %H:%M:%S')
            )
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
        u = self._resolve_creator_user(obj)
        if u:
            return self._format_user_badge(u, 'Created By')
        return mark_safe('<span style="background: #f1f5f9; color: #475569; padding: 3px 8px; border-radius: 6px; font-size: 11px;">👤 System (Initial Import)</span>')

    @admin.display(description='Last Edited / Updated By User')
    def audit_updated_by_display(self, obj):
        if not obj:
            return '-'
        if getattr(obj, 'is_deleted', False):
            updater_res = self._resolve_updater_user(obj)
            u = updater_res[0] if isinstance(updater_res, tuple) else updater_res
            u_str = getattr(u, 'username', 'System') if u else 'System'
            return format_html(
                '<span style="background: #fee2e2; color: #991b1b; padding: 4px 10px; border-radius: 6px; font-weight: 600; font-size: 12.5px;">'
                '🔴 Soft-Deleted by {}</span>',
                u_str
            )
        updater_res = self._resolve_updater_user(obj)
        if updater_res:
            u = updater_res[0] if isinstance(updater_res, tuple) else updater_res
            return self._format_user_badge(u, 'Last Modified By')
        return mark_safe('<span style="color: #64748b; font-size: 12px; font-style: italic;">Original entry (No subsequent edits)</span>')

    @admin.display(description='Complete Record Modification History')
    def audit_history_table(self, obj):
        if not obj or not obj.pk:
            return mark_safe('<div style="color: #94a3b8;">History will be recorded after the record is saved.</div>')

        try:
            ct = ContentType.objects.get_for_model(obj.__class__)
            entries = LogEntry.objects.filter(content_type=ct, object_id=str(obj.pk)).select_related('user').order_by('-action_time')[:50]

            is_deleted = getattr(obj, 'is_deleted', False)
            deleted_banner = ""
            if is_deleted:
                updater_res = self._resolve_updater_user(obj)
                del_user = updater_res[0] if isinstance(updater_res, tuple) else updater_res
                del_username = getattr(del_user, 'username', 'System') if del_user else 'System'
                deleted_banner = f"""
                <div style="background: #fef2f2; border: 1px solid #f87171; border-radius: 6px; padding: 10px 14px; margin-bottom: 12px; color: #991b1b; font-weight: 600; font-size: 13px; display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 16px;">🔴</span>
                    <span>ATTENTION: This record is marked as DELETED (Soft-Deleted) by <u>{del_username}</u>. It is deactivated across operational workflows.</span>
                </div>
                """

            if not entries.exists():
                return mark_safe(
                    f"{deleted_banner}"
                    '<div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; color: #64748b; font-size: 13px;">'
                    'Initial system entry. All subsequent creations, edits, updates, and deletions will appear here in real-time with exact seconds and user attribution.'
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
                    action_html = '<span style="background: #dcfce7; color: #166534; padding: 2px 7px; border-radius: 4px; font-weight: 600; font-size: 11px;">🟢 CREATED</span>'
                elif entry.action_flag == CHANGE:
                    action_html = '<span style="background: #fef3c7; color: #92400e; padding: 2px 7px; border-radius: 4px; font-weight: 600; font-size: 11px;">🟡 EDITED / UPDATED</span>'
                elif entry.action_flag == DELETION:
                    action_html = '<span style="background: #fee2e2; color: #991b1b; padding: 2px 7px; border-radius: 4px; font-weight: 600; font-size: 11px;">🔴 DELETED</span>'
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
                {deleted_banner}
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
        LogEntry._meta.verbose_name = "Master System Audit Log (User Entries, Edits & Deletes)"
        LogEntry._meta.verbose_name_plural = "Master System Audit Logs (User Entries, Edits & Deletes)"
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

        # Wrap get_list_display to include formatted timestamps with seconds AND users
        original_get_list_display = admin_cls.get_list_display

        def make_get_list_display(orig_func):
            def custom_get_list_display(self, request):
                cols = list(orig_func(self, request))

                # Created Time Column (with exact seconds)
                if 'created_at' in cols:
                    cols = [c if c != 'created_at' else 'audit_created_sec' for c in cols]
                elif 'audit_created_sec' not in cols:
                    cols.append('audit_created_sec')

                # Created By User Column
                if 'audit_created_by_user' not in cols and 'created_by' not in cols:
                    cols.append('audit_created_by_user')

                # Updated Time Column (with exact seconds)
                if 'updated_at' in cols:
                    cols = [c if c != 'updated_at' else 'audit_updated_sec' for c in cols]
                elif 'audit_updated_sec' not in cols:
                    cols.append('audit_updated_sec')

                # Updated / Action By User Column
                if 'audit_updated_by_user' not in cols and 'updated_by' not in cols:
                    cols.append('audit_updated_by_user')

                return tuple(cols)
            return custom_get_list_display

        admin_cls.get_list_display = make_get_list_display(original_get_list_display)

        # 3. Universal Safe Soft-Delete for models with is_deleted
        # Prevents ProtectedError / RestrictedError when deleting in Django Admin
        if hasattr(model, 'is_deleted'):
            orig_get_deleted_objects = admin_cls.get_deleted_objects
            def make_get_deleted_objects(orig_func):
                def custom_get_deleted_objects(self, objs, request):
                    if hasattr(self.model, 'is_deleted'):
                        deletable_objects = [str(o) for o in objs]
                        model_count = {str(self.model._meta.verbose_name_plural): len(objs)}
                        perms_needed = set()
                        protected = []  # Bypass Django hard-delete RESTRICT/PROTECT blockers
                        return deletable_objects, model_count, perms_needed, protected
                    return orig_func(self, objs, request)
                return custom_get_deleted_objects

            admin_cls.get_deleted_objects = make_get_deleted_objects(orig_get_deleted_objects)

            orig_delete_model = admin_cls.delete_model
            def make_delete_model(orig_func):
                def custom_delete_model(self, request, obj):
                    if hasattr(obj, 'is_deleted'):
                        safe_cascade_soft_delete(obj, user=request.user)
                    else:
                        orig_func(self, request, obj)
                return custom_delete_model

            admin_cls.delete_model = make_delete_model(orig_delete_model)

            orig_delete_queryset = admin_cls.delete_queryset
            def make_delete_queryset(orig_func):
                def custom_delete_queryset(self, request, queryset):
                    if hasattr(self.model, 'is_deleted'):
                        for obj in queryset:
                            safe_cascade_soft_delete(obj, user=request.user)
                    else:
                        orig_func(self, request, queryset)
                return custom_delete_queryset

            admin_cls.delete_queryset = make_delete_queryset(orig_delete_queryset)

        # 4. Universal Admin QuerySet:
        # Ensures superusers can view and edit records across all companies and soft-deleted records
        # in changeform and changelist without being blocked by TenantManager.
        orig_get_queryset = admin_cls.get_queryset

        def make_get_queryset(orig_func):
            def custom_get_queryset(self, request):
                if request.user.is_superuser:
                    if hasattr(self.model, 'all_objects'):
                        return self.model.all_objects.all()
                    elif hasattr(self.model, '_base_manager'):
                        return self.model._base_manager.all()
                return orig_func(self, request)
            return custom_get_queryset

        admin_cls.get_queryset = make_get_queryset(orig_get_queryset)


def safe_cascade_soft_delete(obj, user=None):
    """
    Safely cascades soft-deletion across CRM and Operations entities
    without triggering SQL RESTRICT/PROTECT errors.
    Also logs explicit DELETION LogEntry with exact user attribution and timestamps.
    """
    if not user:
        from erp_core.middleware import get_current_user
        user = get_current_user()
    if not user:
        from django.contrib.auth import get_user_model
        User = get_user_model()
        user = User.objects.filter(is_superuser=True).first()

    def log_soft_delete_event(target_obj, message=""):
        try:
            target_ct = ContentType.objects.get_for_model(target_obj.__class__)
            username = getattr(user, 'username', 'System') if user else 'System'
            LogEntry.objects.create(
                user=user,
                content_type=target_ct,
                object_id=str(target_obj.pk),
                object_repr=str(target_obj)[:200],
                action_flag=DELETION,
                change_message=message or f"Soft-deleted (is_deleted=True) by {username} via Django Admin / Cascade"
            )
        except Exception as e:
            logger.debug(f"Could not record deletion LogEntry: {e}")

    model_name = obj.__class__.__name__

    try:
        if model_name == 'OperationalSite':
            from operations.models import (
                SecurityPost, SiteStaffingRequirement, Deployment,
                DutyRoster, DutyAssignment, DailyDutyPay
            )
            from security_crm.models import ClientLocation
            from security_crm.services.workflow import SecurityProposalWorkflowService

            obj.is_active = False
            obj.is_deleted = True
            obj.save(update_fields=['is_active', 'is_deleted', 'updated_at'])
            log_soft_delete_event(obj, f"Operational site soft-deleted by {getattr(user, 'username', 'System')}")

            posts = list(SecurityPost.objects.filter(site=obj))
            SecurityPost.objects.filter(site=obj).update(is_active=False, is_deleted=True)
            for p in posts:
                log_soft_delete_event(p, f"Cascaded soft-delete from site '{obj.name}'")

            SiteStaffingRequirement.objects.filter(site=obj).update(is_active=False, is_deleted=True)
            Deployment.objects.filter(site=obj).update(is_deleted=True)
            DutyRoster.objects.filter(site=obj).update(is_deleted=True)
            DutyAssignment.objects.filter(site=obj).update(is_deleted=True)
            DailyDutyPay.objects.filter(site=obj).update(is_deleted=True)

            for contract in obj.service_contracts.all():
                contract.sites.remove(obj)

            if obj.crm_entity_id:
                loc = ClientLocation.objects.filter(
                    customer=obj.crm_entity,
                    name__iexact=obj.name,
                    company=obj.company,
                    is_deleted=False
                ).first()
                if loc:
                    SecurityProposalWorkflowService.cascade_delete_client_location(loc)

        elif model_name == 'ClientLocation':
            from security_crm.services.workflow import SecurityProposalWorkflowService
            SecurityProposalWorkflowService.cascade_delete_client_location(obj)
            log_soft_delete_event(obj, f"Client location soft-deleted by {getattr(user, 'username', 'System')}")

        elif model_name == 'CRMEntity':
            from security_crm.models import ClientLocation, SecurityProposal
            from operations.models import OperationalSite, ServiceContract
            from security_crm.services.workflow import SecurityProposalWorkflowService

            obj.active = False
            obj.is_deleted = True
            obj.save(update_fields=['active', 'is_deleted', 'updated_at'])
            log_soft_delete_event(obj, f"CRM Entity soft-deleted by {getattr(user, 'username', 'System')}")

            for loc in ClientLocation.objects.filter(customer=obj, is_deleted=False):
                SecurityProposalWorkflowService.cascade_delete_client_location(loc)

            for site in OperationalSite.objects.filter(crm_entity=obj, is_deleted=False):
                safe_cascade_soft_delete(site, user=user)

            SecurityProposal.objects.filter(customer=obj).update(is_deleted=True, status='CANCELLED')
            ServiceContract.objects.filter(crm_entity=obj).update(is_deleted=True, status='TERMINATED')

        elif model_name == 'SecurityProposal':
            from security_crm.models import ProposalServiceLine
            obj.is_deleted = True
            obj.status = 'CANCELLED'
            obj.save(update_fields=['is_deleted', 'status', 'updated_at'])
            log_soft_delete_event(obj, f"Proposal cancelled & soft-deleted by {getattr(user, 'username', 'System')}")
            for v in obj.versions.all():
                v.is_deleted = True
                v.save(update_fields=['is_deleted', 'updated_at'])
                ProposalServiceLine.objects.filter(proposal_version=v).update(is_deleted=True)

        elif model_name == 'ServiceContract':
            from operations.models import SecurityPost, ContractRate
            obj.is_deleted = True
            obj.status = 'TERMINATED'
            obj.save(update_fields=['is_deleted', 'status', 'updated_at'])
            log_soft_delete_event(obj, f"Contract terminated & soft-deleted by {getattr(user, 'username', 'System')}")
            SecurityPost.objects.filter(service_contract=obj).update(is_active=False, is_deleted=True)
            ContractRate.objects.filter(service_contract=obj).update(is_deleted=True)

        elif hasattr(obj, 'is_deleted'):
            obj.is_deleted = True
            if hasattr(obj, 'is_active'):
                obj.is_active = False
                obj.save(update_fields=['is_deleted', 'is_active', 'updated_at'])
            elif hasattr(obj, 'active'):
                obj.active = False
                obj.save(update_fields=['is_deleted', 'active', 'updated_at'])
            else:
                obj.save(update_fields=['is_deleted', 'updated_at'])
            log_soft_delete_event(obj, f"Soft-deleted by {getattr(user, 'username', 'System')}")

    except Exception as e:
        logger.error(f"Error in safe_cascade_soft_delete for {model_name} {getattr(obj, 'pk', None)}: {e}")
        if hasattr(obj, 'is_deleted'):
            obj.is_deleted = True
            obj.save(update_fields=['is_deleted', 'updated_at'])
            log_soft_delete_event(obj, f"Soft-deleted (fallback) by {getattr(user, 'username', 'System')}")

