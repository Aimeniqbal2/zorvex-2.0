import logging
from django.core.management.base import BaseCommand
from crm.models import CRMEntity
from security_crm.models import ClientLocation, SecurityProposal, ProposalVersion, ProposalServiceLine

class Command(BaseCommand):
    help = 'Purges soft-deleted CRM entities and orphaned records to free up unique code constraints.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--all-companies',
            action='store_true',
            help='Purge soft-deleted entities across all companies.'
        )

    def handle(self, *args, **options):
        self.stdout.write("========================================")
        self.stdout.write(" PURGING SOFT-DELETED CRM ENTITIES ")
        self.stdout.write("========================================")

        deleted_entities = getattr(CRMEntity, 'all_objects', CRMEntity.objects).filter(is_deleted=True)
        count = deleted_entities.count()

        if count == 0:
            self.stdout.write(self.style.SUCCESS("No soft-deleted CRM entities found. Database is clean."))
            return

        self.stdout.write(f"Found {count} soft-deleted CRM entities. Purging permanently from database...")

        # Hard delete from PostgreSQL table
        deleted_count, details = deleted_entities.delete()

        self.stdout.write(self.style.SUCCESS(f"Successfully purged {deleted_count} records from database: {details}"))
