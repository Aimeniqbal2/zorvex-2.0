import os
import json
from decimal import Decimal
from django.core.management.base import BaseCommand
from django.db import transaction
from django.conf import settings
from companies.models import Company
from crm.models import CRMEntity
from security_crm.models import (
    ClientLocation,
    SecurityProposal,
    ProposalVersion,
    ProposalServiceLine,
    SecurityServiceType,
    SecurityProposalStatus
)
from security_crm.services.workflow import SecurityProposalWorkflowService


class Command(BaseCommand):
    help = "Restores all 223 master client costing requirement lines, locations, and proposals from master_costing_seed.json"

    def add_arguments(self, parser):
        parser.add_argument(
            '--company-id',
            type=str,
            help='Target Company ID to restore data for. Defaults to first active company.',
        )

    def handle(self, *args, **options):
        company_id = options.get('company_id')
        if company_id:
            company = Company.objects.filter(id=company_id).first()
        else:
            company = Company.objects.first()

        if not company:
            self.stdout.write(self.style.ERROR("No company found in the system!"))
            return

        fixture_path = os.path.join(settings.BASE_DIR, 'security_crm', 'fixtures', 'master_costing_seed.json')
        if not os.path.exists(fixture_path):
            self.stdout.write(self.style.ERROR(f"Fixture file not found at: {fixture_path}"))
            return

        with open(fixture_path, 'r', encoding='utf-8') as f:
            records = json.load(f)

        self.stdout.write(self.style.NOTICE("=================================================="))
        self.stdout.write(self.style.NOTICE(f"RESTORING {len(records)} MASTER COSTING REQUIREMENTS FOR {company.name}"))
        self.stdout.write(self.style.NOTICE("=================================================="))

        imported_clients = set()
        imported_locations = set()
        imported_lines = 0
        proposals_to_sync = set()

        with transaction.atomic():
            for rec in records:
                cust_name = rec['customer_name'].strip()
                loc_name = rec['location_name'].strip()
                st_name = rec['service_type_name'].strip()
                st_code = rec['service_type_code'].strip()

                # 1. Customer
                customer = getattr(CRMEntity, 'all_objects', CRMEntity.objects).filter(
                    company=company, name__iexact=cust_name
                ).first()
                if not customer:
                    customer = CRMEntity.objects.create(
                        company=company,
                        name=cust_name,
                        entity_type='CUSTOMER',
                        active=True,
                        is_deleted=False
                    )
                else:
                    if customer.is_deleted or not customer.active:
                        customer.is_deleted = False
                        customer.active = True
                        customer.save(update_fields=['is_deleted', 'active'])

                imported_clients.add(customer.id)

                # 2. Location
                location = getattr(ClientLocation, 'all_objects', ClientLocation.objects).filter(
                    company=company,
                    customer=customer,
                    name__iexact=loc_name
                ).first()
                if not location:
                    location = ClientLocation.objects.create(
                        company=company,
                        customer=customer,
                        name=loc_name,
                        is_active=True,
                        is_deleted=False
                    )
                else:
                    if location.is_deleted or not location.is_active:
                        location.is_deleted = False
                        location.is_active = True
                        location.save(update_fields=['is_deleted', 'is_active'])

                imported_locations.add(location.id)

                # 3. Proposal
                proposal = getattr(SecurityProposal, 'all_objects', SecurityProposal.objects).filter(
                    company=company,
                    customer=customer
                ).order_by('-created_at').first()
                if not proposal:
                    proposal = SecurityProposal.objects.create(
                        company=company,
                        customer=customer,
                        title=f"{customer.name} - Final Requirements",
                        status=SecurityProposalStatus.ACTIVE,
                        is_handoff_ready=True,
                        is_deleted=False
                    )
                else:
                    if proposal.is_deleted or proposal.status != SecurityProposalStatus.ACTIVE:
                        proposal.is_deleted = False
                        proposal.status = SecurityProposalStatus.ACTIVE
                        proposal.is_handoff_ready = True
                        proposal.save(update_fields=['is_deleted', 'status', 'is_handoff_ready'])

                # 4. Version
                version = ProposalVersion.objects.filter(
                    company=company,
                    proposal=proposal
                ).order_by('-version_number').first()
                if not version:
                    version = ProposalVersion.objects.create(
                        company=company,
                        proposal=proposal,
                        version_number=1,
                        version_type='Final Requirement',
                        status='ACTIVE',
                        overhead_per_guard=Decimal(str(rec.get('overhead_per_guard') or 6000)),
                        service_charges_per_guard=Decimal(str(rec.get('service_charges_per_guard') or 3000)),
                        withholding_tax_rate=Decimal(str(rec.get('tax_wht_rate') or 7)),
                        tax_rate=Decimal(str(rec.get('sales_tax_rate') or 8)),
                        sales_tax_override=Decimal(str(rec['sales_tax_override'])) if rec.get('sales_tax_override') is not None else None,
                        withholding_tax_override=Decimal(str(rec['withholding_tax_override'])) if rec.get('withholding_tax_override') is not None else None,
                        total_sessi=Decimal(str(rec.get('total_sessi') or 0)),
                        total_eobi=Decimal(str(rec.get('total_eobi') or 0)),
                        is_deleted=False
                    )
                else:
                    if version.is_deleted:
                        version.is_deleted = False
                        version.save(update_fields=['is_deleted'])

                # 5. Service Type
                st = SecurityServiceType.objects.filter(company=company, code=st_code).first()
                if not st:
                    st = SecurityServiceType.objects.filter(company=company, name__iexact=st_name).first()
                if not st:
                    st = SecurityServiceType.objects.create(
                        company=company,
                        name=st_name,
                        code=st_code,
                        is_active=True
                    )

                # 6. Proposal Service Line
                line = getattr(ProposalServiceLine, 'all_objects', ProposalServiceLine.objects).filter(
                    company=company,
                    proposal_version=version,
                    location=location,
                    service_type=st
                ).first()

                qty = int(rec.get('quantity') or 1)
                rate = Decimal(str(rec.get('client_rate') or 0))
                sal = Decimal(str(rec.get('guard_salary') or 0))
                ot_rate = Decimal(str(rec.get('single_ot_rate') or rec.get('double_ot_rate') or 0))

                if not line:
                    line = ProposalServiceLine.objects.create(
                        company=company,
                        proposal_version=version,
                        location=location,
                        service_type=st,
                        quantity=qty,
                        client_rate=rate,
                        guard_salary=sal,
                        single_ot_rate=ot_rate,
                        double_ot_rate=ot_rate,
                        weapon_type=rec.get('weapon_type') or 'UNARMED',
                        shift_hours=rec.get('shift_hours') or '12_HOURS',
                        billing_unit=rec.get('billing_unit') or 'MONTHLY',
                        is_deleted=False
                    )
                else:
                    line.quantity = qty
                    line.client_rate = rate
                    line.guard_salary = sal
                    line.single_ot_rate = ot_rate
                    line.double_ot_rate = ot_rate
                    line.is_deleted = False
                    line.save()

                imported_lines += 1
                proposals_to_sync.add(proposal)

            # Sync to operations
            for prop in proposals_to_sync:
                try:
                    SecurityProposalWorkflowService.sync_proposal_and_locations_to_operations(prop)
                except Exception as e:
                    self.stdout.write(self.style.WARNING(f"Sync warning for {prop.proposal_number}: {e}"))

        self.stdout.write(self.style.SUCCESS("=================================================="))
        self.stdout.write(self.style.SUCCESS("MASTER COSTING RESTORATION COMPLETE!"))
        self.stdout.write(self.style.SUCCESS(f"- Clients Restored: {len(imported_clients)}"))
        self.stdout.write(self.style.SUCCESS(f"- Locations Restored: {len(imported_locations)}"))
        self.stdout.write(self.style.SUCCESS(f"- Requirement Lines Restored: {imported_lines}"))
        self.stdout.write(self.style.SUCCESS("=================================================="))
