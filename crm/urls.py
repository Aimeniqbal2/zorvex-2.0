from rest_framework.routers import DefaultRouter
from .views import (
    CRMEntityViewSet, CRMContactViewSet, CRMAddressViewSet,
    CRMCommunicationViewSet, CRMTagViewSet, CRMRelationshipViewSet,
    CRMNoteViewSet, CRMAttachmentViewSet,
    OpportunityViewSet, ProposalViewSet, ProposalLineViewSet, OpportunityAwardViewSet
)

router = DefaultRouter()
router.register(r'entities', CRMEntityViewSet, basename='crm-entity')
router.register(r'contacts', CRMContactViewSet, basename='crm-contact')
router.register(r'addresses', CRMAddressViewSet, basename='crm-address')
router.register(r'communications', CRMCommunicationViewSet, basename='crm-communication')
router.register(r'tags', CRMTagViewSet, basename='crm-tag')
router.register(r'relationships', CRMRelationshipViewSet, basename='crm-relationship')
router.register(r'notes', CRMNoteViewSet, basename='crm-note')
router.register(r'attachments', CRMAttachmentViewSet, basename='crm-attachment')
router.register(r'opportunities', OpportunityViewSet, basename='crm-opportunity')
router.register(r'proposals', ProposalViewSet, basename='crm-proposal')
router.register(r'proposal-lines', ProposalLineViewSet, basename='crm-proposal-line')
router.register(r'awards', OpportunityAwardViewSet, basename='crm-award')

urlpatterns = router.urls
