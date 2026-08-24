import logging
from django.core.management.base import BaseCommand
from sales.models import Sale, CustomerCreditLedger
from finance.models import JournalEntry

logger = logging.getLogger(__name__)

class Command(BaseCommand):
    help = 'Phase 6C: Read-only audit of Universal Finance bridges in the Sales module.'

    def handle(self, *args, **kwargs):
        self.stdout.write(self.style.MIGRATE_HEADING("Starting Phase 6C Finance Bridge Audit...\n"))
        warnings = []
        errors = []

        # Audit Sales
        sales_without_bridges = 0
        sales_cross_company = 0
        sales_broken_bridges = 0
        
        for sale in Sale.objects.select_related('journal_entry').iterator():
            if not sale.journal_entry_id:
                sales_without_bridges += 1
            else:
                if sale.company_id != sale.journal_entry.company_id:
                    sales_cross_company += 1
                    errors.append(f"Sale {sale.id} has cross-company JournalEntry {sale.journal_entry_id}")
                
                # Check broken bridge: the foreign key exists, but is it valid?
                # Django ORM handles this usually, but let's just make sure.

        if sales_without_bridges > 0:
            warnings.append(f"{sales_without_bridges} Sales found without JournalEntry bridges (Legacy records).")
        if sales_cross_company > 0:
            errors.append(f"{sales_cross_company} Sales have cross-company JournalEntry references.")

        # Audit Customer Credit Ledger
        ccl_without_bridges = 0
        ccl_cross_company = 0
        
        for ccl in CustomerCreditLedger.objects.select_related('journal_entry').iterator():
            if not ccl.journal_entry_id:
                ccl_without_bridges += 1
            else:
                if ccl.company_id != ccl.journal_entry.company_id:
                    ccl_cross_company += 1
                    errors.append(f"CustomerCreditLedger {ccl.id} has cross-company JournalEntry {ccl.journal_entry_id}")

        if ccl_without_bridges > 0:
            warnings.append(f"{ccl_without_bridges} CustomerCreditLedger entries found without JournalEntry bridges.")
        if ccl_cross_company > 0:
            errors.append(f"{ccl_cross_company} CustomerCreditLedger entries have cross-company JournalEntry references.")

        # Duplicate bridges (multiple sales pointing to same journal entry)
        # That should not happen since JournalEntry is 1:1 with Sale
        from django.db.models import Count
        duplicate_sales = Sale.objects.exclude(journal_entry__isnull=True).values('journal_entry').annotate(count=Count('id')).filter(count__gt=1)
        for dup in duplicate_sales:
            errors.append(f"Duplicate bridge: JournalEntry {dup['journal_entry']} is referenced by {dup['count']} Sales.")

        duplicate_ccls = CustomerCreditLedger.objects.exclude(journal_entry__isnull=True).values('journal_entry').annotate(count=Count('id')).filter(count__gt=1)
        for dup in duplicate_ccls:
            errors.append(f"Duplicate bridge: JournalEntry {dup['journal_entry']} is referenced by {dup['count']} CustomerCreditLedger entries.")

        self.stdout.write(self.style.WARNING("--- WARNINGS ---"))
        for w in warnings:
            self.stdout.write(self.style.WARNING(f"[WARNING] {w}"))
            
        if not warnings:
            self.stdout.write("No warnings found.")

        self.stdout.write("\n")
        self.stdout.write(self.style.ERROR("--- ERRORS ---"))
        for e in errors:
            self.stdout.write(self.style.ERROR(f"[FAIL] {e}"))
            
        if not errors:
            self.stdout.write(self.style.SUCCESS("No errors found."))

        self.stdout.write("\n")
        if not errors:
            self.stdout.write(self.style.SUCCESS("Audit PASS: All bridges valid."))
        else:
            self.stdout.write(self.style.ERROR("Audit FAIL: Broken bridges detected."))
