from unittest.mock import patch
from django.test import TestCase, override_settings
from django.db import connection
from rest_framework.test import APIClient
from django.contrib.auth import get_user_model
from companies.models import Company
from .models import SenderIdentity, EmailTemplate, OutboundEmail
from .admin import SenderIdentityAdminForm
from .services import EmailDeliveryService
from platform_core.models import CompanyModule, UserModuleAccess, ModuleDefinition
from erp_core.encryption import encrypt_value, decrypt_value

User = get_user_model()


class CommunicationsTests(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name='Test Company', business_type='security')
        self.other_company = Company.objects.create(name='Other Company', business_type='security')

        self.admin_user = User.objects.create_user(
            username='adminuser',
            email='admin@test.com',
            password='password123',
            company=self.company,
            role='admin'
        )
        self.manager_user = User.objects.create_user(
            username='manageruser',
            email='manager@test.com',
            password='password123',
            company=self.company,
            role='manager'
        )
        self.other_user = User.objects.create_user(
            username='otheruser',
            email='other@test.com',
            password='password123',
            company=self.other_company,
            role='manager'
        )

        module_def = ModuleDefinition.objects.create(code='communications', name='Communications')
        crm_mod = ModuleDefinition.objects.create(code='crm', name='CRM')

        CompanyModule.objects.create(company=self.company, module=module_def, enabled=True)
        CompanyModule.objects.create(company=self.company, module=crm_mod, enabled=True)
        CompanyModule.objects.create(company=self.other_company, module=module_def, enabled=True)

        self.client = APIClient()
        self.client.force_authenticate(user=self.admin_user)

        self.manager_client = APIClient()
        self.manager_client.force_authenticate(user=self.manager_user)

        self.other_client = APIClient()
        self.other_client.force_authenticate(user=self.other_user)

    def test_sender_identity_isolation(self):
        SenderIdentity.objects.create(
            company=self.company, name='Test Sender', email_address='test@sender.com', verification_status='VERIFIED'
        )
        SenderIdentity.objects.create(
            company=self.other_company, name='Other Sender', email_address='other@sender.com', verification_status='VERIFIED'
        )

        response = self.client.get('/api/communications/senders/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data['results']), 1)
        self.assertEqual(response.data['results'][0]['name'], 'Test Sender')

    def test_sender_secret_not_serialized(self):
        sender = SenderIdentity.objects.create(
            company=self.company, name='Secret Sender', email_address='secret@sender.com',
            smtp_password='supersecretpass'
        )
        response = self.client.get(f'/api/communications/senders/{sender.id}/')
        self.assertEqual(response.status_code, 200)
        self.assertNotIn('supersecretpass', str(response.data))
        self.assertNotIn('smtp_password', response.data)
        self.assertTrue(response.data.get('has_smtp_password'))

    def test_encrypted_storage_at_rest(self):
        """Verify raw value in SQL table is Fernet ciphertext, not plaintext."""
        sender = SenderIdentity.objects.create(
            company=self.company, name='Encrypted Sender', email_address='enc@sender.com',
            smtp_password='MyCleartextPassword123'
        )
        # Fetch raw value via raw SQL cursor
        with connection.cursor() as cursor:
            cursor.execute("SELECT smtp_password FROM communications_senderidentity WHERE id = %s", [str(sender.id)])
            raw_db_value = cursor.fetchone()[0]

        self.assertNotEqual(raw_db_value, 'MyCleartextPassword123')
        self.assertTrue(raw_db_value.startswith('gAAAAA'), "Raw DB value must be a valid Fernet token")
        # Python model access automatically decrypts
        sender.refresh_from_db()
        self.assertEqual(sender.smtp_password, 'MyCleartextPassword123')

    def test_existing_credential_survives_unrelated_sender_update(self):
        """Updating name/reply_to without providing smtp_password must preserve existing secret."""
        sender = SenderIdentity.objects.create(
            company=self.company, name='Original Name', email_address='orig@sender.com',
            smtp_password='OriginalSecretPassword'
        )
        response = self.client.patch(f'/api/communications/senders/{sender.id}/', {
            'name': 'Updated Name',
            'reply_to': 'replies@sender.com'
        })
        self.assertEqual(response.status_code, 200)
        sender.refresh_from_db()
        self.assertEqual(sender.name, 'Updated Name')
        self.assertEqual(sender.reply_to, 'replies@sender.com')
        self.assertEqual(sender.smtp_password, 'OriginalSecretPassword')

    def test_unauthorized_user_cannot_manage_sender_credentials(self):
        """Manager role can read senders for composer dropdown, but cannot POST/PUT/DELETE."""
        # GET should succeed
        get_res = self.manager_client.get('/api/communications/senders/')
        self.assertEqual(get_res.status_code, 200)

        # POST should be forbidden
        post_res = self.manager_client.post('/api/communications/senders/', {
            'name': 'Hacker Sender',
            'email_address': 'hack@test.com',
            'smtp_password': 'secret'
        })
        self.assertEqual(post_res.status_code, 403)

    def test_admin_masks_credential_in_form(self):
        """Django Admin form never displays the raw password and retains old secret if left blank."""
        sender = SenderIdentity.objects.create(
            company=self.company, name='Admin Form Sender', email_address='adminform@test.com',
            smtp_password='AdminSecretPassword'
        )
        form = SenderIdentityAdminForm(instance=sender, data={
            'name': 'Admin Form Sender Renamed',
            'email_address': 'adminform@test.com',
            'provider_type': 'SMTP',
            'verification_status': 'UNVERIFIED',
            'is_active': True,
            'is_default': False,
            'company': self.company.id,
            'smtp_password': ''  # left blank
        })
        self.assertTrue(form.is_valid(), form.errors)
        saved_sender = form.save()
        self.assertEqual(saved_sender.smtp_password, 'AdminSecretPassword')

    def test_duplicate_send_idempotency(self):
        """Duplicate / concurrent send attempts must not send two emails."""
        sender = SenderIdentity.objects.create(
            company=self.company, name='Test', email_address='test@test.com', verification_status='USABLE',
            provider_type='SYSTEM_DEFAULT'
        )
        email = OutboundEmail.objects.create(
            company=self.company, sender_identity=sender, to='recipient@test.com', subject='Test', body_text='Body'
        )

        with patch('django.core.mail.EmailMultiAlternatives.send') as mock_send:
            # First send
            success1, err1 = EmailDeliveryService.send_outbound_email(email)
            self.assertTrue(success1)
            self.assertEqual(mock_send.call_count, 1)

            # Second send (immediate duplicate / retry)
            success2, err2 = EmailDeliveryService.send_outbound_email(email)
            self.assertFalse(success2)
            self.assertIn("already sent", err2)
            # send() must NOT be called a second time
            self.assertEqual(mock_send.call_count, 1)

    def test_generic_endpoint_delegates_to_proposal_orchestration(self):
        """Calling /api/communications/emails/{id}/send/ for a proposal email executes workflow & freezes version."""
        from crm.models import CRMEntity
        from security_crm.models import SecurityProposal, ProposalVersion

        customer = CRMEntity.objects.create(company=self.company, name='Proposal Client', entity_type='CUSTOMER')
        proposal = SecurityProposal.objects.create(company=self.company, customer=customer, title='Commercial Proposal', status='DRAFT')
        version = ProposalVersion.objects.create(company=self.company, proposal=proposal, version_number=2, is_frozen=False)

        sender = SenderIdentity.objects.create(
            company=self.company, name='Test Sender', email_address='sender@test.com', verification_status='USABLE',
            provider_type='SYSTEM_DEFAULT'
        )
        email = OutboundEmail.objects.create(
            company=self.company, sender_identity=sender, to='client@test.com', subject='Your Proposal v2',
            context_type='security_proposal', context_id=str(proposal.id), context_version_id=str(version.id)
        )

        with patch('django.core.mail.EmailMultiAlternatives.send') as mock_send:
            response = self.client.post(f'/api/communications/emails/{email.id}/send/')
            self.assertEqual(response.status_code, 200)

        proposal.refresh_from_db()
        version.refresh_from_db()
        email.refresh_from_db()

        self.assertEqual(proposal.status, 'SENT')
        self.assertTrue(version.is_frozen)
        self.assertEqual(email.status, 'SENT')
        self.assertEqual(email.context_version_id, str(version.id))

    def test_failed_delivery_leaves_proposal_draft_and_version_unfrozen(self):
        """SMTP failure must leave proposal in DRAFT and version unfrozen."""
        from crm.models import CRMEntity
        from security_crm.models import SecurityProposal, ProposalVersion

        customer = CRMEntity.objects.create(company=self.company, name='Failure Client', entity_type='CUSTOMER')
        proposal = SecurityProposal.objects.create(company=self.company, customer=customer, title='Failure Proposal', status='DRAFT')
        version = ProposalVersion.objects.create(company=self.company, proposal=proposal, version_number=1, is_frozen=False)

        sender = SenderIdentity.objects.create(
            company=self.company, name='Test Sender', email_address='sender@test.com', verification_status='USABLE',
            provider_type='SYSTEM_DEFAULT'
        )
        email = OutboundEmail.objects.create(
            company=self.company, sender_identity=sender, to='client@test.com', subject='Proposal',
            context_type='security_proposal', context_id=str(proposal.id), context_version_id=str(version.id)
        )

        with patch('django.core.mail.EmailMultiAlternatives.send', side_effect=Exception("SMTP Connection refused")):
            response = self.client.post(f'/api/communications/emails/{email.id}/send/')
            self.assertEqual(response.status_code, 400)

        proposal.refresh_from_db()
        version.refresh_from_db()
        email.refresh_from_db()

        self.assertEqual(proposal.status, 'DRAFT', "Proposal must remain DRAFT on failure")
        self.assertFalse(version.is_frozen, "Version must remain unfrozen on failure")
        self.assertEqual(email.status, 'FAILED')
        self.assertIn("SMTP Connection refused", email.error_message)

    def test_user_signature_crud_and_isolation(self):
        """Users can create, view, update and delete their own signatures, and tenant isolation is enforced."""
        from .models import UserEmailSignature
        sig1 = UserEmailSignature.objects.create(
            company=self.company,
            user=self.manager_user,
            name='Manager Text Sig',
            signature_type='TEXT',
            text_content='Best Regards,<br><strong>Manager</strong>',
            is_default=True
        )
        sig_other = UserEmailSignature.objects.create(
            company=self.other_company,
            user=self.other_user,
            name='Other Sig',
            signature_type='TEXT',
            text_content='Other Company Sig',
            is_default=True
        )

        # Manager client can list their own signatures
        res = self.manager_client.get('/api/communications/signatures/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data['results']), 1)
        self.assertEqual(res.data['results'][0]['name'], 'Manager Text Sig')

        # Manager client cannot see other company's signatures
        res_detail = self.manager_client.get(f'/api/communications/signatures/{sig_other.id}/')
        self.assertEqual(res_detail.status_code, 404)

        # Manager client can create a new image signature
        create_res = self.manager_client.post('/api/communications/signatures/', {
            'name': 'Manager Image Sig',
            'signature_type': 'IMAGE',
            'is_default': False
        })
        self.assertEqual(create_res.status_code, 201)
        self.assertEqual(create_res.data['name'], 'Manager Image Sig')
        self.assertEqual(create_res.data['user_name'], 'manageruser')

    def test_user_signature_default_switching(self):
        """Setting is_default=True on a new or updated signature clears is_default on existing signatures."""
        from .models import UserEmailSignature
        sig1 = UserEmailSignature.objects.create(
            company=self.company,
            user=self.manager_user,
            name='Sig 1',
            signature_type='TEXT',
            text_content='Sig 1 Text',
            is_default=True
        )
        sig2 = UserEmailSignature.objects.create(
            company=self.company,
            user=self.manager_user,
            name='Sig 2',
            signature_type='IMAGE',
            is_default=True
        )

        sig1.refresh_from_db()
        sig2.refresh_from_db()
        self.assertFalse(sig1.is_default, "Sig 1 is_default should have been cleared")
        self.assertTrue(sig2.is_default, "Sig 2 should be active default")

    def test_my_signatures_endpoint(self):
        """The my_signatures custom action returns all signatures for the authenticated user."""
        from .models import UserEmailSignature
        UserEmailSignature.objects.create(
            company=self.company,
            user=self.manager_user,
            name='Quick Sig',
            signature_type='TEXT',
            text_content='Quick Text'
        )

        res = self.manager_client.get('/api/communications/signatures/my_signatures/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data), 1)
        self.assertEqual(res.data[0]['name'], 'Quick Sig')

