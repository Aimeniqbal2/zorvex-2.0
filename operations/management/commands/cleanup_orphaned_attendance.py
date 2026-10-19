from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Q
from datetime import date
import calendar

from companies.models import Company
from operations.models import DailyDutyPay, OperationalSite
from hrm.models import WorkforceAttendance


class Command(BaseCommand):
    help = "Purges dangling and orphaned attendance/duty pay records linked to deleted, inactive, or unlinked OperationalSites."

    def add_arguments(self, parser):
        parser.add_argument(
            '--year',
            type=int,
            default=None,
            help='Filter by specific year (e.g. 2026)'
        )
        parser.add_argument(
            '--month',
            type=int,
            default=None,
            help='Filter by specific month (1-12)'
        )
        parser.add_argument(
            '--company-id',
            type=str,
            default=None,
            help='Filter by specific company UUID'
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Report matching orphaned records without deleting them'
        )

    def handle(self, *args, **options):
        year = options.get('year')
        month = options.get('month')
        company_id = options.get('company_id')
        dry_run = options.get('dry_run')

        self.stdout.write(self.style.NOTICE("=== SCANNING FOR ORPHANED / DELETED-SITE ATTENDANCE RECORDS ==="))

        invalid_site_filter = (
            Q(site__isnull=True) |
            Q(site__is_deleted=True) |
            Q(site__is_active=False) |
            Q(site__crm_entity__is_deleted=True) |
            Q(site__crm_entity__active=False)
        )

        ddp_qs = DailyDutyPay.objects.filter(invalid_site_filter)
        att_qs = WorkforceAttendance.objects.filter(invalid_site_filter)

        if company_id:
            ddp_qs = ddp_qs.filter(company_id=company_id)
            att_qs = att_qs.filter(company_id=company_id)

        if year and month:
            days_in_month = calendar.monthrange(year, month)[1]
            start_date = date(year, month, 1)
            end_date = date(year, month, days_in_month)
            ddp_qs = ddp_qs.filter(duty_date__gte=start_date, duty_date__lte=end_date)
            att_qs = att_qs.filter(date__gte=start_date, date__lte=end_date)

        total_ddp = ddp_qs.count()
        total_att = att_qs.count()

        self.stdout.write(f"Found {total_ddp} DailyDutyPay records linked to deleted/inactive/null sites.")
        self.stdout.write(f"Found {total_att} WorkforceAttendance records linked to deleted/inactive/null sites.")

        if dry_run:
            self.stdout.write(self.style.WARNING("[DRY RUN] No records were deleted. Run without --dry-run to purge."))
            return

        if total_ddp == 0 and total_att == 0:
            self.stdout.write(self.style.SUCCESS("[OK] No orphaned records found. Everything is clean!"))
            return

        with transaction.atomic():
            deleted_ddp = ddp_qs.delete()[0]
            deleted_att = att_qs.delete()[0]

        self.stdout.write(self.style.SUCCESS(
            f"[SUCCESS] Purged {deleted_ddp} DailyDutyPay and {deleted_att} WorkforceAttendance records successfully."
        ))
