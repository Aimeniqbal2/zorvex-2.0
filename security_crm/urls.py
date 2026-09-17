from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    SecurityProposalViewSet, SecurityServiceTypeViewSet, 
    ClientLocationViewSet, SecurityAssessmentViewSet,
    ProposalVersionViewSet, ProposalServiceLineViewSet,
    SecurityProposalMeetingViewSet, MeetingParticipantViewSet,
    ProposalFollowUpViewSet, AssessmentRiskFindingViewSet,
    AssessmentStaffingRecommendationViewSet,
    AssessmentEquipmentRecommendationViewSet,
    AssessmentAttachmentViewSet, ContractEquipmentRequirementViewSet,
    ProposalAdditionalChargeViewSet, ProposalSignedDocumentViewSet
)

router = DefaultRouter()
router.register(r'securityproposal', SecurityProposalViewSet, basename='security-proposal')
router.register(r'proposals', SecurityProposalViewSet, basename='security-proposal-alias')
router.register(r'securityservicetype', SecurityServiceTypeViewSet, basename='security-service-type')
router.register(r'clientlocation', ClientLocationViewSet, basename='security-client-location')
router.register(r'securityassessment', SecurityAssessmentViewSet, basename='security-assessment')
router.register(r'assessments', SecurityAssessmentViewSet, basename='security-assessment-alias')
router.register(r'assessment-risks', AssessmentRiskFindingViewSet, basename='security-assessment-risk')
router.register(r'assessment-staffing', AssessmentStaffingRecommendationViewSet, basename='security-assessment-staffing')
router.register(r'assessment-equipment', AssessmentEquipmentRecommendationViewSet, basename='security-assessment-equipment')
router.register(r'assessment-attachments', AssessmentAttachmentViewSet, basename='security-assessment-attachment')
router.register(r'proposalversion', ProposalVersionViewSet, basename='security-proposal-version')
router.register(r'proposal-versions', ProposalVersionViewSet, basename='security-proposal-version-alias')
router.register(r'proposalserviceline', ProposalServiceLineViewSet, basename='security-proposal-serviceline')
router.register(r'service-lines', ProposalServiceLineViewSet, basename='security-proposal-serviceline-alias')
router.register(r'contractequipmentrequirement', ContractEquipmentRequirementViewSet, basename='security-contract-equipment')
router.register(r'equipment-requirements', ContractEquipmentRequirementViewSet, basename='security-contract-equipment-alias')
router.register(r'proposaladditionalcharge', ProposalAdditionalChargeViewSet, basename='security-proposal-charge')
router.register(r'additional-charges', ProposalAdditionalChargeViewSet, basename='security-proposal-charge-alias')
router.register(r'signed-documents', ProposalSignedDocumentViewSet, basename='security-proposal-signed-document')
router.register(r'meetings', SecurityProposalMeetingViewSet, basename='security-proposal-meeting')
router.register(r'participants', MeetingParticipantViewSet, basename='security-meeting-participant')
router.register(r'follow-ups', ProposalFollowUpViewSet, basename='security-proposal-followup')
router.register(r'followups', ProposalFollowUpViewSet, basename='security-proposal-followup-alias')

app_name = 'security_crm'

urlpatterns = [
    path('', include(router.urls)),
]

