import logging
from django.core.management.base import BaseCommand
from django.db import transaction
from django.core.exceptions import ValidationError

from companies.models import Company
from sales.models import Sale, CustomerCreditLedger
from finance.models import JournalEntry
from finance.services.sales_accounting import create_sale_journal

logger = logging.getLogger(__name__)

class Command(BaseCommand):
    help = 'Phase 6D: Migrate historical Sales to Universal Finance ledger.'

    def add_arguments(self, parser):
        parser.add_argument('--rollback', action='store_true', help='Rollback the sales migration')

    def handle(self, *args, **options):
        if options['rollback']:
            self.rollback()
        else:
            self.migrate()

    def migrate(self):
        self.stdout.write(self.style.MIGRATE_HEADING("Starting Phase 6D: Sales to Finance Migration...\n"))

        companies = Company.objects.all()
        total_migrated = 0
        total_skipped = 0
        total_warnings = 0
        total_errors = 0

        for company in companies:
            self.stdout.write(f"\nCompany: {company.name}")
            migrated = 0
            skipped = 0
            warnings = 0
            errors = 0

            with transaction.atomic():
                sales_to_migrate = Sale.objects.filter(
                    company=company,
                    journal_entry__isnull=True
                ).iterator()

                for sale in sales_to_migrate:
                    try:
                        # Attempt to generate universal journal
                        entry = create_sale_journal(sale)
                        
                        # Link sale without triggering save() side effects
                        Sale.objects.filter(pk=sale.pk).update(journal_entry=entry)
                        migrated += 1
                    except ValidationError as e:
                        self.stdout.write(self.style.WARNING(f"  [WARNING] Sale {sale.id} skipped: {str(e)}"))
                        warnings += 1
                        skipped += 1
                    except Exception as e:
                        self.stdout.write(self.style.ERROR(f"  [ERROR] Sale {sale.id} failed: {str(e)}"))
                        errors += 1
                        skipped += 1

                # Migrate CustomerCreditLedger
                ccls_to_migrate = CustomerCreditLedger.objects.filter(
                    company=company,
                    journal_entry__isnull=True,
                    sale__isnull=False,
                    sale__journal_entry__isnull=False
                )
                
                for ccl in ccls_to_migrate.iterator():
                    CustomerCreditLedger.objects.filter(pk=ccl.pk).update(journal_entry=ccl.sale.journal_entry)

            self.stdout.write(f"  Migrated: {migrated}")
            self.stdout.write(f"  Skipped: {skipped}")
            self.stdout.write(f"  Warnings: {warnings}")
            self.stdout.write(f"  Errors: {errors}")

            total_migrated += migrated
            total_skipped += skipped
            total_warnings += warnings
            total_errors += errors

        self.stdout.write(self.style.MIGRATE_HEADING("\n--- Final Totals ---"))
        self.stdout.write(f"Total Migrated: {total_migrated}")
        self.stdout.write(f"Total Skipped: {total_skipped}")
        self.stdout.write(f"Total Warnings: {total_warnings}")
        self.stdout.write(f"Total Errors: {total_errors}")

    def rollback(self):
        self.stdout.write(self.style.MIGRATE_HEADING("Rolling back Phase 6D: Sales to Finance Migration...\n"))

        companies = Company.objects.all()
        for company in companies:
            with transaction.atomic():
                # Unlink Sale
                sales_unlinked = Sale.objects.filter(
                    company=company,
                    journal_entry__source_module='sales'
                ).update(journal_entry=None)
                
                # Unlink CCL
                ccl_unlinked = CustomerCreditLedger.objects.filter(
                    company=company,
                    journal_entry__source_module='sales'
                ).update(journal_entry=None)
                
                # Delete generated Universal Journal Entries
                entries_deleted, _ = JournalEntry.objects.filter(
                    company=company,
                    source_module='sales'
                ).delete()

                if sales_unlinked > 0 or entries_deleted > 0:
                    self.stdout.write(f"Company {company.name}: Unlinked {sales_unlinked} Sales, {ccl_unlinked} CCLs. Deleted {entries_deleted} JournalEntries.")

        self.stdout.write(self.style.SUCCESS("Rollback complete."))
