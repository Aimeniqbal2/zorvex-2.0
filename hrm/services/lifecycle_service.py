import json
import logging
from datetime import date, timedelta
from django.db import transaction
from django.core.exceptions import ValidationError
from django.utils import timezone

from hrm.models import (
    Employee,
    EmploymentHistory,
    EmployeeSalaryAssignment,
    Designation,
    Department,
    SalaryStructure,
    JumpRecord,
    JumpRecordStatus,
)

logger = logging.getLogger(__name__)


class LifecycleEventType:
    JOIN = 'JOIN'
    CONFIRMATION = 'CONFIRMATION'
    PROMOTION = 'PROMOTION'
    DESIGNATION_CHANGE = 'DESIGNATION_CHANGE'
    DEPARTMENT_CHANGE = 'DEPARTMENT_CHANGE'
    CLASSIFICATION_CHANGE = 'CLASSIFICATION_CHANGE'
    SALARY_REVISION = 'SALARY_REVISION'
    TRANSFER = 'TRANSFER'
    RELIEF = 'RELIEF'
    SUSPENSION = 'SUSPENSION'
    REINSTATEMENT = 'REINSTATEMENT'
    RESIGNATION = 'RESIGNATION'
    TERMINATION = 'TERMINATION'
    JUMP_OUTCOME = 'JUMP_OUTCOME'
    REHIRE = 'REHIRE'
    OSL_REPORTED = 'OSL_REPORTED'
    OSL_CONFIRMED = 'OSL_CONFIRMED'
    OSL_CANCELLED = 'OSL_CANCELLED'
    DELIST_BLACKLIST = 'DELIST_BLACKLIST'

    CHOICES = [
        (JOIN, 'Join'),
        (CONFIRMATION, 'Confirmation'),
        (PROMOTION, 'Promotion'),
        (DESIGNATION_CHANGE, 'Designation Change'),
        (DEPARTMENT_CHANGE, 'Department Change'),
        (CLASSIFICATION_CHANGE, 'Classification Change'),
        (SALARY_REVISION, 'Salary Revision'),
        (TRANSFER, 'Transfer'),
        (RELIEF, 'Relief'),
        (SUSPENSION, 'Suspension'),
        (REINSTATEMENT, 'Reinstatement'),
        (RESIGNATION, 'Resignation'),
        (TERMINATION, 'Termination'),
        (JUMP_OUTCOME, 'JUMP Outcome'),
        (REHIRE, 'Rehire'),
        (OSL_REPORTED, 'OSL Reported'),
        (OSL_CONFIRMED, 'OSL Confirmed'),
        (OSL_CANCELLED, 'OSL Cancelled'),
        (DELIST_BLACKLIST, 'Delisted from Blacklist'),
    ]


class LifecycleService:
    """
    Phase S-5H: Comprehensive Workforce Lifecycle Engine.
    Coordinates promotions, department/classification transfers, salary revisions,
    deployment transfers/reliefs, suspension/reinstatement, separations (resignation/termination),
    JUMP outcomes, and rehire without duplicate employee masters.
    """

    @classmethod
    def promote_or_change_designation(
        cls,
        employee: Employee,
        new_designation: Designation,
        effective_date: date = None,
        reason: str = '',
        approved_by=None,
        user=None,
        notes: str = '',
        is_promotion: bool = True,
    ) -> EmploymentHistory:
        """
        Promotes employee or updates designation with effective dating,
        preserving previous designation history in EmploymentHistory.
        """
        if not new_designation:
            raise ValidationError({'designation': 'New designation is required.'})
        if str(new_designation.company_id) != str(employee.company_id):
            raise ValidationError({'designation': 'Designation must belong to the same company.'})

        d = effective_date or date.today()
        old_desig = employee.designation
        old_val = old_desig.name if old_desig else 'Unassigned'
        new_val = new_designation.name

        with transaction.atomic():
            employee.designation = new_designation
            employee._skip_history_log = True
            employee.save(update_fields=['designation', 'updated_at'])

            event_type = LifecycleEventType.PROMOTION if is_promotion else LifecycleEventType.DESIGNATION_CHANGE
            summary = notes or f"{'Promoted' if is_promotion else 'Designation changed'} from {old_val} to {new_val}"

            history = EmploymentHistory.objects.create(
                company=employee.company,
                employee=employee,
                event_type=event_type,
                effective_date=d,
                old_value=old_val,
                new_value=new_val,
                reason=reason,
                notes=summary,
                approved_by=approved_by,
                changed_by=user,
                metadata={
                    'old_designation_id': str(old_desig.id) if old_desig else None,
                    'new_designation_id': str(new_designation.id),
                    'is_promotion': is_promotion,
                }
            )
            return history

    @classmethod
    def change_department(
        cls,
        employee: Employee,
        new_department: Department,
        effective_date: date = None,
        reason: str = '',
        approved_by=None,
        user=None,
        notes: str = '',
    ) -> EmploymentHistory:
        """
        Changes employee department with historical event tracking.
        """
        if not new_department:
            raise ValidationError({'department': 'New department is required.'})
        if str(new_department.company_id) != str(employee.company_id):
            raise ValidationError({'department': 'Department must belong to the same company.'})

        d = effective_date or date.today()
        old_dept = employee.department
        old_val = old_dept.name if old_dept else 'Unassigned'
        new_val = new_department.name

        with transaction.atomic():
            employee.department = new_department
            employee._skip_history_log = True
            employee.save(update_fields=['department', 'updated_at'])

            summary = notes or f"Department transferred from {old_val} to {new_val}"
            history = EmploymentHistory.objects.create(
                company=employee.company,
                employee=employee,
                event_type=LifecycleEventType.DEPARTMENT_CHANGE,
                effective_date=d,
                old_value=old_val,
                new_value=new_val,
                reason=reason,
                notes=summary,
                approved_by=approved_by,
                changed_by=user,
                metadata={
                    'old_department_id': str(old_dept.id) if old_dept else None,
                    'new_department_id': str(new_department.id),
                }
            )
            return history

    @classmethod
    def change_classification(
        cls,
        employee: Employee,
        new_classification: str,
        effective_date: date = None,
        reason: str = '',
        approved_by=None,
        user=None,
        notes: str = '',
    ) -> EmploymentHistory:
        """
        Changes employee classification (DIRECT vs INDIRECT).
        """
        if new_classification not in ['DIRECT', 'INDIRECT']:
            raise ValidationError({'classification': "Classification must be 'DIRECT' or 'INDIRECT'."})

        d = effective_date or date.today()
        old_cls = employee.classification

        with transaction.atomic():
            employee.classification = new_classification
            employee._skip_history_log = True
            employee.save(update_fields=['classification', 'updated_at'])

            summary = notes or f"Classification changed from {old_cls} to {new_classification}"
            history = EmploymentHistory.objects.create(
                company=employee.company,
                employee=employee,
                event_type=LifecycleEventType.CLASSIFICATION_CHANGE,
                effective_date=d,
                old_value=old_cls,
                new_value=new_classification,
                reason=reason,
                notes=summary,
                approved_by=approved_by,
                changed_by=user,
                metadata={
                    'old_classification': old_cls,
                    'new_classification': new_classification,
                }
            )
            return history

    @classmethod
    def revise_salary(
        cls,
        employee: Employee,
        base_salary,
        effective_date: date = None,
        daily_rate=None,
        single_ot_rate=None,
        double_ot_rate=None,
        currency=None,
        salary_structure=None,
        reason: str = '',
        approved_by=None,
        user=None,
        notes: str = '',
    ) -> tuple[EmployeeSalaryAssignment, EmploymentHistory]:
        """
        Creates a new effective EmployeeSalaryAssignment rather than editing historical rates.
        Finalized historical payroll runs and payslips remain completely unaffected.
        """
        d = effective_date or date.today()

        with transaction.atomic():
            curr_assign = EmployeeSalaryAssignment.objects.filter(
                company=employee.company,
                employee=employee,
                status='ACTIVE',
                is_deleted=False
            ).order_by('-effective_from').first()

            old_comp = {}
            if curr_assign:
                old_comp = {
                    'base_salary': str(curr_assign.base_salary),
                    'daily_rate': str(curr_assign.daily_rate) if curr_assign.daily_rate is not None else None,
                    'single_ot_rate': str(curr_assign.single_ot_rate),
                    'double_ot_rate': str(curr_assign.double_ot_rate),
                    'effective_from': str(curr_assign.effective_from),
                    'effective_to': str(curr_assign.effective_to) if curr_assign.effective_to else None,
                }
                # If current active assignment starts on or after the new effective date, supersede it
                if curr_assign.effective_from >= d:
                    curr_assign.status = 'SUPERSEDED'
                    curr_assign.save(update_fields=['status', 'updated_at'])
                else:
                    # Cap active assignment to the day before new effective date
                    curr_assign.effective_to = d - timedelta(days=1)
                    curr_assign.save(update_fields=['effective_to', 'updated_at'])

            # Determine currency
            if not currency:
                if curr_assign and curr_assign.currency:
                    currency = curr_assign.currency
                else:
                    from finance.models import Currency
                    currency = (
                        Currency.objects.filter(company=employee.company, is_base_currency=True).first()
                        or Currency.objects.filter(company=employee.company).first()
                    )

            if not currency:
                raise ValidationError({'currency': 'Base currency is required for salary assignment.'})

            struct = salary_structure or (curr_assign.salary_structure if curr_assign else None)

            # Create new effective assignment
            new_assign = EmployeeSalaryAssignment(
                company=employee.company,
                employee=employee,
                salary_structure=struct,
                currency=currency,
                base_salary=base_salary,
                daily_rate=daily_rate,
                single_ot_rate=single_ot_rate if single_ot_rate is not None else 0,
                double_ot_rate=double_ot_rate if double_ot_rate is not None else 0,
                effective_from=d,
                effective_to=None,
                status='ACTIVE',
                notes=notes or reason or f"Salary revised on {d}"
            )
            new_assign.clean()
            new_assign.save()

            new_comp = {
                'base_salary': str(base_salary),
                'daily_rate': str(daily_rate) if daily_rate is not None else None,
                'single_ot_rate': str(new_assign.single_ot_rate),
                'double_ot_rate': str(new_assign.double_ot_rate),
                'effective_from': str(d),
            }

            summary = notes or f"Salary revised to Base {base_salary} (Effective {d})"
            history = EmploymentHistory.objects.create(
                company=employee.company,
                employee=employee,
                event_type=LifecycleEventType.SALARY_REVISION,
                effective_date=d,
                old_value=json.dumps(old_comp) if old_comp else '',
                new_value=json.dumps(new_comp),
                reason=reason,
                notes=summary,
                approved_by=approved_by,
                changed_by=user,
                metadata={
                    'old_compensation': old_comp,
                    'new_compensation': new_comp,
                    'assignment_id': str(new_assign.id),
                }
            )

            return new_assign, history

    @classmethod
    def transfer_deployment(
        cls,
        employee: Employee,
        new_site,
        new_post=None,
        new_service_contract=None,
        new_designation=None,
        start_date: date = None,
        relief_reason: str = '',
        notes: str = '',
        approved_by=None,
        user=None,
    ) -> tuple:
        """
        Coordinates deployment transfer by reusing existing S-5B Deployment workflow.
        Relieves previous active deployment and provisions new active deployment.
        """
        from operations.models import Deployment, DeploymentStatus, DeploymentAssignmentType

        d = start_date or date.today()

        with transaction.atomic():
            old_dep = Deployment.objects.filter(
                company=employee.company,
                employee=employee,
                status=DeploymentStatus.ACTIVE,
                is_deleted=False
            ).first()

            if not old_dep:
                raise ValidationError({'deployment': 'No ACTIVE deployment found to transfer.'})

            old_site_name = old_dep.site.name if old_dep.site else 'Site'
            new_site_name = new_site.name if hasattr(new_site, 'name') else 'New Site'

            # 1. Relieve old deployment
            old_dep.status = DeploymentStatus.RELIEVED
            old_dep.end_date = d
            old_dep.relieved_date = d
            old_dep.relief_reason = relief_reason or f"Transferred to {new_site_name}"
            old_dep.relieved_by = user
            old_dep.save()

            # 2. Resolve contract if not passed
            sc = new_service_contract
            if not sc:
                sc = new_site.service_contracts.filter(status='ACTIVE').first() or old_dep.service_contract

            # 3. Create new deployment
            new_dep = Deployment(
                company=employee.company,
                employee=employee,
                site=new_site,
                post=new_post,
                service_contract=sc,
                designation=new_designation or employee.designation,
                assignment_type=DeploymentAssignmentType.PERMANENT,
                start_date=d,
                status=DeploymentStatus.ACTIVE,
                assigned_by=user,
                notes=notes or f"Transferred from {old_site_name}"
            )
            new_dep.clean()
            new_dep.save()

            # 4. Record history
            summary = notes or f"Transferred deployment from {old_site_name} to {new_site_name}"
            history = EmploymentHistory.objects.create(
                company=employee.company,
                employee=employee,
                event_type=LifecycleEventType.TRANSFER,
                effective_date=d,
                old_value=f"Site: {old_site_name}",
                new_value=f"Site: {new_site_name}",
                reason=relief_reason,
                notes=summary,
                approved_by=approved_by,
                changed_by=user,
                metadata={
                    'old_deployment_id': str(old_dep.id),
                    'new_deployment_id': str(new_dep.id),
                    'old_site_id': str(old_dep.site_id),
                    'new_site_id': str(new_site.id),
                }
            )

            return new_dep, history

    @classmethod
    def relieve_deployment(
        cls,
        employee: Employee,
        relieved_date: date = None,
        relief_reason: str = '',
        notes: str = '',
        approved_by=None,
        user=None,
    ) -> tuple:
        """
        Coordinates deployment relief reusing existing S-5B Deployment workflow.
        """
        from operations.models import Deployment, DeploymentStatus

        d = relieved_date or date.today()

        with transaction.atomic():
            dep = Deployment.objects.filter(
                company=employee.company,
                employee=employee,
                status=DeploymentStatus.ACTIVE,
                is_deleted=False
            ).first()

            if not dep:
                raise ValidationError({'deployment': 'No ACTIVE deployment found to relieve.'})

            site_name = dep.site.name if dep.site else 'Site'
            dep.status = DeploymentStatus.RELIEVED
            dep.end_date = d
            dep.relieved_date = d
            dep.relief_reason = relief_reason or 'Relieved from site deployment'
            dep.relieved_by = user
            dep.save()

            summary = notes or f"Relieved from {site_name}. Reason: {relief_reason or 'Relieved'}"
            history = EmploymentHistory.objects.create(
                company=employee.company,
                employee=employee,
                event_type=LifecycleEventType.RELIEF,
                effective_date=d,
                old_value=f"Site: {site_name}",
                new_value='Unassigned (Relieved)',
                reason=relief_reason,
                notes=summary,
                approved_by=approved_by,
                changed_by=user,
                metadata={
                    'deployment_id': str(dep.id),
                    'site_id': str(dep.site_id),
                }
            )
            return dep, history

    @classmethod
    def suspend_employee(
        cls,
        employee: Employee,
        effective_date: date = None,
        reason: str = '',
        approved_by=None,
        user=None,
        notes: str = '',
    ) -> EmploymentHistory:
        """
        Suspends employee (ACTIVE -> SUSPENDED).
        Blocks normal active deployment and duty assignments per existing validation rules.
        """
        if employee.employment_status == 'SUSPENDED':
            raise ValidationError({'employment_status': 'Employee is already SUSPENDED.'})
        if employee.employment_status in ['RESIGNED', 'TERMINATED']:
            raise ValidationError({'employment_status': f'Cannot suspend separated employee ({employee.employment_status}).'})

        d = effective_date or date.today()
        old_status = employee.employment_status

        with transaction.atomic():
            employee.employment_status = 'SUSPENDED'
            employee._skip_history_log = True
            employee.save(update_fields=['employment_status', 'updated_at'])

            summary = notes or f"Employee suspended from active duty. Reason: {reason or 'Administrative suspension'}"
            history = EmploymentHistory.objects.create(
                company=employee.company,
                employee=employee,
                event_type=LifecycleEventType.SUSPENSION,
                effective_date=d,
                old_value=old_status,
                new_value='SUSPENDED',
                reason=reason,
                notes=summary,
                approved_by=approved_by,
                changed_by=user,
                metadata={
                    'previous_status': old_status,
                }
            )
            return history

    @classmethod
    def reinstate_employee(
        cls,
        employee: Employee,
        effective_date: date = None,
        reason: str = '',
        approved_by=None,
        user=None,
        notes: str = '',
    ) -> EmploymentHistory:
        """
        Reinstates employee back to active duty (SUSPENDED / JUMP -> ACTIVE).
        """
        if employee.employment_status not in ['SUSPENDED', 'JUMP']:
            raise ValidationError({'employment_status': f"Only SUSPENDED or JUMP employees can be reinstated (currently {employee.employment_status})."})

        d = effective_date or date.today()
        old_status = employee.employment_status

        with transaction.atomic():
            # If in JUMP, also restore JumpRecord and attendance state
            if old_status == 'JUMP':
                from operations.services.attendance_service import restore_employee_from_jump
                restore_employee_from_jump(
                    company=employee.company,
                    employee_id=employee.id,
                    user=user,
                    restore_date=d,
                    notes=notes or reason or 'Reinstated from JUMP'
                )
                employee.refresh_from_db()
            else:
                employee.employment_status = 'ACTIVE'
                employee.is_active = True
                employee._skip_history_log = True
                employee.save(update_fields=['employment_status', 'is_active', 'updated_at'])

            summary = notes or f"Employee reinstated to ACTIVE duty from {old_status}"
            history = EmploymentHistory.objects.create(
                company=employee.company,
                employee=employee,
                event_type=LifecycleEventType.REINSTATEMENT,
                effective_date=d,
                old_value=old_status,
                new_value='ACTIVE',
                reason=reason,
                notes=summary,
                approved_by=approved_by,
                changed_by=user,
                metadata={
                    'previous_status': old_status,
                }
            )
            return history

    @classmethod
    def resign_employee(
        cls,
        employee: Employee,
        resignation_date: date = None,
        last_working_date: date = None,
        reason: str = '',
        notice_details: str = '',
        approved_by=None,
        user=None,
        notes: str = '',
    ) -> EmploymentHistory:
        """
        Handles resignation workflow:
        - Relieves any active deployments
        - Sets employee status -> RESIGNED, is_active -> False
        - Preserves all workforce, history, and compensation records
        - Does NOT delete employee
        """
        if employee.employment_status in ['RESIGNED', 'TERMINATED']:
            raise ValidationError({'employment_status': f'Employee is already separated ({employee.employment_status}).'})

        res_date = resignation_date or date.today()
        lwd = last_working_date or res_date
        old_status = employee.employment_status

        with transaction.atomic():
            # 1. Close active deployments
            from operations.models import Deployment, DeploymentStatus
            active_deps = Deployment.objects.filter(
                company=employee.company,
                employee=employee,
                status=DeploymentStatus.ACTIVE,
                is_deleted=False
            )
            for dep in active_deps:
                dep.status = DeploymentStatus.RELIEVED
                dep.end_date = lwd
                dep.relieved_date = lwd
                dep.relief_reason = f"Resigned: {reason or 'Employee resigned'}"
                dep.relieved_by = user
                dep.save()

            # 2. Update employee master
            employee.employment_status = 'RESIGNED'
            employee.is_active = False
            employee.resignation_date = res_date
            employee.last_working_date = lwd
            employee._skip_history_log = True
            employee.save(update_fields=[
                'employment_status', 'is_active', 'resignation_date', 'last_working_date', 'updated_at'
            ])

            # 3. Record history
            summary = notes or f"Employee resigned. Last working date: {lwd}. Reason: {reason or 'Voluntary resignation'}"
            history = EmploymentHistory.objects.create(
                company=employee.company,
                employee=employee,
                event_type=LifecycleEventType.RESIGNATION,
                effective_date=res_date,
                old_value=old_status,
                new_value='RESIGNED',
                reason=reason,
                notes=summary,
                approved_by=approved_by,
                changed_by=user,
                metadata={
                    'resignation_date': str(res_date),
                    'last_working_date': str(lwd),
                    'notice_details': notice_details,
                    'previous_status': old_status,
                }
            )
            return history

    @classmethod
    def terminate_employee(
        cls,
        employee: Employee,
        effective_date: date = None,
        reason: str = '',
        category: str = '',
        authorized_by=None,
        user=None,
        notes: str = '',
    ) -> EmploymentHistory:
        """
        Handles controlled termination:
        - Relieves active deployments
        - Sets employee status -> TERMINATED, is_active -> False
        - Automatically registers individual into Enterprise Blacklist
        - Preserves full audit and employment history
        """
        if employee.employment_status in ['RESIGNED', 'TERMINATED']:
            raise ValidationError({'employment_status': f'Employee is already separated ({employee.employment_status}).'})

        d = effective_date or date.today()
        old_status = employee.employment_status

        with transaction.atomic():
            # 1. Close active deployments
            from operations.models import Deployment, DeploymentStatus
            active_deps = Deployment.objects.filter(
                company=employee.company,
                employee=employee,
                status=DeploymentStatus.ACTIVE,
                is_deleted=False
            )
            for dep in active_deps:
                dep.status = DeploymentStatus.RELIEVED
                dep.end_date = d
                dep.relieved_date = d
                dep.relief_reason = f"Terminated: {reason or 'Company termination'}"
                dep.relieved_by = user
                dep.save()

            # 2. Update employee
            employee.employment_status = 'TERMINATED'
            employee.is_active = False
            employee.termination_date = d
            employee._skip_history_log = True
            employee.save(update_fields=['employment_status', 'is_active', 'termination_date', 'updated_at'])

            # 3. Automatically add to Enterprise Blacklist
            from hrm.models import BlacklistedIndividual
            bl_full_name = employee.full_name or f"{employee.first_name or ''} {employee.last_name or ''}".strip() or 'Terminated Employee'
            BlacklistedIndividual.objects.create(
                company=employee.company,
                employee=employee,
                full_name=bl_full_name,
                cnic_number=employee.cnic_number or '',
                phone_number=getattr(employee, 'phone', None) or getattr(employee, 'telephone_number', '') or '',
                previous_employee_code=employee.employee_code or employee.previous_employee_code or '',
                reason=reason or notes or f"Terminated by management ({category or 'General'})",
                category=category or 'TERMINATION',
                blacklisted_at=timezone.now(),
                blacklisted_by=user or authorized_by,
                is_active_blacklist=True
            )

            # 4. Record history
            summary = notes or f"Employment terminated effective {d}. Category: {category or 'General'}. Reason: {reason or 'Separation'}. Automatically blacklisted."
            history = EmploymentHistory.objects.create(
                company=employee.company,
                employee=employee,
                event_type=LifecycleEventType.TERMINATION,
                effective_date=d,
                old_value=old_status,
                new_value='TERMINATED (BLACKLISTED)',
                reason=reason,
                notes=summary,
                approved_by=authorized_by,
                changed_by=user,
                metadata={
                    'termination_date': str(d),
                    'category': category,
                    'previous_status': old_status,
                    'is_blacklisted': True,
                }
            )
            return history

    @classmethod
    def resolve_jump(
        cls,
        employee: Employee,
        outcome: str,
        jump_record_id=None,
        effective_date: date = None,
        reason: str = '',
        approved_by=None,
        user=None,
        notes: str = '',
    ) -> tuple:
        """
        Resolves an active JumpRecord under HR control:
        - RETURNED / REINSTATED: Restores to ACTIVE using S-5D attendance restoration flow
        - RESIGNED: Triggers resignation workflow and marks jump record resolved
        - TERMINATED: Triggers termination workflow and marks jump record resolved
        - OTHER: Marks jump record resolved with resolution notes
        JUMP itself does NOT automatically choose separation outcome.
        """
        valid_outcomes = ['RETURNED', 'REINSTATED', 'RESIGNED', 'TERMINATED', 'OTHER']
        if outcome not in valid_outcomes:
            raise ValidationError({'outcome': f"Outcome must be one of {valid_outcomes}"})

        d = effective_date or date.today()

        with transaction.atomic():
            jump_qs = JumpRecord.objects.filter(
                company=employee.company,
                employee=employee,
                status=JumpRecordStatus.ACTIVE_JUMP
            )
            if jump_record_id:
                jump_rec = jump_qs.filter(pk=jump_record_id).first()
            else:
                jump_rec = jump_qs.first()

            history = None
            if outcome in ['RETURNED', 'REINSTATED']:
                from operations.services.attendance_service import restore_employee_from_jump
                restore_employee_from_jump(
                    company=employee.company,
                    employee_id=employee.id,
                    user=user,
                    restore_date=d,
                    notes=notes or reason or 'JUMP resolved: Reinstated / Returned'
                )
                if jump_rec:
                    jump_rec.refresh_from_db()
                    jump_rec.resolution_type = 'REINSTATED'
                    jump_rec.resolved_at = timezone.now()
                    jump_rec.resolved_by = user
                    jump_rec.resolution_notes = notes or reason or 'Returned to duty'
                    jump_rec.save(update_fields=['resolution_type', 'resolved_at', 'resolved_by', 'resolution_notes', 'updated_at'])

                summary = notes or f"JUMP resolved: Employee returned / reinstated to active duty on {d}"
                history = EmploymentHistory.objects.create(
                    company=employee.company,
                    employee=employee,
                    event_type=LifecycleEventType.JUMP_OUTCOME,
                    effective_date=d,
                    old_value='JUMP',
                    new_value='REINSTATED',
                    reason=reason,
                    notes=summary,
                    approved_by=approved_by,
                    changed_by=user,
                    metadata={
                        'outcome': 'REINSTATED',
                        'jump_record_id': str(jump_rec.id) if jump_rec else None,
                    }
                )

            elif outcome == 'RESIGNED':
                history = cls.resign_employee(
                    employee=employee,
                    resignation_date=d,
                    reason=reason or 'Resignation following unexcused absence (JUMP)',
                    approved_by=approved_by,
                    user=user,
                    notes=notes or 'JUMP resolved via formal resignation'
                )
                if jump_rec:
                    jump_rec.status = JumpRecordStatus.RESIGNED
                    jump_rec.resolution_type = 'RESIGNED'
                    jump_rec.resolved_at = timezone.now()
                    jump_rec.resolved_by = user
                    jump_rec.resolution_notes = notes or reason or 'Resolved as Resigned'
                    jump_rec.save(update_fields=['status', 'resolution_type', 'resolved_at', 'resolved_by', 'resolution_notes', 'updated_at'])

            elif outcome == 'TERMINATED':
                history = cls.terminate_employee(
                    employee=employee,
                    effective_date=d,
                    reason=reason or 'Termination following persistent unexcused absence (JUMP)',
                    category='ABSENTEEISM',
                    authorized_by=approved_by,
                    user=user,
                    notes=notes or 'JUMP resolved via HR termination'
                )
                if jump_rec:
                    jump_rec.status = JumpRecordStatus.TERMINATED
                    jump_rec.resolution_type = 'TERMINATED'
                    jump_rec.resolved_at = timezone.now()
                    jump_rec.resolved_by = user
                    jump_rec.resolution_notes = notes or reason or 'Resolved as Terminated'
                    jump_rec.save(update_fields=['status', 'resolution_type', 'resolved_at', 'resolved_by', 'resolution_notes', 'updated_at'])

            else:  # OTHER
                if jump_rec:
                    jump_rec.status = JumpRecordStatus.OTHER
                    jump_rec.resolution_type = 'OTHER'
                    jump_rec.resolved_at = timezone.now()
                    jump_rec.resolved_by = user
                    jump_rec.resolution_notes = notes or reason or 'Other resolution'
                    jump_rec.save(update_fields=['status', 'resolution_type', 'resolved_at', 'resolved_by', 'resolution_notes', 'updated_at'])

                summary = notes or f"JUMP outcome resolved as OTHER: {reason}"
                history = EmploymentHistory.objects.create(
                    company=employee.company,
                    employee=employee,
                    event_type=LifecycleEventType.JUMP_OUTCOME,
                    effective_date=d,
                    old_value='JUMP',
                    new_value='OTHER',
                    reason=reason,
                    notes=summary,
                    approved_by=approved_by,
                    changed_by=user,
                    metadata={
                        'outcome': 'OTHER',
                        'jump_record_id': str(jump_rec.id) if jump_rec else None,
                    }
                )

            return jump_rec, history

    @classmethod
    def rehire_employee(
        cls,
        employee: Employee,
        new_employee_code: str,
        rehire_date: date = None,
        designation: Designation = None,
        department: Department = None,
        classification: str = None,
        base_salary=None,
        daily_rate=None,
        single_ot_rate=None,
        double_ot_rate=None,
        currency=None,
        salary_structure=None,
        approved_by=None,
        user=None,
        notes: str = '',
    ) -> tuple:
        """
        Rehires a previously separated (RESIGNED, TERMINATED, OSL_CONFIRMED) employee.
        Strictly requires a NEW Employee Code (cannot reuse old badge code).
        Enforces active Enterprise Blacklist check (rehire blocked if blacklisted).
        """
        if employee.employment_status not in ['RESIGNED', 'TERMINATED', 'INACTIVE', 'OSL_CONFIRMED']:
            raise ValidationError({'employment_status': f"Only separated or confirmed OSL employees can be rehired. Current status: {employee.employment_status}"})

        # 1. Active Blacklist Check
        from hrm.models import BlacklistedIndividual
        from django.db.models import Q
        bl_cond = Q(employee=employee)
        if employee.cnic_number:
            bl_cond |= Q(cnic_number=employee.cnic_number)
        emp_phone = getattr(employee, 'phone', None) or getattr(employee, 'telephone_number', None)
        if emp_phone:
            bl_cond |= Q(phone_number__icontains=str(emp_phone)[-10:])

        bl_entry = BlacklistedIndividual.objects.filter(
            company=employee.company,
            is_active_blacklist=True
        ).filter(bl_cond).first()

        if bl_entry:
            raise ValidationError({
                'employee': f"Cannot rehire '{bl_entry.full_name}' (CNIC: {bl_entry.cnic_number}). "
                            f"This individual is currently on the Enterprise BLACKLIST (Reason: {bl_entry.reason}). "
                            f"They must be formally removed from the Blacklist by an authorized executive (Admin/CEO/COO/GM/HR Manager) before rehire."
            })

        # 2. Mandatory New Employee Code Validation
        clean_new_code = str(new_employee_code or '').strip()
        if not clean_new_code:
            raise ValidationError({'new_employee_code': 'A new employee code is strictly required when rehiring. Cannot rehire without a new code.'})

        old_code = str(employee.employee_code or '').strip()
        if clean_new_code.lower() == old_code.lower():
            raise ValidationError({'new_employee_code': f"Employee cannot be reactivated with previous code '{old_code}'. A NEW distinct employee code is required."})

        # Ensure new code is not duplicate in company
        dup_emp = Employee.objects.filter(
            company=employee.company,
            is_deleted=False
        ).filter(
            Q(employee_code__iexact=clean_new_code) | Q(previous_employee_code__iexact=clean_new_code)
        ).exclude(pk=employee.pk).first()

        if dup_emp:
            existing_name = dup_emp.full_name or f"{dup_emp.first_name} {dup_emp.last_name or ''}".strip()
            raise ValidationError({'new_employee_code': f"Employee code '{clean_new_code}' is already assigned to {existing_name} ({dup_emp.employee_code})."})

        d = rehire_date or date.today()
        old_status = employee.employment_status

        with transaction.atomic():
            employee.previous_employee_code = old_code
            employee.employee_code = clean_new_code
            employee.employment_status = 'ACTIVE'
            employee.is_active = True
            employee.rehire_date = d

            if designation:
                if str(designation.company_id) != str(employee.company_id):
                    raise ValidationError({'designation': 'Designation must belong to the same company.'})
                employee.designation = designation

            if department:
                if str(department.company_id) != str(employee.company_id):
                    raise ValidationError({'department': 'Department must belong to the same company.'})
                employee.department = department

            if classification:
                if classification not in ['DIRECT', 'INDIRECT']:
                    raise ValidationError({'classification': "Classification must be 'DIRECT' or 'INDIRECT'."})
                employee.classification = classification

            employee._skip_history_log = True
            employee.save()

            # Provision new compensation assignment if salary details supplied
            new_assign = None
            if base_salary is not None:
                new_assign, _ = cls.revise_salary(
                    employee=employee,
                    base_salary=base_salary,
                    effective_date=d,
                    daily_rate=daily_rate,
                    single_ot_rate=single_ot_rate,
                    double_ot_rate=double_ot_rate,
                    currency=currency,
                    salary_structure=salary_structure,
                    reason=f"Rehire compensation package effective {d}",
                    approved_by=approved_by,
                    user=user,
                    notes=notes or f"Rehired compensation on {d}"
                )

            summary = notes or f"Employee rehired into active duty on {d} with NEW code {clean_new_code} (Old: {old_code}) as {employee.designation.name if employee.designation else 'Guard'} ({employee.classification})"
            history = EmploymentHistory.objects.create(
                company=employee.company,
                employee=employee,
                event_type=LifecycleEventType.REHIRE,
                effective_date=d,
                old_value=f"Separated ({old_status}) [Old Code: {old_code}]",
                new_value=f"Active - Code: {clean_new_code} - {employee.designation.name if employee.designation else ''} ({employee.classification})",
                reason='Rehire',
                notes=summary,
                approved_by=approved_by,
                changed_by=user,
                metadata={
                    'rehire_date': str(d),
                    'previous_status': old_status,
                    'old_employee_code': old_code,
                    'new_employee_code': clean_new_code,
                    'designation_id': str(employee.designation_id) if employee.designation_id else None,
                    'department_id': str(employee.department_id) if employee.department_id else None,
                    'classification': employee.classification,
                    'has_new_salary': new_assign is not None,
                }
            )

            return employee, new_assign, history

    @classmethod
    def report_osl(
        cls,
        employee: Employee,
        reported_by_department: str = 'HR',
        effective_date: date = None,
        reason: str = '',
        notes: str = '',
        user=None,
    ) -> tuple:
        """
        Reports employee as OSL (Overstayed Leave / Absentee / Bhag gaya).
        Can be initiated by HR or Operations.
        Sets employment_status -> 'OSL' while keeping is_active = True during review.
        Creates/updates JumpRecord in active jump status.
        """
        if employee.employment_status in ['RESIGNED', 'TERMINATED']:
            raise ValidationError({'employment_status': f"Cannot mark separated employee ({employee.employment_status}) as OSL."})

        d = effective_date or date.today()
        old_status = employee.employment_status

        with transaction.atomic():
            employee.employment_status = 'OSL'
            employee._skip_history_log = True
            employee.save(update_fields=['employment_status', 'updated_at'])

            # Create or update JumpRecord
            from hrm.models import JumpRecord, JumpRecordStatus
            jump_rec, created = JumpRecord.objects.get_or_create(
                company=employee.company,
                employee=employee,
                status=JumpRecordStatus.ACTIVE_JUMP,
                defaults={
                    'absent_since': d,
                    'consecutive_absent_days': 1,
                    'reason': reason or f"Reported as OSL by {reported_by_department}",
                    'reported_by_department': reported_by_department,
                    'reported_by': user,
                }
            )
            if not created:
                jump_rec.absent_since = d
                jump_rec.reported_by_department = reported_by_department
                jump_rec.reported_by = user
                jump_rec.reason = reason or f"Reported as OSL by {reported_by_department}"
                jump_rec.save(update_fields=['absent_since', 'reported_by_department', 'reported_by', 'reason', 'updated_at'])

            summary = notes or f"Employee reported as OSL by {reported_by_department}. Reason: {reason or 'Unexcused absence'}"
            history = EmploymentHistory.objects.create(
                company=employee.company,
                employee=employee,
                event_type=LifecycleEventType.OSL_REPORTED,
                effective_date=d,
                old_value=old_status,
                new_value='OSL',
                reason=reason,
                notes=summary,
                approved_by=None,
                changed_by=user,
                metadata={
                    'reported_by_department': reported_by_department,
                    'jump_record_id': str(jump_rec.id),
                    'previous_status': old_status,
                }
            )
            return jump_rec, history

    @classmethod
    def cancel_osl(
        cls,
        employee: Employee,
        user=None,
        reason: str = '',
        notes: str = '',
    ) -> tuple:
        """
        HR cancels OSL (e.g. guard returned or reported in error).
        Restores employment_status -> 'ACTIVE', is_active = True.
        Resolves JumpRecord as CANCELLED with no penalty.
        """
        if employee.employment_status != 'OSL':
            raise ValidationError({'employment_status': f"Employee is not currently in OSL status (current: {employee.employment_status})."})

        d = date.today()

        with transaction.atomic():
            employee.employment_status = 'ACTIVE'
            employee.is_active = True
            employee._skip_history_log = True
            employee.save(update_fields=['employment_status', 'is_active', 'updated_at'])

            from hrm.models import JumpRecord, JumpRecordStatus
            active_jumps = JumpRecord.objects.filter(
                company=employee.company,
                employee=employee,
                status=JumpRecordStatus.ACTIVE_JUMP
            )
            for j in active_jumps:
                j.status = JumpRecordStatus.RESTORED
                j.resolution_type = 'CANCELLED'
                j.resolved_at = timezone.now()
                j.resolved_by = user
                j.resolution_notes = reason or notes or 'OSL cancelled by HR: guard returned / reported in error'
                j.save(update_fields=['status', 'resolution_type', 'resolved_at', 'resolved_by', 'resolution_notes', 'updated_at'])

            summary = notes or f"OSL cancelled by HR. Guard restored to ACTIVE duty without penalty. Reason: {reason or 'Returned / mistake'}"
            history = EmploymentHistory.objects.create(
                company=employee.company,
                employee=employee,
                event_type=LifecycleEventType.OSL_CANCELLED,
                effective_date=d,
                old_value='OSL',
                new_value='ACTIVE',
                reason=reason,
                notes=summary,
                approved_by=user,
                changed_by=user,
                metadata={
                    'cancelled_by': user.get_full_name() if user else None,
                }
            )
            return employee, history

    @classmethod
    def confirm_osl(
        cls,
        employee: Employee,
        effective_date: date = None,
        user=None,
        reason: str = '',
        notes: str = '',
    ) -> tuple:
        """
        HR confirms OSL (absconded / bhag gaya).
        Sets employment_status -> 'OSL_CONFIRMED', is_active = False.
        Relieves active deployments.
        Resolves JumpRecord as OSL_CONFIRMED.
        """
        if employee.employment_status != 'OSL':
            raise ValidationError({'employment_status': f"Employee must be in pending OSL status to confirm (current: {employee.employment_status})."})

        d = effective_date or date.today()

        with transaction.atomic():
            # 1. Close active deployments
            from operations.models import Deployment, DeploymentStatus
            active_deps = Deployment.objects.filter(
                company=employee.company,
                employee=employee,
                status=DeploymentStatus.ACTIVE,
                is_deleted=False
            )
            for dep in active_deps:
                dep.status = DeploymentStatus.RELIEVED
                dep.end_date = d
                dep.relieved_date = d
                dep.relief_reason = f"Confirmed OSL: {reason or 'Employee absconded / bhag gaya'}"
                dep.relieved_by = user
                dep.save()

            # 2. Update employee
            employee.employment_status = 'OSL_CONFIRMED'
            employee.is_active = False
            employee._skip_history_log = True
            employee.save(update_fields=['employment_status', 'is_active', 'updated_at'])

            # 3. Resolve JumpRecord
            from hrm.models import JumpRecord, JumpRecordStatus
            active_jumps = JumpRecord.objects.filter(
                company=employee.company,
                employee=employee,
                status=JumpRecordStatus.ACTIVE_JUMP
            )
            for j in active_jumps:
                j.status = JumpRecordStatus.TERMINATED
                j.resolution_type = 'OSL_CONFIRMED'
                j.resolved_at = timezone.now()
                j.resolved_by = user
                j.resolution_notes = reason or notes or 'OSL confirmed by HR: guard absconded'
                j.save(update_fields=['status', 'resolution_type', 'resolved_at', 'resolved_by', 'resolution_notes', 'updated_at'])

            summary = notes or f"OSL confirmed by HR. Employee marked inactive (absconded). If rehired later, a new employee code will be strictly required. Reason: {reason or 'Absconded'}"
            history = EmploymentHistory.objects.create(
                company=employee.company,
                employee=employee,
                event_type=LifecycleEventType.OSL_CONFIRMED,
                effective_date=d,
                old_value='OSL',
                new_value='OSL_CONFIRMED',
                reason=reason,
                notes=summary,
                approved_by=user,
                changed_by=user,
                metadata={
                    'confirmed_by': user.get_full_name() if user else None,
                }
            )
            return employee, history

    @classmethod
    def delist_from_blacklist(
        cls,
        blacklist_entry,
        user=None,
        removal_reason: str = '',
    ):
        """
        Removes an individual from the Enterprise Blacklist (delist / whitelist).
        Restricted to privileged roles.
        Allows subsequent rehire with a mandatory NEW employee code.
        """
        if not blacklist_entry.is_active_blacklist:
            raise ValidationError({'blacklist': 'This record is already delisted from the blacklist.'})

        if not str(removal_reason or '').strip():
            raise ValidationError({'removal_reason': 'A detailed reason for removing from the blacklist is required.'})

        with transaction.atomic():
            blacklist_entry.is_active_blacklist = False
            blacklist_entry.removed_at = timezone.now()
            blacklist_entry.removed_by = user
            blacklist_entry.removal_reason = removal_reason
            blacklist_entry.save(update_fields=['is_active_blacklist', 'removed_at', 'removed_by', 'removal_reason', 'updated_at'])

            if blacklist_entry.employee:
                summary = f"Delisted from enterprise Blacklist by {user.get_full_name() if user else 'Executive'}. Reason: {removal_reason}"
                EmploymentHistory.objects.create(
                    company=blacklist_entry.company,
                    employee=blacklist_entry.employee,
                    event_type=LifecycleEventType.DELIST_BLACKLIST,
                    effective_date=date.today(),
                    old_value='BLACKLISTED',
                    new_value='DELISTED (Eligible for Rehire)',
                    reason=removal_reason,
                    notes=summary,
                    approved_by=user,
                    changed_by=user,
                    metadata={
                        'blacklist_id': str(blacklist_entry.id),
                        'removal_reason': removal_reason,
                    }
                )
        return blacklist_entry

    @classmethod
    def get_unified_timeline(cls, employee: Employee) -> list[dict]:
        """
        Compiles a comprehensive chronological timeline of the employee's entire lifecycle
        by aggregating source records:
        - EmploymentHistory (JOIN, PROMOTION, TRANSFER, RELIEF, SALARY, SUSPENSION, REINSTATEMENT, RESIGNATION, TERMINATION, REHIRE)
        - Deployments (Site start & relief facts)
        - JumpRecords (Absence alert triggers & restorations)
        - SalaryAssignments (Historical compensation tiers)
        """
        timeline = []

        # 1. Employment History Logs
        hist_qs = EmploymentHistory.objects.filter(
            company=employee.company,
            employee=employee,
            is_deleted=False
        ).select_related('changed_by', 'approved_by')

        for h in hist_qs:
            actor = h.approved_by.get_full_name() if h.approved_by else (h.changed_by.get_full_name() if h.changed_by else None)
            # Prioritize employee's actual hire_date/joining_date over system upload timestamps
            event_date = h.effective_date
            if h.event_type in ['JOINING', 'JOIN', LifecycleEventType.JOIN] and employee.hire_date:
                event_date = employee.hire_date
            elif not event_date:
                event_date = h.created_at.date()

            ts = f"{event_date}T00:00:00" if (h.event_type in ['JOINING', 'JOIN', LifecycleEventType.JOIN] and employee.hire_date) else h.created_at.isoformat()
            timeline.append({
                'id': f"hist_{h.id}",
                'source_type': 'EMPLOYMENT_HISTORY',
                'source_id': str(h.id),
                'event_type': h.event_type,
                'date': str(event_date),
                'timestamp': ts,
                'title': cls._format_history_title(h),
                'description': h.notes or h.reason or '',
                'reason': h.reason,
                'old_value': h.old_value,
                'new_value': h.new_value,
                'actor': actor,
                'metadata': h.metadata or {},
            })

        # 2. Deployments (if not already captured as a history event)
        from operations.models import Deployment
        deps = Deployment.objects.filter(
            company=employee.company,
            employee=employee,
            is_deleted=False
        ).select_related('site', 'post', 'service_contract', 'assigned_by', 'relieved_by')

        for d in deps:
            site_title = d.site.name if d.site else 'Site'
            post_title = f" - {d.post.post_name}" if (d.post and hasattr(d.post, 'post_name')) else ''
            
            # Start of deployment
            timeline.append({
                'id': f"dep_start_{d.id}",
                'source_type': 'DEPLOYMENT',
                'source_id': str(d.id),
                'event_type': 'DEPLOYMENT_START',
                'date': str(d.start_date),
                'timestamp': d.created_at.isoformat(),
                'title': f"Deployed to {site_title}{post_title}",
                'description': f"Assignment Type: {d.assignment_type}. {d.notes or ''}".strip(),
                'reason': '',
                'old_value': '',
                'new_value': f"{site_title}{post_title}",
                'actor': d.assigned_by.get_full_name() if d.assigned_by else None,
                'metadata': {
                    'deployment_id': str(d.id),
                    'site_id': str(d.site_id),
                    'status': d.status,
                    'assignment_type': d.assignment_type,
                }
            })

            # Relief of deployment (if relieved)
            if d.status == 'RELIEVED' and d.relieved_date:
                timeline.append({
                    'id': f"dep_relief_{d.id}",
                    'source_type': 'DEPLOYMENT',
                    'source_id': str(d.id),
                    'event_type': 'DEPLOYMENT_RELIEF',
                    'date': str(d.relieved_date),
                    'timestamp': d.updated_at.isoformat(),
                    'title': f"Relieved from {site_title}{post_title}",
                    'description': f"Relief Reason: {d.relief_reason or 'None'}",
                    'reason': d.relief_reason,
                    'old_value': f"{site_title}{post_title}",
                    'new_value': 'Relieved',
                    'actor': d.relieved_by.get_full_name() if d.relieved_by else None,
                    'metadata': {
                        'deployment_id': str(d.id),
                        'site_id': str(d.site_id),
                        'relief_reason': d.relief_reason,
                    }
                })

        # 3. Jump Records
        jumps = JumpRecord.objects.filter(
            company=employee.company,
            employee=employee,
            is_deleted=False
        ).select_related('reinstated_by', 'resolved_by')

        for j in jumps:
            timeline.append({
                'id': f"jump_trigger_{j.id}",
                'source_type': 'JUMP_RECORD',
                'source_id': str(j.id),
                'event_type': 'JUMP_TRIGGERED',
                'date': str(j.absent_since),
                'timestamp': j.jump_triggered_at.isoformat(),
                'title': f"JUMP Triggered ({j.consecutive_absent_days} consecutive unexcused absences)",
                'description': j.reason or '7 consecutive absent days detected',
                'reason': j.reason,
                'old_value': 'ACTIVE',
                'new_value': 'JUMP',
                'actor': 'System Automated S-5D',
                'metadata': {
                    'jump_id': str(j.id),
                    'status': j.status,
                    'consecutive_absent_days': j.consecutive_absent_days,
                }
            })

        # Ensure a JOINING event exists if employee has an actual hire_date
        has_join_event = any(item['event_type'] in ['JOINING', 'JOIN', LifecycleEventType.JOIN] for item in timeline)
        if not has_join_event and employee.hire_date:
            timeline.append({
                'id': f"emp_join_{employee.id}",
                'source_type': 'EMPLOYEE_MASTER',
                'source_id': str(employee.id),
                'event_type': 'JOINING',
                'date': str(employee.hire_date),
                'timestamp': f"{employee.hire_date}T00:00:00",
                'title': 'Joined Organization',
                'description': f"Employee enrolled with status {employee.employment_status} and code {employee.employee_code}",
                'reason': '',
                'old_value': '',
                'new_value': employee.employment_status,
                'actor': None,
                'metadata': {},
            })

        # Sort chronological descending (by date, then by timestamp)
        timeline.sort(key=lambda x: (x['date'], x['timestamp']), reverse=True)
        return timeline

    @classmethod
    def _format_history_title(cls, h: EmploymentHistory) -> str:
        etype = h.event_type
        if etype in [LifecycleEventType.PROMOTION, 'PROMOTION']:
            return f"Promoted: {h.new_value}"
        elif etype in [LifecycleEventType.DESIGNATION_CHANGE, 'DESIGNATION_CHANGE']:
            return f"Designation Changed: {h.new_value}"
        elif etype in [LifecycleEventType.DEPARTMENT_CHANGE, 'DEPARTMENT_CHANGE']:
            return f"Department Changed: {h.new_value}"
        elif etype in [LifecycleEventType.CLASSIFICATION_CHANGE, 'CLASSIFICATION_CHANGE']:
            return f"Classification Changed: {h.new_value}"
        elif etype in [LifecycleEventType.SALARY_REVISION, 'SALARY_REVISION', 'SALARY_CHANGE']:
            return "Compensation Revised"
        elif etype in [LifecycleEventType.TRANSFER, 'TRANSFER']:
            return f"Transferred: {h.new_value}"
        elif etype in [LifecycleEventType.RELIEF, 'RELIEF']:
            return f"Relieved: {h.old_value}"
        elif etype in [LifecycleEventType.SUSPENSION, 'SUSPENSION']:
            return "Suspended from Active Duty"
        elif etype in [LifecycleEventType.REINSTATEMENT, 'REINSTATEMENT']:
            return "Reinstated to Active Duty"
        elif etype in [LifecycleEventType.RESIGNATION, 'RESIGNATION']:
            return "Resignation / Separation"
        elif etype in [LifecycleEventType.TERMINATION, 'TERMINATION']:
            return "Employment Terminated"
        elif etype in [LifecycleEventType.JUMP_OUTCOME, 'JUMP_OUTCOME']:
            return f"JUMP Outcome: {h.new_value}"
        elif etype in [LifecycleEventType.REHIRE, 'REHIRE']:
            return "Rehired into Active Employment"
        elif etype in [LifecycleEventType.OSL_REPORTED, 'OSL_REPORTED']:
            return "Reported as OSL (Absentee / Bhag gaya)"
        elif etype in [LifecycleEventType.OSL_CONFIRMED, 'OSL_CONFIRMED']:
            return "OSL Confirmed (Absconded / Inactive)"
        elif etype in [LifecycleEventType.OSL_CANCELLED, 'OSL_CANCELLED']:
            return "OSL Cancelled (Restored to Active)"
        elif etype in [LifecycleEventType.DELIST_BLACKLIST, 'DELIST_BLACKLIST']:
            return "Delisted from Blacklist" 
        elif etype in [LifecycleEventType.CONFIRMATION, 'CONFIRMATION']:
            return "Employment Confirmed"
        elif etype in [LifecycleEventType.JOIN, 'JOIN', 'JOINING']:
            return "Joined Organization"
        return f"Lifecycle Event: {etype}"
