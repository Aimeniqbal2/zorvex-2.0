"""
operations/services/security_reporting_service.py

Phase S-9: Security Industry Reports, Dashboards & Analytics Engine
Authoritative reporting and analytical layer across CRM, contracts, workforce,
operations, inventory, purchasing, and finance.

Consumes authoritative source engines and finalized snapshots.
Enforces multi-tenant isolation, company module gating, and RBAC confidentiality
(masking sensitive payroll/financial figures for unauthorized operational viewers).
"""
import calendar
from datetime import datetime, date, timedelta
from decimal import Decimal
from typing import Dict, Any, List, Optional

from django.db.models import (
    Sum, Count, Avg, Q, F, DecimalField, IntegerField, Max, Min
)
from django.db.models.functions import Coalesce
from django.core.exceptions import PermissionDenied
from django.utils import timezone

from companies.models import Company
from crm.models import CRMEntity
from operations.models import (
    OperationalSite, ServiceContract, SecurityPost, PostShiftRequirement,
    Deployment, DutyRoster, DutyAssignment, DutyReplacement, ExtraDuty,
    DailyDutyPay, EmployeePayrollCalculation,
    IncidentReport, DailyOccurrenceLog, PatrolRun, GuardTour, GuardTourEvent,
    EmergencyEvent, SupervisorInspection, OperationsEscalation,
    EquipmentIssue, EquipmentIncident, SecurityItemProfile,
    SiteStaffingRequirement
)
from hrm.models import (
    Employee, Designation, Shift, WorkforceAttendance,
    AttendanceStatus, EmployeeDocument, EmployeeTraining, PayrollRun
)
from inventory.models import Item, InventoryBalance, ItemSerial, StockMovement
from purchasing.models import ProcurementDocument, ProcurementLine
from billing.models import ServiceInvoice

from reports.services.export import UniversalExportService


def user_has_finance_permission(user) -> bool:
    """Checks if user has permission to view financial / ledger figures."""
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser or getattr(user, 'role', None) in ('super_admin', 'admin'):
        return True
    user_perms = set()
    company_role = getattr(user, 'company_role', None)
    if company_role and company_role.is_active:
        user_perms.update(company_role.permissions or [])
    if hasattr(user, 'get_all_permissions'):
        user_perms.update(user.get_all_permissions())
    return any(p in user_perms for p in ('*', 'finance.*', 'finance.read', 'finance.write'))


def user_has_hrm_permission(user) -> bool:
    """Checks if user has permission to view sensitive workforce payroll compensation."""
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser or getattr(user, 'role', None) in ('super_admin', 'admin'):
        return True
    user_perms = set()
    company_role = getattr(user, 'company_role', None)
    if company_role and company_role.is_active:
        user_perms.update(company_role.permissions or [])
    if hasattr(user, 'get_all_permissions'):
        user_perms.update(user.get_all_permissions())
    return any(p in user_perms for p in ('*', 'hrm.*', 'hrm.read', 'hrm.write', 'payroll.read', 'finance.*', 'finance.read'))


class SecurityReportingService:
    """
    Authoritative Service for Security Vertical Reporting, Dashboards & Analytics.
    """

    @classmethod
    def _parse_dates(cls, filters: Optional[Dict[str, Any]] = None):
        filters = filters or {}
        today = timezone.localdate() if hasattr(timezone, 'localdate') else date.today()
        
        start_date_str = filters.get('start_date') or filters.get('date_from')
        end_date_str = filters.get('end_date') or filters.get('date_to')

        if start_date_str:
            if isinstance(start_date_str, date):
                start_date = start_date_str
            else:
                try:
                    start_date = datetime.strptime(str(start_date_str)[:10], '%Y-%m-%d').date()
                except (ValueError, TypeError):
                    start_date = today.replace(day=1)
        else:
            start_date = today.replace(day=1)

        if end_date_str:
            if isinstance(end_date_str, date):
                end_date = end_date_str
            else:
                try:
                    end_date = datetime.strptime(str(end_date_str)[:10], '%Y-%m-%d').date()
                except (ValueError, TypeError):
                    end_date = today
        else:
            end_date = today

        return start_date, end_date

    # =========================================================================
    # PHASE S-9.1: AUTHORITATIVE S-7.1 INSPECTION POLICY COMPLIANCE EVALUATION
    # =========================================================================

    @classmethod
    def get_inspection_compliance_status(
        cls,
        inspection: SupervisorInspection,
        company: Optional[Company] = None
    ) -> Dict[str, Any]:
        """
        Phase S-9.1: Authoritative evaluation of supervisor inspection compliance against
        the authoritative S-7.1 InspectionPolicy.
        - Respects historical inspection.policy reference attached to the inspection where available.
        - Otherwise retrieves the active InspectionPolicy for the tenant effective on inspection_datetime.
        - Consumes the exact warning/escalation/critical thresholds used by Advanced Operations.
        - Eliminates any hardcoded reporting thresholds.
        """
        comp = company or (inspection.site.company if inspection.site else getattr(inspection, 'company', None))
        insp_datetime = inspection.inspection_datetime

        # 1. Historical reference attached to inspection takes precedence
        policy = getattr(inspection, 'policy', None)
        if not policy and comp:
            from operations.services.advanced_operations_service import AdvancedOperationsService
            policy = AdvancedOperationsService.get_active_inspection_policy(
                comp,
                inspection_date=insp_datetime
            )

        base_score = policy.base_score if policy else Decimal('100.00')
        warning_thresh = policy.warning_threshold if policy else Decimal('85.00')
        escalation_thresh = policy.escalation_threshold if policy else Decimal('80.00')
        critical_thresh = policy.critical_threshold if policy else Decimal('60.00')

        score = inspection.overall_score if inspection.overall_score is not None else base_score
        if not isinstance(score, Decimal):
            score = Decimal(str(score))

        has_deficiencies = (
            score < escalation_thresh or
            bool(inspection.deficiencies_observed) or
            bool(inspection.corrective_action_required) or
            inspection.status == 'ACTION_REQUIRED'
        )

        if score < critical_thresh:
            severity = 'CRITICAL'
            compliance_status = 'NON_COMPLIANT_CRITICAL'
        elif score < escalation_thresh:
            severity = 'ESCALATION'
            compliance_status = 'NON_COMPLIANT_ESCALATION'
        elif score < warning_thresh:
            severity = 'WARNING'
            compliance_status = 'WARNING'
        else:
            severity = 'COMPLIANT'
            compliance_status = 'COMPLIANT'

        is_failed = has_deficiencies or (score < escalation_thresh)

        return {
            'policy_id': str(policy.id) if policy else None,
            'policy_name': policy.name if policy else 'Default S-7.1 Inspection Rules',
            'base_score': float(base_score),
            'warning_threshold': float(warning_thresh),
            'escalation_threshold': float(escalation_thresh),
            'critical_threshold': float(critical_thresh),
            'overall_score': float(score),
            'is_failed': is_failed,
            'severity': severity,
            'compliance_status': compliance_status,
            'has_deficiencies': has_deficiencies,
        }

    # =========================================================================
    # 1. EXECUTIVE SECURITY DASHBOARD
    # =========================================================================

    @classmethod
    def get_executive_dashboard(cls, company: Company, user=None, filters: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Gathers high-level management KPIs across Commercial, Workforce,
        Operations, Inventory, and Finance.
        Masks financial/payroll values if the requesting user lacks financial permissions.
        """
        start_date, end_date = cls._parse_dates(filters)
        today = timezone.localdate() if hasattr(timezone, 'localdate') else date.today()
        has_fin_perm = user_has_finance_permission(user)

        # ---------------------------------------------------------------------
        # A. COMMERCIAL KPIS
        # ---------------------------------------------------------------------
        active_clients_count = CRMEntity.objects.filter(
            company=company,
            active=True,
            is_deleted=False,
            entity_type__in=['CLIENT', 'CUSTOMER']
        ).count()

        contracts_qs = ServiceContract.objects.filter(
            company=company,
            is_deleted=False
        )
        active_contracts_count = contracts_qs.filter(status='ACTIVE').count()

        # Expiring contracts (within next 30 days)
        expiring_threshold = today + timedelta(days=30)
        expiring_qs = contracts_qs.filter(
            status='ACTIVE',
            end_date__isnull=False,
            end_date__gte=today,
            end_date__lte=expiring_threshold
        )
        expiring_count = expiring_qs.count()
        expiring_list = [
            {
                'id': str(c.id),
                'contract_code': c.contract_code,
                'client_name': c.crm_entity.name if c.crm_entity else 'Unlinked',
                'end_date': str(c.end_date)
            }
            for c in expiring_qs[:5]
        ]

        commercial_kpis = {
            'active_clients': active_clients_count,
            'active_contracts': active_contracts_count,
            'expiring_contracts_count': expiring_count,
            'expiring_contracts': expiring_list,
        }

        # Billing / Receivables / Collections (finance permission check)
        if has_fin_perm:
            # Reusing Finance Executive Dashboard service
            try:
                from finance.services.executive_dashboard_service import ExecutiveFinanceDashboardService
                receivables_snap = ExecutiveFinanceDashboardService.get_receivables_snapshot(company)
                commercial_kpis['receivables'] = float(receivables_snap.get('total_ar', Decimal('0.00')))
                commercial_kpis['collections'] = float(receivables_snap.get('collections_this_month', Decimal('0.00')))
            except Exception:
                commercial_kpis['receivables'] = 0.0
                commercial_kpis['collections'] = 0.0

            # Total contract value / posted billing for period
            invoiced_val = ServiceInvoice.objects.filter(
                company=company,
                status='POSTED',
                is_deleted=False,
                period_start__gte=start_date,
                period_end__lte=end_date
            ).aggregate(total=Coalesce(Sum('total_amount'), Decimal('0.00'), output_field=DecimalField()))['total']
            commercial_kpis['period_billing'] = float(invoiced_val)
            commercial_kpis['is_financial_masked'] = False
        else:
            commercial_kpis['receivables'] = None
            commercial_kpis['collections'] = None
            commercial_kpis['period_billing'] = None
            commercial_kpis['is_financial_masked'] = True

        # ---------------------------------------------------------------------
        # B. WORKFORCE KPIS
        # ---------------------------------------------------------------------
        emp_qs = Employee.objects.filter(company=company, is_deleted=False, is_active=True)
        total_workforce = emp_qs.count()
        direct_count = emp_qs.filter(classification='DIRECT').count()
        indirect_count = emp_qs.filter(classification='INDIRECT').count()
        jump_count = emp_qs.filter(employment_status='JUMP').count()
        suspended_count = emp_qs.filter(employment_status='SUSPENDED').count()

        deployed_count = Deployment.objects.filter(
            company=company,
            is_deleted=False,
            status='ACTIVE'
        ).values('employee_id').distinct().count()

        # Vacancies: Total required guards across active posts minus active deployments
        total_req_guards = PostShiftRequirement.objects.filter(
            company=company,
            is_deleted=False,
            is_active=True,
            post__is_active=True
        ).aggregate(total=Coalesce(Sum('required_headcount'), 0, output_field=IntegerField()))['total']
        
        vacancies_count = max(0, total_req_guards - deployed_count)

        # Attendance % over requested period
        duties_in_period = DutyAssignment.objects.filter(
            company=company,
            is_deleted=False,
            date__range=(start_date, end_date)
        )
        total_duties_count = duties_in_period.count()
        completed_duties_count = duties_in_period.filter(status='COMPLETED').count()
        attendance_pct = round((completed_duties_count / total_duties_count * 100.0), 2) if total_duties_count > 0 else 100.0

        workforce_kpis = {
            'total_workforce': total_workforce,
            'direct_count': direct_count,
            'indirect_count': indirect_count,
            'deployed_count': deployed_count,
            'vacant_positions': vacancies_count,
            'attendance_pct': attendance_pct,
            'jump_count': jump_count,
            'suspended_count': suspended_count,
        }

        # ---------------------------------------------------------------------
        # C. OPERATIONS KPIS
        # ---------------------------------------------------------------------
        roster_qs = DutyAssignment.objects.filter(
            company=company,
            is_deleted=False,
            date__range=(start_date, end_date)
        )
        uncovered_duties = roster_qs.filter(Q(status='UNCOVERED') | Q(employee__isnull=True)).count()
        replacement_duties = DutyReplacement.objects.filter(
            company=company,
            is_deleted=False,
            duty_date__range=(start_date, end_date)
        ).count()

        total_rostered = roster_qs.count()
        assigned_rostered = roster_qs.filter(employee__isnull=False).exclude(status='UNCOVERED').count()
        roster_coverage_pct = round((assigned_rostered / total_rostered * 100.0), 2) if total_rostered > 0 else 100.0

        incidents_qs = IncidentReport.objects.filter(
            company=company,
            is_deleted=False,
            occurred_at__date__range=(start_date, end_date)
        )
        total_incidents = incidents_qs.count()
        critical_incidents = incidents_qs.filter(severity='CRITICAL').count()

        emergency_events_count = EmergencyEvent.objects.filter(
            company=company,
            is_deleted=False,
            occurred_at__date__range=(start_date, end_date)
        ).count()

        # Patrol Completion %
        patrols_qs = PatrolRun.objects.filter(
            company=company,
            is_deleted=False,
            scheduled_start__date__range=(start_date, end_date)
        )
        total_patrols = patrols_qs.count()
        completed_patrols = patrols_qs.filter(status='COMPLETED').count()
        patrol_completion_pct = round((completed_patrols / total_patrols * 100.0), 2) if total_patrols > 0 else 100.0

        # Inspection Performance: Average overall score
        inspections_qs = SupervisorInspection.objects.filter(
            company=company,
            is_deleted=False,
            inspection_datetime__date__range=(start_date, end_date)
        )
        avg_score = inspections_qs.aggregate(avg=Avg('overall_score'))['avg']
        inspection_avg_score = round(float(avg_score), 2) if avg_score is not None else 100.0

        operations_kpis = {
            'required_manpower': total_req_guards,
            'deployed_manpower': deployed_count,
            'roster_coverage_pct': roster_coverage_pct,
            'uncovered_duties': uncovered_duties,
            'replacement_duties': replacement_duties,
            'total_incidents': total_incidents,
            'critical_incidents': critical_incidents,
            'emergency_events': emergency_events_count,
            'patrol_completion_pct': patrol_completion_pct,
            'inspection_performance_avg': inspection_avg_score,
        }

        # ---------------------------------------------------------------------
        # D. INVENTORY KPIS
        # ---------------------------------------------------------------------
        # Total active issues
        issued_issues = EquipmentIssue.objects.filter(
            company=company,
            is_deleted=False,
            status='ISSUED'
        )
        issued_total_qty = issued_issues.aggregate(total=Coalesce(Sum('quantity'), Decimal('0.00'), output_field=DecimalField()))['total']
        site_custody_qty = issued_issues.filter(custody_type='SITE').aggregate(total=Coalesce(Sum('quantity'), Decimal('0.00'), output_field=DecimalField()))['total']
        employee_custody_qty = issued_issues.filter(custody_type='EMPLOYEE').aggregate(total=Coalesce(Sum('quantity'), Decimal('0.00'), output_field=DecimalField()))['total']

        # Lost/Damaged
        lost_damaged_count = EquipmentIncident.objects.filter(
            company=company,
            is_deleted=False,
            incident_type__in=['LOST', 'DAMAGED']
        ).count()

        # Controlled items
        controlled_assets_count = Item.objects.filter(
            company=company,
            is_deleted=False,
            security_profile__is_controlled=True
        ).count()

        # Low stock items
        balances_qs = InventoryBalance.objects.filter(
            item__company=company,
            is_deleted=False
        ).values('item_id', 'item__reorder_level', 'item__minimum_stock_level').annotate(total_qty=Sum('quantity'))
        
        low_stock_count = sum(1 for b in balances_qs if b['total_qty'] <= (b['item__reorder_level'] or b['item__minimum_stock_level'] or 0))

        # Authoritative valuation from balances * cost_price
        inv_val = InventoryBalance.objects.filter(
            item__company=company,
            is_deleted=False
        ).annotate(
            val=F('quantity') * F('item__cost_price')
        ).aggregate(total=Coalesce(Sum('val'), Decimal('0.00'), output_field=DecimalField()))['total']

        inventory_kpis = {
            'inventory_value': float(inv_val) if has_fin_perm else None,
            'issued_equipment_count': issued_total_qty,
            'site_custody_count': site_custody_qty,
            'employee_custody_count': employee_custody_qty,
            'low_stock_items_count': low_stock_count,
            'lost_damaged_count': lost_damaged_count,
            'controlled_assets_count': controlled_assets_count,
            'is_financial_masked': not has_fin_perm,
        }

        # ---------------------------------------------------------------------
        # E. FINANCE KPIS (Authoritative S-4J / S-4L sources)
        # ---------------------------------------------------------------------
        finance_kpis = {}
        if has_fin_perm:
            try:
                from finance.services.executive_dashboard_service import ExecutiveFinanceDashboardService
                fin_exec = ExecutiveFinanceDashboardService.get_executive_dashboard(
                    company, start_date=start_date, end_date=end_date
                )
                receivables_snap = ExecutiveFinanceDashboardService.get_receivables_snapshot(company)
                payables_snap = ExecutiveFinanceDashboardService.get_payables_snapshot(company)
                treasury_snap = ExecutiveFinanceDashboardService.get_treasury_snapshot(company)

                revenue = float(fin_exec.get('revenue', Decimal('0.00')))
                expense = float(fin_exec.get('expense', Decimal('0.00')))
                net_profit = float(fin_exec.get('net_profit', Decimal('0.00')))
                net_margin = float(fin_exec.get('net_margin_percentage', 0.0))

                # Payroll cost from finalized calculations in period
                payroll_cost = EmployeePayrollCalculation.objects.filter(
                    company=company,
                    is_deleted=False,
                    period_start__gte=start_date,
                    period_end__lte=end_date
                ).aggregate(total=Coalesce(Sum('gross_earnings'), Decimal('0.00'), output_field=DecimalField()))['total']

                finance_kpis = {
                    'is_masked': False,
                    'revenue': revenue,
                    'expense': expense,
                    'payroll_cost': float(payroll_cost),
                    'other_direct_cost': max(0.0, expense - float(payroll_cost)),
                    'gross_margin': net_profit,
                    'gross_margin_pct': net_margin,
                    'ar_outstanding': float(receivables_snap.get('total_ar', Decimal('0.00'))),
                    'ap_outstanding': float(payables_snap.get('total_ap', Decimal('0.00'))),
                    'cash_bank_balance': float(treasury_snap.get('total_liquid_cash', Decimal('0.00'))),
                }
            except Exception as e:
                finance_kpis = {
                    'is_masked': False,
                    'revenue': 0.0,
                    'payroll_cost': 0.0,
                    'other_direct_cost': 0.0,
                    'gross_margin': 0.0,
                    'gross_margin_pct': 0.0,
                    'ar_outstanding': 0.0,
                    'ap_outstanding': 0.0,
                    'cash_bank_balance': 0.0,
                    'error': str(e)
                }
        else:
            finance_kpis = {
                'is_masked': True,
                'message': 'Confidential financial metrics require finance.read permission.'
            }

        return {
            'start_date': str(start_date),
            'end_date': str(end_date),
            'commercial': commercial_kpis,
            'workforce': workforce_kpis,
            'operations': operations_kpis,
            'inventory': inventory_kpis,
            'finance': finance_kpis,
        }

    # =========================================================================
    # 2. CLIENT / CONTRACT / SITE PROFITABILITY (Reusing S-4J)
    # =========================================================================

    @classmethod
    def get_profitability_report(
        cls,
        company: Company,
        user=None,
        dimension: str = 'contract',
        filters: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Consumes authoritative S-4J GL-derived profitability service.
        Strictly requires financial permission.
        """
        if not user_has_finance_permission(user):
            raise PermissionDenied("Access to Profitability reports requires financial permissions.")

        from finance.services.profitability_service import ProfitabilityService
        start_date, end_date = cls._parse_dates(filters)
        filters = filters or {}
        entity_id = filters.get('entity_id') or filters.get('id')

        if dimension == 'client':
            data = ProfitabilityService.get_client_profitability(
                company, client_id=entity_id, start_date=start_date, end_date=end_date
            )
        elif dimension == 'site':
            data = ProfitabilityService.get_site_profitability(
                company, site_id=entity_id, start_date=start_date, end_date=end_date
            )
        else:
            data = ProfitabilityService.get_contract_profitability(
                company, contract_id=entity_id, start_date=start_date, end_date=end_date
            )

        return {
            'dimension': dimension,
            'start_date': str(start_date),
            'end_date': str(end_date),
            'profitability': data
        }

    # =========================================================================
    # 3. WORKFORCE REPORTS
    # =========================================================================

    @classmethod
    def get_workforce_reports(
        cls,
        company: Company,
        user=None,
        report_type: str = 'employee_master',
        filters: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Workforce reporting suite: Master, Deployment, Site Strength, Attendance,
        Absence, Leave, JUMP, Replacements, OT, Payroll, Statutory, Custody, Lifecycle.
        """
        start_date, end_date = cls._parse_dates(filters)
        filters = filters or {}
        has_hrm_perm = user_has_hrm_permission(user)

        site_id = filters.get('site_id') or filters.get('site')
        client_id = filters.get('client_id') or filters.get('client')
        contract_id = filters.get('contract_id') or filters.get('contract')
        classification = filters.get('classification')
        designation_id = filters.get('designation_id') or filters.get('designation')
        shift_id = filters.get('shift_id') or filters.get('shift')
        status = filters.get('status')
        employee_id = filters.get('employee_id') or filters.get('employee')

        # ---------------------------------------------------------------------
        # 3.1 Employee Master
        # ---------------------------------------------------------------------
        if report_type == 'employee_master':
            qs = Employee.objects.filter(company=company, is_deleted=False).select_related('designation', 'department', 'branch')
            if classification:
                qs = qs.filter(classification=classification)
            if designation_id:
                qs = qs.filter(designation_id=designation_id)
            if status:
                qs = qs.filter(employment_status=status)
            if employee_id:
                qs = qs.filter(id=employee_id)

            results = [
                {
                    'id': str(e.id),
                    'employee_code': e.employee_code,
                    'full_name': e.full_name,
                    'classification': e.classification,
                    'designation': e.designation.name if e.designation else '',
                    'department': e.department.name if e.department else '',
                    'branch': e.branch.name if e.branch else '',
                    'employment_status': e.employment_status,
                    'phone': e.phone,
                    'cnic_number': e.cnic_number,
                    'joining_date': str(e.hire_date) if e.hire_date else '',
                }
                for e in qs[:500]
            ]
            return {'report_type': report_type, 'total_count': qs.count(), 'records': results}

        # ---------------------------------------------------------------------
        # 3.2 Deployment
        # ---------------------------------------------------------------------
        elif report_type == 'deployment':
            qs = Deployment.objects.filter(company=company, is_deleted=False).select_related(
                'employee', 'site', 'post', 'service_contract', 'designation'
            )
            if site_id:
                qs = qs.filter(site_id=site_id)
            if contract_id:
                qs = qs.filter(service_contract_id=contract_id)
            if status:
                qs = qs.filter(status=status)
            if employee_id:
                qs = qs.filter(employee_id=employee_id)

            results = [
                {
                    'id': str(d.id),
                    'employee_code': d.employee.employee_code if d.employee else '',
                    'employee_name': d.employee.full_name if d.employee else '',
                    'site_name': d.site.name if d.site else '',
                    'post_name': d.post.post_name if d.post else '',
                    'contract_code': d.service_contract.contract_code if d.service_contract else '',
                    'designation': d.designation.name if d.designation else '',
                    'status': d.status,
                    'assignment_type': d.assignment_type,
                    'start_date': str(d.start_date),
                    'end_date': str(d.end_date) if d.end_date else '',
                }
                for d in qs[:500]
            ]
            return {'report_type': report_type, 'total_count': qs.count(), 'records': results}

        # ---------------------------------------------------------------------
        # 3.3 Site Strength
        # ---------------------------------------------------------------------
        elif report_type == 'site_strength':
            sites_qs = OperationalSite.objects.filter(company=company, is_deleted=False)
            if site_id:
                sites_qs = sites_qs.filter(id=site_id)

            results = []
            for s in sites_qs:
                req_guards = PostShiftRequirement.objects.filter(
                    company=company,
                    is_deleted=False,
                    is_active=True,
                    post__site=s,
                    post__is_active=True
                ).aggregate(total=Coalesce(Sum('required_headcount'), 0))['total']

                active_deployed = Deployment.objects.filter(
                    company=company,
                    site=s,
                    status='ACTIVE',
                    is_deleted=False
                ).count()

                variance = active_deployed - req_guards
                status_str = 'FULL' if variance >= 0 else 'DEFICIT'

                results.append({
                    'site_id': str(s.id),
                    'site_name': s.name,
                    'client_name': s.crm_entity.name if s.crm_entity else '',
                    'required_strength': req_guards,
                    'deployed_count': active_deployed,
                    'variance': variance,
                    'status': status_str,
                })
            return {'report_type': report_type, 'total_count': len(results), 'records': results}

        # ---------------------------------------------------------------------
        # 3.4 Attendance & Absence
        # ---------------------------------------------------------------------
        elif report_type in ('attendance', 'absence', 'leave'):
            qs = WorkforceAttendance.objects.filter(
                company=company,
                is_deleted=False,
                date__range=(start_date, end_date)
            ).select_related('employee', 'site', 'post', 'shift')

            if report_type == 'absence':
                qs = qs.filter(status__in=[AttendanceStatus.ABSENT, 'ABSENT'])
            elif report_type == 'leave':
                qs = qs.filter(status__in=[AttendanceStatus.LEAVE, 'LEAVE'])
            elif status:
                qs = qs.filter(status=status)

            if site_id:
                qs = qs.filter(site_id=site_id)
            if employee_id:
                qs = qs.filter(employee_id=employee_id)

            results = [
                {
                    'id': str(a.id),
                    'date': str(a.date),
                    'employee_code': a.employee.employee_code if a.employee else '',
                    'employee_name': a.employee.full_name if a.employee else '',
                    'site_name': a.site.name if a.site else '',
                    'post_name': a.post.post_name if a.post else '',
                    'shift_name': a.shift.name if a.shift else '',
                    'status': a.status,
                    'check_in': a.check_in.strftime('%H:%M:%S') if a.check_in else '',
                    'check_out': a.check_out.strftime('%H:%M:%S') if a.check_out else '',
                }
                for a in qs[:500]
            ]
            return {'report_type': report_type, 'total_count': qs.count(), 'records': results}

        # ---------------------------------------------------------------------
        # 3.5 JUMP Report
        # ---------------------------------------------------------------------
        elif report_type == 'jump':
            jump_emps = Employee.objects.filter(
                company=company,
                employment_status='JUMP',
                is_deleted=False
            ).select_related('designation', 'branch')

            results = [
                {
                    'id': str(e.id),
                    'employee_code': e.employee_code,
                    'full_name': e.full_name,
                    'designation': e.designation.name if e.designation else '',
                    'phone': e.phone,
                    'cnic_number': e.cnic_number,
                    'status': 'JUMP',
                    'last_working_date': str(e.last_working_date) if e.last_working_date else '',
                }
                for e in jump_emps
            ]
            return {'report_type': report_type, 'total_count': jump_emps.count(), 'records': results}

        # ---------------------------------------------------------------------
        # 3.6 Replacement Duties
        # ---------------------------------------------------------------------
        elif report_type == 'replacements':
            qs = DutyReplacement.objects.filter(
                company=company,
                is_deleted=False,
                duty_date__range=(start_date, end_date)
            ).select_related('original_employee', 'replacement_employee', 'site', 'post')

            if site_id:
                qs = qs.filter(site_id=site_id)

            results = [
                {
                    'id': str(r.id),
                    'replacement_date': str(r.duty_date),
                    'site_name': r.site.name if r.site else '',
                    'post_name': r.post.post_name if r.post else '',
                    'original_guard': r.original_employee.full_name if r.original_employee else '',
                    'replacement_guard': r.replacement_employee.full_name if r.replacement_employee else '',
                    'reason': r.reason,
                    'status': r.status,
                }
                for r in qs[:500]
            ]
            return {'report_type': report_type, 'total_count': qs.count(), 'records': results}

        # ---------------------------------------------------------------------
        # 3.7 Overtime / Extra Duties
        # ---------------------------------------------------------------------
        elif report_type == 'overtime':
            qs = ExtraDuty.objects.filter(
                company=company,
                is_deleted=False,
                date__range=(start_date, end_date)
            ).select_related('employee', 'site')

            if site_id:
                qs = qs.filter(site_id=site_id)
            if employee_id:
                qs = qs.filter(employee_id=employee_id)

            results = [
                {
                    'id': str(ed.id),
                    'date': str(ed.date),
                    'employee_code': ed.employee.employee_code if ed.employee else '',
                    'employee_name': ed.employee.full_name if ed.employee else '',
                    'site_name': ed.site.name if ed.site else '',
                    'hours': float(ed.hours),
                    'status': ed.status,
                    'approved_hours': float(ed.hours) if ed.status == 'APPROVED' else 0.0,
                }
                for ed in qs[:500]
            ]
            return {'report_type': report_type, 'total_count': qs.count(), 'records': results}

        # ---------------------------------------------------------------------
        # 3.8 Payroll Summary & Statutory Contributions
        # ---------------------------------------------------------------------
        elif report_type in ('payroll_summary', 'statutory'):
            if not has_hrm_perm:
                raise PermissionDenied("Access to Payroll & Statutory reports requires HR/Payroll permissions.")

            qs = EmployeePayrollCalculation.objects.filter(
                company=company,
                is_deleted=False,
                period_start__gte=start_date,
                period_end__lte=end_date
            ).select_related('employee', 'payroll_run')

            if employee_id:
                qs = qs.filter(employee_id=employee_id)

            if report_type == 'statutory':
                results = [
                    {
                        'id': str(calc.id),
                        'employee_code': calc.employee.employee_code if calc.employee else '',
                        'employee_name': calc.employee.full_name if calc.employee else '',
                        'period': f"{calc.period_start} to {calc.period_end}",
                        'eobi_employee': float(calc.eobi_employee_amount),
                        'eobi_employer': float(calc.eobi_employer_amount),
                        'sessi_pessi_employee': float(calc.sessi_pessi_employee_amount),
                        'sessi_pessi_employer': float(calc.sessi_pessi_employer_amount),
                        'total_statutory': float(calc.total_statutory_deductions + calc.total_employer_statutory),
                    }
                    for calc in qs[:500]
                ]
            else:
                results = [
                    {
                        'id': str(calc.id),
                        'employee_code': calc.employee.employee_code if calc.employee else '',
                        'employee_name': calc.employee.full_name if calc.employee else '',
                        'period': f"{calc.period_start} to {calc.period_end}",
                        'duty_days': calc.duty_days_count,
                        'gross_earnings': float(calc.gross_earnings),
                        'total_deductions': float(calc.total_deductions),
                        'net_payable': float(calc.net_payable),
                        'status': calc.status,
                        'payroll_run_code': calc.payroll_run.run_code if calc.payroll_run and hasattr(calc.payroll_run, 'run_code') else '',
                    }
                    for calc in qs[:500]
                ]
            return {'report_type': report_type, 'total_count': qs.count(), 'records': results}

        # ---------------------------------------------------------------------
        # 3.9 Employee Equipment Custody
        # ---------------------------------------------------------------------
        elif report_type == 'custody':
            from operations.services.security_inventory_service import SecurityInventoryService
            qs = EquipmentIssue.objects.filter(
                company=company,
                custody_type='EMPLOYEE',
                status='ISSUED',
                is_deleted=False
            ).select_related('employee', 'item', 'item_serial')

            if employee_id:
                qs = qs.filter(employee_id=employee_id)

            results = [
                {
                    'id': str(iss.id),
                    'employee_code': iss.employee.employee_code if iss.employee else '',
                    'employee_name': iss.employee.full_name if iss.employee else '',
                    'item_name': iss.item.name if iss.item else '',
                    'serial_number': iss.item_serial.serial_number if iss.item_serial else '',
                    'quantity': iss.quantity,
                    'issued_at': iss.issued_at.strftime('%Y-%m-%d') if iss.issued_at else '',
                    'condition': iss.issue_condition,
                }
                for iss in qs[:500]
            ]
            return {'report_type': report_type, 'total_count': qs.count(), 'records': results}

        # ---------------------------------------------------------------------
        # 3.10 Lifecycle Movement
        # ---------------------------------------------------------------------
        elif report_type == 'lifecycle':
            emps = Employee.objects.filter(company=company, is_deleted=False).select_related('designation', 'branch')
            if employee_id:
                emps = emps.filter(id=employee_id)

            results = []
            for e in emps[:500]:
                events = []
                if e.hire_date:
                    events.append({'event': 'JOINED', 'date': str(e.hire_date)})
                if e.confirmation_date:
                    events.append({'event': 'CONFIRMED', 'date': str(e.confirmation_date)})
                if e.resignation_date:
                    events.append({'event': 'RESIGNED', 'date': str(e.resignation_date)})
                if e.termination_date:
                    events.append({'event': 'TERMINATED', 'date': str(e.termination_date)})
                if e.rehire_date:
                    events.append({'event': 'REHIRED', 'date': str(e.rehire_date)})

                for ev in events:
                    results.append({
                        'employee_id': str(e.id),
                        'employee_code': e.employee_code,
                        'employee_name': e.full_name,
                        'designation': e.designation.name if e.designation else '',
                        'event': ev['event'],
                        'event_date': ev['date'],
                        'current_status': e.employment_status,
                    })
            return {'report_type': report_type, 'total_count': len(results), 'records': results}

        return {'report_type': report_type, 'error': f"Unsupported report type: {report_type}"}

    # =========================================================================
    # 4. OPERATIONS REPORTS
    # =========================================================================

    @classmethod
    def get_operations_reports(
        cls,
        company: Company,
        user=None,
        report_type: str = 'site_manpower',
        filters: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Operations reporting suite: Site Manpower, Post Coverage, Duty Roster,
        Incidents, Daily Occurrence Book, Patrols, Emergencies, Inspections, Escalations.
        """
        start_date, end_date = cls._parse_dates(filters)
        filters = filters or {}

        site_id = filters.get('site_id') or filters.get('site')
        contract_id = filters.get('contract_id') or filters.get('contract')
        shift_id = filters.get('shift_id') or filters.get('shift')
        status = filters.get('status')

        # ---------------------------------------------------------------------
        # 4.1 Site Manpower & Post Coverage
        # ---------------------------------------------------------------------
        if report_type in ('site_manpower', 'post_coverage'):
            qs = PostShiftRequirement.objects.filter(
                company=company,
                is_deleted=False,
                is_active=True
            ).select_related('post', 'post__site', 'post__required_designation', 'shift')

            if site_id:
                qs = qs.filter(post__site_id=site_id)
            if shift_id:
                qs = qs.filter(shift_id=shift_id)

            results = []
            for req in qs[:500]:
                site = req.post.site if req.post else None
                post = req.post
                req_guards = req.required_headcount

                # Active deployments matching site & post
                active_deployments = Deployment.objects.filter(
                    company=company,
                    site=site,
                    post=post,
                    status='ACTIVE',
                    is_deleted=False
                ).count()

                variance = active_deployments - req_guards
                coverage_pct = round((active_deployments / req_guards * 100.0), 2) if req_guards > 0 else 100.0

                results.append({
                    'id': str(req.id),
                    'site_name': site.name if site else '',
                    'post_name': post.post_name if post else '',
                    'shift_name': req.shift.name if req.shift else '',
                    'designation': req.post.required_designation.name if req.post and req.post.required_designation else '',
                    'required_guards': req_guards,
                    'deployed_guards': active_deployments,
                    'variance': variance,
                    'coverage_pct': coverage_pct,
                })
            return {'report_type': report_type, 'total_count': len(results), 'records': results}

        # ---------------------------------------------------------------------
        # 4.2 Duty Roster
        # ---------------------------------------------------------------------
        elif report_type == 'duty_roster':
            qs = DutyRoster.objects.filter(
                company=company,
                is_deleted=False,
                duty_date__range=(start_date, end_date)
            ).select_related('employee', 'site', 'post', 'shift')

            if site_id:
                qs = qs.filter(site_id=site_id)
            if shift_id:
                qs = qs.filter(shift_id=shift_id)
            if status:
                qs = qs.filter(status=status)

            results = [
                {
                    'id': str(dr.id),
                    'date': str(dr.duty_date),
                    'site_name': dr.site.name if dr.site else '',
                    'post_name': dr.post.post_name if dr.post else '',
                    'shift_name': dr.shift.name if dr.shift else '',
                    'employee_name': dr.employee.full_name if dr.employee else 'UNASSIGNED',
                    'status': dr.status,
                }
                for dr in qs[:500]
            ]
            return {'report_type': report_type, 'total_count': qs.count(), 'records': results}

        # ---------------------------------------------------------------------
        # 4.2b Replacement Coverage
        # ---------------------------------------------------------------------
        elif report_type in ('replacements', 'replacement_coverage'):
            qs = DutyReplacement.objects.filter(
                company=company,
                is_deleted=False,
                duty_date__range=(start_date, end_date)
            ).select_related('site', 'post', 'shift', 'original_employee', 'replacement_employee')

            if site_id:
                qs = qs.filter(site_id=site_id)
            if status:
                qs = qs.filter(status=status)

            results = [
                {
                    'id': str(dr.id),
                    'duty_date': str(dr.duty_date),
                    'site_name': dr.site.name if dr.site else '',
                    'post_name': dr.post.post_name if dr.post else '',
                    'shift_name': dr.shift.name if dr.shift else '',
                    'original_employee': dr.original_employee.full_name if dr.original_employee else '',
                    'original_guard': dr.original_employee.full_name if dr.original_employee else '',
                    'replacement_employee': dr.replacement_employee.full_name if dr.replacement_employee else '',
                    'replacement_guard': dr.replacement_employee.full_name if dr.replacement_employee else '',
                    'reason': dr.reason,
                    'status': dr.status,
                }
                for dr in qs[:500]
            ]
            return {'report_type': report_type, 'total_count': qs.count(), 'records': results}

        # ---------------------------------------------------------------------
        # 4.3 Incident Register
        # ---------------------------------------------------------------------
        elif report_type == 'incidents':
            qs = IncidentReport.objects.filter(
                company=company,
                is_deleted=False,
                occurred_at__date__range=(start_date, end_date)
            ).select_related('site')

            if site_id:
                qs = qs.filter(site_id=site_id)
            if status:
                qs = qs.filter(status=status)

            results = [
                {
                    'id': str(inc.id),
                    'incident_number': inc.incident_number,
                    'title': inc.title,
                    'site_name': inc.site.name if inc.site else '',
                    'incident_date': inc.occurred_at.strftime('%Y-%m-%d') if inc.occurred_at else '',
                    'severity': inc.severity,
                    'category': getattr(inc, 'incident_type', ''),
                    'status': inc.status,
                }
                for inc in qs[:500]
            ]
            return {'report_type': report_type, 'total_count': qs.count(), 'records': results}

        # ---------------------------------------------------------------------
        # 4.4 Daily Occurrence Book (DOB)
        # ---------------------------------------------------------------------
        elif report_type == 'dob':
            qs = DailyOccurrenceLog.objects.filter(
                company=company,
                is_deleted=False,
                timestamp__date__range=(start_date, end_date)
            ).select_related('site', 'post', 'shift', 'employee')

            if site_id:
                qs = qs.filter(site_id=site_id)
            if status == 'flagged':
                qs = qs.filter(is_flagged=True)

            results = [
                {
                    'id': str(log.id),
                    'timestamp': log.timestamp.strftime('%Y-%m-%d %H:%M:%S'),
                    'site_name': log.site.name if log.site else '',
                    'post_name': log.post.post_name if log.post else '',
                    'shift_name': log.shift.name if log.shift else '',
                    'entry_type': log.entry_type,
                    'title': log.title,
                    'employee_name': log.employee.full_name if log.employee else '',
                    'is_flagged': log.is_flagged,
                }
                for log in qs[:500]
            ]
            return {'report_type': report_type, 'total_count': qs.count(), 'records': results}

        # ---------------------------------------------------------------------
        # 4.5 Patrol Performance & Missed Checkpoints
        # ---------------------------------------------------------------------
        elif report_type in ('patrols', 'missed_checkpoints'):
            if report_type == 'missed_checkpoints':
                qs = GuardTourEvent.objects.filter(
                    tour__site__company=company,
                    is_deleted=False,
                    status='MISSED',
                    created_at__date__range=(start_date, end_date)
                ).select_related('tour', 'tour__site', 'checkpoint')

                if site_id:
                    qs = qs.filter(tour__site_id=site_id)

                results = [
                    {
                        'id': str(ev.id),
                        'tour_name': ev.tour.tour_name if ev.tour else '',
                        'site_name': ev.tour.site.name if ev.tour and ev.tour.site else '',
                        'checkpoint_name': ev.checkpoint.name if ev.checkpoint else '',
                        'status': ev.status,
                        'notes': ev.notes,
                        'created_at': ev.created_at.strftime('%Y-%m-%d %H:%M:%S'),
                    }
                    for ev in qs[:500]
                ]
                return {'report_type': report_type, 'total_count': qs.count(), 'records': results}
            else:
                qs = PatrolRun.objects.filter(
                    company=company,
                    is_deleted=False,
                    scheduled_start__date__range=(start_date, end_date)
                ).select_related('site', 'assigned_employee', 'shift')

                if site_id:
                    qs = qs.filter(site_id=site_id)
                if status:
                    qs = qs.filter(status=status)

                results = [
                    {
                        'id': str(p.id),
                        'run_code': p.run_code,
                        'site_name': p.site.name if p.site else '',
                        'assigned_guard': p.assigned_employee.full_name if p.assigned_employee else '',
                        'shift_name': p.shift.name if p.shift else '',
                        'scheduled_start': p.scheduled_start.strftime('%Y-%m-%d %H:%M'),
                        'actual_start': p.actual_start.strftime('%Y-%m-%d %H:%M') if p.actual_start else '',
                        'status': p.status,
                    }
                    for p in qs[:500]
                ]
                return {'report_type': report_type, 'total_count': qs.count(), 'records': results}

        # ---------------------------------------------------------------------
        # 4.6 Emergency / SOS Events
        # ---------------------------------------------------------------------
        elif report_type == 'emergencies':
            qs = EmergencyEvent.objects.filter(
                company=company,
                is_deleted=False,
                occurred_at__date__range=(start_date, end_date)
            ).select_related('site', 'employee')

            if site_id:
                qs = qs.filter(site_id=site_id)
            if status:
                qs = qs.filter(status=status)

            results = [
                {
                    'id': str(ev.id),
                    'event_type': ev.event_type,
                    'site_name': ev.site.name if ev.site else '',
                    'employee_name': ev.employee.full_name if ev.employee else '',
                    'severity': ev.severity,
                    'status': ev.status,
                    'occurred_at': ev.occurred_at.strftime('%Y-%m-%d %H:%M:%S'),
                    'resolved_at': ev.resolved_at.strftime('%Y-%m-%d %H:%M:%S') if ev.resolved_at else '',
                }
                for ev in qs[:500]
            ]
            return {'report_type': report_type, 'total_count': qs.count(), 'records': results}

        # ---------------------------------------------------------------------
        # 4.7 Supervisor Inspections
        # ---------------------------------------------------------------------
        elif report_type == 'inspections':
            qs = SupervisorInspection.objects.filter(
                company=company,
                is_deleted=False,
                inspection_datetime__date__range=(start_date, end_date)
            ).select_related('site', 'inspector', 'inspected_employee', 'policy')

            if site_id:
                qs = qs.filter(site_id=site_id)
            if status and status.upper() in ('DRAFT', 'COMPLETED', 'ACTION_REQUIRED'):
                qs = qs.filter(status=status.upper())

            results = []
            for insp in qs[:500]:
                compliance = cls.get_inspection_compliance_status(insp, company=company)
                if status and status.lower() == 'failed' and not compliance['is_failed']:
                    continue
                results.append({
                    'id': str(insp.id),
                    'site_name': insp.site.name if insp.site else '',
                    'inspector_name': str(insp.inspector) if insp.inspector else '',
                    'guard_inspected': insp.inspected_employee.full_name if insp.inspected_employee else '',
                    'inspection_datetime': insp.inspection_datetime.strftime('%Y-%m-%d %H:%M'),
                    'overall_score': compliance['overall_score'],
                    'status': insp.status,
                    'policy_name': compliance['policy_name'],
                    'warning_threshold': compliance['warning_threshold'],
                    'escalation_threshold': compliance['escalation_threshold'],
                    'critical_threshold': compliance['critical_threshold'],
                    'severity': compliance['severity'],
                    'compliance_status': compliance['compliance_status'],
                    'is_failed': compliance['is_failed'],
                    'deficiencies': insp.deficiencies_observed,
                })
            return {'report_type': report_type, 'total_count': len(results), 'records': results}

        # ---------------------------------------------------------------------
        # 4.8 Escalations
        # ---------------------------------------------------------------------
        elif report_type == 'escalations':
            qs = OperationsEscalation.objects.filter(
                company=company,
                is_deleted=False,
                created_at__date__range=(start_date, end_date)
            ).select_related('site')

            if site_id:
                qs = qs.filter(site_id=site_id)
            if status:
                qs = qs.filter(status=status)

            results = [
                {
                    'id': str(esc.id),
                    'title': esc.title,
                    'site_name': esc.site.name if esc.site else '',
                    'source_type': esc.source_type,
                    'priority': esc.priority,
                    'status': esc.status,
                    'due_at': esc.due_at.strftime('%Y-%m-%d %H:%M') if esc.due_at else '',
                    'created_at': esc.created_at.strftime('%Y-%m-%d %H:%M'),
                }
                for esc in qs[:500]
            ]
            return {'report_type': report_type, 'total_count': qs.count(), 'records': results}

        return {'report_type': report_type, 'error': f"Unsupported report type: {report_type}"}

    # =========================================================================
    # 5. INVENTORY REPORTS (Universal Inventory Reconciliation)
    # =========================================================================

    @classmethod
    def get_inventory_reports(
        cls,
        company: Company,
        user=None,
        report_type: str = 'store_stock',
        filters: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Inventory reporting suite: Store Stock, Site Custody, Employee Custody,
        Serialized Equipment, Issue/Return History, Lost/Damaged, Low Stock, Controlled Items.
        """
        filters = filters or {}
        has_fin_perm = user_has_finance_permission(user)

        # ---------------------------------------------------------------------
        # 5.1 Store Stock Overview
        # ---------------------------------------------------------------------
        if report_type == 'store_stock':
            from operations.services.security_inventory_service import SecurityInventoryService
            stock_data = SecurityInventoryService.get_stock_overview(company)
            items_list = stock_data.get('items', [])

            # Mask cost and valuation if no finance permission
            if not has_fin_perm:
                for itm in items_list:
                    itm['cost_price'] = None
                    itm['total_valuation'] = None

            return {
                'report_type': report_type,
                'total_count': len(items_list),
                'summary': stock_data.get('summary', {}),
                'records': items_list
            }

        # ---------------------------------------------------------------------
        # 5.2 Site & Employee Custody
        # ---------------------------------------------------------------------
        elif report_type in ('site_custody', 'employee_custody'):
            custody_type = 'SITE' if report_type == 'site_custody' else 'EMPLOYEE'
            qs = EquipmentIssue.objects.filter(
                company=company,
                custody_type=custody_type,
                status='ISSUED',
                is_deleted=False
            ).select_related('item', 'item_serial', 'site', 'employee')

            results = [
                {
                    'id': str(iss.id),
                    'custody_type': iss.custody_type,
                    'holder_name': iss.site.name if iss.site else (iss.employee.full_name if iss.employee else ''),
                    'item_name': iss.item.name if iss.item else '',
                    'serial_number': iss.item_serial.serial_number if iss.item_serial else '',
                    'quantity': iss.quantity,
                    'issue_date': iss.issued_at.strftime('%Y-%m-%d') if iss.issued_at else '',
                    'condition_on_issue': iss.issue_condition,
                    'status': iss.status,
                }
                for iss in qs[:500]
            ]
            return {'report_type': report_type, 'total_count': qs.count(), 'records': results}

        # ---------------------------------------------------------------------
        # 5.3 Serialized Equipment
        # ---------------------------------------------------------------------
        elif report_type == 'serialized':
            qs = ItemSerial.objects.filter(
                item__company=company,
                is_deleted=False
            ).select_related('item', 'warehouse')

            results = [
                {
                    'id': str(s.id),
                    'item_name': s.item.name,
                    'serial_number': s.serial_number,
                    'status': s.status,
                    'warehouse': s.warehouse.name if s.warehouse else '',
                }
                for s in qs[:500]
            ]
            return {'report_type': report_type, 'total_count': qs.count(), 'records': results}

        # ---------------------------------------------------------------------
        # 5.4 Issue & Return History
        # ---------------------------------------------------------------------
        elif report_type == 'issue_return_history':
            qs = EquipmentIssue.objects.filter(
                company=company,
                is_deleted=False
            ).select_related('item', 'item_serial', 'site', 'employee')

            results = [
                {
                    'id': str(iss.id),
                    'item_name': iss.item.name if iss.item else '',
                    'serial_number': iss.item_serial.serial_number if iss.item_serial else '',
                    'custody_type': iss.custody_type,
                    'holder': iss.site.name if iss.site else (iss.employee.full_name if iss.employee else ''),
                    'issue_date': iss.issued_at.strftime('%Y-%m-%d') if iss.issued_at else '',
                    'return_date': str(iss.returned_at.date()) if iss.returned_at else '',
                    'status': iss.status,
                }
                for iss in qs[:500]
            ]
            return {'report_type': report_type, 'total_count': qs.count(), 'records': results}

        # ---------------------------------------------------------------------
        # 5.5 Lost / Damaged Register
        # ---------------------------------------------------------------------
        elif report_type == 'lost_damaged':
            qs = EquipmentIncident.objects.filter(
                company=company,
                is_deleted=False
            ).select_related('item', 'item_serial', 'reported_by', 'employee')

            results = [
                {
                    'id': str(inc.id),
                    'incident_type': inc.incident_type,
                    'item_name': inc.item.name if inc.item else '',
                    'serial_number': inc.item_serial.serial_number if inc.item_serial else '',
                    'reported_by': ((inc.employee.first_name + ' ' + inc.employee.last_name).strip() if inc.employee else (inc.reported_by.username if inc.reported_by else '')),
                    'quantity': inc.quantity,
                    'status': inc.status,
                    'fine_amount': float(inc.estimated_loss_value or 0) if has_fin_perm else None,
                    'incident_date': str(inc.incident_date),
                }
                for inc in qs[:500]
            ]
            return {'report_type': report_type, 'total_count': qs.count(), 'records': results}

        # ---------------------------------------------------------------------
        # 5.6 Controlled Equipment (Weapons, Radios, Body Cams)
        # ---------------------------------------------------------------------
        elif report_type == 'controlled_equipment':
            qs = Item.objects.filter(
                company=company,
                security_profile__is_controlled=True,
                is_deleted=False
            ).select_related('security_profile')

            results = []
            for itm in qs[:500]:
                serials = ItemSerial.objects.filter(item=itm, is_deleted=False)
                for s in serials:
                    # Check if currently issued
                    issue = EquipmentIssue.objects.filter(
                        item_serial=s,
                        status='ISSUED',
                        is_deleted=False
                    ).first()
                    custody_holder = ''
                    if issue:
                        custody_holder = issue.site.name if issue.site else (issue.employee.full_name if issue.employee else '')

                    results.append({
                        'item_id': str(itm.id),
                        'item_name': itm.name,
                        'category': itm.security_profile.category if hasattr(itm, 'security_profile') else 'CONTROLLED',
                        'serial_number': s.serial_number,
                        'status': s.status,
                        'custody_holder': custody_holder or 'IN_STORE',
                    })
            return {'report_type': report_type, 'total_count': len(results), 'records': results}

        return {'report_type': report_type, 'error': f"Unsupported report type: {report_type}"}

    # =========================================================================
    # 6. PURCHASING REPORTS
    # =========================================================================

    @classmethod
    def get_purchasing_reports(
        cls,
        company: Company,
        user=None,
        report_type: str = 'purchase_orders',
        filters: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Purchasing reporting suite: Requisitions, POs, GRN, Invoices, 3-Way Match Exceptions.
        """
        filters = filters or {}
        has_fin_perm = user_has_finance_permission(user)
        start_date, end_date = cls._parse_dates(filters)

        # ---------------------------------------------------------------------
        # 6.1 Purchase Orders / Requisitions / GRN
        # ---------------------------------------------------------------------
        doc_type_map = {
            'purchase_orders': 'PURCHASE_ORDER',
            'requisitions': 'PURCHASE_REQUEST',
            'grn': 'GOODS_RECEIPT',
            'vendor_invoices': 'VENDOR_INVOICE',
            'three_way_match_exceptions': None,
        }

        doc_type = doc_type_map.get(report_type, 'PURCHASE_ORDER')

        if report_type == 'three_way_match_exceptions':
            qs = ProcurementDocument.objects.filter(
                company=company,
                status='MISMATCH',
                is_deleted=False
            ).select_related('vendor')
        else:
            qs = ProcurementDocument.objects.filter(
                company=company,
                document_type=doc_type,
                is_deleted=False,
                document_date__range=(start_date, end_date)
            ).select_related('vendor')

        results = [
            {
                'id': str(doc.id),
                'number': doc.number,
                'document_type': doc.document_type,
                'vendor_name': doc.vendor.name if doc.vendor else '',
                'document_date': str(doc.document_date),
                'total_amount': float(doc.total_amount) if has_fin_perm else None,
                'status': doc.status,
            }
            for doc in qs[:500]
        ]
        return {'report_type': report_type, 'total_count': qs.count(), 'records': results}

    # =========================================================================
    # 7. FINANCE & AR/AP AGING REPORTS (Linking S-4L sources)
    # =========================================================================

    @classmethod
    def get_finance_reports(
        cls,
        company: Company,
        user=None,
        report_type: str = 'ar_aging',
        filters: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Reuses authoritative Finance reports (AR Aging, AP Aging, Treasury, Profitability).
        Strictly requires financial permission.
        """
        if not user_has_finance_permission(user):
            raise PermissionDenied("Access to Finance reports requires financial permissions.")

        from finance.services.executive_dashboard_service import ExecutiveFinanceDashboardService

        if report_type == 'ar_aging':
            data = ExecutiveFinanceDashboardService.get_receivables_snapshot(company)
        elif report_type == 'ap_aging':
            data = ExecutiveFinanceDashboardService.get_payables_snapshot(company)
        elif report_type == 'treasury':
            data = ExecutiveFinanceDashboardService.get_treasury_snapshot(company)
        elif report_type == 'profitability_snapshot':
            data = ExecutiveFinanceDashboardService.get_profitability_snapshot(company)
        else:
            data = ExecutiveFinanceDashboardService.get_financial_health_summary(company)

        return {'report_type': report_type, 'data': data}

    # =========================================================================
    # 8. COMPLIANCE & EXCEPTION REPORTS (S-8 Action Center Integration)
    # =========================================================================

    @classmethod
    def get_compliance_reports(
        cls,
        company: Company,
        user=None,
        filters: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Aggregates operational, workforce, inventory, and procurement exceptions.
        """
        today = timezone.localdate() if hasattr(timezone, 'localdate') else date.today()
        threshold_30d = today + timedelta(days=30)

        # 1. Expiring employee documents
        expiring_docs = EmployeeDocument.objects.filter(
            employee__company=company,
            is_deleted=False,
            expiry_date__isnull=False,
            expiry_date__gte=today,
            expiry_date__lte=threshold_30d
        ).select_related('employee')

        expiring_docs_list = [
            {
                'employee_id': str(d.employee.id),
                'employee_code': d.employee.employee_code,
                'employee_name': d.employee.full_name,
                'document_type': d.document_type,
                'expiry_date': str(d.expiry_date),
            }
            for d in expiring_docs[:20]
        ]

        # 2. Unresolved JUMP guards
        jump_guards = Employee.objects.filter(
            company=company,
            employment_status='JUMP',
            is_deleted=False
        )

        # 3. Critical unresolved incidents
        critical_incidents = IncidentReport.objects.filter(
            company=company,
            severity='CRITICAL',
            status__in=['REPORTED', 'INVESTIGATING'],
            is_deleted=False
        ).select_related('site')

        critical_incidents_list = [
            {
                'id': str(inc.id),
                'incident_number': inc.incident_number,
                'title': inc.title,
                'site_name': inc.site.name if inc.site else '',
                'incident_date': inc.occurred_at.strftime('%Y-%m-%d') if inc.occurred_at else '',
                'status': inc.status,
            }
            for inc in critical_incidents[:20]
        ]

        # 4. Unresolved escalations
        open_escalations = OperationsEscalation.objects.filter(
            company=company,
            status__in=['OPEN', 'IN_PROGRESS'],
            is_deleted=False
        ).select_related('site')

        open_escalations_list = [
            {
                'id': str(esc.id),
                'title': esc.title,
                'site_name': esc.site.name if esc.site else '',
                'priority': esc.priority,
                'due_at': esc.due_at.strftime('%Y-%m-%d %H:%M') if esc.due_at else '',
            }
            for esc in open_escalations[:20]
        ]

        # 5. Failed supervisor inspections (Authoritative S-7.1 InspectionPolicy evaluation)
        inspections_qs = SupervisorInspection.objects.filter(
            company=company,
            is_deleted=False
        ).select_related('site', 'policy', 'inspector', 'inspected_employee').order_by('-inspection_datetime')

        if filters and (filters.get('start_date') or filters.get('date_from')):
            s_date, e_date = cls._parse_dates(filters)
            inspections_qs = inspections_qs.filter(inspection_datetime__date__range=(s_date, e_date))

        failed_inspections_list = []
        for insp in inspections_qs:
            status_eval = cls.get_inspection_compliance_status(insp, company=company)
            if status_eval['is_failed']:
                failed_inspections_list.append({
                    'id': str(insp.id),
                    'site_name': insp.site.name if insp.site else '',
                    'inspection_datetime': insp.inspection_datetime.strftime('%Y-%m-%d %H:%M'),
                    'score': status_eval['overall_score'],
                    'policy_name': status_eval['policy_name'],
                    'escalation_threshold': status_eval['escalation_threshold'],
                    'critical_threshold': status_eval['critical_threshold'],
                    'severity': status_eval['severity'],
                    'compliance_status': status_eval['compliance_status'],
                    'deficiencies': insp.deficiencies_observed,
                })

        # 6. Unreturned equipment from inactive guards
        unreturned_equipment = EquipmentIssue.objects.filter(
            company=company,
            custody_type='EMPLOYEE',
            status='ISSUED',
            employee__employment_status__in=['TERMINATED', 'SUSPENDED', 'RESIGNED', 'JUMP'],
            is_deleted=False
        ).select_related('employee', 'item', 'item_serial')

        unreturned_equipment_list = [
            {
                'id': str(iss.id),
                'employee_code': iss.employee.employee_code if iss.employee else '',
                'employee_name': iss.employee.full_name if iss.employee else '',
                'employee_status': iss.employee.employment_status if iss.employee else '',
                'item_name': iss.item.name if iss.item else '',
                'serial_number': iss.item_serial.serial_number if iss.item_serial else '',
                'quantity': iss.quantity,
            }
            for iss in unreturned_equipment[:20]
        ]

        # 7. Payroll blockers
        payroll_blockers = EmployeePayrollCalculation.objects.filter(
            company=company,
            has_blockers=True,
            status='BLOCKED',
            is_deleted=False
        ).select_related('employee')

        payroll_blockers_list = [
            {
                'id': str(calc.id),
                'employee_name': calc.employee.full_name if calc.employee else '',
                'period': f"{calc.period_start} to {calc.period_end}",
                'blocking_reasons': calc.blocking_reasons,
            }
            for calc in payroll_blockers[:20]
        ]

        # 8. Unbilled operational delivery (Sites where duties completed in last 30 days without posted billing)
        sites_with_duties = DutyAssignment.objects.filter(
            company=company,
            status='COMPLETED',
            date__gte=today - timedelta(days=30),
            is_deleted=False
        ).values_list('site_id', flat=True).distinct()

        sites_with_invoices = ServiceInvoice.objects.filter(
            company=company,
            status='POSTED',
            period_end__gte=today - timedelta(days=30),
            is_deleted=False
        ).values_list('service_contract__sites__id', flat=True).distinct()

        unbilled_site_ids = set(filter(None, sites_with_duties)) - set(filter(None, sites_with_invoices))
        unbilled_sites = OperationalSite.objects.filter(id__in=unbilled_site_ids, company=company)
        unbilled_sites_list = [{'id': str(s.id), 'name': s.name} for s in unbilled_sites[:20]]

        # 9. Purchasing / 3-way match exceptions
        purchasing_mismatches = ProcurementDocument.objects.filter(
            company=company,
            status='MISMATCH',
            is_deleted=False
        ).count()

        return {
            'summary': {
                'expiring_documents_count': expiring_docs.count(),
                'jump_guards_count': jump_guards.count(),
                'critical_incidents_count': critical_incidents.count(),
                'open_escalations_count': open_escalations.count(),
                'failed_inspections_count': len(failed_inspections_list),
                'unreturned_equipment_count': unreturned_equipment.count(),
                'payroll_blockers_count': payroll_blockers.count(),
                'unbilled_sites_count': len(unbilled_site_ids),
                'purchasing_mismatches_count': purchasing_mismatches,
            },
            'expiring_documents': expiring_docs_list,
            'critical_incidents': critical_incidents_list,
            'open_escalations': open_escalations_list,
            'failed_inspections': failed_inspections_list,
            'unreturned_equipment': unreturned_equipment_list,
            'payroll_blockers': payroll_blockers_list,
            'unbilled_sites': unbilled_sites_list,
        }

    # =========================================================================
    # 9. TRENDS REPORTING (Last 6 Months Aggregates)
    # =========================================================================

    @classmethod
    def get_trends_report(cls, company: Company, user=None, months: int = 6) -> Dict[str, Any]:
        """
        Computes monthly historical metrics for workforce strength, absenteeism,
        vacancies, incidents, patrol completion, and financial trends.
        """
        today = timezone.localdate() if hasattr(timezone, 'localdate') else date.today()
        has_fin_perm = user_has_finance_permission(user)
        months = max(1, min(12, int(months)))

        trend_points = []
        for i in range(months - 1, -1, -1):
            # Calculate month start and end
            cur_year = today.year
            cur_month = today.month - i
            while cur_month <= 0:
                cur_month += 12
                cur_year -= 1

            _, last_day = calendar.monthrange(cur_year, cur_month)
            m_start = date(cur_year, cur_month, 1)
            m_end = date(cur_year, cur_month, last_day)
            label = m_start.strftime('%b %Y')

            # Workforce count active in month
            wf_count = Employee.objects.filter(
                company=company,
                is_deleted=False,
                hire_date__lte=m_end
            ).filter(
                Q(resignation_date__isnull=True) | Q(resignation_date__gte=m_start)
            ).count()

            # Duties & Absenteeism
            month_duties = DutyAssignment.objects.filter(
                company=company,
                date__range=(m_start, m_end),
                is_deleted=False
            )
            total_duties = month_duties.count()
            absent_duties = month_duties.filter(status='ABSENT').count()
            absent_pct = round((absent_duties / total_duties * 100.0), 2) if total_duties > 0 else 0.0

            # Incidents
            inc_count = IncidentReport.objects.filter(
                company=company,
                occurred_at__date__range=(m_start, m_end),
                is_deleted=False
            ).count()

            # Patrol completion %
            patrols = PatrolRun.objects.filter(
                company=company,
                scheduled_start__date__range=(m_start, m_end),
                is_deleted=False
            )
            tot_p = patrols.count()
            comp_p = patrols.filter(status='COMPLETED').count()
            p_comp_pct = round((comp_p / tot_p * 100.0), 2) if tot_p > 0 else 100.0

            pt = {
                'month': label,
                'workforce_strength': wf_count,
                'absenteeism_pct': absent_pct,
                'incidents_count': inc_count,
                'patrol_completion_pct': p_comp_pct,
            }

            if has_fin_perm:
                # Revenue in month from posted service invoices
                rev = ServiceInvoice.objects.filter(
                    company=company,
                    status='POSTED',
                    is_deleted=False,
                    period_start__gte=m_start,
                    period_end__lte=m_end
                ).aggregate(total=Coalesce(Sum('total_amount'), Decimal('0.00'), output_field=DecimalField()))['total']

                # Payroll in month
                pay = EmployeePayrollCalculation.objects.filter(
                    company=company,
                    is_deleted=False,
                    period_start__gte=m_start,
                    period_end__lte=m_end
                ).aggregate(total=Coalesce(Sum('gross_earnings'), Decimal('0.00'), output_field=DecimalField()))['total']

                margin = rev - pay
                pt['revenue'] = float(rev)
                pt['payroll_cost'] = float(pay)
                pt['margin'] = float(margin)

            trend_points.append(pt)

        return {
            'months': months,
            'is_financial_masked': not has_fin_perm,
            'data': trend_points
        }

    # =========================================================================
    # 10. DRILL-DOWN CAPABILITY
    # =========================================================================

    @classmethod
    def get_drill_down_data(cls, company: Company, user=None, entity_type: str = 'site', entity_id: str = '') -> Dict[str, Any]:
        """
        Resolves a summary KPI or report row into underlying source entity details.
        """
        if not entity_id:
            return {'error': 'entity_id is required for drill-down.'}

        if entity_type == 'site':
            site = OperationalSite.objects.filter(company=company, id=entity_id, is_deleted=False).first()
            if not site:
                return {'error': 'Operational site not found'}
            posts = SecurityPost.objects.filter(site=site, is_deleted=False).values('id', 'post_name', 'is_active')
            deployments = Deployment.objects.filter(site=site, status='ACTIVE', is_deleted=False).select_related('employee', 'designation')
            dep_list = [
                {
                    'id': str(d.id),
                    'employee_name': d.employee.full_name if d.employee else '',
                    'designation': d.designation.name if d.designation else '',
                    'start_date': str(d.start_date)
                }
                for d in deployments
            ]
            return {
                'entity_type': 'site',
                'id': str(site.id),
                'name': site.name,
                'address': site.address,
                'client_name': site.crm_entity.name if site.crm_entity else '',
                'posts': list(posts),
                'active_deployments': dep_list,
            }

        elif entity_type == 'employee':
            emp = Employee.objects.filter(company=company, id=entity_id, is_deleted=False).select_related('designation', 'branch').first()
            if not emp:
                return {'error': 'Employee not found'}
            return {
                'entity_type': 'employee',
                'id': str(emp.id),
                'employee_code': emp.employee_code,
                'full_name': emp.full_name,
                'classification': emp.classification,
                'designation': emp.designation.name if emp.designation else '',
                'phone': emp.phone,
                'status': emp.employment_status,
                'hire_date': str(emp.hire_date) if emp.hire_date else '',
            }

        elif entity_type == 'contract':
            contract = ServiceContract.objects.filter(company=company, id=entity_id, is_deleted=False).select_related('crm_entity').first()
            if not contract:
                return {'error': 'Service contract not found'}
            sites = contract.sites.filter(is_deleted=False).values('id', 'name')
            return {
                'entity_type': 'contract',
                'id': str(contract.id),
                'contract_code': contract.contract_code,
                'client_name': contract.crm_entity.name if contract.crm_entity else '',
                'start_date': str(contract.start_date),
                'end_date': str(contract.end_date) if contract.end_date else '',
                'status': contract.status,
                'sites': list(sites),
            }

        elif entity_type == 'incident':
            inc = IncidentReport.objects.filter(company=company, id=entity_id, is_deleted=False).select_related('site').first()
            if not inc:
                return {'error': 'Incident not found'}
            return {
                'entity_type': 'incident',
                'id': str(inc.id),
                'incident_number': inc.incident_number,
                'title': inc.title,
                'site_name': inc.site.name if inc.site else '',
                'severity': inc.severity,
                'category': inc.category,
                'status': inc.status,
                'description': inc.description,
            }

        elif entity_type == 'inspection':
            insp = SupervisorInspection.objects.filter(
                company=company, id=entity_id, is_deleted=False
            ).select_related('site', 'inspector', 'inspected_employee', 'policy').first()
            if not insp:
                return {'error': 'Supervisor inspection not found'}
            comp_eval = cls.get_inspection_compliance_status(insp, company=company)
            return {
                'entity_type': 'inspection',
                'id': str(insp.id),
                'site_name': insp.site.name if insp.site else '',
                'inspector': str(insp.inspector) if insp.inspector else '',
                'inspected_employee': insp.inspected_employee.full_name if insp.inspected_employee else '',
                'inspection_datetime': insp.inspection_datetime.strftime('%Y-%m-%d %H:%M'),
                'overall_score': comp_eval['overall_score'],
                'status': insp.status,
                'policy_name': comp_eval['policy_name'],
                'warning_threshold': comp_eval['warning_threshold'],
                'escalation_threshold': comp_eval['escalation_threshold'],
                'critical_threshold': comp_eval['critical_threshold'],
                'compliance_status': comp_eval['compliance_status'],
                'severity': comp_eval['severity'],
                'is_failed': comp_eval['is_failed'],
                'deficiencies_observed': insp.deficiencies_observed,
                'corrective_action_required': insp.corrective_action_required,
                'notes': insp.notes,
            }

        return {'error': f"Drill-down for entity type '{entity_type}' is not supported."}

    # =========================================================================
    # 11. UNIVERSAL CSV EXPORT
    # =========================================================================

    @classmethod
    def export_report_csv(
        cls,
        company: Company,
        user=None,
        domain: str = 'workforce',
        report_type: str = 'employee_master',
        filters: Optional[Dict[str, Any]] = None
    ):
        """
        Reuses universal export infrastructure to download CSV report.
        """
        if domain == 'workforce':
            res = cls.get_workforce_reports(company, user, report_type, filters)
            records = res.get('records', [])
        elif domain == 'operations':
            res = cls.get_operations_reports(company, user, report_type, filters)
            records = res.get('records', [])
        elif domain == 'inventory':
            res = cls.get_inventory_reports(company, user, report_type, filters)
            records = res.get('records', [])
        elif domain == 'purchasing':
            res = cls.get_purchasing_reports(company, user, report_type, filters)
            records = res.get('records', [])
        else:
            records = []

        filename_prefix = f"security_{domain}_{report_type}"
        return UniversalExportService.export_csv_from_dicts(records, filename_prefix=filename_prefix)
