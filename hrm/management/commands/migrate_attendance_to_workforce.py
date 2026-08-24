from django.core.management.base import BaseCommand
from django.db import transaction
from hrm.models import Attendance, WorkforceAttendance
import datetime

class Command(BaseCommand):
    help = 'Migrates legacy Attendance records to WorkforceAttendance records safely'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true', help='Print what would happen without making changes')

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        legacy_records = Attendance.objects.filter(is_deleted=False, workforce_attendance__isnull=True)
        
        self.stdout.write(f"Found {legacy_records.count()} unbridged active legacy attendance records.")
        
        success = 0
        failed = 0
        
        for legacy in legacy_records:
            if not legacy.employee or not legacy.employee.employee_id:
                self.stderr.write(f"WARNING: Legacy attendance {legacy.id} has no mapped universal employee. Skipping.")
                failed += 1
                continue
                
            try:
                with transaction.atomic():
                    new_att = WorkforceAttendance(
                        company_id=legacy.company_id,
                        employee_id=legacy.employee.employee_id,
                        date=legacy.date,
                        check_in=datetime.datetime.combine(legacy.date, legacy.check_in) if legacy.check_in else None,
                        check_out=datetime.datetime.combine(legacy.date, legacy.check_out) if legacy.check_out else None,
                        source='MIGRATION'
                    )
                    
                    if not dry_run:
                        new_att.save()
                        legacy.workforce_attendance = new_att
                        legacy.save(update_fields=['workforce_attendance'])
                    
                    success += 1
            except Exception as e:
                self.stderr.write(f"CRITICAL: Failed to migrate legacy attendance {legacy.id}: {e}")
                failed += 1
                
        if dry_run:
            self.stdout.write(self.style.SUCCESS(f"DRY RUN COMPLETE: Would migrate {success}, skip/fail {failed}"))
        else:
            self.stdout.write(self.style.SUCCESS(f"MIGRATION COMPLETE: Migrated {success}, skipped/failed {failed}"))
