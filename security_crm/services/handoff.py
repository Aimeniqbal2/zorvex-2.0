from decimal import Decimal
from django.utils import timezone
from django.core.exceptions import ValidationError
from security_crm.models import (
    SecurityProposal, SecurityProposalStatus, ProposalVersion,
    ProposalSignedDocument
)
from operations.models import ServiceContract, OperationalSite


class CRMCrossModuleHandoffService:
    """
    Cross-Module Handoff Service for Zorvex ERP 2.0 Security CRM (Phase S-2H).
    Exposes clean, structured contract snapshots from ACTIVE signed clients
    for consumption by downstream security modules (Operations, HRM, Inventory, Purchasing, Finance).
    """

    @classmethod
    def get_active_approved_version(cls, proposal: SecurityProposal) -> ProposalVersion:
        """
        Retrieves the approved ProposalVersion for the proposal.
        Falls back to the latest frozen version or highest version number.
        """
        if proposal.approved_version:
            return proposal.approved_version
        
        frozen = proposal.versions.filter(company=proposal.company, is_frozen=True).order_by('-version_number').first()
        if frozen:
            return frozen
            
        return proposal.versions.filter(company=proposal.company).order_by('-version_number').first()

    @classmethod
    def prepare_cross_module_handoff(cls, proposal: SecurityProposal, user=None, notes: str = '') -> dict:
        """
        Validates readiness and prepares the proposal for downstream consumption.
        Ensures proposal is ACTIVE, ServiceContract is linked, and sets handoff readiness state.
        Strictly idempotent.
        """
        if proposal.status != SecurityProposalStatus.ACTIVE:
            # If currently SIGNED, safely activate first via workflow service
            if proposal.status == SecurityProposalStatus.SIGNED:
                from security_crm.services.workflow import SecurityProposalWorkflowService
                proposal = SecurityProposalWorkflowService.activate_client(proposal, user=user)
            else:
                raise ValidationError(
                    f"Proposal must be in ACTIVE status to prepare cross-module handoff (Current: {proposal.status})."
                )

        if not proposal.contract:
            from security_crm.services.workflow import SecurityProposalWorkflowService
            proposal = SecurityProposalWorkflowService.activate_client(proposal, user=user)

        # Mark handoff readiness
        proposal.is_handoff_ready = True
        proposal.handoff_prepared_at = timezone.now()
        if user and user.is_authenticated:
            proposal.handoff_prepared_by = user
        if notes:
            proposal.handoff_notes = notes
        proposal.save(update_fields=['is_handoff_ready', 'handoff_prepared_at', 'handoff_prepared_by', 'handoff_notes'])

        return cls.get_handoff_summary(proposal)

    @classmethod
    def get_handoff_summary(cls, proposal: SecurityProposal) -> dict:
        """
        Builds and returns the comprehensive cross-module contract snapshot and readiness status.
        """
        version = cls.get_active_approved_version(proposal)
        contract = proposal.contract
        customer = proposal.customer

        # 1. Operational Sites & Locations
        linked_sites = []
        if contract:
            for site in contract.sites.filter(is_deleted=False).order_by('name'):
                linked_sites.append({
                    'id': str(site.id),
                    'name': site.name,
                    'address': site.address or '',
                    'is_active': site.is_active
                })

        # 2. Staffing Demand (HRM Handoff) & Operations Service Requirements
        service_lines_data = []
        hrm_staffing_demand = []
        total_headcount = 0
        total_monthly_service_revenue = Decimal('0.00')

        if version:
            for line in version.service_lines.filter(is_deleted=False).select_related('service_type', 'location', 'source_recommendation'):
                line_tot = line.total
                total_monthly_service_revenue += line_tot
                total_headcount += line.quantity

                loc_name = line.location.name if line.location else 'Primary Site'
                loc_id = str(line.location.id) if line.location else None

                # Find corresponding OperationalSite if any
                matching_site = None
                if linked_sites:
                    matching_site = next((s for s in linked_sites if s['name'] == loc_name), linked_sites[0])

                # Shift / Coverage notes from recommendation if present
                shift_notes = ''
                post_area = ''
                if line.source_recommendation:
                    shift_notes = line.source_recommendation.shift_coverage_notes or ''
                    post_area = line.source_recommendation.post_area or ''

                service_entry = {
                    'line_id': str(line.id),
                    'service_type_id': str(line.service_type.id),
                    'service_type_code': line.service_type.code,
                    'service_type_name': line.service_type.name,
                    'location_id': loc_id,
                    'location_name': loc_name,
                    'operational_site_id': matching_site['id'] if matching_site else None,
                    'operational_site_name': matching_site['name'] if matching_site else loc_name,
                    'quantity': line.quantity,
                    'billing_unit': line.billing_unit,
                    'client_rate': str(line.client_rate),
                    'single_ot_rate': str(line.single_ot_rate),
                    'double_ot_rate': str(line.double_ot_rate),
                    'line_total': str(line_tot),
                    'shift_coverage_notes': shift_notes,
                    'post_area': post_area,
                    'notes': line.notes or ''
                }
                service_lines_data.append(service_entry)

                # HRM Demand Entry
                hrm_staffing_demand.append({
                    'demand_id': f"DEMAND-HR-{line.id}",
                    'location_id': loc_id,
                    'location_name': loc_name,
                    'operational_site_id': matching_site['id'] if matching_site else None,
                    'service_type_id': str(line.service_type.id),
                    'service_type_code': line.service_type.code,
                    'service_type_name': line.service_type.name,
                    'required_headcount': line.quantity,
                    'expected_start_date': str(proposal.contract_start_date or version.expected_start_date or timezone.now().date()),
                    'shift_coverage_notes': shift_notes or line.notes or 'Standard 24/7 or defined shift pattern',
                    'post_area': post_area,
                    'status': 'DEMAND_REGISTERED'
                })

        # 3. Equipment Demand (Inventory & Purchasing Handoff)
        equipment_demand = []
        procurement_demand = []
        total_equipment_quantity = 0

        if version:
            for eq in version.equipment_requirements.filter(is_deleted=False).select_related('location', 'inventory_item'):
                total_equipment_quantity += eq.quantity
                loc_name = eq.location.name if eq.location else 'Main Facility'
                loc_id = str(eq.location.id) if eq.location else None

                matching_site = None
                if linked_sites:
                    matching_site = next((s for s in linked_sites if s['name'] == loc_name), linked_sites[0])

                item_display = eq.item_name or eq.description or (eq.inventory_item.brand + ' ' + eq.inventory_item.model_name if eq.inventory_item else 'Security Equipment')

                eq_entry = {
                    'requirement_id': str(eq.id),
                    'inventory_item_id': str(eq.inventory_item.id) if eq.inventory_item else None,
                    'item_name': item_display,
                    'description': eq.description or '',
                    'location_id': loc_id,
                    'location_name': loc_name,
                    'operational_site_id': matching_site['id'] if matching_site else None,
                    'quantity': eq.quantity,
                    'unit_rate': str(eq.unit_rate),
                    'line_total': str(eq.line_total),
                    'charge_type': eq.charge_type,
                    'required_date': str(proposal.expected_mobilization_date or proposal.contract_start_date or timezone.now().date()),
                    'notes': eq.notes or '',
                    'status': 'EQUIPMENT_DEMAND_READY'
                }
                equipment_demand.append(eq_entry)

                # Purchasing demand entry
                procurement_demand.append({
                    'procurement_demand_id': f"DEMAND-PUR-{eq.id}",
                    'item_name': item_display,
                    'required_quantity': eq.quantity,
                    'location_name': loc_name,
                    'required_by_date': str(proposal.expected_mobilization_date or proposal.contract_start_date or timezone.now().date()),
                    'charge_type': eq.charge_type,
                    'estimated_unit_cost': str(eq.unit_rate),
                    'estimated_total_cost': str(eq.line_total),
                    'status': 'PROCUREMENT_DEMAND_REGISTERED'
                })

        # 4. Commercial Snapshot & Additional Charges (Finance Handoff)
        additional_charges_data = []
        if version:
            for ch in version.additional_charges.filter(is_deleted=False):
                additional_charges_data.append({
                    'id': str(ch.id),
                    'charge_name': ch.charge_name,
                    'charge_type': ch.charge_type,
                    'amount': str(ch.amount),
                    'quantity': ch.quantity,
                    'line_total': str(ch.line_total),
                    'notes': ch.notes or ''
                })

        # 5. Signed Documents Repository
        signed_docs_data = []
        for doc in proposal.signed_documents.filter(is_deleted=False).order_by('-created_at'):
            signed_docs_data.append({
                'id': str(doc.id),
                'title': doc.title,
                'document_type': doc.document_type,
                'document_type_display': doc.get_document_type_display(),
                'file_url': doc.file.url if doc.file else '',
                'notes': doc.notes or '',
                'uploaded_at': doc.created_at.isoformat() if doc.created_at else None,
                'uploaded_by_name': doc.uploaded_by.get_full_name() or doc.uploaded_by.username if doc.uploaded_by else ''
            })

        # 6. Readiness Checklist & Indicators
        is_active = proposal.status == SecurityProposalStatus.ACTIVE
        has_contract = contract is not None
        has_sites = len(linked_sites) > 0
        has_staffing = len(service_lines_data) > 0
        has_documents = len(signed_docs_data) > 0
        version_locked = bool(version and version.is_frozen)

        readiness_checklist = {
            'crm_lifecycle_completed': is_active,
            'service_contract_linked': has_contract,
            'operational_sites_linked': has_sites,
            'approved_version_locked': version_locked,
            'signed_documents_present': has_documents,
            'operations_ready': is_active and has_contract and has_sites and has_staffing,
            'hr_demand_ready': is_active and has_staffing,
            'inventory_demand_ready': is_active and len(equipment_demand) > 0,
            'purchasing_demand_ready': is_active and len(procurement_demand) > 0,
            'finance_commercial_ready': is_active and version_locked,
            'overall_handoff_ready': proposal.is_handoff_ready or (is_active and has_contract and has_sites)
        }

        # 7. Construct Full Master Handoff Payload
        return {
            'proposal_id': str(proposal.id),
            'proposal_number': proposal.proposal_number,
            'status': proposal.status,
            'is_handoff_ready': proposal.is_handoff_ready,
            'handoff_prepared_at': proposal.handoff_prepared_at.isoformat() if proposal.handoff_prepared_at else None,
            'handoff_prepared_by_name': proposal.handoff_prepared_by.get_full_name() or proposal.handoff_prepared_by.username if proposal.handoff_prepared_by else '',
            'handoff_notes': proposal.handoff_notes,

            # Client Entity
            'client': {
                'id': str(customer.id) if customer else None,
                'name': customer.name if customer else 'Client',
                'entity_type': customer.entity_type if customer else 'CUSTOMER',
                'email': getattr(customer, 'email', '') or '',
                'phone': getattr(customer, 'phone', '') or '',
                'approved_contact_name': proposal.approved_by_name or (proposal.approved_by_contact.get_full_name() if proposal.approved_by_contact else ''),
                'approval_method': proposal.approval_method,
                'approved_date': str(proposal.approved_date) if proposal.approved_date else None,
                'signing_date': str(proposal.signing_date) if proposal.signing_date else None,
                'signed_by_client': proposal.signed_by_client,
                'signed_by_company': proposal.signed_by_company
            },

            # Service Contract Source of Truth
            'service_contract': {
                'id': str(contract.id) if contract else None,
                'contract_code': contract.contract_code if contract else (proposal.contract_reference or f"SC-{proposal.proposal_number}"),
                'status': contract.status if contract else 'ACTIVE',
                'start_date': str(contract.start_date if contract else (proposal.contract_start_date or timezone.now().date())),
                'end_date': str(contract.end_date if contract else proposal.contract_end_date) if (contract and contract.end_date) or proposal.contract_end_date else None,
                'billing_cycle': proposal.billing_cycle or 'MONTHLY',
                'payment_terms': proposal.payment_terms or 'NET_30',
                'expected_mobilization_date': str(proposal.expected_mobilization_date) if proposal.expected_mobilization_date else None,
                'contract_reference': proposal.contract_reference or '',
                'notes': contract.notes if contract else proposal.signing_notes
            },

            # Approved Version Details
            'approved_version': {
                'id': str(version.id) if version else None,
                'version_number': version.version_number if version else 1,
                'version_type': version.version_type if version else 'Final Proposal',
                'is_frozen': version.is_frozen if version else True,
                'subtotal': str(version.subtotal) if version else '0.00',
                'discount_amount': str(version.discount_amount) if version else '0.00',
                'tax_amount': str(version.tax_amount) if version else '0.00',
                'grand_total': str(version.grand_total) if version else '0.00'
            },

            # Multi-Location Operational Sites
            'operational_sites': linked_sites,

            # 1. OPERATIONS HANDOFF SNAPSHOT
            'operations_handoff': {
                'module_target': 'Security Operations & Dispatch',
                'readiness_status': 'OPERATIONS_READY' if readiness_checklist['operations_ready'] else 'PENDING_PREREQUISITES',
                'contract_code': contract.contract_code if contract else (proposal.contract_reference or f"SC-{proposal.proposal_number}"),
                'expected_mobilization_date': str(proposal.expected_mobilization_date) if proposal.expected_mobilization_date else str(proposal.contract_start_date or timezone.now().date()),
                'contract_start_date': str(proposal.contract_start_date or timezone.now().date()),
                'contract_end_date': str(proposal.contract_end_date) if proposal.contract_end_date else None,
                'operational_sites': linked_sites,
                'service_requirements': service_lines_data,
                'total_guard_posts': total_headcount,
                'total_operational_sites': len(linked_sites),
                'instructions': 'Import contracted guard posts and site coverage to setup shifts, beats, and post orders.'
            },

            # 2. HRM HANDOFF SNAPSHOT
            'hrm_handoff': {
                'module_target': 'Security HRM & Workforce',
                'readiness_status': 'STAFFING_DEMAND_READY' if readiness_checklist['hr_demand_ready'] else 'PENDING_PREREQUISITES',
                'total_required_headcount': total_headcount,
                'expected_deployment_date': str(proposal.expected_mobilization_date or proposal.contract_start_date or timezone.now().date()),
                'staffing_demand': hrm_staffing_demand,
                'instructions': 'Import staffing demand per location/post to allocate deployable security personnel and verify certifications.'
            },

            # 3. INVENTORY HANDOFF SNAPSHOT
            'inventory_handoff': {
                'module_target': 'Security Inventory & Armory',
                'readiness_status': 'EQUIPMENT_DEMAND_READY' if readiness_checklist['inventory_demand_ready'] else 'NO_EQUIPMENT_DEMAND',
                'total_equipment_quantity': total_equipment_quantity,
                'required_by_date': str(proposal.expected_mobilization_date or proposal.contract_start_date or timezone.now().date()),
                'equipment_demand': equipment_demand,
                'instructions': 'Review equipment demand for uniforms, radios, metal detectors, and tactical gear to plan site issuance.'
            },

            # 4. PURCHASING HANDOFF SNAPSHOT
            'purchasing_handoff': {
                'module_target': 'Purchasing & Procurement',
                'readiness_status': 'PROCUREMENT_DEMAND_READY' if readiness_checklist['purchasing_demand_ready'] else 'NO_PROCUREMENT_DEMAND',
                'total_items_to_procure': total_equipment_quantity,
                'procurement_demand': procurement_demand,
                'instructions': 'Review procurement demand for client-required equipment that must be acquired from external vendors.'
            },

            # 5. FINANCE HANDOFF SNAPSHOT
            'finance_handoff': {
                'module_target': 'Security Finance & Invoicing',
                'readiness_status': 'COMMERCIAL_DATA_READY' if readiness_checklist['finance_commercial_ready'] else 'PENDING_PREREQUISITES',
                'billing_cycle': proposal.billing_cycle or 'MONTHLY',
                'payment_terms': proposal.payment_terms or 'NET_30',
                'contract_start_date': str(proposal.contract_start_date or timezone.now().date()),
                'contract_end_date': str(proposal.contract_end_date) if proposal.contract_end_date else None,
                'service_billing_rates': [
                    {
                        'service_type': l['service_type_name'],
                        'location': l['location_name'],
                        'quantity': l['quantity'],
                        'client_rate': l['client_rate'],
                        'single_ot_rate': l['single_ot_rate'],
                        'double_ot_rate': l['double_ot_rate'],
                        'billing_unit': l['billing_unit'],
                        'line_total': l['line_total']
                    } for l in service_lines_data
                ],
                'additional_charges': additional_charges_data,
                'subtotal_monthly_recurring': str(version.total_monthly_recurring) if version else '0.00',
                'total_one_time': str(version.total_one_time) if version else '0.00',
                'discount_amount': str(version.discount_amount) if version else '0.00',
                'tax_rate': str(version.tax_rate) if version else '0.00',
                'tax_amount': str(version.tax_amount) if version else '0.00',
                'grand_total': str(version.grand_total) if version else '0.00',
                'instructions': 'Consume approved billing schedule, overtime multipliers, and recurring lines for monthly billing generation.'
            },

            # Signed Documents
            'signed_documents': signed_docs_data,

            # Master Checklist
            'readiness_checklist': readiness_checklist
        }
