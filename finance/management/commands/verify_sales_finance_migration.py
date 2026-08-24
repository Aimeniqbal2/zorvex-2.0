import logging
from django.core.management.base import BaseCommand
from django.db.models import Count, Q

from sales.models import Sale, CustomerCreditLedger
from finance.models import JournalEntry, SalesAccountingConfiguration, AccountingPeriod
from crm.models import CRMEntity
from companies.models import Company

logger = logging.getLogger(__name__)

class Command(BaseCommand):
    help = 'Phase 6D: Verify Sales to Finance Migration.'

    def handle(self, *args, **options):
        self.stdout.write(self.style.MIGRATE_HEADING("Starting Phase 6D: Sales to Finance Verification...\n"))
        
        companies = Company.objects.all()
        for company in companies:
            self.stdout.write(f"\nVerifying Company: {company.name}")
            warnings = 0
            errors = 0

            # 1. Missing journal bridges
            missing_bridges = Sale.objects.filter(company=company, journal_entry__isnull=True).count()
            if missing_bridges > 0:
                self.stdout.write(self.style.WARNING(f"  [WARNING] {missing_bridges} Sales missing journal bridges."))
                warnings += missing_bridges

            # 2. Broken journal references / Cross-company references
            broken_cross = Sale.objects.filter(
                company=company,
                journal_entry__isnull=False
            ).exclude(journal_entry__company=company).count()
            if broken_cross > 0:
                self.stdout.write(self.style.ERROR(f"  [CRITICAL] {broken_cross} Sales have cross-company or broken JournalEntry references."))
                errors += broken_cross

            # 3. Missing CRMEntity on Sales
            missing_crm = Sale.objects.filter(company=company, crm_entity__isnull=True).count()
            if missing_crm > 0:
                self.stdout.write(self.style.WARNING(f"  [WARNING] {missing_crm} Sales missing CRMEntity."))
                warnings += missing_crm

            # 4. Duplicate journals / source_document_id / reference numbers
            duplicates = JournalEntry.objects.filter(
                company=company, 
                source_module='sales'
            ).values('source_document_id').annotate(count=Count('id')).filter(count__gt=1)
            for d in duplicates:
                self.stdout.write(self.style.ERROR(f"  [CRITICAL] Duplicate JournalEntry for Sale ID {d['source_document_id']}"))
                errors += 1

            duplicate_refs = JournalEntry.objects.filter(
                company=company, 
                source_module='sales'
            ).values('reference').annotate(count=Count('id')).filter(count__gt=1)
            for d in duplicate_refs:
                self.stdout.write(self.style.ERROR(f"  [CRITICAL] Duplicate reference number {d['reference']}"))
                errors += 1

            # 5. Invalid journal status
            invalid_status = JournalEntry.objects.filter(
                company=company,
                source_module='sales'
            ).exclude(status__in=['POSTED', 'REVERSED']).count()
            if invalid_status > 0:
                self.stdout.write(self.style.ERROR(f"  [CRITICAL] {invalid_status} JournalEntries have invalid status (not POSTED/REVERSED)."))
                errors += invalid_status

            from django.db.models import Sum
            # 6. Journal not balanced
            unbalanced = 0
            for entry in JournalEntry.objects.filter(company=company, source_module='sales'):
                totals = entry.lines.aggregate(
                    total_debit=Sum('debit'), 
                    total_credit=Sum('credit')
                )
                if totals['total_debit'] != totals['total_credit']:
                    unbalanced += 1
            if unbalanced > 0:
                self.stdout.write(self.style.ERROR(f"  [CRITICAL] {unbalanced} JournalEntries are not balanced."))
                errors += unbalanced

            # 7. Missing accounting configuration
            config_exists = SalesAccountingConfiguration.objects.filter(company=company, is_active=True).exists()
            if not config_exists:
                self.stdout.write(self.style.WARNING("  [WARNING] Missing active SalesAccountingConfiguration."))
                warnings += 1

            # 8. Missing accounting period
            periods = AccountingPeriod.objects.filter(company=company)
            if not periods.exists():
                self.stdout.write(self.style.WARNING("  [WARNING] Missing AccountingPeriod."))
                warnings += 1

            if errors == 0 and warnings == 0:
                self.stdout.write(self.style.SUCCESS("  [PASS] All checks passed."))
            else:
                self.stdout.write(f"  Summary: {errors} CRITICAL, {warnings} WARNINGS")

        self.stdout.write(self.style.MIGRATE_HEADING("\nVerification Complete."))
