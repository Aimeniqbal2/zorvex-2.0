import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp_core.settings')
import django
django.setup()

from collections import defaultdict
from django.db import transaction
from crm.models import CRMEntity
from security_crm.models import ClientLocation, SecurityProposal, ProposalVersion, ProposalServiceLine
from operations.models import (
    OperationalSite, SecurityPost, Deployment, DutyRoster,
    DutyAssignment, DailyDutyPay
)
from hrm.models import WorkforceAttendance, OvertimeRecord

def reconcile_operations():
    print("==================================================")
    print("STARTING OPERATIONS & CRM RECONCILIATION CLEANUP")
    print("==================================================")

    cleaned_dupe_posts = 0
    repointed_deployments = 0
    cleaned_orphaned_sites = 0

    with transaction.atomic():
        # ------------------------------------------------------------------
        # 1. Clean up duplicate SecurityPosts for the same site & designation
        # ------------------------------------------------------------------
        all_posts = list(SecurityPost.objects.filter(
            is_active=True, is_deleted=False
        ).select_related('site', 'required_designation'))

        site_map = defaultdict(lambda: defaultdict(list))
        for p in all_posts:
            # Group by site and normalized designation/post name
            key = str(p.required_designation_id) if p.required_designation_id else (p.post_name or '').strip().lower().replace('(', '').replace(')', '').replace('-', ' ').strip()
            site_map[p.site_id][key].append(p)

        for site_id, desig_groups in site_map.items():
            for desig_key, group in desig_groups.items():
                if len(group) <= 1:
                    continue

                # Sort to choose the canonical post:
                # 1. Clean name without parentheses preferred
                # 2. Most deployments preferred
                # 3. Higher headcount preferred
                def post_rank(p):
                    has_paren = 1 if '(' in (p.post_name or '') else 0
                    dep_count = p.deployments.count()
                    return (-dep_count, has_paren, -p.required_headcount)

                sorted_group = sorted(group, key=post_rank)
                canonical = sorted_group[0]
                duplicates = sorted_group[1:]

                # Clean up duplicate posts
                for dupe in duplicates:
                    # Move any deployments from dupe to canonical
                    deps = Deployment.objects.filter(post=dupe)
                    for dep in deps:
                        dep.post = canonical
                        dep.save(update_fields=['post', 'updated_at'])
                        repointed_deployments += 1

                    # Re-link any attendances
                    WorkforceAttendance.objects.filter(post=dupe).update(post=canonical)
                    DutyRoster.objects.filter(post=dupe).update(post=canonical)
                    DailyDutyPay.objects.filter(post=dupe).update(post=canonical)

                    # Mark duplicate post as deleted/inactive
                    dupe.is_active = False
                    dupe.is_deleted = True
                    dupe.save(update_fields=['is_active', 'is_deleted', 'updated_at'])
                    cleaned_dupe_posts += 1

        print(f"-> Repointed {repointed_deployments} deployment(s) to canonical posts.")
        print(f"-> Deactivated and soft-deleted {cleaned_dupe_posts} duplicate post(s).")

        # ------------------------------------------------------------------
        # 2. Clean up orphaned OperationalSites where CRMEntity is deleted or inactive
        # ------------------------------------------------------------------
        all_sites = list(OperationalSite.objects.filter(is_deleted=False).select_related('crm_entity'))
        for s in all_sites:
            if not s.crm_entity_id or s.crm_entity.is_deleted or not s.crm_entity.active:
                s.is_active = False
                s.is_deleted = True
                s.save(update_fields=['is_active', 'is_deleted', 'updated_at'])
                SecurityPost.objects.filter(site=s).update(is_active=False, is_deleted=True)
                Deployment.objects.filter(site=s).update(is_deleted=True)
                cleaned_orphaned_sites += 1

        print(f"-> Deactivated and soft-deleted {cleaned_orphaned_sites} orphaned operational site(s).")

        # ------------------------------------------------------------------
        # 3. Reconcile Vapejam specifically to ensure 100% precision
        # ------------------------------------------------------------------
        vapejam = CRMEntity.objects.filter(name__icontains='vapejam', is_deleted=False).first()
        if vapejam:
            print("\nVapejam Status:")
            v_locs = list(ClientLocation.objects.filter(customer=vapejam, is_deleted=False).values_list('name', flat=True))
            print(f"  Active CRM Locations ({len(v_locs)}): {v_locs}")
            v_sites = list(OperationalSite.objects.filter(crm_entity=vapejam, is_deleted=False, is_active=True))
            print(f"  Active Operational Sites ({len(v_sites)}): {[s.name for s in v_sites]}")
            for vs in v_sites:
                v_posts = list(SecurityPost.objects.filter(site=vs, is_active=True, is_deleted=False).values_list('post_name', flat=True))
                print(f"    Site '{vs.name}' active posts: {v_posts}")

    print("\n==================================================")
    print("RECONCILIATION COMPLETE SUCCESSFULLY")
    print("==================================================")

if __name__ == '__main__':
    reconcile_operations()
