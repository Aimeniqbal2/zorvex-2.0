from django.core.management.base import BaseCommand
from datetime import datetime, date
import logging
from companies.models import Company
from operations.models import AutoAttendanceConfig
from operations.services.monthly_muster_service import MonthlyMusterService

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Runs the automated muster attendance engine for one or all companies."

    def add_arguments(self, parser):
        parser.add_argument(
            '--company-id',
            type=str,
            default=None,
            help='Filter by specific company UUID or name'
        )
        parser.add_argument(
            '--target-date',
            type=str,
            default=None,
            help='Target date to calculate attendance for (YYYY-MM-DD). If omitted, uses today minus company delay_days.'
        )
        parser.add_argument(
            '--fill-month',
            action='store_true',
            default=True,
            help='Fill chronological missing dates up to target date (default True)'
        )
        parser.add_argument(
            '--overwrite',
            action='store_true',
            default=False,
            help='Overwrite existing attendance records'
        )
        parser.add_argument(
            '--force',
            action='store_true',
            default=False,
            help='Force run even if auto-attendance is disabled in company settings'
        )

    def handle(self, *args, **options):
        company_id = options.get('company_id')
        target_date_str = options.get('target_date')
        fill_month = options.get('fill_month')
        overwrite = options.get('overwrite')
        force = options.get('force')

        target_date = None
        if target_date_str:
            try:
                target_date = datetime.strptime(target_date_str, '%Y-%m-%d').date()
            except ValueError:
                self.stderr.write(self.style.ERROR(f"Invalid target_date format: {target_date_str}. Expected YYYY-MM-DD."))
                return

        companies_qs = Company.objects.filter(is_active=True)
        if company_id:
            companies_qs = companies_qs.filter(id=company_id)

        if not companies_qs.exists():
            self.stdout.write(self.style.WARNING("No matching active companies found."))
            return

        for company in companies_qs:
            config = AutoAttendanceConfig.get_for_company(company)
            if not config.is_enabled and not force:
                self.stdout.write(self.style.NOTICE(f"[{company.name}] Auto attendance is disabled in settings. Skipping (use --force to override)."))
                continue

            self.stdout.write(self.style.MIGRATE_HEADING(f"Running auto-attendance for [{company.name}] (Delay: {config.delay_days} days)..."))
            try:
                result = MonthlyMusterService.run_auto_attendance_for_company(
                    company=company,
                    target_date=target_date,
                    fill_month_up_to_target=fill_month,
                    overwrite_existing=overwrite
                )
                if result.get('status') == 'success':
                    self.stdout.write(self.style.SUCCESS(
                        f"[{company.name}] Success! Processed {result.get('total_records_processed', 0)} total records "
                        f"({result.get('new_records_created', 0)} created, {result.get('existing_records_skipped', 0)} existing). "
                        f"Target Date: {result.get('target_date')}."
                    ))
                else:
                    self.stdout.write(self.style.WARNING(f"[{company.name}] Notice: {result.get('message', 'No details')}"))
            except Exception as e:
                self.stderr.write(self.style.ERROR(f"[{company.name}] Error running auto attendance: {e}"))
