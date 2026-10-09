import sys
from django.core.management.base import BaseCommand
from django.db import transaction
from crm.models import CRMEntity
from security_crm.models import ClientLocation, SecurityProposal, ProposalVersion, ProposalServiceLine
from operations.models import OperationalSite, SecurityPost
from security_crm.services.workflow import SecurityProposalWorkflowService


class Command(BaseCommand):
    help = "Safely restores soft-deleted CRM client locations, proposal requirements, and syncs them to Operations."

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Simulate restoration without saving changes to the database.',
        )
        parser.add_argument(
            '--client',
            type=str,
            help='Filter restoration to a specific client name (substring match).',
        )

    def handle(self, *args, **options):
        dry_run = options.get('dry_run', False)
        client_filter = options.get('client')

        self.stdout.write(self.style.NOTICE("=================================================="))
        self.style.NOTICE("ZORVEX ERP - CRM REQUIREMENTS DATA RESTORATION TOOL")
        self.stdout.write(self.style.NOTICE("=================================================="))

        if dry_run:
            self.stdout.write(self.style.WARNING("RUNNING IN DRY-RUN MODE (No database changes will be saved)\n"))

        # 1. Restore Client Locations
        loc_qs = ClientLocation.all_objects.filter(is_deleted=True)
        if client_filter:
            loc_qs = loc_qs.filter(customer__name__icontains=client_filter)

        restored_locations = 0
        with transaction.atomic():
            for loc in loc_qs:
                if loc.customer and not loc.customer.is_deleted:
                    self.stdout.write(f"Restoring location: '{loc.name}' for client '{loc.customer.name}'")
                    if not dry_run:
                        loc.is_deleted = False
                        loc.is_active = True
                        loc.save(update_fields=['is_deleted', 'is_active', 'updated_at'])
                    restored_locations += 1

            # 2. Restore Proposal Service Lines
            line_qs = ProposalServiceLine.all_objects.filter(is_deleted=True)
            if client_filter:
                line_qs = line_qs.filter(proposal_version__proposal__customer__name__icontains=client_filter)

            restored_lines = 0
            proposals_to_resync = set()
            for line in line_qs:
                prop = line.proposal_version.proposal if line.proposal_version else None
                cust = prop.customer if prop else None
                if prop and not prop.is_deleted and cust and not cust.is_deleted:
                    loc_name = line.location.name if line.location else "Head Office"
                    role_name = line.service_type.name if line.service_type else "Guard"
                    self.stdout.write(f"Restoring requirement line: '{role_name}' x {line.quantity} @ {loc_name} ({cust.name})")
                    if not dry_run:
                        line.is_deleted = False
                        line.save(update_fields=['is_deleted', 'updated_at'])
                        proposals_to_resync.add(prop)
                    restored_lines += 1

            # 3. Restore Matching Operational Sites
            site_qs = OperationalSite.all_objects.filter(is_deleted=True)
            if client_filter:
                site_qs = site_qs.filter(crm_entity__name__icontains=client_filter)

            restored_sites = 0
            for site in site_qs:
                if site.crm_entity and not site.crm_entity.is_deleted:
                    # Check if matching active ClientLocation exists
                    cloc_exists = ClientLocation.objects.filter(
                        customer=site.crm_entity,
                        name__iexact=site.name,
                        is_deleted=False
                    ).exists()
                    if cloc_exists:
                        self.stdout.write(f"Restoring operational site: '{site.name}' for client '{site.crm_entity.name}'")
                        if not dry_run:
                            site.is_deleted = False
                            site.is_active = True
                            site.save(update_fields=['is_deleted', 'is_active', 'updated_at'])
                            SecurityPost.all_objects.filter(site=site).update(is_deleted=False, is_active=True)
                        restored_sites += 1

            # 4. Re-sync to Operations
            resynced_proposals = 0
            if not dry_run:
                for prop in proposals_to_resync:
                    try:
                        SecurityProposalWorkflowService.sync_proposal_and_locations_to_operations(prop)
                        resynced_proposals += 1
                    except Exception as e:
                        self.stdout.write(self.style.WARNING(f"Warning syncing proposal {prop.proposal_number}: {e}"))

            if dry_run:
                transaction.set_rollback(True)

        self.stdout.write(self.style.SUCCESS("\n=================================================="))
        self.stdout.write(self.style.SUCCESS("RESTORATION COMPLETE!"))
        self.stdout.write(self.style.SUCCESS(f"- Client Locations Restored: {restored_locations}"))
        self.stdout.write(self.style.SUCCESS(f"- Requirement Lines Restored: {restored_lines}"))
        self.stdout.write(self.style.SUCCESS(f"- Operational Sites Restored: {restored_sites}"))
        self.stdout.write(self.style.SUCCESS(f"- Proposals Synced to Operations: {resynced_proposals}"))
        self.stdout.write(self.style.SUCCESS("=================================================="))
