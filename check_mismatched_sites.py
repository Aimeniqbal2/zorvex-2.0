import django, os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp_core.settings')
django.setup()

from crm.models import CRMEntity
from security_crm.models import ClientLocation, SecurityProposal, ProposalServiceLine, ProposalVersion
from operations.models import OperationalSite, SecurityPost, Deployment, ServiceContract

print('=== VAPEJAM ANALYSIS ===')
for e in CRMEntity.all_objects.filter(name__icontains='vape'):
    print(f'Entity: {e.name} (id={e.id}, is_deleted={e.is_deleted})')
    print('  ClientLocations:')
    for l in ClientLocation.all_objects.filter(customer=e):
        print(f'    Loc: {l.name} (id={l.id}, is_deleted={l.is_deleted})')
    print('  OperationalSites:')
    for s in OperationalSite.all_objects.filter(crm_entity=e):
        print(f'    Site: {s.name} (id={s.id}, is_deleted={s.is_deleted})')
        for p in SecurityPost.all_objects.filter(site=s):
            print(f'      Post: {p.post_name} (id={p.id}, is_deleted={p.is_deleted})')
    print('  Proposals:')
    for p in SecurityProposal.all_objects.filter(customer=e):
        print(f'    Prop: {p.proposal_number} - {p.title} (status={p.status}, is_deleted={p.is_deleted})')
        for v in ProposalVersion.all_objects.filter(proposal=p):
            print(f'      Ver: v{v.version_number} (status={v.status}, is_deleted={v.is_deleted})')
            for sl in ProposalServiceLine.all_objects.filter(proposal_version=v):
                print(f'        Line: loc={sl.location.name if sl.location else None} (loc_id={sl.location_id}), qty={sl.quantity}')

print('\n=== CHECK ALL SITES IN OPERATIONS THAT DONT MATCH CRM LOCATIONS ===')
all_crm_entities = set(CRMEntity.objects.filter(is_deleted=False).values_list('id', flat=True))

mismatched = []
for s in OperationalSite.objects.filter(is_deleted=False):
    if s.crm_entity_id not in all_crm_entities:
        mismatched.append((s, 'Entity deleted or missing'))
    elif not ClientLocation.objects.filter(customer=s.crm_entity, name=s.name, is_deleted=False).exists():
        mismatched.append((s, f'Site name "{s.name}" not in active ClientLocations for entity "{s.crm_entity.name}"'))

print(f'Total active OperationalSites: {OperationalSite.objects.filter(is_deleted=False).count()}')
print(f'Total mismatched/orphaned sites: {len(mismatched)}')
for s, reason in mismatched[:30]:
    print(f'  Site: "{s.name}" ({s.crm_entity.name if s.crm_entity else "No entity"}) -> {reason}')
