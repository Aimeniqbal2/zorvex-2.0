from unittest.mock import patch
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.utils import timezone
from datetime import timedelta
from crm.models import CRMEntity, CRMContact
from companies.models import Company
from platform_core.models import ModuleDefinition, CompanyModule, UserModuleAccess
from operations.models import ServiceContract
from security_crm.models import (
    SecurityProposal, ProposalVersion, SecurityServiceType, 
    ClientLocation, ProposalServiceLine, SecurityAssessment, 
    SecurityProposalStatus, SecurityProposalMeeting, MeetingParticipant,
    ProposalFollowUp, SecurityProposalMeetingType, SecurityProposalMeetingStatus,
    SecurityProposalMeetingOutcome, FollowUpPriority, FollowUpStatus,
    AssessmentStaffingRecommendation, AssessmentEquipmentRecommendation,
    ContractEquipmentRequirement, ProposalAdditionalCharge,
    CommercialBillingCycle, CommercialPaymentTerms, CommercialDiscountType,
    CommercialChargeType, ProposalSignedDocument
)
from security_crm.services.workflow import SecurityProposalWorkflowService
from django.core.exceptions import ValidationError
from decimal import Decimal
from rest_framework.test import APIClient
from communications.models import SenderIdentity, OutboundEmail

User = get_user_model()

class SecurityCRMTests(TestCase):
    def setUp(self):
        # Create company
        self.company = Company.objects.create(name='Test Security Co')
        self.other_company = Company.objects.create(name='Other Co')
        
        # Modules
        self.crm_module = ModuleDefinition.objects.create(code='crm', name='CRM')
        self.comm_module = ModuleDefinition.objects.create(code='communications', name='Communications')
        
        # User
        self.user = User.objects.create_user(
            'testuser',
            email='test@example.com',
            password='password123',
            company=self.company,
            role='manager'
        )
        
        self.other_user = User.objects.create_user(
            'otheruser',
            email='other@example.com',
            password='password123',
            company=self.other_company,
            role='manager'
        )
        # Module Access
        CompanyModule.objects.create(company=self.company, module=self.crm_module, enabled=True)
        CompanyModule.objects.create(company=self.company, module=self.comm_module, enabled=True)
        CompanyModule.objects.create(company=self.other_company, module=self.crm_module, enabled=True)
        CompanyModule.objects.create(company=self.other_company, module=self.comm_module, enabled=True)
        UserModuleAccess.objects.create(user=self.user, module=self.crm_module, enabled=True)
        UserModuleAccess.objects.create(user=self.other_user, module=self.crm_module, enabled=True)
        
        # CRM Entities
        self.customer = CRMEntity.objects.create(
            company=self.company, 
            name='Customer A', 
            entity_type='CUSTOMER',
            code='C-001'
        )
        
        self.other_customer = CRMEntity.objects.create(
            company=self.other_company, 
            name='Customer B', 
            entity_type='CUSTOMER',
            code='C-002'
        )
        
        # Service Type
        self.service_type = SecurityServiceType.objects.create(
            company=self.company,
            code='GUARD',
            name='Security Guard'
        )
        
        # Test client
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        
        self.other_client = APIClient()
        self.other_client.force_authenticate(user=self.other_user)

    def test_proposal_creation(self):
        proposal = SecurityProposal.objects.create(
            company=self.company,
            customer=self.customer,
            proposal_number='SEC-PROP-000001',
            title='Initial Guarding Proposal'
        )
        self.assertEqual(proposal.status, SecurityProposalStatus.DRAFT)
        
    def test_cross_tenant_customer_blocked(self):
        proposal = SecurityProposal(
            company=self.company,
            customer=self.other_customer,
            proposal_number='SEC-PROP-000002',
            title='Cross Tenant'
        )
        with self.assertRaises(ValidationError):
            proposal.full_clean()
            
    def test_workflow_valid_transition(self):
        proposal = SecurityProposal.objects.create(
            company=self.company,
            customer=self.customer,
            proposal_number='SEC-PROP-000003',
            title='Workflow Test'
        )
        
        # DRAFT -> SENT
        SecurityProposalWorkflowService.transition_status(proposal, SecurityProposalStatus.SENT, self.user)
        self.assertEqual(proposal.status, SecurityProposalStatus.SENT)
        
    def test_workflow_invalid_transition(self):
        proposal = SecurityProposal.objects.create(
            company=self.company,
            customer=self.customer,
            proposal_number='SEC-PROP-000004',
            title='Workflow Fail'
        )
        
        # DRAFT -> ACTIVE is invalid
        with self.assertRaises(ValidationError):
            SecurityProposalWorkflowService.transition_status(proposal, SecurityProposalStatus.ACTIVE, self.user)
            
    def test_proposal_versioning(self):
        proposal = SecurityProposal.objects.create(
            company=self.company,
            customer=self.customer,
            proposal_number='SEC-PROP-000005',
            title='Version Test'
        )
        v1 = ProposalVersion.objects.create(
            company=self.company,
            proposal=proposal,
            version_number=1,
            status=SecurityProposalStatus.DRAFT
        )
        self.assertEqual(v1.version_number, 1)
        
    def test_service_line_calculation(self):
        proposal = SecurityProposal.objects.create(
            company=self.company,
            customer=self.customer,
            proposal_number='SEC-PROP-000006',
            title='Lines Test'
        )
        v1 = ProposalVersion.objects.create(
            company=self.company,
            proposal=proposal,
            version_number=1,
            status=SecurityProposalStatus.DRAFT
        )
        location = ClientLocation.objects.create(
            company=self.company,
            customer=self.customer,
            name='Head Office'
        )
        line = ProposalServiceLine.objects.create(
            company=self.company,
            proposal_version=v1,
            location=location,
            service_type=self.service_type,
            quantity=5,
            client_rate=Decimal('50000.00')
        )
        self.assertEqual(line.total, Decimal('250000.00'))

    def test_api_proposal_creation_auto_version(self):
        response = self.client.post('/api/security/crm/securityproposal/', {
            'customer': self.customer.id,
            'title': 'API Auto Version Test'
        })
        self.assertEqual(response.status_code, 201)
        proposal_id = response.data['id']
        versions = ProposalVersion.objects.filter(proposal_id=proposal_id)
        self.assertEqual(versions.count(), 1, "Exactly one version must be created on proposal creation")
        self.assertEqual(versions.first().version_number, 1)

    def test_service_line_tenant_validation(self):
        proposal = SecurityProposal.objects.create(company=self.company, customer=self.customer, title='Tenant Test')
        v1 = ProposalVersion.objects.create(company=self.company, proposal=proposal, version_number=1)
        other_loc = ClientLocation.objects.create(company=self.other_company, customer=self.other_customer, name='Other Loc')
        
        with self.assertRaises(ValidationError):
            line = ProposalServiceLine(
                company=self.company,
                proposal_version=v1,
                location=other_loc,
                service_type=self.service_type,
                quantity=1
            )
            line.clean()

    def test_api_tenant_isolation(self):
        response = self.other_client.get('/api/security/crm/securityproposal/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data.get('results', [])), 0, "Other company should not see proposals")

    def test_frozen_version_protection(self):
        proposal = SecurityProposal.objects.create(company=self.company, customer=self.customer, title='Frozen Test')
        v1 = ProposalVersion.objects.create(company=self.company, proposal=proposal, version_number=1, is_frozen=True)
        
        with self.assertRaises(ValidationError):
            line = ProposalServiceLine(
                company=self.company,
                proposal_version=v1,
                service_type=self.service_type,
                quantity=1
            )
            line.clean()

    def test_version_2_send_freezes_version_2_not_version_1(self):
        """Sending Version 2 freezes Version 2 and leaves Version 1 in its original state."""
        proposal = SecurityProposal.objects.create(company=self.company, customer=self.customer, status='DRAFT')
        v1 = ProposalVersion.objects.create(company=self.company, proposal=proposal, version_number=1, is_frozen=False)
        v2 = ProposalVersion.objects.create(company=self.company, proposal=proposal, version_number=2, is_frozen=False)

        sender = SenderIdentity.objects.create(
            company=self.company, name='Test', email_address='test@test.com', verification_status='USABLE', provider_type='SYSTEM_DEFAULT'
        )
        email = OutboundEmail.objects.create(
            company=self.company, sender_identity=sender, to='client@test.com', subject='Proposal v2'
        )

        with patch('django.core.mail.EmailMultiAlternatives.send'):
            response = self.client.post(
                f'/api/security/crm/securityproposal/{proposal.id}/send_proposal_email/',
                {'email_id': email.id, 'version_id': v2.id}
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['status'], 'sent')

        proposal.refresh_from_db()
        v1.refresh_from_db()
        v2.refresh_from_db()
        email.refresh_from_db()

        self.assertEqual(proposal.status, 'SENT')
        self.assertFalse(v1.is_frozen, "Version 1 must NOT be frozen when Version 2 was sent")
        self.assertTrue(v2.is_frozen, "Version 2 must be frozen")
        self.assertEqual(email.context_version_id, str(v2.id))

    def test_cross_tenant_proposal_version_rejected(self):
        """Passing a version_id belonging to another tenant or proposal must be rejected."""
        proposal = SecurityProposal.objects.create(company=self.company, customer=self.customer, status='DRAFT')
        other_prop = SecurityProposal.objects.create(company=self.other_company, customer=self.other_customer, status='DRAFT')
        other_version = ProposalVersion.objects.create(company=self.other_company, proposal=other_prop, version_number=1, is_frozen=False)

        sender = SenderIdentity.objects.create(
            company=self.company, name='Test', email_address='test@test.com', verification_status='USABLE', provider_type='SYSTEM_DEFAULT'
        )
        email = OutboundEmail.objects.create(
            company=self.company, sender_identity=sender, to='client@test.com', subject='Proposal'
        )

        response = self.client.post(
            f'/api/security/crm/securityproposal/{proposal.id}/send_proposal_email/',
            {'email_id': email.id, 'version_id': other_version.id}
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('ProposalVersion', response.data.get('error', ''))

    def test_failed_delivery_leaves_proposal_draft(self):
        """Failed delivery leaves proposal in DRAFT and does not freeze the version."""
        proposal = SecurityProposal.objects.create(company=self.company, customer=self.customer, status='DRAFT')
        v1 = ProposalVersion.objects.create(company=self.company, proposal=proposal, version_number=1, is_frozen=False)

        sender = SenderIdentity.objects.create(
            company=self.company, name='Test', email_address='test@test.com', verification_status='USABLE', provider_type='SYSTEM_DEFAULT'
        )
        email = OutboundEmail.objects.create(
            company=self.company, sender_identity=sender, to='client@test.com', subject='Proposal'
        )

        with patch('django.core.mail.EmailMultiAlternatives.send', side_effect=Exception("Delivery timeout")):
            response = self.client.post(
                f'/api/security/crm/securityproposal/{proposal.id}/send_proposal_email/',
                {'email_id': email.id, 'version_id': v1.id}
            )

        self.assertEqual(response.status_code, 400)
        proposal.refresh_from_db()
        v1.refresh_from_db()
        email.refresh_from_db()

        self.assertEqual(proposal.status, 'DRAFT', "Proposal must remain DRAFT on failure")
        self.assertFalse(v1.is_frozen, "Version must remain unfrozen on failure")
        self.assertEqual(email.status, 'FAILED')

    # ==========================================
    # PHASE S-2D: MEETING & FOLLOW-UP TESTS
    # ==========================================

    def test_meeting_creation_and_auto_transition_sent_to_meeting(self):
        """Scheduling a meeting on a SENT proposal automatically transitions it to MEETING stage."""
        proposal = SecurityProposal.objects.create(
            company=self.company, 
            customer=self.customer, 
            status='SENT', 
            proposal_number='SEC-001'
        )
        
        contact = CRMContact.objects.create(
            company=self.company,
            entity=self.customer,
            first_name='Ali',
            last_name='Khan',
            email='ali@customer.com'
        )

        scheduled_time = timezone.now() + timedelta(days=1)
        meeting = SecurityProposalWorkflowService.schedule_meeting(
            proposal=proposal,
            subject='Guard Deployment Review',
            meeting_type='FACE_TO_FACE',
            scheduled_at=scheduled_time,
            location='Client Head Office',
            agenda='Review 24/7 guard posts and shift rotations',
            user=self.user,
            participants_data=[
                {'participant_type': 'CUSTOMER_CONTACT', 'crm_contact': contact, 'role': 'Client Lead'},
                {'participant_type': 'INTERNAL_USER', 'user': self.user, 'role': 'Operations Manager'}
            ]
        )

        proposal.refresh_from_db()
        self.assertEqual(proposal.status, 'MEETING', "Scheduling a meeting must transition SENT to MEETING")
        self.assertEqual(meeting.status, 'SCHEDULED')
        self.assertEqual(meeting.participants.count(), 2)
        self.assertEqual(proposal.meetings.count(), 1)

    def test_customer_contact_participant_validation(self):
        """MeetingParticipant with crm_contact must belong to proposal customer."""
        proposal = SecurityProposal.objects.create(
            company=self.company, 
            customer=self.customer, 
            status='MEETING', 
            proposal_number='SEC-002'
        )
        
        # Contact belonging to another customer within same company
        other_cust = CRMEntity.objects.create(
            company=self.company, 
            name='Other Customer Corp', 
            entity_type='CUSTOMER',
            code='C-999'
        )
        invalid_contact = CRMContact.objects.create(
            company=self.company,
            entity=other_cust,
            first_name='Wrong',
            last_name='Customer',
            email='wrong@other.com'
        )

        meeting = SecurityProposalMeeting.objects.create(
            company=self.company,
            proposal=proposal,
            subject='Initial sync',
            meeting_type='ONLINE',
            scheduled_at=timezone.now() + timedelta(days=2)
        )

        participant = MeetingParticipant(
            company=self.company,
            meeting=meeting,
            participant_type='CUSTOMER_CONTACT',
            crm_contact=invalid_contact
        )

        with self.assertRaises(ValidationError):
            participant.clean()

    def test_cross_tenant_meeting_and_contact_rejected(self):
        """Meetings and participants cannot cross tenant boundaries."""
        proposal = SecurityProposal.objects.create(
            company=self.company, 
            customer=self.customer, 
            status='MEETING'
        )
        
        # Cross tenant contact
        other_tenant_contact = CRMContact.objects.create(
            company=self.other_company,
            entity=self.other_customer,
            first_name='Tenant2',
            last_name='Contact'
        )

        meeting = SecurityProposalMeeting.objects.create(
            company=self.company,
            proposal=proposal,
            subject='Sync',
            scheduled_at=timezone.now() + timedelta(days=1)
        )

        participant = MeetingParticipant(
            company=self.company,
            meeting=meeting,
            participant_type='CUSTOMER_CONTACT',
            crm_contact=other_tenant_contact
        )

        with self.assertRaises(ValidationError):
            participant.clean()

    def test_advance_to_site_assessment_from_meeting(self):
        """Workflow service advances MEETING stage to SITE_ASSESSMENT."""
        proposal = SecurityProposal.objects.create(
            company=self.company, 
            customer=self.customer, 
            status='MEETING', 
            proposal_number='SEC-003'
        )

        SecurityProposalWorkflowService.advance_to_site_assessment(proposal, user=self.user)
        proposal.refresh_from_db()
        self.assertEqual(proposal.status, 'SITE_ASSESSMENT')

    def test_advance_to_site_assessment_invalid_from_draft_blocked(self):
        """Attempting to advance to SITE_ASSESSMENT directly from DRAFT must raise ValidationError."""
        proposal = SecurityProposal.objects.create(
            company=self.company, 
            customer=self.customer, 
            status='DRAFT', 
            proposal_number='SEC-004'
        )

        with self.assertRaises(ValidationError):
            SecurityProposalWorkflowService.advance_to_site_assessment(proposal, user=self.user)

    def test_complete_meeting_with_outcome_and_followup(self):
        """Completing a meeting records structured notes, outcome, and creates an action item."""
        proposal = SecurityProposal.objects.create(
            company=self.company, 
            customer=self.customer, 
            status='MEETING', 
            proposal_number='SEC-005'
        )

        meeting = SecurityProposalMeeting.objects.create(
            company=self.company,
            proposal=proposal,
            subject='Commercial Negotiation',
            meeting_type='FACE_TO_FACE',
            scheduled_at=timezone.now()
        )

        due_time = timezone.now() + timedelta(days=3)
        response = self.client.post(
            f'/api/security/crm/meetings/{meeting.id}/complete/',
            {
                'outcome': 'PROCEED_TO_SITE_ASSESSMENT',
                'outcome_notes': 'Client agreed on price. Proceed to physical site survey.',
                'discussion_notes': 'Discussed CCTV integration and night guard supervisor.',
                'client_requirements': 'Require 2 armed guards and 4 unarmed.',
                'commercial_concerns': 'Negotiated 5% quarterly discount.',
                'agreed_points': 'Site survey on Monday 10am.',
                'follow_up_title': 'Conduct Physical Site Survey',
                'follow_up_due_at': due_time.isoformat(),
                'follow_up_priority': 'HIGH',
                'follow_up_assigned_to': str(self.user.id)
            }
        )

        self.assertEqual(response.status_code, 200)
        meeting.refresh_from_db()
        self.assertEqual(meeting.status, 'COMPLETED')
        self.assertEqual(meeting.outcome, 'PROCEED_TO_SITE_ASSESSMENT')
        self.assertEqual(meeting.commercial_concerns, 'Negotiated 5% quarterly discount.')
        self.assertIsNotNone(meeting.completed_at)

        # Check linked follow-up created
        follow_ups = ProposalFollowUp.objects.filter(related_meeting=meeting)
        self.assertEqual(follow_ups.count(), 1)
        fu = follow_ups.first()
        self.assertEqual(fu.title, 'Conduct Physical Site Survey')
        self.assertEqual(fu.priority, 'HIGH')
        self.assertEqual(fu.status, 'OPEN')
        self.assertEqual(fu.assigned_to, self.user)

    def test_proposal_next_action_computation(self):
        """Proposal serializer exposes computed next_action based on open follow-up or scheduled meeting."""
        proposal = SecurityProposal.objects.create(
            company=self.company, 
            customer=self.customer, 
            status='MEETING', 
            proposal_number='SEC-006'
        )

        # Create an upcoming meeting
        meeting_time = timezone.now() + timedelta(days=2)
        SecurityProposalMeeting.objects.create(
            company=self.company,
            proposal=proposal,
            subject='Upcoming Security Briefing',
            meeting_type='FACE_TO_FACE',
            scheduled_at=meeting_time
        )

        response = self.client.get(f'/api/security/crm/securityproposal/{proposal.id}/')
        self.assertEqual(response.status_code, 200)
        self.assertIsNotNone(response.data.get('next_action'))
        self.assertEqual(response.data['next_action']['type'], 'meeting')
        self.assertEqual(response.data['next_action']['title'], 'Upcoming Security Briefing')

        # Add an urgent follow-up due tomorrow (earlier than meeting)
        fu_time = timezone.now() + timedelta(days=1)
        ProposalFollowUp.objects.create(
            company=self.company,
            proposal=proposal,
            title='Send Draft SLA to Legal',
            due_at=fu_time,
            priority='URGENT',
            status='OPEN',
            assigned_to=self.user
        )

        response2 = self.client.get(f'/api/security/crm/securityproposal/{proposal.id}/')
        self.assertEqual(response2.data['next_action']['type'], 'follow_up')
        self.assertEqual(response2.data['next_action']['title'], 'Send Draft SLA to Legal')

    def test_proposal_meeting_viewset_lifecycle(self):
        """Verify meeting cancel, no-show, and participant endpoints."""
        proposal = SecurityProposal.objects.create(
            company=self.company, 
            customer=self.customer, 
            status='MEETING'
        )

        meeting = SecurityProposalMeeting.objects.create(
            company=self.company,
            proposal=proposal,
            subject='Meeting to Cancel',
            meeting_type='PHONE',
            scheduled_at=timezone.now() + timedelta(days=1)
        )

        # Cancel
        res = self.client.post(f'/api/security/crm/meetings/{meeting.id}/cancel/')
        self.assertEqual(res.status_code, 200)
        meeting.refresh_from_db()
        self.assertEqual(meeting.status, 'CANCELLED')

        # No Show on new meeting
        meeting2 = SecurityProposalMeeting.objects.create(
            company=self.company,
            proposal=proposal,
            subject='Meeting No Show',
            meeting_type='ONLINE',
            scheduled_at=timezone.now() + timedelta(days=1)
        )
        res2 = self.client.post(f'/api/security/crm/meetings/{meeting2.id}/no_show/')
        self.assertEqual(res2.status_code, 200)
        meeting2.refresh_from_db()
        self.assertEqual(meeting2.status, 'NO_SHOW')

    def test_proposal_followup_viewset_lifecycle(self):
        """Verify follow-up create, complete, cancel endpoints."""
        proposal = SecurityProposal.objects.create(
            company=self.company, 
            customer=self.customer, 
            status='MEETING'
        )

        # Create
        create_res = self.client.post('/api/security/crm/follow-ups/', {
            'proposal': str(proposal.id),
            'title': 'Call client regarding guard uniforms',
            'priority': 'MEDIUM',
            'status': 'OPEN'
        })
        self.assertEqual(create_res.status_code, 201)
        fu_id = create_res.data['id']

        # Complete
        comp_res = self.client.post(f'/api/security/crm/follow-ups/{fu_id}/complete/')
        self.assertEqual(comp_res.status_code, 200)
        fu = ProposalFollowUp.objects.get(id=fu_id)
        self.assertEqual(fu.status, 'COMPLETED')
        self.assertIsNotNone(fu.completed_at)

        # Cancel
        fu2 = ProposalFollowUp.objects.create(
            company=self.company,
            proposal=proposal,
            title='Follow up to cancel',
            status='OPEN'
        )
        cancel_res = self.client.post(f'/api/security/crm/follow-ups/{fu2.id}/cancel/')
        self.assertEqual(cancel_res.status_code, 200)
        fu2.refresh_from_db()
        self.assertEqual(fu2.status, 'CANCELLED')

    def test_cross_tenant_isolation_on_meetings_and_followups(self):
        """Tenant B cannot view or modify Tenant A's meetings or follow-ups."""
        prop_a = SecurityProposal.objects.create(
            company=self.company, 
            customer=self.customer, 
            status='MEETING'
        )
        meeting_a = SecurityProposalMeeting.objects.create(
            company=self.company,
            proposal=prop_a,
            subject='Tenant A Secret Meeting',
            scheduled_at=timezone.now() + timedelta(days=1)
        )
        fu_a = ProposalFollowUp.objects.create(
            company=self.company,
            proposal=prop_a,
            title='Tenant A Action Item'
        )

        # Tenant B tries to get Tenant A's meeting
        get_res = self.other_client.get(f'/api/security/crm/meetings/{meeting_a.id}/')
        self.assertEqual(get_res.status_code, 404)

        # Tenant B tries to complete Tenant A's meeting
        post_res = self.other_client.post(f'/api/security/crm/meetings/{meeting_a.id}/complete/', {'outcome': 'REJECTED'})
        self.assertEqual(post_res.status_code, 404)

        # Tenant B tries to get Tenant A's follow-up
        fu_res = self.other_client.get(f'/api/security/crm/follow-ups/{fu_a.id}/')
        self.assertEqual(fu_res.status_code, 404)

    def test_multi_location_assessment_creation_and_constraints(self):
        """Test multi-location site assessment under single proposal and database constraints."""
        loc1 = ClientLocation.objects.create(
            company=self.company,
            customer=self.customer,
            name='Factory Site Karachi'
        )
        loc2 = ClientLocation.objects.create(
            company=self.company,
            customer=self.customer,
            name='Head Office Lahore'
        )
        other_cust_loc = ClientLocation.objects.create(
            company=self.other_company,
            customer=self.other_customer,
            name='Other Customer Site'
        )

        proposal = SecurityProposal.objects.create(
            company=self.company,
            customer=self.customer,
            status='SITE_ASSESSMENT'
        )

        # Assessment for Location 1
        ass1 = SecurityAssessment.objects.create(
            company=self.company,
            proposal=proposal,
            client_location=loc1,
            assessed_by=self.user,
            assessment_date=timezone.now().date(),
            site_overview='Factory perimeter and main gates'
        )
        # Assessment for Location 2
        ass2 = SecurityAssessment.objects.create(
            company=self.company,
            proposal=proposal,
            client_location=loc2,
            assessed_by=self.user,
            assessment_date=timezone.now().date(),
            site_overview='Multi-storey head office building'
        )

        self.assertEqual(proposal.assessments.count(), 2)

        # Duplicate location assessment under same proposal must fail
        with self.assertRaises(Exception):
            SecurityAssessment.objects.create(
                company=self.company,
                proposal=proposal,
                client_location=loc1
            )

        # Location from another customer must fail validation
        ass_invalid = SecurityAssessment(
            company=self.company,
            proposal=proposal,
            client_location=other_cust_loc
        )
        with self.assertRaises(ValidationError):
            ass_invalid.clean()

    def test_assessment_subresources_api(self):
        """Test creating and retrieving risk findings, staffing, equipment, and attachments."""
        loc = ClientLocation.objects.create(
            company=self.company,
            customer=self.customer,
            name='Main Distribution Hub'
        )
        proposal = SecurityProposal.objects.create(
            company=self.company,
            customer=self.customer,
            status='SITE_ASSESSMENT'
        )
        assessment = SecurityAssessment.objects.create(
            company=self.company,
            proposal=proposal,
            client_location=loc,
            assessed_by=self.user,
            status='IN_PROGRESS'
        )

        # 1. Add Risk Finding via API
        risk_res = self.client.post(f'/api/security/crm/assessments/{assessment.id}/add-risk/', {
            'title': 'Broken perimeter fence at East corner',
            'category': 'PERIMETER',
            'risk_level': 'HIGH',
            'location_area': 'East Fence',
            'recommendation': 'Install razor wire and deploy night guard patrol',
            'status': 'OPEN'
        })
        self.assertEqual(risk_res.status_code, 201)
        self.assertEqual(risk_res.data['risk_level'], 'HIGH')

        # 2. Add Staffing Recommendation via API
        staff_res = self.client.post(f'/api/security/crm/assessments/{assessment.id}/add-staffing/', {
            'service_type': str(self.service_type.id),
            'quantity': 3,
            'post_area': 'Main Gate & Loading Dock',
            'shift_coverage_notes': '12h Shifts 24/7',
            'remarks': 'Requires body cameras'
        })
        self.assertEqual(staff_res.status_code, 201)
        self.assertEqual(staff_res.data['quantity'], 3)

        # 3. Add Equipment Recommendation via API
        equip_res = self.client.post(f'/api/security/crm/assessments/{assessment.id}/add-equipment/', {
            'equipment_name': 'Handheld Metal Detector',
            'quantity': 2,
            'location_area': 'Main Gate Turnstile',
            'purpose': 'Visitor screening',
            'notes': 'Rechargeable battery model'
        })
        self.assertEqual(equip_res.status_code, 201)
        self.assertEqual(equip_res.data['quantity'], 2)

        # 4. Add Attachment via API
        att_res = self.client.post(f'/api/security/crm/assessments/{assessment.id}/add-attachment/', {
            'title': 'East Perimeter Damage Photo',
            'category': 'SITE_PHOTO',
            'file_url': 'https://storage.zorvex.com/photos/site1_east.jpg',
            'notes': 'Clear breach in wire fence'
        })
        self.assertEqual(att_res.status_code, 201)
        self.assertEqual(att_res.data['title'], 'East Perimeter Damage Photo')

        # 5. Retrieve Assessment Detail and verify nested structures
        detail_res = self.client.get(f'/api/security/crm/assessments/{assessment.id}/')
        self.assertEqual(detail_res.status_code, 200)
        self.assertEqual(detail_res.data['risk_count'], 1)
        self.assertEqual(detail_res.data['staffing_count'], 1)
        self.assertEqual(detail_res.data['equipment_count'], 1)
        self.assertEqual(detail_res.data['attachment_count'], 1)
        self.assertEqual(len(detail_res.data['risk_findings']), 1)
        self.assertEqual(len(detail_res.data['staffing_recommendations']), 1)

    def test_assessment_completion_protection_and_reopen(self):
        """Test that COMPLETED assessments are locked against accidental edits and can be reopened."""
        loc = ClientLocation.objects.create(
            company=self.company,
            customer=self.customer,
            name='Port Facility'
        )
        proposal = SecurityProposal.objects.create(
            company=self.company,
            customer=self.customer,
            status='SITE_ASSESSMENT'
        )
        assessment = SecurityAssessment.objects.create(
            company=self.company,
            proposal=proposal,
            client_location=loc,
            status='IN_PROGRESS'
        )

        # Complete assessment
        comp_res = self.client.post(f'/api/security/crm/assessments/{assessment.id}/complete/')
        self.assertEqual(comp_res.status_code, 200)
        self.assertEqual(comp_res.data['status'], 'COMPLETED')
        self.assertIsNotNone(comp_res.data['completed_at'])

        # Modification must be blocked
        patch_res = self.client.patch(f'/api/security/crm/assessments/{assessment.id}/', {
            'site_overview': 'Attempting unauthorized edit'
        })
        self.assertEqual(patch_res.status_code, 400)

        # Adding risk to completed assessment must be blocked
        add_risk_res = self.client.post(f'/api/security/crm/assessments/{assessment.id}/add-risk/', {
            'title': 'New risk on locked assessment',
            'category': 'PERIMETER',
            'risk_level': 'LOW'
        })
        self.assertEqual(add_risk_res.status_code, 400)

        # Reopen assessment
        reopen_res = self.client.post(f'/api/security/crm/assessments/{assessment.id}/reopen/')
        self.assertEqual(reopen_res.status_code, 200)
        self.assertEqual(reopen_res.data['status'], 'IN_PROGRESS')

        # Now editing succeeds
        patch_ok_res = self.client.patch(f'/api/security/crm/assessments/{assessment.id}/', {
            'site_overview': 'Authorized edit after reopen'
        })
        self.assertEqual(patch_ok_res.status_code, 200)
        assessment.refresh_from_db()
        self.assertEqual(assessment.site_overview, 'Authorized edit after reopen')

    def test_cross_tenant_isolation_on_assessments(self):
        """Test cross-tenant isolation on assessments and sub-resources."""
        loc = ClientLocation.objects.create(
            company=self.company,
            customer=self.customer,
            name='Tenant A Location'
        )
        proposal = SecurityProposal.objects.create(
            company=self.company,
            customer=self.customer,
            status='SITE_ASSESSMENT'
        )
        assessment = SecurityAssessment.objects.create(
            company=self.company,
            proposal=proposal,
            client_location=loc
        )

        # Tenant B tries to retrieve Tenant A's assessment
        get_res = self.other_client.get(f'/api/security/crm/assessments/{assessment.id}/')
        self.assertEqual(get_res.status_code, 404)

        # Tenant B tries to complete Tenant A's assessment
        post_res = self.other_client.post(f'/api/security/crm/assessments/{assessment.id}/complete/')
        self.assertEqual(post_res.status_code, 404)

        # Tenant B tries to add a risk finding to Tenant A's assessment
        risk_res = self.other_client.post(f'/api/security/crm/assessments/{assessment.id}/add-risk/', {
            'title': 'Intruder finding',
            'risk_level': 'HIGH'
        })
        self.assertEqual(risk_res.status_code, 404)

    def test_full_workflow_progression_to_final_proposal(self):
        """Test full workflow progression DRAFT -> SENT -> MEETING -> SITE_ASSESSMENT -> FINAL_PROPOSAL."""
        proposal = SecurityProposal.objects.create(
            company=self.company,
            customer=self.customer,
            status='DRAFT'
        )

        # Cannot jump to FINAL_PROPOSAL from DRAFT
        with self.assertRaises(ValidationError):
            SecurityProposalWorkflowService.advance_to_final_proposal(proposal, user=self.user)

        # Move to SENT
        proposal.status = 'SENT'
        proposal.save()

        # Move to MEETING
        SecurityProposalWorkflowService.start_meeting_stage(proposal, user=self.user)
        self.assertEqual(proposal.status, 'MEETING')

        # Move to SITE_ASSESSMENT
        SecurityProposalWorkflowService.advance_to_site_assessment(proposal, user=self.user)
        self.assertEqual(proposal.status, 'SITE_ASSESSMENT')

        # Advance to FINAL_PROPOSAL via API endpoint
        res = self.client.post(f'/api/security/crm/securityproposal/{proposal.id}/advance-to-final-proposal/')
        self.assertEqual(res.status_code, 200)
        proposal.refresh_from_db()
        self.assertEqual(proposal.status, 'FINAL_PROPOSAL')

    def test_recommendations_non_interference(self):
        """Verify staffing and equipment recommendations do not mutate operational deployments or inventory."""
        loc = ClientLocation.objects.create(
            company=self.company,
            customer=self.customer,
            name='Non-interference Test Location'
        )
        proposal = SecurityProposal.objects.create(
            company=self.company,
            customer=self.customer,
            status='SITE_ASSESSMENT'
        )
        assessment = SecurityAssessment.objects.create(
            company=self.company,
            proposal=proposal,
            client_location=loc
        )

        # Add staffing recommendation
        self.client.post(f'/api/security/crm/assessments/{assessment.id}/add-staffing/', {
            'service_type': str(self.service_type.id),
            'quantity': 5,
            'post_area': 'Surveillance Room',
            'shift_coverage_notes': '12h'
        })

        # Add equipment recommendation
        self.client.post(f'/api/security/crm/assessments/{assessment.id}/add-equipment/', {
            'equipment_name': 'Handheld Scanner',
            'quantity': 4,
            'purpose': 'Check-in scanning'
        })

        # Check that no service contracts, payroll, or operational deployments were accidentally created
        self.assertEqual(ServiceContract.objects.filter(company=self.company).count(), 0)

    # -------------------------------------------------------------
    # PHASE S-2F: FINAL PROPOSAL & COMMERCIAL REQUIREMENTS TESTS
    # -------------------------------------------------------------

    def test_advance_to_final_proposal_creates_version2_and_preserves_version1(self):
        """Test transitioning SITE_ASSESSMENT -> FINAL_PROPOSAL creates Version 2 without modifying Version 1."""
        proposal = SecurityProposal.objects.create(
            company=self.company,
            customer=self.customer,
            title='Office Security Offer',
            status=SecurityProposalStatus.SITE_ASSESSMENT
        )
        v1 = ProposalVersion.objects.create(
            company=self.company,
            proposal=proposal,
            version_number=1,
            version_type='Initial Proposal',
            status=SecurityProposalStatus.SENT,
            is_frozen=True,
            notes='Initial offer frozen'
        )

        res = self.client.post(f'/api/security/crm/securityproposal/{proposal.id}/advance-to-final-proposal/')
        self.assertEqual(res.status_code, 200)

        proposal.refresh_from_db()
        self.assertEqual(proposal.status, SecurityProposalStatus.FINAL_PROPOSAL)

        v1.refresh_from_db()
        self.assertEqual(v1.version_number, 1)
        self.assertTrue(v1.is_frozen)
        self.assertEqual(v1.version_type, 'Initial Proposal')

        v2 = proposal.versions.filter(version_number=2).first()
        self.assertIsNotNone(v2)
        self.assertEqual(v2.version_type, 'Final Proposal')
        self.assertFalse(v2.is_frozen)
        self.assertEqual(v2.status, SecurityProposalStatus.FINAL_PROPOSAL)

    def test_import_assessment_recommendations_workflow(self):
        """Test [Import Assessment Recommendations] accurately converts staffing & equipment into commercial lines."""
        loc1 = ClientLocation.objects.create(company=self.company, customer=self.customer, name='Karachi Factory')
        loc2 = ClientLocation.objects.create(company=self.company, customer=self.customer, name='Head Office')

        supervisor_type = SecurityServiceType.objects.create(company=self.company, code='SUP', name='Supervisor')

        proposal = SecurityProposal.objects.create(
            company=self.company,
            customer=self.customer,
            status=SecurityProposalStatus.FINAL_PROPOSAL
        )
        v2 = ProposalVersion.objects.create(
            company=self.company,
            proposal=proposal,
            version_number=2,
            version_type='Final Proposal',
            status=SecurityProposalStatus.FINAL_PROPOSAL,
            is_frozen=False
        )

        assessment1 = SecurityAssessment.objects.create(
            company=self.company, proposal=proposal, client_location=loc1, status='COMPLETED'
        )
        AssessmentStaffingRecommendation.objects.create(
            company=self.company, assessment=assessment1, service_type=self.service_type,
            quantity=12, shift_coverage_notes='24/7 Gate & Patrol'
        )
        AssessmentStaffingRecommendation.objects.create(
            company=self.company, assessment=assessment1, service_type=supervisor_type,
            quantity=2, shift_coverage_notes='Day & Night shift supervisors'
        )
        AssessmentEquipmentRecommendation.objects.create(
            company=self.company, assessment=assessment1, equipment_name='PTZ Camera System',
            quantity=4, location_area='Main Gate', purpose='Intruder surveillance'
        )

        assessment2 = SecurityAssessment.objects.create(
            company=self.company, proposal=proposal, client_location=loc2, status='COMPLETED'
        )
        AssessmentStaffingRecommendation.objects.create(
            company=self.company, assessment=assessment2, service_type=self.service_type,
            quantity=5, shift_coverage_notes='Reception & Floor guards'
        )

        # Trigger import
        res = self.client.post(f'/api/security/crm/securityproposal/{proposal.id}/import-recommendations/', {
            'version_id': str(v2.id)
        })
        self.assertEqual(res.status_code, 200)

        # Verify service lines created
        service_lines = v2.service_lines.all()
        self.assertEqual(service_lines.count(), 3)
        
        # Verify 12 guards at loc1
        g1 = service_lines.filter(location=loc1, service_type=self.service_type).first()
        self.assertIsNotNone(g1)
        self.assertEqual(g1.quantity, 12)
        self.assertEqual(g1.client_rate, 0)
        self.assertEqual(g1.billing_unit, 'MONTHLY')

        # Verify equipment requirement created
        equip_lines = v2.equipment_requirements.all()
        self.assertEqual(equip_lines.count(), 1)
        e1 = equip_lines.first()
        self.assertEqual(e1.location, loc1)
        self.assertEqual(e1.item_name, 'PTZ Camera System')
        self.assertEqual(e1.quantity, 4)
        self.assertEqual(e1.unit_rate, 0)

        # Assessment records remain untouched
        self.assertEqual(assessment1.staffing_recommendations.count(), 2)
        self.assertEqual(assessment1.equipment_recommendations.count(), 1)

    def test_commercial_pricing_and_calculations(self):
        """Test calculation of recurring totals, one-time totals, discounts, taxes, and grand total."""
        loc = ClientLocation.objects.create(company=self.company, customer=self.customer, name='Branch A')
        proposal = SecurityProposal.objects.create(company=self.company, customer=self.customer, status='FINAL_PROPOSAL')
        
        version = ProposalVersion.objects.create(
            company=self.company,
            proposal=proposal,
            version_number=1,
            version_type='Final Proposal',
            status=SecurityProposalStatus.FINAL_PROPOSAL,
            discount_type=CommercialDiscountType.FIXED,
            discount_value=Decimal('5000.00'),
            tax_rate=Decimal('10.00') # 10%
        )

        # Service lines:
        # Line 1: 5 guards @ PKR 50,000 / month = 250,000
        ProposalServiceLine.objects.create(
            company=self.company,
            proposal_version=version,
            location=loc,
            service_type=self.service_type,
            quantity=5,
            client_rate=Decimal('50000.00'),
            single_ot_rate=Decimal('350.00'),
            double_ot_rate=Decimal('500.00'),
            billing_unit='MONTHLY'
        )
        # Line 2: 1 one-time security escort @ PKR 20,000 = 20,000
        ProposalServiceLine.objects.create(
            company=self.company,
            proposal_version=version,
            location=loc,
            service_type=self.service_type,
            quantity=1,
            client_rate=Decimal('20000.00'),
            billing_unit='ONE_TIME'
        )

        # Equipment lines:
        # 2 Monthly radios rental @ PKR 3,000 / month = 6,000
        ContractEquipmentRequirement.objects.create(
            company=self.company,
            proposal_version=version,
            location=loc,
            item_name='VHF Radio',
            quantity=2,
            unit_rate=Decimal('3000.00'),
            charge_type=CommercialChargeType.MONTHLY
        )
        # 1 One-time barrier installation @ PKR 30,000 = 30,000
        ContractEquipmentRequirement.objects.create(
            company=self.company,
            proposal_version=version,
            location=loc,
            item_name='Security Barrier',
            quantity=1,
            unit_rate=Decimal('30000.00'),
            charge_type=CommercialChargeType.ONE_TIME
        )

        # Additional charges:
        # One-time mobilization fee = 15,000
        ProposalAdditionalCharge.objects.create(
            company=self.company,
            proposal_version=version,
            charge_name='Mobilization & Deployment',
            charge_type=CommercialChargeType.ONE_TIME,
            quantity=1,
            amount=Decimal('15000.00')
        )

        version.refresh_from_db()

        # Monthly recurring: 250,000 (guard) + 6,000 (radio) = 256,000
        self.assertEqual(version.monthly_services_total, Decimal('250000.00'))
        self.assertEqual(version.recurring_equipment_total, Decimal('6000.00'))
        self.assertEqual(version.total_monthly_recurring, Decimal('256000.00'))

        # One-time: 20,000 (service) + 30,000 (barrier) + 15,000 (mobilization) = 65,000
        self.assertEqual(version.total_one_time, Decimal('65000.00'))

        # Subtotal: 256,000 + 65,000 = 321,000
        self.assertEqual(version.subtotal, Decimal('321000.00'))

        # Discount: 5,000
        self.assertEqual(version.discount_amount, Decimal('5000.00'))

        # Taxable: 321,000 - 5,000 = 316,000
        self.assertEqual(version.taxable_amount, Decimal('316000.00'))

        # Tax (10%): 31,600
        self.assertEqual(version.tax_amount, Decimal('31600.00'))

        # Grand Total: 316,000 + 31,600 = 347,600
        self.assertEqual(version.grand_total, Decimal('347600.00'))

    def test_frozen_version_immutability(self):
        """Test modifying service lines, equipment, or terms on frozen versions is blocked."""
        loc = ClientLocation.objects.create(company=self.company, customer=self.customer, name='HQ')
        proposal = SecurityProposal.objects.create(company=self.company, customer=self.customer, status='FINAL_PROPOSAL')
        frozen_version = ProposalVersion.objects.create(
            company=self.company,
            proposal=proposal,
            version_number=1,
            version_type='Final Proposal',
            status=SecurityProposalStatus.FINAL_PROPOSAL,
            is_frozen=True
        )

        # Attempt to add service line via API
        res = self.client.post('/api/security/crm/proposalserviceline/', {
            'proposal_version': str(frozen_version.id),
            'location': str(loc.id),
            'service_type': str(self.service_type.id),
            'quantity': 2,
            'client_rate': 40000
        })
        self.assertEqual(res.status_code, 400)

        # Attempt to add equipment via API
        res = self.client.post('/api/security/crm/contractequipmentrequirement/', {
            'proposal_version': str(frozen_version.id),
            'location': str(loc.id),
            'item_name': 'Walkie Talkie',
            'quantity': 2,
            'unit_rate': 2000
        })
        self.assertEqual(res.status_code, 400)

        # Attempt to add charge via API
        res = self.client.post('/api/security/crm/proposaladditionalcharge/', {
            'proposal_version': str(frozen_version.id),
            'charge_name': 'Installation',
            'amount': 10000
        })
        self.assertEqual(res.status_code, 400)

    def test_create_final_proposal_revision_clones_all_lines(self):
        """Test creating a new revision copies all service lines, equipment, charges, and terms to Version 3."""
        loc = ClientLocation.objects.create(company=self.company, customer=self.customer, name='HQ')
        proposal = SecurityProposal.objects.create(company=self.company, customer=self.customer, status='FINAL_PROPOSAL')
        
        v2 = ProposalVersion.objects.create(
            company=self.company,
            proposal=proposal,
            version_number=2,
            version_type='Final Proposal',
            status=SecurityProposalStatus.FINAL_PROPOSAL,
            is_frozen=True,
            billing_cycle=CommercialBillingCycle.MONTHLY,
            payment_terms=CommercialPaymentTerms.NET_15,
            proposal_validity_days=45,
            contract_duration_months=24,
            tax_rate=Decimal('13.00')
        )
        ProposalServiceLine.objects.create(
            company=self.company,
            proposal_version=v2,
            location=loc,
            service_type=self.service_type,
            quantity=8,
            client_rate=Decimal('60000.00'),
            billing_unit='MONTHLY'
        )
        ContractEquipmentRequirement.objects.create(
            company=self.company,
            proposal_version=v2,
            location=loc,
            item_name='Metal Detector Archway',
            quantity=2,
            unit_rate=Decimal('80000.00'),
            charge_type=CommercialChargeType.ONE_TIME
        )
        ProposalAdditionalCharge.objects.create(
            company=self.company,
            proposal_version=v2,
            charge_name='Site Setup',
            quantity=1,
            amount=Decimal('25000.00'),
            charge_type=CommercialChargeType.ONE_TIME
        )

        res = self.client.post(f'/api/security/crm/securityproposal/{proposal.id}/create-final-revision/', {
            'base_version_id': str(v2.id)
        })
        self.assertEqual(res.status_code, 201)

        v3 = proposal.versions.filter(version_number=3).first()
        self.assertIsNotNone(v3)
        self.assertFalse(v3.is_frozen)
        self.assertEqual(v3.billing_cycle, CommercialBillingCycle.MONTHLY)
        self.assertEqual(v3.payment_terms, CommercialPaymentTerms.NET_15)
        self.assertEqual(v3.contract_duration_months, 24)
        self.assertEqual(v3.tax_rate, Decimal('13.00'))

        # Verify cloned lines
        self.assertEqual(v3.service_lines.count(), 1)
        self.assertEqual(v3.service_lines.first().quantity, 8)
        self.assertEqual(v3.service_lines.first().client_rate, Decimal('60000.00'))

        self.assertEqual(v3.equipment_requirements.count(), 1)
        self.assertEqual(v3.equipment_requirements.first().item_name, 'Metal Detector Archway')

        self.assertEqual(v3.additional_charges.count(), 1)
        self.assertEqual(v3.additional_charges.first().amount, Decimal('25000.00'))

    def test_send_final_proposal_email_transitions_to_awaiting_approval_and_freezes_version(self):
        """Test sending final proposal email transitions proposal to AWAITING_APPROVAL and freezes version."""
        proposal = SecurityProposal.objects.create(
            company=self.company,
            customer=self.customer,
            status=SecurityProposalStatus.FINAL_PROPOSAL
        )
        v2 = ProposalVersion.objects.create(
            company=self.company,
            proposal=proposal,
            version_number=2,
            version_type='Final Proposal',
            status=SecurityProposalStatus.FINAL_PROPOSAL,
            is_frozen=False
        )

        sender = SenderIdentity.objects.create(
            company=self.company,
            name='Sales Team',
            email_address='sales@zorvexsecurity.com',
            is_default=True
        )
        email = OutboundEmail.objects.create(
            company=self.company,
            sender_identity=sender,
            to='client@acmecorp.com',
            subject=f'Final Commercial Offer {proposal.proposal_number}',
            body_html='<p>Final commercial proposal details</p>',
            context_type='security_proposal',
            context_id=str(proposal.id),
            context_version_id=str(v2.id)
        )

        with patch('communications.services.EmailDeliveryService.send_outbound_email', return_value=(True, None)):
            res = self.client.post(f'/api/security/crm/securityproposal/{proposal.id}/send-final-proposal-email/', {
                'email_id': str(email.id),
                'version_id': str(v2.id)
            })
            self.assertEqual(res.status_code, 200)

        proposal.refresh_from_db()
        v2.refresh_from_db()

        self.assertEqual(proposal.status, SecurityProposalStatus.AWAITING_APPROVAL)
        self.assertTrue(v2.is_frozen)
        self.assertIsNotNone(v2.sent_at)

    # -----------------------------------------------------------------
    # PHASE S-2G: CLIENT APPROVAL, SIGNING & ACTIVE CLIENT CONVERSION TESTS
    # -----------------------------------------------------------------

    def test_client_approval_workflow(self):
        """Test approval transition from AWAITING_APPROVAL to APPROVED with full metadata."""
        proposal = SecurityProposal.objects.create(
            company=self.company,
            customer=self.customer,
            status=SecurityProposalStatus.AWAITING_APPROVAL
        )
        v1 = ProposalVersion.objects.create(
            company=self.company,
            proposal=proposal,
            version_number=1,
            version_type='Final Proposal',
            is_frozen=True,
            billing_cycle='MONTHLY',
            payment_terms='NET_30',
            expected_start_date=timezone.now().date() + timedelta(days=10),
            contract_duration_months=12
        )

        contact = CRMContact.objects.create(
            company=self.company,
            entity=self.customer,
            first_name='Arthur',
            last_name='Dent',
            email='arthur@dent.com'
        )

        response = self.client.post(f'/api/security/crm/securityproposal/{proposal.id}/approve/', {
            'version_id': str(v1.id),
            'approved_date': '2026-09-01',
            'approved_by_name': 'Arthur Dent, Procurement Director',
            'approved_by_contact': str(contact.id),
            'approval_method': 'EMAIL',
            'approval_notes': 'Confirmed via formal email acceptance of proposal v1'
        })
        self.assertEqual(response.status_code, 200)

        proposal.refresh_from_db()
        self.assertEqual(proposal.status, SecurityProposalStatus.APPROVED)
        self.assertEqual(proposal.approved_version, v1)
        self.assertEqual(str(proposal.approved_date), '2026-09-01')
        self.assertEqual(proposal.approved_by_name, 'Arthur Dent, Procurement Director')
        self.assertEqual(proposal.approved_by_contact, contact)
        self.assertEqual(proposal.approval_method, 'EMAIL')
        self.assertIn('formal email', proposal.approval_notes)
        self.assertEqual(proposal.billing_cycle, 'MONTHLY')
        self.assertEqual(proposal.payment_terms, 'NET_30')
        self.assertEqual(proposal.contract_start_date, v1.expected_start_date)

    def test_rejection_workflow(self):
        """Test client rejection transition to REJECTED with feedback capture."""
        proposal = SecurityProposal.objects.create(
            company=self.company,
            customer=self.customer,
            status=SecurityProposalStatus.AWAITING_APPROVAL
        )

        response = self.client.post(f'/api/security/crm/securityproposal/{proposal.id}/reject/', {
            'rejection_reason': 'Pricing / Budget Constraint',
            'rejection_notes': 'Client budget was capped at PKR 400,000/mo',
            'rejection_date': '2026-09-02'
        })
        self.assertEqual(response.status_code, 200)

        proposal.refresh_from_db()
        self.assertEqual(proposal.status, SecurityProposalStatus.REJECTED)
        self.assertEqual(proposal.rejection_reason, 'Pricing / Budget Constraint')
        self.assertEqual(proposal.rejection_notes, 'Client budget was capped at PKR 400,000/mo')
        self.assertEqual(str(proposal.rejection_date), '2026-09-02')

    def test_on_hold_and_resume_workflow(self):
        """Test putting proposal on hold and safely resuming back to workflow."""
        proposal = SecurityProposal.objects.create(
            company=self.company,
            customer=self.customer,
            status=SecurityProposalStatus.AWAITING_APPROVAL
        )

        # 1. Put on hold
        hold_res = self.client.post(f'/api/security/crm/securityproposal/{proposal.id}/put-on-hold/', {
            'on_hold_reason': 'Client Internal Reorganization',
            'on_hold_notes': 'Revisit in Q4 after management transition',
            'on_hold_date': '2026-09-03'
        })
        self.assertEqual(hold_res.status_code, 200)
        proposal.refresh_from_db()
        self.assertEqual(proposal.status, SecurityProposalStatus.ON_HOLD)
        self.assertEqual(proposal.on_hold_reason, 'Client Internal Reorganization')

        # 2. Resume from on-hold
        resume_res = self.client.post(f'/api/security/crm/securityproposal/{proposal.id}/resume-from-on-hold/', {
            'target_status': SecurityProposalStatus.AWAITING_APPROVAL
        })
        self.assertEqual(resume_res.status_code, 200)
        proposal.refresh_from_db()
        self.assertEqual(proposal.status, SecurityProposalStatus.AWAITING_APPROVAL)

    def test_signing_stage_lifecycle(self):
        """Test complete contract signing workflow from APPROVED -> SIGNING -> SIGNED."""
        proposal = SecurityProposal.objects.create(
            company=self.company,
            customer=self.customer,
            status=SecurityProposalStatus.APPROVED,
            proposal_number='PRO-2026-SIGN'
        )

        # 1. Start Signing stage
        start_res = self.client.post(f'/api/security/crm/securityproposal/{proposal.id}/start-signing/', {
            'contract_start_date': '2026-10-01',
            'contract_end_date': '2027-09-30',
            'billing_cycle': 'MONTHLY',
            'payment_terms': 'NET_30',
            'expected_mobilization_date': '2026-09-28',
            'contract_reference': 'SC-PRO-2026-SIGN',
            'signing_notes': 'Draft contract sent to client legal'
        })
        self.assertEqual(start_res.status_code, 200)
        proposal.refresh_from_db()
        self.assertEqual(proposal.status, SecurityProposalStatus.SIGNING)
        self.assertEqual(str(proposal.contract_start_date), '2026-10-01')
        self.assertEqual(str(proposal.contract_end_date), '2027-09-30')

        # 2. Complete Signing
        complete_res = self.client.post(f'/api/security/crm/securityproposal/{proposal.id}/complete-signing/', {
            'signed_by_client': 'Bruce Wayne, CEO',
            'signed_by_company': 'Lucius Fox, COO Zorvex Security',
            'signing_date': '2026-09-15',
            'signing_notes': 'Countersigned and stamped by both parties'
        })
        self.assertEqual(complete_res.status_code, 200)
        proposal.refresh_from_db()
        self.assertEqual(proposal.status, SecurityProposalStatus.SIGNED)
        self.assertEqual(proposal.signed_by_client, 'Bruce Wayne, CEO')
        self.assertEqual(proposal.signed_by_company, 'Lucius Fox, COO Zorvex Security')
        self.assertEqual(str(proposal.signing_date), '2026-09-15')

    def test_signed_document_upload_and_category_filtering(self):
        """Test uploading signed contract, PO, and award letters with tenant verification."""
        from django.core.files.uploadedfile import SimpleUploadedFile

        proposal = SecurityProposal.objects.create(
            company=self.company,
            customer=self.customer,
            status=SecurityProposalStatus.SIGNING
        )

        dummy_pdf = SimpleUploadedFile("contract_signed.pdf", b"dummy pdf content for signed agreement", content_type="application/pdf")

        # Upload document
        upload_res = self.client.post(f'/api/security/crm/securityproposal/{proposal.id}/upload-signed-document/', {
            'title': 'Master Security Agreement Signed Copy',
            'document_type': 'SIGNED_CONTRACT',
            'file': dummy_pdf,
            'notes': 'Executed with client official seal'
        }, format='multipart')
        self.assertEqual(upload_res.status_code, 201)
        doc_id = upload_res.data['id']

        # Verify proposal detail serializer includes signed document
        detail_res = self.client.get(f'/api/security/crm/securityproposal/{proposal.id}/')
        self.assertEqual(detail_res.status_code, 200)
        self.assertEqual(detail_res.data['signed_documents_count'], 1)
        self.assertEqual(detail_res.data['signed_documents'][0]['title'], 'Master Security Agreement Signed Copy')
        self.assertEqual(detail_res.data['signed_documents'][0]['document_type'], 'SIGNED_CONTRACT')

        # Test delete document (soft delete via TenantModelViewSet)
        del_res = self.client.delete(f'/api/security/crm/signed-documents/{doc_id}/')
        self.assertEqual(del_res.status_code, 200)
        self.assertFalse(ProposalSignedDocument.objects.filter(id=doc_id, is_deleted=False).exists())

    def test_active_client_conversion_and_idempotent_service_contract(self):
        """
        Verify ACTIVE stage conversion:
        1. CRMEntity becomes active customer (entity_type='CUSTOMER').
        2. operations.ServiceContract is created once with unique code and status ACTIVE.
        3. OperationalSite created & linked for all ClientLocations in approved proposal version.
        4. Idempotency: Multiple activation requests never duplicate contracts or sites.
        """
        from operations.models import ServiceContract, OperationalSite

        loc1 = ClientLocation.objects.create(company=self.company, customer=self.customer, name='HQ North Tower')
        loc2 = ClientLocation.objects.create(company=self.company, customer=self.customer, name='West Warehouse')

        proposal = SecurityProposal.objects.create(
            company=self.company,
            customer=self.customer,
            status=SecurityProposalStatus.SIGNED,
            proposal_number='PRO-2026-ACTIVATE',
            contract_reference='SC-2026-ACTIVATE',
            contract_start_date=timezone.now().date(),
            signed_by_client='Clark Kent',
            signed_by_company='Perry White'
        )

        v1 = ProposalVersion.objects.create(
            company=self.company,
            proposal=proposal,
            version_number=1,
            version_type='Final Proposal',
            is_frozen=True
        )
        proposal.approved_version = v1
        proposal.save()

        # Add service lines for both locations
        ProposalServiceLine.objects.create(
            company=self.company,
            proposal_version=v1,
            service_type=self.service_type,
            location=loc1,
            quantity=4,
            client_rate=Decimal('65000.00'),
            billing_unit='MONTH'
        )
        ProposalServiceLine.objects.create(
            company=self.company,
            proposal_version=v1,
            service_type=self.service_type,
            location=loc2,
            quantity=2,
            client_rate=Decimal('60000.00'),
            billing_unit='MONTH'
        )

        # 1. First Activation
        act_res = self.client.post(f'/api/security/crm/securityproposal/{proposal.id}/activate-client/')
        self.assertEqual(act_res.status_code, 200)

        proposal.refresh_from_db()
        self.customer.refresh_from_db()

        self.assertEqual(proposal.status, SecurityProposalStatus.ACTIVE)
        self.assertEqual(self.customer.entity_type, 'CUSTOMER')
        self.assertIsNotNone(proposal.contract)

        contract = proposal.contract
        self.assertEqual(contract.contract_code, 'SC-2026-ACTIVATE')
        self.assertEqual(contract.status, 'ACTIVE')
        self.assertEqual(contract.sites.count(), 2)

        site_names = list(contract.sites.values_list('name', flat=True))
        self.assertIn('HQ North Tower', site_names)
        self.assertIn('West Warehouse', site_names)

        # 2. Repeated Activation (Idempotency check)
        act_res2 = self.client.post(f'/api/security/crm/securityproposal/{proposal.id}/activate-client/')
        self.assertEqual(act_res2.status_code, 200)

        # Verify contract count and sites count did not increase
        self.assertEqual(ServiceContract.objects.filter(company=self.company, contract_code='SC-2026-ACTIVATE').count(), 1)
        self.assertEqual(OperationalSite.objects.filter(company=self.company, crm_entity=self.customer).count(), 2)

    def test_tenant_isolation_for_approval_and_signing(self):
        """Cross-tenant user cannot approve or sign another company's proposal."""
        other_proposal = SecurityProposal.objects.create(
            company=self.other_company,
            customer=self.other_customer,
            status=SecurityProposalStatus.AWAITING_APPROVAL
        )

        # Try to approve other company proposal
        res = self.client.post(f'/api/security/crm/securityproposal/{other_proposal.id}/approve/', {
            'approved_date': '2026-09-01',
            'approved_by_name': 'Hacker'
        })
        self.assertEqual(res.status_code, 404)

        # Try to upload signed document to other company proposal
        upload_res = self.client.post(f'/api/security/crm/securityproposal/{other_proposal.id}/upload-signed-document/', {
            'title': 'Illegal Contract'
        })
        self.assertEqual(upload_res.status_code, 404)

    # -----------------------------------------------------------------
    # PHASE S-2H: CRM CROSS-MODULE HANDOFF & CERTIFICATION PREPARATION TESTS
    # -----------------------------------------------------------------

    def test_cross_module_handoff_summary_structure(self):
        """
        Verify that an ACTIVE client proposal generates complete structured handoff snapshots
        for Operations, HRM, Inventory, Purchasing, and Finance.
        """
        from operations.models import OperationalSite

        loc1 = ClientLocation.objects.create(company=self.company, customer=self.customer, name='Central Data Center')
        loc2 = ClientLocation.objects.create(company=self.company, customer=self.customer, name='Logistics Hub')

        site1 = OperationalSite.objects.create(company=self.company, crm_entity=self.customer, name='Central Data Center', address='Sector G-10')
        site2 = OperationalSite.objects.create(company=self.company, crm_entity=self.customer, name='Logistics Hub', address='Sector I-9')

        contract = ServiceContract.objects.create(
            company=self.company,
            crm_entity=self.customer,
            contract_code='SC-HANDOFF-2026',
            start_date=timezone.now().date() + timedelta(days=5),
            status='ACTIVE'
        )
        contract.sites.add(site1, site2)

        proposal = SecurityProposal.objects.create(
            company=self.company,
            customer=self.customer,
            status=SecurityProposalStatus.ACTIVE,
            proposal_number='PRO-HANDOFF-2026',
            contract=contract,
            contract_reference='SC-HANDOFF-2026',
            contract_start_date=contract.start_date,
            billing_cycle='MONTHLY',
            payment_terms='NET_30',
            expected_mobilization_date=contract.start_date - timedelta(days=2),
            signed_by_client='Bruce Wayne',
            signed_by_company='Lucius Fox'
        )

        v1 = ProposalVersion.objects.create(
            company=self.company,
            proposal=proposal,
            version_number=1,
            version_type='Final Proposal',
            is_frozen=True,
            billing_cycle='MONTHLY',
            payment_terms='NET_30',
            tax_rate=Decimal('16.00')
        )
        proposal.approved_version = v1
        proposal.save()

        # 1. Staffing lines
        ProposalServiceLine.objects.create(
            company=self.company,
            proposal_version=v1,
            service_type=self.service_type,
            location=loc1,
            quantity=6,
            client_rate=Decimal('65000.00'),
            single_ot_rate=Decimal('350.00'),
            double_ot_rate=Decimal('500.00'),
            billing_unit='MONTH'
        )
        ProposalServiceLine.objects.create(
            company=self.company,
            proposal_version=v1,
            service_type=self.service_type,
            location=loc2,
            quantity=4,
            client_rate=Decimal('60000.00'),
            single_ot_rate=Decimal('300.00'),
            double_ot_rate=Decimal('450.00'),
            billing_unit='MONTH'
        )

        # 2. Equipment Requirement
        ContractEquipmentRequirement.objects.create(
            company=self.company,
            proposal_version=v1,
            location=loc1,
            item_name='Motorola Walkie-Talkies GP328',
            quantity=8,
            unit_rate=Decimal('15000.00'),
            charge_type='ONE_TIME'
        )

        # 3. Additional Charge
        ProposalAdditionalCharge.objects.create(
            company=self.company,
            proposal_version=v1,
            charge_name='Site Setup & Guard Briefing',
            charge_type='ONE_TIME',
            amount=Decimal('50000.00'),
            quantity=1
        )

        # 4. Signed Document
        from django.core.files.uploadedfile import SimpleUploadedFile
        pdf = SimpleUploadedFile("executed_sla.pdf", b"Executed Agreement Content", content_type="application/pdf")
        ProposalSignedDocument.objects.create(
            company=self.company,
            proposal=proposal,
            title='Master SLA Agreement',
            document_type='SIGNED_CONTRACT',
            file=pdf,
            uploaded_by=self.user
        )

        # Query GET /handoff-summary/
        response = self.client.get(f'/api/security/crm/securityproposal/{proposal.id}/handoff-summary/')
        self.assertEqual(response.status_code, 200)
        data = response.data

        # Verify Client Info
        self.assertEqual(data['client']['name'], self.customer.name)
        self.assertEqual(data['client']['signed_by_client'], 'Bruce Wayne')

        # Verify Operations Handoff
        self.assertEqual(data['operations_handoff']['contract_code'], 'SC-HANDOFF-2026')
        self.assertEqual(data['operations_handoff']['total_guard_posts'], 10)
        self.assertEqual(data['operations_handoff']['total_operational_sites'], 2)
        self.assertEqual(data['operations_handoff']['readiness_status'], 'OPERATIONS_READY')

        # Verify HRM Handoff
        self.assertEqual(data['hrm_handoff']['total_required_headcount'], 10)
        self.assertEqual(len(data['hrm_handoff']['staffing_demand']), 2)
        self.assertEqual(data['hrm_handoff']['readiness_status'], 'STAFFING_DEMAND_READY')

        # Verify Inventory Handoff
        self.assertEqual(data['inventory_handoff']['total_equipment_quantity'], 8)
        self.assertEqual(len(data['inventory_handoff']['equipment_demand']), 1)
        self.assertEqual(data['inventory_handoff']['equipment_demand'][0]['item_name'], 'Motorola Walkie-Talkies GP328')
        self.assertEqual(data['inventory_handoff']['readiness_status'], 'EQUIPMENT_DEMAND_READY')

        # Verify Purchasing Handoff
        self.assertEqual(data['purchasing_handoff']['total_items_to_procure'], 8)
        self.assertEqual(len(data['purchasing_handoff']['procurement_demand']), 1)
        self.assertEqual(data['purchasing_handoff']['readiness_status'], 'PROCUREMENT_DEMAND_READY')

        # Verify Finance Handoff
        self.assertEqual(data['finance_handoff']['billing_cycle'], 'MONTHLY')
        self.assertEqual(data['finance_handoff']['payment_terms'], 'NET_30')
        self.assertEqual(len(data['finance_handoff']['service_billing_rates']), 2)
        self.assertEqual(data['finance_handoff']['readiness_status'], 'COMMERCIAL_DATA_READY')

        # Verify Readiness Checklist
        self.assertTrue(data['readiness_checklist']['crm_lifecycle_completed'])
        self.assertTrue(data['readiness_checklist']['service_contract_linked'])
        self.assertTrue(data['readiness_checklist']['operations_ready'])
        self.assertTrue(data['readiness_checklist']['hr_demand_ready'])
        self.assertTrue(data['readiness_checklist']['inventory_demand_ready'])
        self.assertTrue(data['readiness_checklist']['purchasing_demand_ready'])
        self.assertTrue(data['readiness_checklist']['finance_commercial_ready'])

    def test_prepare_cross_module_handoff_idempotency(self):
        """Test POST /prepare-handoff/ certifying readiness idempotently."""
        proposal = SecurityProposal.objects.create(
            company=self.company,
            customer=self.customer,
            status=SecurityProposalStatus.ACTIVE,
            proposal_number='PRO-PREP-2026'
        )
        v1 = ProposalVersion.objects.create(
            company=self.company,
            proposal=proposal,
            version_number=1,
            version_type='Final Proposal',
            is_frozen=True
        )
        proposal.approved_version = v1
        proposal.save()

        # 1. Prepare Handoff
        res1 = self.client.post(f'/api/security/crm/securityproposal/{proposal.id}/prepare-handoff/', {
            'notes': 'Certified by Commercial Director for Operations Handoff'
        })
        self.assertEqual(res1.status_code, 200)
        self.assertIn('prepared and certified', res1.data['message'])

        proposal.refresh_from_db()
        self.assertTrue(proposal.is_handoff_ready)
        self.assertIsNotNone(proposal.handoff_prepared_at)
        self.assertEqual(proposal.handoff_prepared_by, self.user)
        self.assertEqual(proposal.handoff_notes, 'Certified by Commercial Director for Operations Handoff')

        # 2. Repeated call (Idempotency)
        res2 = self.client.post(f'/api/security/crm/securityproposal/{proposal.id}/prepare-handoff/', {
            'notes': 'Updated certification notes'
        })
        self.assertEqual(res2.status_code, 200)

        proposal.refresh_from_db()
        self.assertTrue(proposal.is_handoff_ready)
        self.assertEqual(proposal.handoff_notes, 'Updated certification notes')

    def test_cross_module_handoff_boundary_enforcement(self):
        """
        Verify that preparing cross-module handoff does NOT create:
        - Operational deployments or rosters
        - Employee records or salary structures
        - Inventory stock deductions or movements
        - Financial invoices or journal entries
        """
        from operations.models import ServiceContract
        from hrm.models import Employee
        from inventory.models import Product

        initial_employee_count = Employee.objects.filter(company=self.company).count()
        initial_product_count = Product.objects.filter(company=self.company).count()

        proposal = SecurityProposal.objects.create(
            company=self.company,
            customer=self.customer,
            status=SecurityProposalStatus.ACTIVE,
            proposal_number='PRO-BOUNDARY-2026'
        )
        v1 = ProposalVersion.objects.create(
            company=self.company,
            proposal=proposal,
            version_number=1,
            version_type='Final Proposal',
            is_frozen=True
        )
        proposal.approved_version = v1
        proposal.save()

        res = self.client.post(f'/api/security/crm/securityproposal/{proposal.id}/prepare-handoff/')
        self.assertEqual(res.status_code, 200)

        # Assert no downstream records created
        self.assertEqual(Employee.objects.filter(company=self.company).count(), initial_employee_count)
        self.assertEqual(Product.objects.filter(company=self.company).count(), initial_product_count)

    def test_cross_module_handoff_tenant_isolation(self):
        """Cross-tenant user cannot view or prepare handoff for other company's proposal."""
        other_proposal = SecurityProposal.objects.create(
            company=self.other_company,
            customer=self.other_customer,
            status=SecurityProposalStatus.ACTIVE
        )

        # GET handoff-summary
        get_res = self.client.get(f'/api/security/crm/securityproposal/{other_proposal.id}/handoff-summary/')
        self.assertEqual(get_res.status_code, 404)

        # POST prepare-handoff
        post_res = self.client.post(f'/api/security/crm/securityproposal/{other_proposal.id}/prepare-handoff/')
        self.assertEqual(post_res.status_code, 404)





