"""
operations/services/cross_module_integration_service.py

Phase S-8: Security Industry Cross-Module Integration & Exception Engine.

Coordinates controlled, authoritative handoffs between:
- Security CRM (Commercial Client & Contract Activation)
- Core Operations & Workforce (Sites, Posts, Deployments, Rosters)
- HRM & Payroll (Attendance, DailyDutyPay, Calculations, Runs)
- Security Inventory (Universal Balances, Custody, Incidents, Shortages)
- Purchasing (Purchase Requests, GRN Intake, 3-Way Matching, AP)
- Finance (Receivables, Payables, Payroll Liability Recognition, General Ledger)

RULES:
1. No duplicate tables, parallel balances, or separate movement ledgers.
2. Cross-module reads consume existing authoritative source-of-truth records.
3. Employee compensation / payroll amounts remain completely separate from client billing.
4. Handoff operations are strictly idempotent and tenant-isolated.
"""
from datetime import date, timedelta
from decimal import Decimal
import logging
from typing import Optional, Dict, Any, List

from django.db import transaction
from django.db.models import Count, Q, Sum
from django.utils import timezone
from django.core.exceptions import ValidationError

from companies.models import Company
from crm.models import CRMEntity
from operations.models import (
    ServiceContract, OperationalSite, SecurityPost, Deployment, DeploymentStatus,
    DutyRoster, DutyRosterStatus, DutyReplacement,
    DailyDutyPay, DailyPayCalculationStatus,
    EmployeePayrollCalculation, PayrollCalculationStatus,
    EquipmentIssue, EquipmentIncident, IncidentReport,
    SupervisorInspection, OperationsEscalation
)
from hrm.models import (
    Employee, WorkforceAttendance, AttendanceStatus,
    JumpRecord, JumpRecordStatus, PayrollRun, PayrollRunStatus, Payslip
)
from inventory.models import Item, InventoryBalance, ItemSerial
from purchasing.models import ProcurementDocument, ProcurementLine, ProcurementAuditTrail
from billing.models import ServiceInvoice, ServiceInvoiceLine, ServiceInvoiceStatus

logger = logging.getLogger(__name__)


def _parse_date(d):
    if isinstance(d, str):
        return date.fromisoformat(d)
    elif hasattr(d, 'date'):
        return d.date()
    elif isinstance(d, date):
        return d
    return timezone.now().date()


class CrossModuleIntegrationService:
    """
    Authoritative cross-module coordinator and exception intelligence hub.
    """

    # =========================================================================
    # 1. CROSS-MODULE ACTION CENTER (EXCEPTION HUBS)
    # =========================================================================

    @classmethod
    def get_action_center_exceptions(cls, company_id, target_date=None) -> List[Dict[str, Any]]:
        """
        Consolidates the 11 authoritative cross-module handoff exceptions:
        1. Signed/active contract without site
        2. Site without manpower setup (posts/requirements)
        3. Site/post vacancies
        4. Rostered absence without replacement
        5. Unresolved DailyDutyPay
        6. Blocked payroll calculations
        7. Inventory shortage / low stock below reorder level
        8. Unresolved critical equipment incident
        9. Purchasing / GRN intake mismatch
        10. Finance handoff pending (payroll liability / draft invoice)
        11. Critical operations escalation
        """
        d = _parse_date(target_date)
        exceptions: List[Dict[str, Any]] = []

        # ---------------------------------------------------------------------
        # 1. Signed/Active Contract Without Site (CRM -> Operations)
        # ---------------------------------------------------------------------
        contracts_without_site = ServiceContract.objects.filter(
            company_id=company_id,
            status='ACTIVE',
            sites__isnull=True,
            is_deleted=False
        ).select_related('crm_entity')

        for sc in contracts_without_site[:10]:
            exceptions.append({
                'id': f"exc_crm_sc_{sc.id}",
                'owning_module': 'CRM',
                'category': 'CONTRACT_WITHOUT_SITE',
                'severity': 'HIGH',
                'status': 'OPEN',
                'title': f"Contract Without Site: {sc.contract_code}",
                'description': f"Active client contract '{sc.contract_code}' ({sc.crm_entity.name if sc.crm_entity else 'Unknown Client'}) has no linked operational sites.",
                'source_type': 'SERVICE_CONTRACT',
                'source_id': str(sc.id),
                'target_workspace': 'contracts',
                'action_label': 'Configure Operational Site'
            })

        # ---------------------------------------------------------------------
        # 2. Site Without Manpower Setup (Operations)
        # ---------------------------------------------------------------------
        active_sites = OperationalSite.objects.filter(
            company_id=company_id,
            is_active=True,
            is_deleted=False
        ).annotate(
            posts_count=Count('security_posts', filter=Q(security_posts__is_deleted=False)),
            reqs_count=Count('staffing_requirements', filter=Q(staffing_requirements__is_deleted=False))
        ).filter(posts_count=0, reqs_count=0).select_related('crm_entity')

        for site in active_sites[:10]:
            exceptions.append({
                'id': f"exc_ops_site_{site.id}",
                'owning_module': 'OPERATIONS',
                'category': 'SITE_WITHOUT_MANPOWER',
                'severity': 'HIGH',
                'status': 'OPEN',
                'title': f"Site Lacks Manpower Setup: {site.name}",
                'description': f"Active operational site '{site.name}' ({site.crm_entity.name if site.crm_entity else 'Direct'}) has zero security posts and no staffing requirements.",
                'source_type': 'OPERATIONAL_SITE',
                'source_id': str(site.id),
                'target_workspace': 'sites',
                'action_label': 'Setup Posts & Requirements'
            })

        # ---------------------------------------------------------------------
        # 3. Site / Post Vacancies (Contract -> Workforce)
        # ---------------------------------------------------------------------
        active_posts = SecurityPost.objects.filter(
            company_id=company_id,
            is_active=True,
            is_deleted=False
        ).select_related('site', 'required_designation')

        for post in active_posts:
            active_deps = Deployment.objects.filter(
                company_id=company_id,
                site=post.site,
                post=post,
                status=DeploymentStatus.ACTIVE,
                is_deleted=False
            ).count()
            if active_deps < post.required_headcount:
                vac = post.required_headcount - active_deps
                exceptions.append({
                    'id': f"exc_post_vac_{post.id}",
                    'owning_module': 'OPERATIONS',
                    'category': 'POST_VACANCY',
                    'severity': 'HIGH',
                    'status': 'OPEN',
                    'title': f"Post Vacancy: {post.post_name}",
                    'description': f"Post '{post.post_name}' at {post.site.name} requires {post.required_headcount} guard(s) but has {active_deps} deployed ({vac} vacant).",
                    'source_type': 'SECURITY_POST',
                    'source_id': str(post.id),
                    'target_workspace': 'deployments',
                    'action_label': 'Deploy Guard'
                })

        # ---------------------------------------------------------------------
        # 4. Rostered Absence Without Replacement (Workforce Execution)
        # ---------------------------------------------------------------------
        rostered_today = DutyRoster.objects.filter(
            company_id=company_id,
            duty_date=d,
            status=DutyRosterStatus.SCHEDULED,
            is_deleted=False
        ).select_related('employee', 'site', 'post', 'shift')

        for r in rostered_today:
            att = WorkforceAttendance.objects.filter(
                company_id=company_id,
                employee=r.employee,
                date=d,
                is_deleted=False
            ).first()

            if att and str(att.status).upper() in ['ABSENT', 'LEAVE', 'ON_LEAVE']:
                # Check if replacement assigned
                has_replacement = DutyReplacement.objects.filter(
                    company_id=company_id,
                    original_employee=r.employee,
                    duty_date=d,
                    is_deleted=False
                ).exists() or r.replacement_duties.filter(is_deleted=False).exists()

                if not has_replacement:
                    exceptions.append({
                        'id': f"exc_unc_abs_{r.id}",
                        'owning_module': 'OPERATIONS',
                        'category': 'UNCOVERED_ABSENCE',
                        'severity': 'CRITICAL',
                        'status': 'OPEN',
                        'title': f"Uncovered Absence: {r.employee.full_name}",
                        'description': f"Rostered guard {r.employee.full_name} is {att.get_status_display()} at {r.site.name} ({r.post.post_name if r.post else 'Main'}) without replacement.",
                        'source_type': 'DUTY_ROSTER',
                        'source_id': str(r.id),
                        'target_workspace': 'roster',
                        'action_label': 'Assign Replacement'
                    })

        # ---------------------------------------------------------------------
        # 5. Unresolved DailyDutyPay (Operations -> Payroll)
        # ---------------------------------------------------------------------
        unresolved_pays = DailyDutyPay.objects.filter(
            company_id=company_id,
            calculation_status=DailyPayCalculationStatus.UNRESOLVED,
            is_deleted=False
        ).select_related('employee', 'site')

        for udp in unresolved_pays[:10]:
            exceptions.append({
                'id': f"exc_udp_{udp.id}",
                'owning_module': 'OPERATIONS',
                'category': 'UNRESOLVED_DUTY_PAY',
                'severity': 'CRITICAL',
                'status': 'OPEN',
                'title': f"Unresolved Pay Rate: {udp.employee.full_name if udp.employee else 'Guard'}",
                'description': f"Duty date {udp.duty_date}: {udp.unresolved_reason or 'Missing compensation rate or contract rate bridge.'}",
                'source_type': 'DAILY_DUTY_PAY',
                'source_id': str(udp.id),
                'target_workspace': 'daily_pay',
                'action_label': 'Resolve Compensation Rate'
            })

        # ---------------------------------------------------------------------
        # 6. Blocked Payroll Calculations (HRM / Payroll)
        # ---------------------------------------------------------------------
        blocked_calcs = EmployeePayrollCalculation.objects.filter(
            company_id=company_id,
            is_deleted=False
        ).filter(
            Q(status=PayrollCalculationStatus.BLOCKED) | Q(has_blockers=True)
        ).select_related('employee')

        for bc in blocked_calcs[:10]:
            exceptions.append({
                'id': f"exc_blk_calc_{bc.id}",
                'owning_module': 'HRM',
                'category': 'BLOCKED_PAYROLL',
                'severity': 'CRITICAL',
                'status': 'OPEN',
                'title': f"Blocked Payroll Calculation: {bc.employee.full_name if bc.employee else 'Employee'}",
                'description': f"Period {bc.period_start} to {bc.period_end}: {', '.join(bc.blocking_reasons[:2]) if bc.blocking_reasons else 'Unresolved calculations'}",
                'source_type': 'PAYROLL_CALCULATION',
                'source_id': str(bc.id),
                'target_workspace': 'payroll_prep',
                'action_label': 'Review Blockers'
            })

        # ---------------------------------------------------------------------
        # 7. Inventory Shortages / Reorder Needs (Inventory -> Purchasing)
        # ---------------------------------------------------------------------
        tracked_items = Item.objects.filter(
            company_id=company_id,
            is_active=True,
            track_inventory=True,
            is_deleted=False
        )

        for item in tracked_items:
            stock_qty = item.balances.aggregate(total=Sum('quantity'))['total'] or Decimal('0.00')
            threshold = item.reorder_level if item.reorder_level > 0 else item.minimum_stock_level
            if threshold > 0 and stock_qty <= threshold:
                exceptions.append({
                    'id': f"exc_inv_shortage_{item.id}",
                    'owning_module': 'INVENTORY',
                    'category': 'INVENTORY_SHORTAGE',
                    'severity': 'HIGH',
                    'status': 'OPEN',
                    'title': f"Low Stock Shortage: {item.name}",
                    'description': f"Current balance is {stock_qty} {item.unit_of_measure} (Threshold: {threshold} {item.unit_of_measure}). Reorder required.",
                    'source_type': 'ITEM',
                    'source_id': str(item.id),
                    'target_workspace': 'security_inventory',
                    'action_label': 'Create Purchase Request'
                })

        # ---------------------------------------------------------------------
        # 8. Unresolved Critical Equipment Incident (Operations -> Inventory)
        # ---------------------------------------------------------------------
        open_equipment_incidents = EquipmentIncident.objects.filter(
            company_id=company_id,
            status__in=['REPORTED', 'UNDER_INVESTIGATION'],
            is_deleted=False
        ).select_related('item', 'employee', 'site')

        for eqi in open_equipment_incidents[:10]:
            is_lost = eqi.incident_type == 'LOST'
            exceptions.append({
                'id': f"exc_eq_inc_{eqi.id}",
                'owning_module': 'OPERATIONS',
                'category': 'UNRESOLVED_EQUIPMENT_INCIDENT',
                'severity': 'CRITICAL' if is_lost else 'HIGH',
                'status': 'OPEN',
                'title': f"{eqi.get_incident_type_display()} Equipment: {eqi.item.name if eqi.item else 'Item'}",
                'description': f"{eqi.quantity} unit(s) reported {eqi.get_incident_type_display().lower()} on {eqi.incident_date} by {eqi.employee.full_name if eqi.employee else 'Staff'}. Awaiting write-off/recovery resolution.",
                'source_type': 'EQUIPMENT_INCIDENT',
                'source_id': str(eqi.id),
                'target_workspace': 'security_inventory',
                'action_label': 'Resolve Incident'
            })

        # ---------------------------------------------------------------------
        # 9. Purchasing / GRN Mismatch (Purchasing -> Inventory)
        # ---------------------------------------------------------------------
        draft_grns = ProcurementDocument.objects.filter(
            company_id=company_id,
            document_type='GOODS_RECEIPT',
            status='DRAFT',
            is_deleted=False
        ).select_related('vendor', 'parent_document')

        for grn in draft_grns[:10]:
            exceptions.append({
                'id': f"exc_pur_grn_{grn.id}",
                'owning_module': 'PURCHASING',
                'category': 'PURCHASING_GRN_MISMATCH',
                'severity': 'MEDIUM',
                'status': 'OPEN',
                'title': f"Draft Goods Receipt: {grn.number}",
                'description': f"GRN for PO '{grn.parent_document.number if grn.parent_document else 'Direct'}' is unposted. Stock has not been taken into inventory balances.",
                'source_type': 'PROCUREMENT_DOCUMENT',
                'source_id': str(grn.id),
                'target_workspace': 'purchasing',
                'action_label': 'Post Goods Receipt'
            })

        # ---------------------------------------------------------------------
        # 10. Finance Handoff Pending (Payroll / Billing -> Finance)
        # ---------------------------------------------------------------------
        # Finalized payroll runs without financial liability
        finalized_runs = PayrollRun.objects.filter(
            company_id=company_id,
            status=PayrollRunStatus.FINALIZED,
            is_deleted=False
        )

        for pr in finalized_runs[:5]:
            try:
                from finance.models import PayrollAccountingIntegration
                integ = PayrollAccountingIntegration.objects.filter(
                    company_id=company_id,
                    payroll_run=pr,
                    is_deleted=False
                ).first()
                if not integ or not integ.journal_entry:
                    exceptions.append({
                        'id': f"exc_fin_pr_{pr.id}",
                        'owning_module': 'FINANCE',
                        'category': 'FINANCE_HANDOFF_PENDING',
                        'severity': 'HIGH',
                        'status': 'OPEN',
                        'title': f"Payroll Finance Handoff Pending: Run {pr.run_number}",
                        'description': f"Finalized payroll run {pr.run_number} (Net: PKR {pr.net_payroll}) has not been posted to General Ledger liabilities.",
                        'source_type': 'PAYROLL_RUN',
                        'source_id': str(pr.id),
                        'target_workspace': 'payroll_runs',
                        'action_label': 'Recognize Finance Liability'
                    })
            except Exception:
                pass

        # Unposted draft ServiceInvoices
        draft_invoices = ServiceInvoice.objects.filter(
            company_id=company_id,
            status=ServiceInvoiceStatus.DRAFT,
            is_deleted=False
        ).select_related('service_contract', 'crm_entity')

        for inv in draft_invoices[:5]:
            exceptions.append({
                'id': f"exc_fin_inv_{inv.id}",
                'owning_module': 'FINANCE',
                'category': 'DRAFT_SERVICE_INVOICE',
                'severity': 'MEDIUM',
                'status': 'OPEN',
                'title': f"Draft Client Invoice: {inv.invoice_number}",
                'description': f"Service invoice for {inv.crm_entity.name if inv.crm_entity else 'Client'} (Total: PKR {inv.total_amount}) is in draft status and unposted to AR.",
                'source_type': 'SERVICE_INVOICE',
                'source_id': str(inv.id),
                'target_workspace': 'billing',
                'action_label': 'Post Invoice'
            })

        # ---------------------------------------------------------------------
        # 11. Unresolved Critical Operations Escalation (Advanced Operations)
        # ---------------------------------------------------------------------
        critical_escalations = OperationsEscalation.objects.filter(
            company_id=company_id,
            status__in=['OPEN', 'IN_PROGRESS'],
            priority__in=['CRITICAL', 'HIGH'],
            is_deleted=False
        ).select_related('site', 'assigned_to')

        for esc in critical_escalations[:10]:
            exceptions.append({
                'id': f"exc_ops_esc_{esc.id}",
                'owning_module': 'OPERATIONS',
                'category': 'CRITICAL_ESCALATION',
                'severity': esc.priority,
                'status': esc.status,
                'title': f"Critical Escalation: {esc.title}",
                'description': f"[{esc.get_source_type_display()}] at {esc.site.name}: {esc.description[:120]}...",
                'source_type': 'OPERATIONS_ESCALATION',
                'source_id': str(esc.id),
                'target_workspace': 'advanced_ops',
                'action_label': 'Resolve Escalation'
            })

        # Sort exceptions by severity: CRITICAL first, then HIGH, then MEDIUM
        severity_rank = {'CRITICAL': 1, 'HIGH': 2, 'MEDIUM': 3, 'LOW': 4}
        exceptions.sort(key=lambda x: severity_rank.get(x['severity'], 5))

        return exceptions

    @classmethod
    @transaction.atomic
    def resolve_action_center_exception(
        cls,
        company_id,
        source_type: str,
        source_id: str,
        action: str = 'ACKNOWLEDGE',
        user=None,
        notes: str = '',
        extra_params: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Authoritative Action Center Resolution Bridge.
        Guarantees module lifecycle integrity:
        1. An integration exception NEVER directly bypasses an owning module's lifecycle or mutates unrelated source state generically.
        2. If action is 'ACKNOWLEDGE' or 'DISMISS', records acknowledgment without mutating domain state.
        3. If action is 'RESOLVE_VIA_MODULE' (or module-specific action), delegates strictly to the authoritative owning module:
           - EQUIPMENT_INCIDENT -> SecurityInventoryService.resolve_incident(...)
           - EMERGENCY_EVENT -> AdvancedOperationsService.resolve_emergency(...)
           - OPERATIONS_ESCALATION -> OperationsEscalation update / AdvancedOperationsService
           - PAYROLL_RUN -> PayrollFinanceService.create_payroll_liability_journal(...)
           - DAILY_DUTY_PAY -> duty_pay_service.recalculate_daily_duty_pay(...)
           - BILLING_SHEET -> invoice_generator_service.generate_client_invoice_from_sheet(...)
        """
        extra_params = extra_params or {}
        action_normalized = (action or 'ACKNOWLEDGE').upper().strip()

        # 1. Passive / Non-mutating resolutions: ACKNOWLEDGE or DISMISS
        if action_normalized in ['ACKNOWLEDGE', 'DISMISS']:
            return {
                'status': action_normalized,
                'owning_module': 'ACTION_CENTER',
                'source_type': source_type,
                'source_id': str(source_id),
                'notes': notes,
                'resolved_by': str(user) if user else None,
                'resolved_at': timezone.now().isoformat(),
                'message': f"Exception for {source_type} ({source_id}) {action_normalized.lower()}ed successfully without mutating source lifecycle."
            }

        # 2. Authoritative Owning-Module Dispatch
        src_upper = (source_type or '').upper().strip()

        if src_upper == 'EQUIPMENT_INCIDENT':
            from operations.services.security_inventory_service import SecurityInventoryService
            incident = SecurityInventoryService.resolve_incident(
                company=company_id,
                incident_id=source_id,
                resolution_status=extra_params.get('resolution_status', 'APPROVED_WRITE_OFF'),
                approved_resolution=notes or 'Resolved via Action Center integration',
                user=user,
                payroll_deduction_recommended=extra_params.get('payroll_deduction_recommended', False),
                payroll_deduction_amount=extra_params.get('payroll_deduction_amount', Decimal('0.00'))
            )
            return {
                'status': 'RESOLVED',
                'owning_module': 'INVENTORY',
                'source_type': source_type,
                'source_id': str(source_id),
                'message': f"Equipment incident {incident.id} resolved via SecurityInventoryService.",
                'result': {'incident_id': str(incident.id), 'status': incident.status}
            }

        elif src_upper == 'EMERGENCY_EVENT':
            from operations.services.advanced_operations_service import AdvancedOperationsService
            emergency = AdvancedOperationsService.resolve_emergency(
                company=company_id,
                emergency_id=source_id,
                user=user,
                resolution_summary=notes or 'Emergency resolved via Action Center integration',
                is_false_alarm=extra_params.get('is_false_alarm', False)
            )
            return {
                'status': 'RESOLVED',
                'owning_module': 'OPERATIONS',
                'source_type': source_type,
                'source_id': str(source_id),
                'message': f"Emergency event {emergency.id} resolved via AdvancedOperationsService.",
                'result': {'emergency_id': str(emergency.id), 'status': emergency.status}
            }

        elif src_upper == 'OPERATIONS_ESCALATION':
            from operations.models import OperationsEscalation, EscalationStatus
            esc = OperationsEscalation.objects.select_for_update().get(id=source_id, company_id=company_id)
            esc.status = EscalationStatus.RESOLVED
            esc.resolved_at = timezone.now()
            esc.resolution_notes = notes or 'Escalation resolved via Action Center integration'
            esc.save(update_fields=['status', 'resolved_at', 'resolution_notes'])
            return {
                'status': 'RESOLVED',
                'owning_module': 'OPERATIONS',
                'source_type': source_type,
                'source_id': str(source_id),
                'message': f"Escalation {esc.id} marked resolved.",
                'result': {'escalation_id': str(esc.id), 'status': esc.status}
            }

        elif src_upper == 'PAYROLL_RUN':
            from finance.services.payroll_finance_service import PayrollFinanceService
            from operations.models import PayrollRun
            pr = PayrollRun.objects.get(id=source_id, company_id=company_id)
            integ = PayrollFinanceService.create_payroll_liability_journal(
                company_id=company_id,
                payroll_run=pr,
                user=user
            )
            return {
                'status': 'RESOLVED',
                'owning_module': 'FINANCE',
                'source_type': source_type,
                'source_id': str(source_id),
                'message': f"Payroll liability recognized in General Ledger for run {pr.run_number}.",
                'result': {'integration_id': str(integ.id), 'status': integ.status}
            }

        elif src_upper == 'DAILY_DUTY_PAY':
            from operations.services.duty_pay_service import recalculate_daily_duty_pay
            pay_rec = recalculate_daily_duty_pay(company=company_id, pay_record_id=source_id, user=user)
            return {
                'status': 'RESOLVED',
                'owning_module': 'WORKFORCE',
                'source_type': source_type,
                'source_id': str(source_id),
                'message': f"Daily duty pay record recalculated via duty_pay_service.",
                'result': {'pay_record_id': str(pay_rec.id), 'status': pay_rec.calculation_status}
            }

        elif src_upper == 'BILLING_SHEET':
            from billing.services.invoice_generator_service import generate_client_invoice_from_sheet
            from billing.models import BillingSheet
            sheet = BillingSheet.objects.get(id=source_id, company_id=company_id)
            invoice = generate_client_invoice_from_sheet(billing_sheet=sheet, user=user)
            return {
                'status': 'RESOLVED',
                'owning_module': 'BILLING',
                'source_type': source_type,
                'source_id': str(source_id),
                'message': f"Invoice {invoice.invoice_number} generated via InvoiceGeneratorService.",
                'result': {'invoice_id': str(invoice.id), 'invoice_number': invoice.invoice_number}
            }

        else:
            raise ValidationError(
                f"Unknown or unsupported source type '{source_type}' for module resolution. "
                "Action Center does not allow generic unmanaged state mutations across module boundaries."
            )

    # =========================================================================
    # 2. SHARED CONTEXT NAVIGATION HUBS
    # =========================================================================

    @classmethod
    def get_client_shared_context(cls, company_id, client_id) -> Dict[str, Any]:
        """
        Multi-hop drill-through:
        Client -> Contracts -> Sites -> Workforce -> Equipment -> Incidents -> Billing/Finance
        """
        client = CRMEntity.objects.filter(company_id=company_id, id=client_id, is_deleted=False).first()
        if not client:
            raise ValidationError("Client not found.")

        # Contracts
        contracts = ServiceContract.objects.filter(
            company_id=company_id,
            crm_entity=client,
            is_deleted=False
        ).prefetch_related('sites', 'rates')

        contracts_data = [
            {
                'id': str(c.id),
                'contract_code': c.contract_code,
                'status': c.status,
                'start_date': str(c.start_date) if c.start_date else '',
                'end_date': str(c.end_date) if c.end_date else '',
                'sites_count': c.sites.count(),
                'rates_count': c.rates.count()
            }
            for c in contracts
        ]

        # Sites
        sites = OperationalSite.objects.filter(
            company_id=company_id,
            crm_entity=client,
            is_deleted=False
        ).prefetch_related('security_posts')

        sites_data = []
        for s in sites:
            active_dep_count = Deployment.objects.filter(
                company_id=company_id,
                site=s,
                status=DeploymentStatus.ACTIVE,
                is_deleted=False
            ).count()
            sites_data.append({
                'id': str(s.id),
                'name': s.name,
                'address': s.address or '',
                'is_active': s.is_active,
                'posts_count': s.security_posts.count(),
                'active_deployments_count': active_dep_count
            })

        # Workforce
        deployments = Deployment.objects.filter(
            company_id=company_id,
            site__crm_entity=client,
            status=DeploymentStatus.ACTIVE,
            is_deleted=False
        ).select_related('employee', 'site', 'post')

        workforce_data = [
            {
                'deployment_id': str(d.id),
                'employee_id': str(d.employee_id),
                'employee_name': d.employee.full_name if d.employee else 'Unknown',
                'site_name': d.site.name if d.site else '',
                'post_name': d.post.post_name if d.post else '',
                'start_date': str(d.start_date) if d.start_date else ''
            }
            for d in deployments
        ]

        # Equipment in Custody
        issues = EquipmentIssue.objects.filter(
            company_id=company_id,
            client=client,
            status='ISSUED',
            is_deleted=False
        ).select_related('item', 'item_serial', 'site')

        equipment_data = [
            {
                'issue_id': str(eq.id),
                'item_name': eq.item.name if eq.item else 'Item',
                'serial_number': eq.item_serial.serial_number if eq.item_serial else '',
                'site_name': eq.site.name if eq.site else '',
                'custody_type': eq.custody_type,
                'issued_at': eq.issued_at.isoformat() if eq.issued_at else ''
            }
            for eq in issues
        ]

        # Incidents
        incidents = IncidentReport.objects.filter(
            company_id=company_id,
            client=client,
            is_deleted=False
        ).select_related('site').order_by('-occurred_at')[:10]

        incidents_data = [
            {
                'incident_id': str(inc.id),
                'incident_number': inc.incident_number,
                'title': inc.title,
                'severity': inc.severity,
                'status': inc.status,
                'site_name': inc.site.name if inc.site else '',
                'occurred_at': inc.occurred_at.isoformat() if inc.occurred_at else ''
            }
            for inc in incidents
        ]

        # Billing & Invoices
        invoices = ServiceInvoice.objects.filter(
            company_id=company_id,
            crm_entity=client,
            is_deleted=False
        ).order_by('-period_end')[:10]

        invoices_data = [
            {
                'invoice_id': str(inv.id),
                'invoice_number': inv.invoice_number,
                'period_start': str(inv.period_start),
                'period_end': str(inv.period_end),
                'total_amount': str(inv.total_amount),
                'paid_amount': str(inv.paid_amount),
                'status': inv.status,
                'payment_status': inv.payment_status
            }
            for inv in invoices
        ]

        total_billed = sum(Decimal(str(inv.total_amount)) for inv in invoices)
        total_paid = sum(Decimal(str(inv.paid_amount)) for inv in invoices)

        return {
            'client': {
                'id': str(client.id),
                'name': client.name,
                'entity_type': getattr(client, 'entity_type', 'CUSTOMER'),
                'email': getattr(client, 'email', ''),
                'phone': getattr(client, 'phone', '')
            },
            'contracts': contracts_data,
            'sites': sites_data,
            'workforce': workforce_data,
            'equipment': equipment_data,
            'incidents': incidents_data,
            'billing': invoices_data,
            'summary': {
                'contracts_count': len(contracts_data),
                'sites_count': len(sites_data),
                'active_workforce_count': len(workforce_data),
                'equipment_count': len(equipment_data),
                'incidents_count': len(incidents_data),
                'total_billed': str(total_billed),
                'total_paid': str(total_paid),
                'outstanding_ar': str(total_billed - total_paid)
            }
        }

    @classmethod
    def get_employee_shared_context(cls, company_id, employee_id) -> Dict[str, Any]:
        """
        Multi-hop drill-through:
        Employee -> Deployment -> Attendance -> Equipment -> Payroll -> Lifecycle
        """
        employee = Employee.objects.filter(
            company_id=company_id,
            id=employee_id,
            is_deleted=False
        ).select_related('designation', 'department').first()
        if not employee:
            raise ValidationError("Employee not found.")

        # Current Deployment
        active_deployment = Deployment.objects.filter(
            company_id=company_id,
            employee=employee,
            status=DeploymentStatus.ACTIVE,
            is_deleted=False
        ).select_related('site', 'post').first()

        deployment_data = None
        if active_deployment:
            deployment_data = {
                'id': str(active_deployment.id),
                'site_name': active_deployment.site.name if active_deployment.site else '',
                'post_name': active_deployment.post.post_name if active_deployment.post else '',
                'start_date': str(active_deployment.start_date) if active_deployment.start_date else '',
                'status': active_deployment.status
            }

        # Attendance & Today's Duty
        today = timezone.now().date()
        today_roster = DutyRoster.objects.filter(
            company_id=company_id,
            employee=employee,
            duty_date=today,
            is_deleted=False
        ).select_related('site', 'shift', 'post').first()

        today_attendance = WorkforceAttendance.objects.filter(
            company_id=company_id,
            employee=employee,
            date=today,
            is_deleted=False
        ).first()

        # Equipment Issued
        equipment_issues = EquipmentIssue.objects.filter(
            company_id=company_id,
            employee=employee,
            status='ISSUED',
            is_deleted=False
        ).select_related('item', 'item_serial')

        equipment_data = [
            {
                'issue_id': str(eq.id),
                'item_name': eq.item.name if eq.item else 'Item',
                'serial_number': eq.item_serial.serial_number if eq.item_serial else '',
                'condition': eq.issue_condition,
                'issued_at': eq.issued_at.isoformat() if eq.issued_at else '',
                'expected_return_date': str(eq.expected_return_date) if eq.expected_return_date else ''
            }
            for eq in equipment_issues
        ]

        # Latest Payroll Calculation
        latest_calc = EmployeePayrollCalculation.objects.filter(
            company_id=company_id,
            employee=employee,
            is_deleted=False
        ).order_by('-period_end').first()

        calc_data = None
        if latest_calc:
            calc_data = {
                'id': str(latest_calc.id),
                'period_start': str(latest_calc.period_start),
                'period_end': str(latest_calc.period_end),
                'status': latest_calc.status,
                'has_blockers': latest_calc.has_blockers,
                'duty_days_count': latest_calc.duty_days_count,
                'gross_earnings': str(latest_calc.gross_earnings),
                'total_deductions': str(latest_calc.total_deductions),
                'net_payable': str(latest_calc.net_payable)
            }

        # Lifecycle / JUMP alert
        jump = JumpRecord.objects.filter(
            company_id=company_id,
            employee=employee,
            status=JumpRecordStatus.ACTIVE_JUMP,
            is_deleted=False
        ).first()

        return {
            'employee': {
                'id': str(employee.id),
                'employee_code': getattr(employee, 'employee_code', ''),
                'full_name': employee.full_name,
                'designation_name': employee.designation.name if employee.designation else '',
                'department_name': employee.department.name if employee.department else '',
                'employment_status': employee.employment_status,
                'phone': getattr(employee, 'mobile_number', getattr(employee, 'phone', ''))
            },
            'current_deployment': deployment_data,
            'today_duty': {
                'roster_id': str(today_roster.id) if today_roster else None,
                'shift_name': today_roster.shift.name if today_roster and today_roster.shift else 'Unscheduled',
                'site_name': today_roster.site.name if today_roster and today_roster.site else '',
                'attendance_status': today_attendance.status if today_attendance else 'NOT_MARKED'
            },
            'equipment_custody': equipment_data,
            'latest_payroll': calc_data,
            'lifecycle': {
                'status': employee.employment_status,
                'is_active_jump': jump is not None,
                'jump_consecutive_days': jump.consecutive_absent_days if jump else 0
            }
        }

    @classmethod
    def get_site_shared_context(cls, company_id, site_id) -> Dict[str, Any]:
        """
        Multi-hop drill-through:
        Site -> Contract -> Manpower -> Roster -> Attendance -> Inventory -> Incidents
        """
        site = OperationalSite.objects.filter(
            company_id=company_id,
            id=site_id,
            is_deleted=False
        ).select_related('crm_entity').first()
        if not site:
            raise ValidationError("Operational site not found.")

        # Contracts
        contracts = site.service_contracts.filter(is_deleted=False)
        contracts_data = [
            {
                'id': str(c.id),
                'contract_code': c.contract_code,
                'client_name': site.crm_entity.name if site.crm_entity else 'Direct',
                'status': c.status,
                'start_date': str(c.start_date) if c.start_date else '',
                'end_date': str(c.end_date) if c.end_date else ''
            }
            for c in contracts
        ]

        # Posts & Manpower
        posts = SecurityPost.objects.filter(site=site, is_active=True, is_deleted=False).select_related('required_designation')
        posts_data = []
        total_req = 0
        total_dep = 0
        for p in posts:
            dep_count = Deployment.objects.filter(site=site, post=p, status=DeploymentStatus.ACTIVE, is_deleted=False).count()
            total_req += p.required_headcount
            total_dep += dep_count
            posts_data.append({
                'id': str(p.id),
                'name': p.post_name,
                'post_code': p.post_code,
                'required_guards': p.required_headcount,
                'deployed_guards': dep_count,
                'vacancies': max(0, p.required_headcount - dep_count),
                'designation_name': p.required_designation.name if p.required_designation else ''
            })

        # Today's Roster & Attendance
        today = timezone.now().date()
        rosters = DutyRoster.objects.filter(
            company_id=company_id,
            site=site,
            duty_date=today,
            is_deleted=False
        ).select_related('employee', 'shift', 'post')

        rosters_data = []
        for r in rosters:
            att = WorkforceAttendance.objects.filter(
                company_id=company_id,
                employee=r.employee,
                date=today,
                is_deleted=False
            ).first()
            rosters_data.append({
                'roster_id': str(r.id),
                'employee_id': str(r.employee_id),
                'employee_name': r.employee.full_name if r.employee else 'Staff',
                'shift_name': r.shift.name if r.shift else '',
                'post_name': r.post.post_name if r.post else '',
                'status': r.status,
                'attendance_status': att.status if att else 'NOT_MARKED'
            })

        # Site Equipment
        site_equipment = EquipmentIssue.objects.filter(
            company_id=company_id,
            site=site,
            status='ISSUED',
            is_deleted=False
        ).select_related('item', 'item_serial')

        equipment_data = [
            {
                'issue_id': str(eq.id),
                'item_name': eq.item.name if eq.item else 'Item',
                'serial_number': eq.item_serial.serial_number if eq.item_serial else '',
                'quantity': str(eq.quantity),
                'condition': eq.issue_condition,
                'custody_type': eq.custody_type
            }
            for eq in site_equipment
        ]

        # Recent Incidents & Field Inspections
        recent_incidents = IncidentReport.objects.filter(
            company_id=company_id,
            site=site,
            is_deleted=False
        ).order_by('-occurred_at')[:5]

        recent_inspections = SupervisorInspection.objects.filter(
            company_id=company_id,
            site=site,
            is_deleted=False
        ).order_by('-inspection_datetime')[:5]

        return {
            'site': {
                'id': str(site.id),
                'name': site.name,
                'address': site.address or '',
                'client_name': site.crm_entity.name if site.crm_entity else 'Direct',
                'latitude': str(site.latitude) if getattr(site, 'latitude', None) else '',
                'longitude': str(site.longitude) if getattr(site, 'longitude', None) else '',
                'geofence_radius_meters': site.geofence_radius_meters if hasattr(site, 'geofence_radius_meters') else 100,
                'is_active': site.is_active
            },
            'contracts': contracts_data,
            'manpower': {
                'posts': posts_data,
                'total_required': total_req,
                'total_deployed': total_dep,
                'total_vacancies': max(0, total_req - total_dep)
            },
            'todays_roster': rosters_data,
            'today_rosters': rosters_data,
            'equipment': equipment_data,
            'recent_incidents': [
                {
                    'id': str(inc.id),
                    'incident_number': inc.incident_number,
                    'title': inc.title,
                    'severity': inc.severity,
                    'status': inc.status,
                    'occurred_at': inc.occurred_at.isoformat() if inc.occurred_at else ''
                }
                for inc in recent_incidents
            ],
            'recent_inspections': [
                {
                    'id': str(insp.id),
                    'inspection_datetime': insp.inspection_datetime.isoformat() if insp.inspection_datetime else '',
                    'overall_score': str(insp.overall_score) if insp.overall_score is not None else '',
                    'status': insp.status
                }
                for insp in recent_inspections
            ]
        }

    # =========================================================================
    # 3. CONTROLLED HANDOFFS (INVENTORY SHORTAGE -> PURCHASE REQUEST)
    # =========================================================================

    @classmethod
    @transaction.atomic
    def create_purchase_request_from_inventory_shortage(
        cls,
        company_id,
        item_id,
        quantity: Decimal,
        user=None,
        warehouse_id=None,
        notes: str = ''
    ) -> ProcurementDocument:
        """
        Controlled handoff from an inventory shortage into an authoritative Purchase Request.
        Idempotent: if an open draft PR for this item already exists, updates or returns it.
        """
        company = Company.objects.get(id=company_id)
        item = Item.objects.select_for_update().get(id=item_id, company_id=company_id)

        if quantity <= Decimal('0.00'):
            raise ValidationError("Purchase request quantity must be greater than zero.")

        # Check if an existing open DRAFT purchase request exists containing this item
        existing_line = ProcurementLine.objects.filter(
            document__company=company,
            document__document_type='PURCHASE_REQUEST',
            document__status='DRAFT',
            document__is_deleted=False,
            item=item
        ).select_related('document').first()

        if existing_line:
            # Idempotent: return existing document without duplicating
            return existing_line.document

        # Create new Purchase Request
        from datetime import date
        today = date.today()

        crm_entity = (
            getattr(item, 'preferred_vendor', None)
            or CRMEntity.objects.filter(company_id=company_id, entity_type='SUPPLIER').first()
            or CRMEntity.objects.filter(company_id=company_id).first()
        )
        if not crm_entity:
            crm_entity = CRMEntity.objects.create(
                company=company,
                code="SUPP-INTERNAL",
                name="Internal Operations Supply",
                entity_type="SUPPLIER"
            )

        pr_doc = ProcurementDocument.objects.create(
            company=company,
            crm_entity=crm_entity,
            document_type='PURCHASE_REQUEST',
            status='DRAFT',
            document_date=today,
            warehouse_id=warehouse_id,
            notes=notes or f"Automated requisition triggered by inventory shortage for {item.name}.",
            created_by=user if (user and user.is_authenticated) else None
        )

        cost_price = (item.cost_price or Decimal('0.00')).quantize(Decimal('0.01'))
        line_total = (quantity * cost_price).quantize(Decimal('0.01'))

        ProcurementLine.objects.create(
            company=company,
            document=pr_doc,
            item=item,
            quantity=quantity,
            unit_price=cost_price,
            total_amount=line_total,
            notes=f"Stock shortage: balance below reorder threshold."
        )

        pr_doc.subtotal_amount = line_total
        pr_doc.total_amount = line_total
        pr_doc.save(update_fields=['subtotal_amount', 'total_amount'])

        ProcurementAuditTrail.objects.create(
            company=company,
            document=pr_doc,
            user=user if (user and user.is_authenticated) else None,
            event='CREATED',
            details=f"Created Purchase Request {pr_doc.number} from inventory shortage ({item.name}, Qty: {quantity})."
        )

        return pr_doc

    # =========================================================================
    # 4. OPERATIONS -> CLIENT BILLING INPUT RECONCILIATION
    # =========================================================================

    @classmethod
    def generate_client_billing_snapshot(
        cls,
        company_id,
        contract_id,
        period_start,
        period_end,
        user=None
    ) -> Dict[str, Any]:
        """
        Connects approved operational delivery (manpower, OT, extra duties)
        to the universal S-4 Billing flow.
        Uses contract rates only — strictly never touches employee payroll amounts.
        Strictly idempotent: returns existing invoice if already created.
        """
        p_start = _parse_date(period_start)
        p_end = _parse_date(period_end)

        contract = ServiceContract.objects.filter(
            company_id=company_id,
            id=contract_id,
            is_deleted=False
        ).first()
        if not contract:
            raise ValidationError("ServiceContract not found.")

        # Check existing invoice
        existing_inv = ServiceInvoice.objects.filter(
            company_id=company_id,
            service_contract=contract,
            period_start=p_start,
            period_end=p_end,
            is_deleted=False
        ).first()

        if existing_inv:
            return {
                'created': False,
                'invoice_id': str(existing_inv.id),
                'invoice_number': existing_inv.invoice_number,
                'total_amount': str(existing_inv.total_amount),
                'status': existing_inv.status,
                'message': f"Existing invoice {existing_inv.invoice_number} found for period."
            }

        # Invoke billing service generator
        from billing.services.service_billing import generate_service_invoice
        result = generate_service_invoice(
            company_id=company_id,
            service_contract_id=contract.id,
            period_start=p_start,
            period_end=p_end
        )

        return result
