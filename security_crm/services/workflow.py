import logging
from django.utils import timezone
from django.core.exceptions import ValidationError
from security_crm.models import SecurityProposal, SecurityProposalStatus, ProposalVersion

logger = logging.getLogger(__name__)


class SecurityProposalWorkflowService:
    
    ALLOWED_TRANSITIONS = {
        SecurityProposalStatus.DRAFT: [
            SecurityProposalStatus.SENT,
            SecurityProposalStatus.CANCELLED
        ],
        SecurityProposalStatus.SENT: [
            SecurityProposalStatus.MEETING,
            SecurityProposalStatus.REJECTED,
            SecurityProposalStatus.CANCELLED
        ],
        SecurityProposalStatus.MEETING: [
            SecurityProposalStatus.SITE_ASSESSMENT,
            SecurityProposalStatus.FINAL_PROPOSAL,
            SecurityProposalStatus.REJECTED,
            SecurityProposalStatus.CANCELLED
        ],
        SecurityProposalStatus.SITE_ASSESSMENT: [
            SecurityProposalStatus.FINAL_PROPOSAL,
            SecurityProposalStatus.REJECTED,
            SecurityProposalStatus.CANCELLED
        ],
        SecurityProposalStatus.FINAL_PROPOSAL: [
            SecurityProposalStatus.AWAITING_APPROVAL,
            SecurityProposalStatus.REJECTED,
            SecurityProposalStatus.CANCELLED
        ],
        SecurityProposalStatus.AWAITING_APPROVAL: [
            SecurityProposalStatus.APPROVED,
            SecurityProposalStatus.ON_HOLD,
            SecurityProposalStatus.REJECTED,
            SecurityProposalStatus.CANCELLED
        ],
        SecurityProposalStatus.APPROVED: [
            SecurityProposalStatus.SIGNING,
            SecurityProposalStatus.ON_HOLD,
            SecurityProposalStatus.CANCELLED
        ],
        SecurityProposalStatus.SIGNING: [
            SecurityProposalStatus.SIGNED,
            SecurityProposalStatus.ON_HOLD,
            SecurityProposalStatus.CANCELLED
        ],
        SecurityProposalStatus.SIGNED: [
            SecurityProposalStatus.ACTIVE,
            SecurityProposalStatus.ON_HOLD
        ],
        SecurityProposalStatus.ON_HOLD: [
            SecurityProposalStatus.AWAITING_APPROVAL,
            SecurityProposalStatus.APPROVED,
            SecurityProposalStatus.SIGNING,
            SecurityProposalStatus.SIGNED,
            SecurityProposalStatus.CANCELLED
        ],
        SecurityProposalStatus.ACTIVE: [
            SecurityProposalStatus.ON_HOLD,
            SecurityProposalStatus.CANCELLED
        ],
        SecurityProposalStatus.REJECTED: [],
        SecurityProposalStatus.CANCELLED: []
    }

    @classmethod
    def transition_status(cls, proposal: SecurityProposal, new_status: str, user=None) -> SecurityProposal:
        """
        Transition the proposal to a new status safely.
        """
        if proposal.status == new_status:
            return proposal
            
        allowed = cls.ALLOWED_TRANSITIONS.get(proposal.status, [])
        if new_status not in allowed:
            raise ValidationError(f"Invalid transition from {proposal.status} to {new_status}")

        proposal.status = new_status
        proposal.save()
        return proposal

    @classmethod
    def send_proposal_email(cls, proposal: SecurityProposal, email, version_id=None, version_number=None, user=None):
        """
        Orchestrates sending a security proposal email:
        1. Validates and identifies the exact ProposalVersion to be sent.
        2. Enforces tenant isolation (rejects cross-tenant version or proposal).
        3. Enforces valid proposal workflow state (cannot send if REJECTED / CANCELLED).
        4. Links the OutboundEmail to context_type='security_proposal', context_id=proposal.id, context_version_id=version.id.
        5. Calls EmailDeliveryService.send_outbound_email(email).
        6. On delivery success:
           - Freezes THAT exact version only (version.is_frozen = True).
           - Transitions proposal from DRAFT -> SENT strictly through cls.transition_status.
           - Returns (True, None, version).
        7. On delivery failure:
           - Leaves proposal in DRAFT (never marks proposal as SENT).
           - Leaves version unfrozen (never freezes on failure).
           - Returns (False, error_message, version).
        """
        from communications.services import EmailDeliveryService

        # 1. State validation
        if proposal.status in [SecurityProposalStatus.REJECTED, SecurityProposalStatus.CANCELLED]:
            raise ValidationError(f"Cannot send email for a {proposal.status} proposal.")

        # 2. Determine and validate exact proposal version
        version = None
        if version_id:
            version = ProposalVersion.objects.filter(
                id=version_id,
                proposal=proposal,
                company=proposal.company
            ).first()
            if not version:
                raise ValidationError("Specified ProposalVersion not found or does not belong to this proposal/company.")
        elif version_number is not None:
            version = ProposalVersion.objects.filter(
                version_number=version_number,
                proposal=proposal,
                company=proposal.company
            ).first()
            if not version:
                raise ValidationError(f"ProposalVersion #{version_number} not found for this proposal.")
        elif email.context_version_id:
            version = ProposalVersion.objects.filter(
                id=email.context_version_id,
                proposal=proposal,
                company=proposal.company
            ).first()

        if not version:
            # Default to latest active version for this proposal
            version = proposal.versions.filter(company=proposal.company).order_by('-version_number').first()

        if not version:
            raise ValidationError("No valid ProposalVersion found to send for this proposal.")

        # 3. Ensure email has context linkages persisted
        email.context_type = 'security_proposal'
        email.context_id = str(proposal.id)
        email.context_version_id = str(version.id)
        email.save(update_fields=['context_type', 'context_id', 'context_version_id'])

        # 4. Dispatch email delivery
        success, error = EmailDeliveryService.send_outbound_email(email)

        # 5. Handle post-send state atomically
        if success:
            # Freeze THAT specific version only
            if not version.is_frozen:
                version.is_frozen = True
                version.save(update_fields=['is_frozen'])

            # Transition proposal state through workflow service
            if proposal.status == SecurityProposalStatus.DRAFT:
                cls.transition_status(proposal, SecurityProposalStatus.SENT, user=user)

            return True, None, version
        else:
            # Failure atomicity: proposal remains DRAFT, version remains unfrozen
            logger.warning(f"Proposal email delivery failed for proposal {proposal.id}: {error}")
            return False, error, version

    @classmethod
    def start_meeting_stage(cls, proposal: SecurityProposal, user=None) -> SecurityProposal:
        """
        Transitions a sent proposal to the MEETING stage.
        If already in MEETING stage, returns without error.
        """
        if proposal.status == SecurityProposalStatus.SENT:
            return cls.transition_status(proposal, SecurityProposalStatus.MEETING, user=user)
        elif proposal.status == SecurityProposalStatus.MEETING:
            return proposal
        else:
            raise ValidationError(f"Cannot start meeting stage from status {proposal.status}. Proposal must be in SENT or MEETING status.")

    @classmethod
    def schedule_meeting(cls, proposal: SecurityProposal, data: dict = None, user=None, **kwargs):
        """
        Schedules a meeting for a security proposal.
        Auto-transitions proposal from SENT to MEETING if currently in SENT.
        """
        from security_crm.models import SecurityProposalMeeting, MeetingParticipant, SecurityProposalMeetingStatus
        from django.db import transaction

        if proposal.status in [SecurityProposalStatus.REJECTED, SecurityProposalStatus.CANCELLED]:
            raise ValidationError(f"Cannot schedule meetings for a {proposal.status} proposal.")

        meeting_data = dict(data or {})
        meeting_data.update(kwargs)

        participants_data = meeting_data.pop('participants', []) or meeting_data.pop('participants_data', [])

        with transaction.atomic():
            # If proposal is in SENT, advance to MEETING
            if proposal.status == SecurityProposalStatus.SENT:
                cls.start_meeting_stage(proposal, user=user)

            meeting = SecurityProposalMeeting(
                company=proposal.company,
                proposal=proposal,
                created_by=user,
                **meeting_data
            )
            meeting.full_clean()
            meeting.save()

            for p_data in participants_data:
                participant = MeetingParticipant(
                    company=proposal.company,
                    meeting=meeting,
                    **p_data
                )
                participant.full_clean()
                participant.save()

            return meeting


    @classmethod
    def advance_to_site_assessment(cls, proposal: SecurityProposal, user=None) -> SecurityProposal:
        """
        Advances the proposal from MEETING stage to SITE_ASSESSMENT.
        """
        return cls.transition_status(proposal, SecurityProposalStatus.SITE_ASSESSMENT, user=user)

    @classmethod
    def advance_to_final_proposal(cls, proposal: SecurityProposal, user=None) -> SecurityProposal:
        """
        Advances the proposal from SITE_ASSESSMENT stage to FINAL_PROPOSAL.
        Creates a new ProposalVersion (e.g. Version 2 - Final Proposal) if one does not already exist,
        ensuring Version 1 (Initial Proposal) remains preserved and not overwritten.
        """
        from django.db import transaction
        from security_crm.models import ProposalVersion

        if proposal.status != SecurityProposalStatus.SITE_ASSESSMENT and proposal.status != SecurityProposalStatus.FINAL_PROPOSAL:
            raise ValidationError(f"Cannot advance to FINAL_PROPOSAL from status {proposal.status}. Proposal must be in SITE_ASSESSMENT status.")
        
        with transaction.atomic():
            proposal = cls.transition_status(proposal, SecurityProposalStatus.FINAL_PROPOSAL, user=user)

            # Check if an unfrozen Final Proposal version already exists
            final_version = proposal.versions.filter(
                company=proposal.company,
                version_type__icontains='Final Proposal',
                is_frozen=False
            ).first()

            if not final_version:
                # Find highest version number
                latest_version = proposal.versions.filter(company=proposal.company).order_by('-version_number').first()
                next_version_number = (latest_version.version_number + 1) if latest_version else 1
                
                final_version = ProposalVersion(
                    company=proposal.company,
                    proposal=proposal,
                    version_number=next_version_number,
                    version_type='Final Proposal',
                    status=SecurityProposalStatus.FINAL_PROPOSAL,
                    is_frozen=False,
                    notes='Final Commercial Proposal prepared from site security assessment.'
                )
                final_version.full_clean()
                final_version.save()

            return proposal

    @classmethod
    def import_assessment_recommendations(cls, proposal_version: ProposalVersion, user=None, assessment_ids=None):
        """
        Converts selected assessment staffing and equipment recommendations into editable
        final proposal service lines and equipment requirements on the given proposal version.
        Assessment records remain unchanged after import.
        """
        from django.db import transaction
        from security_crm.models import (
            ProposalServiceLine, ContractEquipmentRequirement, SecurityAssessment
        )

        if proposal_version.is_frozen:
            raise ValidationError("Cannot import recommendations into a frozen proposal version.")

        proposal = proposal_version.proposal
        if str(proposal.company_id) != str(proposal_version.company_id):
            raise ValidationError("Company mismatch between proposal and version.")

        assessments = proposal.assessments.filter(company=proposal.company)
        if assessment_ids:
            assessments = assessments.filter(id__in=assessment_ids)

        staffing_imported = 0
        equipment_imported = 0

        with transaction.atomic():
            for assessment in assessments:
                # 1. Staffing recommendations -> ProposalServiceLine
                for staffing_rec in assessment.staffing_recommendations.filter(company=proposal.company):
                    # Check if already imported into this version
                    already_imported = ProposalServiceLine.objects.filter(
                        proposal_version=proposal_version,
                        source_recommendation=staffing_rec
                    ).exists()
                    if not already_imported:
                        loc = staffing_rec.location or assessment.client_location
                        line = ProposalServiceLine(
                            company=proposal_version.company,
                            proposal_version=proposal_version,
                            location=loc,
                            service_type=staffing_rec.service_type,
                            quantity=staffing_rec.quantity,
                            billing_unit='MONTHLY',
                            client_rate=0,
                            single_ot_rate=0,
                            double_ot_rate=0,
                            notes=staffing_rec.shift_coverage_notes or staffing_rec.remarks or '',
                            source_recommendation=staffing_rec
                        )
                        line.full_clean()
                        line.save()
                        staffing_imported += 1

                # 2. Equipment recommendations -> ContractEquipmentRequirement
                for equip_rec in assessment.equipment_recommendations.filter(company=proposal.company):
                    already_imported = ContractEquipmentRequirement.objects.filter(
                        proposal_version=proposal_version,
                        source_recommendation=equip_rec
                    ).exists()
                    if not already_imported:
                        notes_parts = []
                        if equip_rec.location_area:
                            notes_parts.append(f"Area: {equip_rec.location_area}")
                        if equip_rec.purpose:
                            notes_parts.append(f"Purpose: {equip_rec.purpose}")
                        if equip_rec.notes:
                            notes_parts.append(equip_rec.notes)
                        combined_notes = ". ".join(notes_parts)

                        equip = ContractEquipmentRequirement(
                            company=proposal_version.company,
                            proposal_version=proposal_version,
                            location=assessment.client_location,
                            item_name=equip_rec.equipment_name,
                            description=equip_rec.equipment_name,
                            quantity=equip_rec.quantity,
                            unit_rate=0,
                            charge_type='ONE_TIME',
                            notes=combined_notes,
                            source_recommendation=equip_rec
                        )
                        equip.full_clean()
                        equip.save()
                        equipment_imported += 1

        return {
            'staffing_imported': staffing_imported,
            'equipment_imported': equipment_imported
        }

    @classmethod
    def create_final_proposal_revision(cls, proposal: SecurityProposal, base_version_id=None, user=None) -> ProposalVersion:
        """
        Creates a new draft revision for the final proposal (e.g. Version 3, Version 4),
        copying all service lines, equipment, charges, and commercial terms from the base version.
        Previous sent/frozen versions remain strictly immutable.
        """
        from django.db import transaction
        from security_crm.models import (
            ProposalVersion, ProposalServiceLine, ContractEquipmentRequirement,
            ProposalAdditionalCharge
        )

        if proposal.status in [SecurityProposalStatus.REJECTED, SecurityProposalStatus.CANCELLED]:
            raise ValidationError(f"Cannot create revisions for a {proposal.status} proposal.")

        with transaction.atomic():
            base_version = None
            if base_version_id:
                base_version = proposal.versions.filter(id=base_version_id, company=proposal.company).first()
            if not base_version:
                base_version = proposal.versions.filter(company=proposal.company).order_by('-version_number').first()

            latest_version = proposal.versions.filter(company=proposal.company).order_by('-version_number').first()
            next_version_number = (latest_version.version_number + 1) if latest_version else 1

            new_version = ProposalVersion(
                company=proposal.company,
                proposal=proposal,
                version_number=next_version_number,
                version_type=f"Final Proposal (Revision {next_version_number})",
                status=SecurityProposalStatus.FINAL_PROPOSAL,
                is_frozen=False,
                notes=f"Revision based on v{base_version.version_number if base_version else 1}"
            )

            # Copy commercial terms if base_version exists
            if base_version:
                new_version.billing_cycle = base_version.billing_cycle
                new_version.payment_terms = base_version.payment_terms
                new_version.proposal_validity_days = base_version.proposal_validity_days
                new_version.contract_duration_months = base_version.contract_duration_months
                new_version.expected_start_date = base_version.expected_start_date
                new_version.security_deposit = base_version.security_deposit
                new_version.commercial_notes = base_version.commercial_notes
                new_version.terms_and_conditions = base_version.terms_and_conditions
                new_version.discount_type = base_version.discount_type
                new_version.discount_value = base_version.discount_value
                new_version.tax_rate = base_version.tax_rate

            new_version.full_clean()
            new_version.save()

            if base_version:
                # Clone service lines
                for line in base_version.service_lines.filter(company=proposal.company, is_deleted=False):
                    cloned_line = ProposalServiceLine(
                        company=proposal.company,
                        proposal_version=new_version,
                        location=line.location,
                        service_type=line.service_type,
                        quantity=line.quantity,
                        client_rate=line.client_rate,
                        single_ot_rate=line.single_ot_rate,
                        double_ot_rate=line.double_ot_rate,
                        billing_unit=line.billing_unit,
                        notes=line.notes,
                        source_recommendation=line.source_recommendation
                    )
                    cloned_line.full_clean()
                    cloned_line.save()

                # Clone equipment requirements
                for equip in base_version.equipment_requirements.filter(company=proposal.company, is_deleted=False):
                    cloned_equip = ContractEquipmentRequirement(
                        company=proposal.company,
                        proposal_version=new_version,
                        location=equip.location,
                        inventory_item=equip.inventory_item,
                        item_name=equip.item_name,
                        description=equip.description,
                        quantity=equip.quantity,
                        unit_rate=equip.unit_rate,
                        charge_type=equip.charge_type,
                        notes=equip.notes,
                        source_recommendation=equip.source_recommendation
                    )
                    cloned_equip.full_clean()
                    cloned_equip.save()

                # Clone additional charges
                for charge in base_version.additional_charges.filter(company=proposal.company, is_deleted=False):
                    cloned_charge = ProposalAdditionalCharge(
                        company=proposal.company,
                        proposal_version=new_version,
                        charge_name=charge.charge_name,
                        charge_type=charge.charge_type,
                        amount=charge.amount,
                        quantity=charge.quantity,
                        notes=charge.notes
                    )
                    cloned_charge.full_clean()
                    cloned_charge.save()

            # If proposal is currently in AWAITING_APPROVAL or FINAL_PROPOSAL, ensure proposal status is FINAL_PROPOSAL
            if proposal.status == SecurityProposalStatus.AWAITING_APPROVAL:
                proposal.status = SecurityProposalStatus.FINAL_PROPOSAL
                proposal.save(update_fields=['status'])

            return new_version

    @classmethod
    def send_final_proposal_email(cls, proposal: SecurityProposal, email, version_id=None, version_number=None, user=None):
        """
        Orchestrates sending the Final Proposal email:
        1. Validates and identifies the exact ProposalVersion to be sent.
        2. Enforces tenant isolation and workflow state (must be in FINAL_PROPOSAL).
        3. Links OutboundEmail to context.
        4. Calls EmailDeliveryService.send_outbound_email(email).
        5. On delivery success:
           - Freezes THAT exact Final Proposal Version (version.is_frozen = True, sent_at = timezone.now(), sent_by = user).
           - Transitions proposal from FINAL_PROPOSAL -> AWAITING_APPROVAL strictly through cls.transition_status.
           - Returns (True, None, version).
        6. On delivery failure:
           - Proposal remains FINAL_PROPOSAL (never marks as AWAITING_APPROVAL).
           - Version remains unfrozen.
           - Returns (False, error_message, version).
        """
        from communications.services import EmailDeliveryService
        from django.utils import timezone

        # 1. State validation
        if proposal.status in [SecurityProposalStatus.REJECTED, SecurityProposalStatus.CANCELLED]:
            raise ValidationError(f"Cannot send email for a {proposal.status} proposal.")

        # 2. Determine and validate exact proposal version
        version = None
        if version_id:
            version = ProposalVersion.objects.filter(
                id=version_id,
                proposal=proposal,
                company=proposal.company
            ).first()
            if not version:
                raise ValidationError("Specified ProposalVersion not found or does not belong to this proposal/company.")
        elif version_number is not None:
            version = ProposalVersion.objects.filter(
                version_number=version_number,
                proposal=proposal,
                company=proposal.company
            ).first()
            if not version:
                raise ValidationError(f"ProposalVersion #{version_number} not found for this proposal.")
        elif email.context_version_id:
            version = ProposalVersion.objects.filter(
                id=email.context_version_id,
                proposal=proposal,
                company=proposal.company
            ).first()

        if not version:
            version = proposal.versions.filter(company=proposal.company).order_by('-version_number').first()

        if not version:
            raise ValidationError("No valid ProposalVersion found to send for this proposal.")

        # 3. Ensure email has context linkages persisted
        email.context_type = 'security_proposal'
        email.context_id = str(proposal.id)
        email.context_version_id = str(version.id)
        email.save(update_fields=['context_type', 'context_id', 'context_version_id'])

        # 4. Dispatch email delivery
        success, error = EmailDeliveryService.send_outbound_email(email)

        # 5. Handle post-send state atomically
        if success:
            # Freeze THAT specific version only
            if not version.is_frozen:
                version.is_frozen = True
                version.sent_at = timezone.now()
                version.sent_by = user
                version.save(update_fields=['is_frozen', 'sent_at', 'sent_by'])

            # Transition proposal state: FINAL_PROPOSAL -> AWAITING_APPROVAL
            if proposal.status == SecurityProposalStatus.FINAL_PROPOSAL:
                cls.transition_status(proposal, SecurityProposalStatus.AWAITING_APPROVAL, user=user)

            return True, None, version
        else:
            # Failure atomicity: proposal remains in current status, version remains unfrozen
            logger.warning(f"Final Proposal email delivery failed for proposal {proposal.id}: {error}")
            return False, error, version

    # -------------------------------------------------------------
    # PHASE S-2G: APPROVAL, SIGNING & ACTIVE CLIENT CONVERSION
    # -------------------------------------------------------------

    @classmethod
    def approve_proposal(cls, proposal: SecurityProposal, data: dict, user=None) -> SecurityProposal:
        """
        Transitions proposal from AWAITING_APPROVAL (or ON_HOLD) to APPROVED.
        Captures approval metadata (date, contact, method, notes) and records the approved ProposalVersion.
        Prefills initial contract signing dates and commercial references from the approved version.
        Does NOT treat approval as contract signing.
        """
        if proposal.status not in [SecurityProposalStatus.AWAITING_APPROVAL, SecurityProposalStatus.ON_HOLD]:
            raise ValidationError(f"Cannot approve proposal from status {proposal.status}. Must be in AWAITING_APPROVAL.")

        # Identify approved version
        version_id = data.get('version_id')
        approved_version = None
        if version_id:
            approved_version = ProposalVersion.objects.filter(
                id=version_id, proposal=proposal, company=proposal.company
            ).first()
            if not approved_version:
                raise ValidationError("Specified ProposalVersion not found or does not belong to this proposal.")
        else:
            # Pick latest frozen version or highest version
            approved_version = proposal.versions.filter(company=proposal.company, is_frozen=True).order_by('-version_number').first()
            if not approved_version:
                approved_version = proposal.versions.filter(company=proposal.company).order_by('-version_number').first()

        if not approved_version:
            raise ValidationError("A proposal version must exist to approve.")

        approved_date = data.get('approved_date') or timezone.now().date()
        if isinstance(approved_date, str):
            from datetime import datetime
            try:
                approved_date = datetime.strptime(approved_date, '%Y-%m-%d').date()
            except ValueError:
                approved_date = timezone.now().date()

        proposal.approved_version = approved_version
        proposal.approved_date = approved_date
        proposal.approved_by_name = data.get('approved_by_name', '').strip()
        proposal.approval_method = data.get('approval_method', 'EMAIL')
        proposal.approval_notes = data.get('approval_notes', '').strip()

        contact_id = data.get('approved_by_contact')
        if contact_id:
            from crm.models import CRMContact
            contact = CRMContact.objects.filter(id=contact_id, company=proposal.company).first()
            proposal.approved_by_contact = contact

        # Prefill signing / commercial terms from approved version
        proposal.billing_cycle = approved_version.billing_cycle
        proposal.payment_terms = approved_version.payment_terms
        if approved_version.expected_start_date:
            proposal.contract_start_date = approved_version.expected_start_date
            if approved_version.contract_duration_months:
                from datetime import timedelta
                proposal.contract_end_date = approved_version.expected_start_date + timedelta(days=approved_version.contract_duration_months * 30)

        if not proposal.contract_reference:
            proposal.contract_reference = f"SC-{proposal.proposal_number}"

        proposal.save()
        return cls.transition_status(proposal, SecurityProposalStatus.APPROVED, user=user)

    @classmethod
    def reject_proposal(cls, proposal: SecurityProposal, data: dict, user=None) -> SecurityProposal:
        """
        Transitions proposal from AWAITING_APPROVAL (or ON_HOLD) to REJECTED.
        Captures rejection reason, notes, and date.
        """
        if proposal.status not in [SecurityProposalStatus.AWAITING_APPROVAL, SecurityProposalStatus.ON_HOLD, SecurityProposalStatus.SENT, SecurityProposalStatus.MEETING, SecurityProposalStatus.SITE_ASSESSMENT, SecurityProposalStatus.FINAL_PROPOSAL]:
            raise ValidationError(f"Cannot reject proposal from terminal status {proposal.status}.")

        rejection_date = data.get('rejection_date') or timezone.now().date()
        if isinstance(rejection_date, str):
            from datetime import datetime
            try:
                rejection_date = datetime.strptime(rejection_date, '%Y-%m-%d').date()
            except ValueError:
                rejection_date = timezone.now().date()

        proposal.rejection_reason = data.get('rejection_reason', '').strip()
        proposal.rejection_notes = data.get('rejection_notes', '').strip()
        proposal.rejection_date = rejection_date
        proposal.save()

        return cls.transition_status(proposal, SecurityProposalStatus.REJECTED, user=user)

    @classmethod
    def put_proposal_on_hold(cls, proposal: SecurityProposal, data: dict, user=None) -> SecurityProposal:
        """
        Transitions proposal from active states to ON_HOLD.
        Captures on-hold reason, notes, and date.
        """
        if proposal.status in [SecurityProposalStatus.REJECTED, SecurityProposalStatus.CANCELLED]:
            raise ValidationError(f"Cannot put terminal proposal ({proposal.status}) on hold.")

        on_hold_date = data.get('on_hold_date') or timezone.now().date()
        if isinstance(on_hold_date, str):
            from datetime import datetime
            try:
                on_hold_date = datetime.strptime(on_hold_date, '%Y-%m-%d').date()
            except ValueError:
                on_hold_date = timezone.now().date()

        proposal.on_hold_reason = data.get('on_hold_reason', '').strip()
        proposal.on_hold_notes = data.get('on_hold_notes', '').strip()
        proposal.on_hold_date = on_hold_date
        proposal.save()

        return cls.transition_status(proposal, SecurityProposalStatus.ON_HOLD, user=user)

    @classmethod
    def resume_proposal_from_on_hold(cls, proposal: SecurityProposal, target_status: str = None, user=None) -> SecurityProposal:
        """
        Resumes proposal from ON_HOLD back to a valid logical state.
        """
        if proposal.status != SecurityProposalStatus.ON_HOLD:
            raise ValidationError("Proposal is not on hold.")

        if not target_status:
            if proposal.signed_by_client and proposal.signed_by_company:
                target_status = SecurityProposalStatus.SIGNED
            elif proposal.approved_version:
                target_status = SecurityProposalStatus.APPROVED
            else:
                target_status = SecurityProposalStatus.AWAITING_APPROVAL

        return cls.transition_status(proposal, target_status, user=user)

    @classmethod
    def start_signing(cls, proposal: SecurityProposal, data: dict = None, user=None) -> SecurityProposal:
        """
        Transitions proposal from APPROVED to SIGNING.
        Updates contract dates and reference if provided.
        """
        if proposal.status != SecurityProposalStatus.APPROVED:
            raise ValidationError(f"Cannot start signing from status {proposal.status}. Proposal must be APPROVED.")

        if data:
            if 'contract_start_date' in data and data['contract_start_date']:
                proposal.contract_start_date = data['contract_start_date']
            if 'contract_end_date' in data and data['contract_end_date']:
                proposal.contract_end_date = data['contract_end_date']
            if 'billing_cycle' in data and data['billing_cycle']:
                proposal.billing_cycle = data['billing_cycle']
            if 'payment_terms' in data and data['payment_terms']:
                proposal.payment_terms = data['payment_terms']
            if 'expected_mobilization_date' in data and data['expected_mobilization_date']:
                proposal.expected_mobilization_date = data['expected_mobilization_date']
            if 'contract_reference' in data and data['contract_reference']:
                proposal.contract_reference = data['contract_reference']
            if 'signing_notes' in data:
                proposal.signing_notes = data['signing_notes']
            proposal.save()

        return cls.transition_status(proposal, SecurityProposalStatus.SIGNING, user=user)

    @classmethod
    def complete_signing(cls, proposal: SecurityProposal, data: dict, user=None) -> SecurityProposal:
        """
        Transitions proposal from SIGNING to SIGNED.
        Captures signing metadata (client signer, company signer, signing date, notes).
        """
        if proposal.status != SecurityProposalStatus.SIGNING:
            raise ValidationError(f"Cannot complete signing from status {proposal.status}. Proposal must be in SIGNING.")

        signed_by_client = data.get('signed_by_client', '').strip()
        signed_by_company = data.get('signed_by_company', '').strip()

        if not signed_by_client:
            raise ValidationError({'signed_by_client': "Client signatory name is required."})
        if not signed_by_company:
            raise ValidationError({'signed_by_company': "Company signatory name is required."})

        signing_date = data.get('signing_date') or timezone.now().date()
        if isinstance(signing_date, str):
            from datetime import datetime
            try:
                signing_date = datetime.strptime(signing_date, '%Y-%m-%d').date()
            except ValueError:
                signing_date = timezone.now().date()

        proposal.signed_by_client = signed_by_client
        proposal.signed_by_company = signed_by_company
        proposal.signing_date = signing_date

        if 'contract_start_date' in data and data['contract_start_date']:
            proposal.contract_start_date = data['contract_start_date']
        if 'contract_end_date' in data and data['contract_end_date']:
            proposal.contract_end_date = data['contract_end_date']
        if 'billing_cycle' in data and data['billing_cycle']:
            proposal.billing_cycle = data['billing_cycle']
        if 'payment_terms' in data and data['payment_terms']:
            proposal.payment_terms = data['payment_terms']
        if 'expected_mobilization_date' in data and data['expected_mobilization_date']:
            proposal.expected_mobilization_date = data['expected_mobilization_date']
        if 'contract_reference' in data and data['contract_reference']:
            proposal.contract_reference = data['contract_reference']
        if 'signing_notes' in data:
            proposal.signing_notes = data['signing_notes']

        proposal.save()
        return cls.transition_status(proposal, SecurityProposalStatus.SIGNED, user=user)

    @classmethod
    def activate_client(cls, proposal: SecurityProposal, user=None) -> SecurityProposal:
        """
        Transitions proposal from SIGNED to ACTIVE (Active Client Conversion).
        1. Safely and idempotently creates or links the operational ServiceContract.
        2. Preserves all approved client locations by creating/linking OperationalSite instances.
        3. Preserves approved commercial terms and staffing/equipment requirements.
        4. Updates the existing CRMEntity to an active client (entity_type='CUSTOMER').
        5. Strictly idempotent: repeated activation calls will never duplicate ServiceContract or sites.
        """
        if proposal.status not in [SecurityProposalStatus.SIGNED, SecurityProposalStatus.ACTIVE]:
            raise ValidationError(f"Cannot activate client from status {proposal.status}. Proposal must be SIGNED.")

        if proposal.status == SecurityProposalStatus.ACTIVE and proposal.contract:
            # Already active and linked
            return proposal

        from operations.models import ServiceContract, ServiceContractStatus, OperationalSite

        approved_version = proposal.approved_version
        if not approved_version:
            # Fallback to latest frozen or highest version
            approved_version = proposal.versions.filter(company=proposal.company, is_frozen=True).order_by('-version_number').first()
            if not approved_version:
                approved_version = proposal.versions.filter(company=proposal.company).order_by('-version_number').first()

        # 1. Collect all distinct approved ClientLocations from service lines
        client_locations = []
        if approved_version:
            for line in approved_version.service_lines.select_related('location').all():
                if line.location and line.location not in client_locations:
                    client_locations.append(line.location)

        # 2. Find or create OperationalSites for each ClientLocation
        operational_sites = []
        for loc in client_locations:
            site, _ = OperationalSite.objects.get_or_create(
                company=proposal.company,
                crm_entity=proposal.customer,
                name=loc.name,
                defaults={
                    'address': getattr(loc.crm_address, 'street_address', '') if loc.crm_address else (loc.notes or loc.name),
                    'is_active': True
                }
            )
            operational_sites.append(site)

        # 3. Create or link ServiceContract idempotently
        service_contract = proposal.contract
        if not service_contract:
            contract_code = proposal.contract_reference or f"SC-{proposal.proposal_number}"
            
            # Check if matching contract already exists for this company
            existing_contract = ServiceContract.objects.filter(
                company=proposal.company,
                contract_code=contract_code,
                is_deleted=False
            ).first()

            if existing_contract:
                service_contract = existing_contract
            else:
                start_date = proposal.contract_start_date or timezone.now().date()
                end_date = proposal.contract_end_date
                
                service_contract = ServiceContract.objects.create(
                    company=proposal.company,
                    crm_entity=proposal.customer,
                    contract_code=contract_code,
                    start_date=start_date,
                    end_date=end_date,
                    status=ServiceContractStatus.ACTIVE,
                    notes=f"Created automatically from Security Proposal {proposal.proposal_number}."
                )

            # Link sites
            if operational_sites:
                service_contract.sites.add(*operational_sites)

            proposal.contract = service_contract
            proposal.save(update_fields=['contract'])

        # 4. Ensure customer entity_type is CUSTOMER (active client)
        customer = proposal.customer
        if customer:
            if customer.entity_type != 'CUSTOMER':
                customer.entity_type = 'CUSTOMER'
                customer.save(update_fields=['entity_type'])

        # 5. Transition to ACTIVE
        if proposal.status != SecurityProposalStatus.ACTIVE:
            cls.transition_status(proposal, SecurityProposalStatus.ACTIVE, user=user)

        return proposal



