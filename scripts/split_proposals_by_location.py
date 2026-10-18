import os
import sys
import django

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp_core.settings')
django.setup()

from django.db import transaction
from security_crm.models import (
    SecurityProposal,
    ProposalVersion,
    ProposalServiceLine,
    ContractEquipmentRequirement,
    ClientLocation,
    SecurityProposalStatus,
)
from crm.models import CRMEntity
from security_crm.services.workflow import SecurityProposalWorkflowService


def run(dry_run=True):
    print(f"=== SPLIT PROPOSALS BY LOCATION (DRY RUN = {dry_run}) ===")

    # 1. Single location proposals: assign proposal.location
    single_loc_updated = 0
    for p in SecurityProposal.objects.filter(is_deleted=False, location__isnull=True):
        ver = p.versions.filter(is_deleted=False).order_by('-version_number').first()
        if not ver:
            continue
        loc_ids = set(ver.service_lines.filter(is_deleted=False).values_list('location_id', flat=True))
        loc_ids.discard(None)
        if len(loc_ids) == 1:
            loc = ClientLocation.objects.filter(id=list(loc_ids)[0], is_deleted=False).first()
            if loc:
                print(f"[Single-Loc] Binding proposal {p.proposal_number} ({p.customer.name}) -> {loc.name}")
                if not dry_run:
                    p.location = loc
                    p.save(update_fields=['location'])
                single_loc_updated += 1

    print(f"Total single-location proposals bound: {single_loc_updated}")

    # 2. Multi-location proposals: split into 1 proposal per location
    multi_split_count = 0
    for p in SecurityProposal.objects.filter(is_deleted=False):
        ver = p.versions.filter(is_deleted=False).order_by('-version_number').first()
        if not ver:
            continue
        loc_ids = list(set(ver.service_lines.filter(is_deleted=False).values_list('location_id', flat=True)))
        if None in loc_ids:
            loc_ids.remove(None)
        if len(loc_ids) <= 1:
            continue

        locs = list(ClientLocation.objects.filter(id__in=loc_ids, is_deleted=False).order_by('name'))
        if len(locs) <= 1:
            continue

        print(f"\n[Multi-Loc] Splitting proposal {p.proposal_number} ({p.customer.name}) across {len(locs)} locations:")
        loc0 = locs[0]
        print(f"   -> Retaining loc0 on {p.proposal_number}: {loc0.name}")
        if not dry_run:
            p.location = loc0
            p.title = f"{p.customer.name} - {loc0.name} Requirements"
            p.save(update_fields=['location', 'title'])

        for loc_i in locs[1:]:
            print(f"   -> Creating dedicated proposal for {loc_i.name}...")
            if not dry_run:
                with transaction.atomic():
                    new_p = SecurityProposal.objects.create(
                        company=p.company,
                        customer=p.customer,
                        location=loc_i,
                        title=f"{p.customer.name} - {loc_i.name} Requirements",
                        status=p.status,
                        is_handoff_ready=True
                    )
                    new_ver = ProposalVersion.objects.create(
                        company=p.company,
                        proposal=new_p,
                        version_number=1,
                        version_type='Final Requirement',
                        status=ver.status,
                        billing_cycle=ver.billing_cycle,
                        payment_terms=ver.payment_terms,
                        proposal_validity_days=ver.proposal_validity_days,
                        contract_duration_months=ver.contract_duration_months,
                        expected_start_date=ver.expected_start_date,
                        security_deposit=ver.security_deposit,
                        commercial_notes=ver.commercial_notes,
                        terms_and_conditions=ver.terms_and_conditions,
                        discount_type=ver.discount_type,
                        discount_value=ver.discount_value,
                        tax_rate=ver.tax_rate,
                        overhead_per_guard=ver.overhead_per_guard,
                        service_charges_per_guard=ver.service_charges_per_guard,
                        sales_tax_basis=ver.sales_tax_basis,
                        withholding_tax_rate=ver.withholding_tax_rate,
                        withholding_tax_basis=ver.withholding_tax_basis,
                        sales_tax_override=ver.sales_tax_override,
                        withholding_tax_override=ver.withholding_tax_override,
                        total_sessi=ver.total_sessi,
                        total_eobi=ver.total_eobi,
                    )
                    # Move lines for loc_i to new_ver
                    lines_moved = ProposalServiceLine.objects.filter(
                        proposal_version=ver,
                        location=loc_i,
                        is_deleted=False
                    ).update(proposal_version=new_ver)
                    print(f"      Moved {lines_moved} service lines to {new_p.proposal_number}")

                    equip_moved = ContractEquipmentRequirement.objects.filter(
                        proposal_version=ver,
                        location=loc_i,
                        is_deleted=False
                    ).update(proposal_version=new_ver)
                    if equip_moved:
                        print(f"      Moved {equip_moved} equipment lines to {new_p.proposal_number}")

                    # Sync new proposal to operations
                    try:
                        SecurityProposalWorkflowService.sync_proposal_and_locations_to_operations(new_p)
                        print(f"      Synced {new_p.proposal_number} to Operations successfully.")
                    except Exception as err:
                        print(f"      [WARN] Syncing {new_p.proposal_number} to Operations: {err}")

        # Resync the original proposal which now only contains loc0
        if not dry_run:
            try:
                SecurityProposalWorkflowService.sync_proposal_and_locations_to_operations(p)
                print(f"   Resynced original {p.proposal_number} to Operations successfully.")
            except Exception as err:
                print(f"   [WARN] Resyncing original {p.proposal_number} to Operations: {err}")

        multi_split_count += 1

    print(f"\nTotal multi-location proposals processed: {multi_split_count}")

    # 3. For proposals without service lines, if customer has 1 location, bind it
    empty_bound_count = 0
    for p in SecurityProposal.objects.filter(is_deleted=False, location__isnull=True):
        cust_locs = ClientLocation.objects.filter(customer=p.customer, is_deleted=False)
        if cust_locs.count() == 1:
            loc = cust_locs.first()
            # check if loc already has a proposal
            already_has = SecurityProposal.objects.filter(customer=p.customer, location=loc, is_deleted=False).exclude(id=p.id).exists()
            if not already_has:
                print(f"[Empty-Prop-Single-Loc] Binding {p.proposal_number} ({p.customer.name}) -> {loc.name}")
                if not dry_run:
                    p.location = loc
                    p.save(update_fields=['location'])
                empty_bound_count += 1

    print(f"Total empty proposals bound: {empty_bound_count}")

    # 4. For any active ClientLocation that still has NO proposal, auto-create one
    created_loc_props = 0
    for loc in ClientLocation.objects.filter(is_deleted=False, is_active=True):
        has_prop = SecurityProposal.objects.filter(customer=loc.customer, location=loc, is_deleted=False).exists()
        if not has_prop:
            print(f"[Missing-Prop] Creating proposal for location: {loc.name} ({loc.customer.name})")
            if not dry_run:
                with transaction.atomic():
                    new_p = SecurityProposal.objects.create(
                        company=loc.company,
                        customer=loc.customer,
                        location=loc,
                        title=f"{loc.customer.name} - {loc.name} Requirements",
                        status=SecurityProposalStatus.ACTIVE,
                        is_handoff_ready=True
                    )
                    ProposalVersion.objects.create(
                        company=loc.company,
                        proposal=new_p,
                        version_number=1,
                        version_type='Final Requirement',
                        status='ACTIVE',
                        overhead_per_guard=6000,
                        service_charges_per_guard=3000,
                        withholding_tax_rate=7,
                        tax_rate=8,
                        sales_tax_basis='TOTAL_SALE',
                        withholding_tax_basis='INVOICE_AMOUNT'
                    )
                    try:
                        SecurityProposalWorkflowService.sync_proposal_and_locations_to_operations(new_p)
                    except Exception as err:
                        print(f"   [WARN] Syncing new location proposal to Operations: {err}")
            created_loc_props += 1

    print(f"Total new proposals created for bare locations: {created_loc_props}")
    print("=== DONE ===")


if __name__ == '__main__':
    dry = '--dry-run' in sys.argv or '--execute' not in sys.argv
    run(dry_run=dry)
