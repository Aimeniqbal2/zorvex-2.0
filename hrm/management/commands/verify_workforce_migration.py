from django.core.management.base import BaseCommand
from hrm.models import Attendance, WorkforceAttendance
from django.db import models

class Command(BaseCommand):
    help = 'Verifies the integrity of the workforce migration'

    def handle(self, *args, **options):
        legacy_records = Attendance.objects.filter(is_deleted=False)
        
        unbridged = legacy_records.filter(workforce_attendance__isnull=True).count()
        if unbridged > 0:
            self.stderr.write(f"WARNING: {unbridged} legacy records are unbridged.")
            
        cross_company = legacy_records.filter(company_id__isnull=False, workforce_attendance__company_id__isnull=False).exclude(company_id=models.F('workforce_attendance__company_id')).count()
        if cross_company > 0:
            self.stderr.write(f"CRITICAL: {cross_company} cross-company bridge violations detected.")
            
        self.stdout.write(self.style.SUCCESS("Verification complete."))
