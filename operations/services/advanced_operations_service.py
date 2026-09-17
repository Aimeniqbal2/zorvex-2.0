import math
from decimal import Decimal
from typing import Dict, Any, List, Optional
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from django.core.exceptions import ValidationError
from rest_framework.exceptions import PermissionDenied

from operations.models import (
    OperationalSite, SecurityPost, IncidentReport, DailyOccurrenceLog,
    OccurrenceEntryType, SiteCheckpoint, PatrolPlan, PatrolRun, PatrolRunStatus,
    GuardTour, GuardTourStatus, GuardTourEvent, CheckpointEventStatus,
    VerificationSource, GeofenceStatus, EmergencyEvent, EmergencyType,
    EmergencyStatus, SupervisorInspection, SupervisorInspectionStatus,
    InspectionRating, OperationsEscalation, EscalationSourceType,
    EscalationPriority, EscalationStatus, EquipmentIncident, EquipmentIncidentStatus,
    DutyRoster, PostShiftRequirement, InspectionPolicy, InspectionCriterionPolicy,
    InspectionCriterionCode
)
from hrm.models import Employee, Shift, WorkforceAttendance


class AdvancedOperationsService:
    """
    Phase S-7: Advanced Security Operations Engine.
    Orchestrates Incidents, Daily Occurrence Book (DOB), Patrols, Guard Tours,
    Geofencing, Control Room queue, SOS / Emergencies, Inspections, and Escalations.
    """

    # --------------------------------------------------------------------------
    # 1. GPS & Geofencing Foundation (Device & Provider Neutral)
    # --------------------------------------------------------------------------
    @staticmethod
    def calculate_distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """
        Haversine formula to compute geodesic distance between two coordinate pairs in meters.
        """
        r = 6371000.0  # Earth radius in meters
        phi1 = math.radians(lat1)
        phi2 = math.radians(lat2)
        delta_phi = math.radians(lat2 - lat1)
        delta_lambda = math.radians(lon2 - lon1)

        a = (
            math.sin(delta_phi / 2.0) ** 2
            + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
        )
        c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
        return r * c

    @classmethod
    def evaluate_geofence(
        cls,
        site: OperationalSite,
        latitude: Optional[float] = None,
        longitude: Optional[float] = None
    ) -> str:
        """
        Validates whether GPS coordinates fall within site geofence radius.
        Returns INSIDE_GEOFENCE, OUTSIDE_GEOFENCE, or LOCATION_UNAVAILABLE.
        Does not require GPS for normal system operations.
        """
        if latitude is None or longitude is None:
            return GeofenceStatus.LOCATION_UNAVAILABLE

        site_lat = float(site.latitude) if site.latitude is not None else None
        site_lon = float(site.longitude) if site.longitude is not None else None

        if site_lat is None or site_lon is None:
            return GeofenceStatus.LOCATION_UNAVAILABLE

        distance = cls.calculate_distance_meters(
            float(latitude), float(longitude), site_lat, site_lon
        )
        radius = float(site.geofence_radius_meters or 100)

        if distance <= radius:
            return GeofenceStatus.INSIDE_GEOFENCE
        return GeofenceStatus.OUTSIDE_GEOFENCE

    # --------------------------------------------------------------------------
    # 2. Incident Management (Lifecycle: OPEN -> INVESTIGATING -> ACTION_REQUIRED -> RESOLVED -> CLOSED)
    # --------------------------------------------------------------------------
    @classmethod
    def create_incident(
        cls,
        company,
        reported_by,
        site,
        incident_type: str,
        severity: str,
        occurred_at,
        title: str,
        description: str,
        client=None,
        contract=None,
        post=None,
        shift=None,
        roster=None,
        duty_assignment=None,
        involved_persons: str = '',
        immediate_action: str = '',
        assigned_to=None,
        auto_escalate_critical: bool = True
    ) -> IncidentReport:
        comp_id = company.id if hasattr(company, 'id') else company
        rep_by = reported_by if hasattr(reported_by, 'id') else Employee.objects.get(id=reported_by, company_id=comp_id)
        site_obj = site if hasattr(site, 'id') else OperationalSite.objects.get(id=site, company_id=comp_id)

        incident = IncidentReport.objects.create(
            company_id=comp_id,
            reported_by=rep_by,
            site=site_obj,
            incident_type=incident_type,
            severity=severity,
            occurred_at=occurred_at,
            title=title,
            description=description,
            client=client,
            contract=contract,
            post=post,
            shift=shift,
            roster=roster,
            duty_assignment=duty_assignment,
            involved_persons=involved_persons,
            immediate_action=immediate_action,
            assigned_to=assigned_to,
            status=IncidentReport.IncidentStatus.OPEN
        )

        # Auto-escalate CRITICAL or HIGH incidents to OperationsEscalation
        if auto_escalate_critical and severity in ['CRITICAL', 'HIGH']:
            cls.create_escalation(
                company=comp_id,
                source_type=EscalationSourceType.INCIDENT,
                source_id=str(incident.id),
                site=site_obj,
                title=f"Incident Escalation: {incident.title}",
                description=f"Severity: {incident.severity} - {incident.description[:300]}",
                priority=EscalationPriority.CRITICAL if severity == 'CRITICAL' else EscalationPriority.HIGH,
                assigned_to=assigned_to
            )

        return incident

    @classmethod
    def transition_incident_status(
        cls,
        company,
        incident_id: str,
        new_status: str,
        user,
        resolution: str = '',
        immediate_action: str = '',
        assigned_to=None
    ) -> IncidentReport:
        comp_id = company.id if hasattr(company, 'id') else company
        incident = IncidentReport.objects.get(id=incident_id, company_id=comp_id)

        valid_statuses = [c[0] for c in IncidentReport.IncidentStatus.choices]
        if new_status not in valid_statuses:
            raise ValidationError(f"Invalid incident status: {new_status}")

        incident.status = new_status
        if resolution:
            incident.resolution = resolution
        if immediate_action:
            incident.immediate_action = immediate_action
        if assigned_to:
            incident.assigned_to = assigned_to

        if new_status in [IncidentReport.IncidentStatus.RESOLVED, IncidentReport.IncidentStatus.CLOSED]:
            incident.closed_by = user
            incident.closed_at = timezone.now()
            # Also resolve linked escalations
            OperationsEscalation.objects.filter(
                company_id=comp_id,
                source_type=EscalationSourceType.INCIDENT,
                source_id=str(incident.id),
                status__in=[EscalationStatus.OPEN, EscalationStatus.ACKNOWLEDGED, EscalationStatus.IN_PROGRESS]
            ).update(
                status=EscalationStatus.RESOLVED,
                resolved_at=timezone.now(),
                resolution_notes=f"Resolved via Incident {incident.incident_number} transition to {new_status}."
            )

        incident.save()
        return incident

    # --------------------------------------------------------------------------
    # 3. Daily Occurrence Book / Site Log (DOB) - Append-Only
    # --------------------------------------------------------------------------
    @classmethod
    def log_occurrence(
        cls,
        company,
        site,
        title: str,
        details: str,
        entry_type: str = OccurrenceEntryType.GENERAL,
        timestamp=None,
        logged_by=None,
        employee=None,
        post=None,
        shift=None,
        incident_reference=None,
        is_flagged: bool = False
    ) -> DailyOccurrenceLog:
        comp_id = company.id if hasattr(company, 'id') else company
        site_obj = site if hasattr(site, 'id') else OperationalSite.objects.get(id=site, company_id=comp_id)
        ts = timestamp or timezone.now()

        entry = DailyOccurrenceLog.objects.create(
            company_id=comp_id,
            site=site_obj,
            title=title,
            details=details,
            entry_type=entry_type,
            timestamp=ts,
            logged_by=logged_by,
            employee=employee,
            post=post,
            shift=shift,
            incident_reference=incident_reference,
            is_flagged=is_flagged
        )
        return entry

    # --------------------------------------------------------------------------
    # 4. Checkpoints & Patrol Management
    # --------------------------------------------------------------------------
    @classmethod
    def create_checkpoint(
        cls,
        company,
        site,
        name: str,
        code: str,
        sequence_order: int = 1,
        location_description: str = '',
        latitude: Optional[Decimal] = None,
        longitude: Optional[Decimal] = None,
        qr_code_tag: str = '',
        nfc_tag_id: str = '',
        is_active: bool = True
    ) -> SiteCheckpoint:
        comp_id = company.id if hasattr(company, 'id') else company
        site_obj = site if hasattr(site, 'id') else OperationalSite.objects.get(id=site, company_id=comp_id)

        cp = SiteCheckpoint.objects.create(
            company_id=comp_id,
            site=site_obj,
            name=name,
            code=code,
            sequence_order=sequence_order,
            location_description=location_description,
            latitude=latitude,
            longitude=longitude,
            qr_code_tag=qr_code_tag,
            nfc_tag_id=nfc_tag_id,
            is_active=is_active
        )
        return cp

    @classmethod
    def create_patrol_plan(
        cls,
        company,
        site,
        name: str,
        description: str = '',
        frequency: str = 'HOURLY',
        shift=None,
        assigned_employee=None,
        estimated_duration_minutes: int = 30,
        is_active: bool = True
    ) -> PatrolPlan:
        comp_id = company.id if hasattr(company, 'id') else company
        site_obj = site if hasattr(site, 'id') else OperationalSite.objects.get(id=site, company_id=comp_id)

        plan = PatrolPlan.objects.create(
            company_id=comp_id,
            site=site_obj,
            name=name,
            description=description,
            frequency=frequency,
            shift=shift,
            assigned_employee=assigned_employee,
            estimated_duration_minutes=estimated_duration_minutes,
            is_active=is_active
        )
        return plan

    @classmethod
    def schedule_patrol_run(
        cls,
        company,
        site,
        scheduled_start,
        plan=None,
        shift=None,
        assigned_employee=None,
        roster=None,
        scheduled_end=None,
        notes: str = ''
    ) -> PatrolRun:
        comp_id = company.id if hasattr(company, 'id') else company
        site_obj = site if hasattr(site, 'id') else OperationalSite.objects.get(id=site, company_id=comp_id)

        run = PatrolRun.objects.create(
            company_id=comp_id,
            site=site_obj,
            plan=plan,
            shift=shift,
            assigned_employee=assigned_employee,
            roster=roster,
            scheduled_start=scheduled_start,
            scheduled_end=scheduled_end,
            status=PatrolRunStatus.PLANNED,
            notes=notes
        )
        return run

    @classmethod
    def complete_patrol_run(
        cls,
        company,
        run_id: str,
        status: str = PatrolRunStatus.COMPLETED,
        completion_notes: str = ''
    ) -> PatrolRun:
        comp_id = company.id if hasattr(company, 'id') else company
        run = PatrolRun.objects.get(id=run_id, company_id=comp_id)
        run.status = status
        run.actual_end = timezone.now()
        run.completion_notes = completion_notes
        run.save(update_fields=['status', 'actual_end', 'completion_notes', 'updated_at'])

        # If run is missed or aborted, auto-generate escalation
        if status in [PatrolRunStatus.MISSED, PatrolRunStatus.ABORTED]:
            cls.create_escalation(
                company=comp_id,
                source_type=EscalationSourceType.MISSED_PATROL,
                source_id=str(run.id),
                site=run.site,
                title=f"Missed Patrol: {run.run_code or run.site.name}",
                description=f"Patrol run scheduled at {run.scheduled_start} was marked {status}. Notes: {completion_notes}",
                priority=EscalationPriority.HIGH
            )

        return run

    # --------------------------------------------------------------------------
    # 5. Guard Tour & Checkpoint Events
    # --------------------------------------------------------------------------
    @classmethod
    def start_guard_tour(
        cls,
        company,
        site,
        tour_name: str,
        assigned_employee=None,
        patrol_run=None,
        shift=None,
        roster=None,
        notes: str = ''
    ) -> GuardTour:
        comp_id = company.id if hasattr(company, 'id') else company
        site_obj = site if hasattr(site, 'id') else OperationalSite.objects.get(id=site, company_id=comp_id)

        total_cps = SiteCheckpoint.objects.filter(
            company_id=comp_id,
            site=site_obj,
            is_active=True
        ).count()

        tour = GuardTour.objects.create(
            company_id=comp_id,
            site=site_obj,
            tour_name=tour_name,
            assigned_employee=assigned_employee,
            patrol_run=patrol_run,
            shift=shift,
            roster=roster,
            start_time=timezone.now(),
            status=GuardTourStatus.IN_PROGRESS,
            total_checkpoints=total_cps,
            completed_checkpoints=0,
            missed_checkpoints=0,
            completion_rate=Decimal('0.00'),
            notes=notes
        )
        return tour

    @classmethod
    def verify_checkpoint(
        cls,
        company,
        tour_id: str,
        checkpoint_id: str,
        user=None,
        verification_source: str = VerificationSource.MANUAL,
        latitude: Optional[float] = None,
        longitude: Optional[float] = None,
        accuracy_meters: Optional[float] = None,
        notes: str = ''
    ) -> GuardTourEvent:
        comp_id = company.id if hasattr(company, 'id') else company
        tour = GuardTour.objects.get(id=tour_id, company_id=comp_id)
        cp = SiteCheckpoint.objects.get(id=checkpoint_id, company_id=comp_id, site=tour.site)

        # Evaluate optional geofence
        geofence_status = cls.evaluate_geofence(tour.site, latitude, longitude)

        # Check if already verified in this tour
        existing = GuardTourEvent.objects.filter(tour=tour, checkpoint=cp).first()
        if existing:
            event = existing
            event.verified_at = timezone.now()
            event.verification_source = verification_source
            event.verified_by = user
            event.status = CheckpointEventStatus.VERIFIED
            event.notes = notes
            event.latitude = latitude
            event.longitude = longitude
            event.accuracy_meters = accuracy_meters
            event.captured_at = timezone.now() if latitude is not None else None
            event.geofence_status = geofence_status
            event.save()
        else:
            event = GuardTourEvent.objects.create(
                company_id=comp_id,
                tour=tour,
                checkpoint=cp,
                verified_at=timezone.now(),
                verification_source=verification_source,
                verified_by=user,
                status=CheckpointEventStatus.VERIFIED,
                notes=notes,
                latitude=latitude,
                longitude=longitude,
                accuracy_meters=accuracy_meters,
                captured_at=timezone.now() if latitude is not None else None,
                geofence_status=geofence_status
            )

        # Recalculate tour completion metrics
        completed_count = GuardTourEvent.objects.filter(
            tour=tour, status=CheckpointEventStatus.VERIFIED
        ).count()
        tour.completed_checkpoints = completed_count
        if tour.total_checkpoints > 0:
            rate = (Decimal(str(completed_count)) / Decimal(str(tour.total_checkpoints))) * Decimal('100.00')
            tour.completion_rate = min(rate, Decimal('100.00'))
        tour.save(update_fields=['completed_checkpoints', 'completion_rate', 'updated_at'])

        return event

    @classmethod
    def complete_guard_tour(
        cls,
        company,
        tour_id: str,
        user=None,
        notes: str = ''
    ) -> GuardTour:
        comp_id = company.id if hasattr(company, 'id') else company
        tour = GuardTour.objects.get(id=tour_id, company_id=comp_id)

        # Check for any unvisited checkpoints
        all_cps = SiteCheckpoint.objects.filter(company_id=comp_id, site=tour.site, is_active=True)
        visited_cp_ids = set(
            GuardTourEvent.objects.filter(
                tour=tour, status=CheckpointEventStatus.VERIFIED
            ).values_list('checkpoint_id', flat=True)
        )

        missed_count = 0
        for cp in all_cps:
            if cp.id not in visited_cp_ids:
                missed_count += 1
                GuardTourEvent.objects.create(
                    company_id=comp_id,
                    tour=tour,
                    checkpoint=cp,
                    verified_at=timezone.now(),
                    verification_source=VerificationSource.MANUAL,
                    verified_by=user,
                    status=CheckpointEventStatus.MISSED,
                    notes='Missed during tour execution'
                )

        tour.end_time = timezone.now()
        tour.missed_checkpoints = missed_count
        if tour.total_checkpoints > 0:
            tour.completion_rate = (Decimal(str(tour.completed_checkpoints)) / Decimal(str(tour.total_checkpoints))) * Decimal('100.00')
        
        if tour.completed_checkpoints == 0 and tour.total_checkpoints > 0:
            tour.status = GuardTourStatus.MISSED
        else:
            tour.status = GuardTourStatus.COMPLETED

        if notes:
            tour.notes = f"{tour.notes}\n{notes}".strip()
        tour.save()

        # If checkpoints were missed, escalate
        if missed_count > 0:
            cls.create_escalation(
                company=comp_id,
                source_type=EscalationSourceType.MISSED_PATROL,
                source_id=str(tour.id),
                site=tour.site,
                title=f"Guard Tour Deficiencies: {tour.tour_name}",
                description=f"Tour completed with {missed_count} missed checkpoints out of {tour.total_checkpoints}.",
                priority=EscalationPriority.HIGH if missed_count >= 3 else EscalationPriority.MEDIUM
            )

        return tour

    # --------------------------------------------------------------------------
    # 6. Emergency / SOS Alerts & Responder Assignment
    # --------------------------------------------------------------------------
    @classmethod
    def trigger_emergency(
        cls,
        company,
        site,
        event_type: str = EmergencyType.PANIC_BUTTON,
        severity: str = 'CRITICAL',
        employee=None,
        reported_by=None,
        description: str = '',
        latitude: Optional[float] = None,
        longitude: Optional[float] = None,
        accuracy_meters: Optional[float] = None,
        location_source: str = 'MOBILE_APP'
    ) -> EmergencyEvent:
        comp_id = company.id if hasattr(company, 'id') else company
        site_obj = site if hasattr(site, 'id') else OperationalSite.objects.get(id=site, company_id=comp_id)

        geofence_status = cls.evaluate_geofence(site_obj, latitude, longitude)

        emergency = EmergencyEvent.objects.create(
            company_id=comp_id,
            site=site_obj,
            event_type=event_type,
            severity=severity,
            employee=employee,
            reported_by=reported_by,
            occurred_at=timezone.now(),
            description=description,
            status=EmergencyStatus.TRIGGERED,
            latitude=latitude,
            longitude=longitude,
            accuracy_meters=accuracy_meters,
            location_source=location_source,
            geofence_status=geofence_status
        )

        # Immediate Critical Escalation
        cls.create_escalation(
            company=comp_id,
            source_type=EscalationSourceType.EMERGENCY,
            source_id=str(emergency.id),
            site=site_obj,
            title=f"SOS EMERGENCY ALERT: {emergency.get_event_type_display()} @ {site_obj.name}",
            description=f"Triggered at {emergency.occurred_at}. Geofence: {geofence_status}. Details: {description}",
            priority=EscalationPriority.CRITICAL
        )

        return emergency

    @classmethod
    def acknowledge_emergency(
        cls,
        company,
        emergency_id: str,
        user,
        responder=None,
        response_notes: str = ''
    ) -> EmergencyEvent:
        comp_id = company.id if hasattr(company, 'id') else company
        emergency = EmergencyEvent.objects.get(id=emergency_id, company_id=comp_id)
        emergency.status = EmergencyStatus.RESPONDING if responder else EmergencyStatus.ACKNOWLEDGED
        emergency.acknowledged_by = user
        emergency.acknowledged_at = timezone.now()
        if responder:
            emergency.assigned_responder = responder
        if response_notes:
            emergency.response_notes = response_notes
        emergency.save()
        return emergency

    @classmethod
    def resolve_emergency(
        cls,
        company,
        emergency_id: str,
        user,
        resolution_summary: str,
        is_false_alarm: bool = False
    ) -> EmergencyEvent:
        comp_id = company.id if hasattr(company, 'id') else company
        emergency = EmergencyEvent.objects.get(id=emergency_id, company_id=comp_id)
        emergency.status = EmergencyStatus.FALSE_ALARM if is_false_alarm else EmergencyStatus.RESOLVED
        emergency.resolved_at = timezone.now()
        emergency.resolution_summary = resolution_summary
        emergency.save()

        # Resolve linked escalation
        OperationsEscalation.objects.filter(
            company_id=comp_id,
            source_type=EscalationSourceType.EMERGENCY,
            source_id=str(emergency.id)
        ).update(
            status=EscalationStatus.RESOLVED,
            resolved_at=timezone.now(),
            resolution_notes=f"Emergency resolved by {user}: {resolution_summary}"
        )

        return emergency

    # --------------------------------------------------------------------------
    # 7. Supervisor Field Inspection
    # --------------------------------------------------------------------------
    # 7. Supervisor Field Inspection & Policy-Driven Scoring (Phase S-7.1)
    # --------------------------------------------------------------------------
    DEFAULT_INSPECTION_CRITERIA_WEIGHTS: Dict[str, Decimal] = {
        InspectionCriterionCode.GUARD_PRESENCE: Decimal('30.00'),
        InspectionCriterionCode.UNIFORM_CONDITION: Decimal('15.00'),
        InspectionCriterionCode.EQUIPMENT_CONDITION: Decimal('20.00'),
        InspectionCriterionCode.POST_CLEANLINESS: Decimal('10.00'),
        InspectionCriterionCode.DOCUMENTATION_ORDER: Decimal('15.00'),
        InspectionCriterionCode.TURNOUT_BEARING: Decimal('10.00'),
    }

    @classmethod
    def get_active_inspection_policy(cls, company, inspection_date=None) -> Optional[InspectionPolicy]:
        """
        Retrieves the active inspection policy for the specified tenant company
        taking into account effective_from and effective_to dates.
        """
        comp_id = company.id if hasattr(company, 'id') else company
        if inspection_date is None:
            target_date = timezone.now().date()
        elif hasattr(inspection_date, 'date'):
            target_date = inspection_date.date()
        else:
            target_date = inspection_date

        return InspectionPolicy.objects.filter(
            company_id=comp_id,
            is_active=True,
            effective_from__lte=target_date
        ).filter(
            Q(effective_to__isnull=True) | Q(effective_to__gte=target_date)
        ).prefetch_related('criteria').order_by('-effective_from', '-created_at').first()

    @classmethod
    def evaluate_inspection(
        cls,
        company,
        guard_presence_verified: bool = True,
        uniform_condition: str = InspectionRating.SATISFACTORY,
        equipment_condition: str = InspectionRating.SATISFACTORY,
        post_cleanliness_condition: str = InspectionRating.SATISFACTORY,
        documentation_in_order: bool = True,
        turnout_and_bearing: str = InspectionRating.SATISFACTORY,
        deficiencies_observed: str = '',
        corrective_action_required: str = '',
        inspection_date=None
    ) -> Dict[str, Any]:
        """
        Evaluates supervisor inspection checklist according to tenant-configured policy.
        Reads criteria deduction weights, base score, and warning/escalation/critical thresholds.
        """
        comp_id = company.id if hasattr(company, 'id') else company
        policy = cls.get_active_inspection_policy(comp_id, inspection_date=inspection_date)

        base_score = policy.base_score if policy else Decimal('100.00')
        warning_thresh = policy.warning_threshold if policy else Decimal('85.00')
        escalation_thresh = policy.escalation_threshold if policy else Decimal('80.00')
        critical_thresh = policy.critical_threshold if policy else Decimal('60.00')

        crit_priority = policy.critical_priority if policy else EscalationPriority.HIGH
        esc_priority = policy.escalation_priority if policy else EscalationPriority.MEDIUM
        warn_priority = policy.warning_priority if policy else EscalationPriority.LOW

        # Compile criteria weights: defaults overridden by active policy criteria rules
        weights = dict(cls.DEFAULT_INSPECTION_CRITERIA_WEIGHTS)
        if policy:
            for crit in policy.criteria.filter(is_active=True):
                weights[crit.criterion_code] = crit.deduction_weight

        # Perform checklist deductions
        score = base_score
        deductions_applied = {}

        if not guard_presence_verified:
            d = weights.get(InspectionCriterionCode.GUARD_PRESENCE, Decimal('30.00'))
            score -= d
            deductions_applied['guard_presence'] = d

        if uniform_condition == InspectionRating.DEFICIENT:
            d = weights.get(InspectionCriterionCode.UNIFORM_CONDITION, Decimal('15.00'))
            score -= d
            deductions_applied['uniform_condition'] = d

        if equipment_condition == InspectionRating.DEFICIENT:
            d = weights.get(InspectionCriterionCode.EQUIPMENT_CONDITION, Decimal('20.00'))
            score -= d
            deductions_applied['equipment_condition'] = d

        if post_cleanliness_condition == InspectionRating.DEFICIENT:
            d = weights.get(InspectionCriterionCode.POST_CLEANLINESS, Decimal('10.00'))
            score -= d
            deductions_applied['post_cleanliness'] = d

        if not documentation_in_order:
            d = weights.get(InspectionCriterionCode.DOCUMENTATION_ORDER, Decimal('15.00'))
            score -= d
            deductions_applied['documentation_order'] = d

        if turnout_and_bearing == InspectionRating.DEFICIENT:
            d = weights.get(InspectionCriterionCode.TURNOUT_BEARING, Decimal('10.00'))
            score -= d
            deductions_applied['turnout_bearing'] = d

        final_score = max(Decimal('0.00'), score)

        has_deficiencies = (
            final_score < escalation_thresh or bool(deficiencies_observed) or bool(corrective_action_required)
        )
        insp_status = SupervisorInspectionStatus.ACTION_REQUIRED if has_deficiencies else SupervisorInspectionStatus.COMPLETED

        # Determine escalation priority according to thresholds
        if final_score < critical_thresh:
            escalation_priority = crit_priority
        elif final_score < escalation_thresh:
            escalation_priority = esc_priority
        elif final_score < warning_thresh:
            escalation_priority = warn_priority
        else:
            escalation_priority = esc_priority

        return {
            'overall_score': final_score,
            'status': insp_status,
            'has_deficiencies': has_deficiencies,
            'escalation_priority': escalation_priority,
            'policy': policy,
            'deductions_applied': deductions_applied,
            'warning_threshold': warning_thresh,
            'escalation_threshold': escalation_thresh,
            'critical_threshold': critical_thresh,
        }

    @classmethod
    def submit_inspection(
        cls,
        company,
        site,
        inspector,
        guard_presence_verified: bool = True,
        uniform_condition: str = InspectionRating.SATISFACTORY,
        equipment_condition: str = InspectionRating.SATISFACTORY,
        post_cleanliness_condition: str = InspectionRating.SATISFACTORY,
        documentation_in_order: bool = True,
        turnout_and_bearing: str = InspectionRating.SATISFACTORY,
        post=None,
        shift=None,
        deficiencies_observed: str = '',
        corrective_action_required: str = '',
        notes: str = '',
        inspection_datetime=None
    ) -> SupervisorInspection:
        comp_id = company.id if hasattr(company, 'id') else company
        site_obj = site if hasattr(site, 'id') else OperationalSite.objects.get(id=site, company_id=comp_id)
        dt = inspection_datetime or timezone.now()

        evaluation = cls.evaluate_inspection(
            company=comp_id,
            guard_presence_verified=guard_presence_verified,
            uniform_condition=uniform_condition,
            equipment_condition=equipment_condition,
            post_cleanliness_condition=post_cleanliness_condition,
            documentation_in_order=documentation_in_order,
            turnout_and_bearing=turnout_and_bearing,
            deficiencies_observed=deficiencies_observed,
            corrective_action_required=corrective_action_required,
            inspection_date=dt
        )

        inspection = SupervisorInspection.objects.create(
            company_id=comp_id,
            site=site_obj,
            post=post,
            shift=shift,
            inspector=inspector,
            inspection_datetime=dt,
            status=evaluation['status'],
            guard_presence_verified=guard_presence_verified,
            uniform_condition=uniform_condition,
            equipment_condition=equipment_condition,
            post_cleanliness_condition=post_cleanliness_condition,
            documentation_in_order=documentation_in_order,
            turnout_and_bearing=turnout_and_bearing,
            deficiencies_observed=deficiencies_observed,
            corrective_action_required=corrective_action_required,
            notes=notes,
            overall_score=evaluation['overall_score'],
            policy=evaluation['policy']
        )

        if evaluation['has_deficiencies']:
            cls.create_escalation(
                company=comp_id,
                source_type=EscalationSourceType.INSPECTION_FAILURE,
                source_id=str(inspection.id),
                site=site_obj,
                title=f"Inspection Deficiencies @ {site_obj.name} (Score: {evaluation['overall_score']}%)",
                description=f"Deficiencies: {deficiencies_observed}. Action: {corrective_action_required}",
                priority=evaluation['escalation_priority']
            )

        return inspection

    # --------------------------------------------------------------------------
    # 8. Operations Escalations
    # --------------------------------------------------------------------------
    @classmethod
    def create_escalation(
        cls,
        company,
        source_type: str,
        source_id: str,
        site,
        title: str,
        description: str,
        priority: str = EscalationPriority.HIGH,
        assigned_to=None,
        due_at=None
    ) -> OperationsEscalation:
        comp_id = company.id if hasattr(company, 'id') else company
        site_obj = site if hasattr(site, 'id') else OperationalSite.objects.get(id=site, company_id=comp_id)

        escalation = OperationsEscalation.objects.create(
            company_id=comp_id,
            source_type=source_type,
            source_id=source_id,
            site=site_obj,
            title=title,
            description=description,
            priority=priority,
            status=EscalationStatus.OPEN,
            assigned_to=assigned_to,
            due_at=due_at
        )
        return escalation

    @classmethod
    def resolve_escalation(
        cls,
        company,
        escalation_id: str,
        user,
        resolution_notes: str
    ) -> OperationsEscalation:
        comp_id = company.id if hasattr(company, 'id') else company
        esc = OperationsEscalation.objects.get(id=escalation_id, company_id=comp_id)
        esc.status = EscalationStatus.RESOLVED
        esc.resolved_at = timezone.now()
        esc.resolution_notes = resolution_notes
        esc.save(update_fields=['status', 'resolved_at', 'resolution_notes', 'updated_at'])
        return esc

    # --------------------------------------------------------------------------
    # 9. Control Room Queue & Dashboard (No duplicated source records)
    # --------------------------------------------------------------------------
    @classmethod
    def get_control_room_queue(cls, company_id) -> Dict[str, Any]:
        """
        Builds live central operations queue composing active operational exceptions:
        - Open incidents
        - Active emergencies
        - Missed patrols & guard tours
        - Open escalations
        - Equipment damage/loss incidents
        """
        # 1. Open Incidents
        incidents = IncidentReport.objects.filter(
            company_id=company_id,
            status__in=[IncidentReport.IncidentStatus.OPEN, IncidentReport.IncidentStatus.INVESTIGATING, IncidentReport.IncidentStatus.ACTION_REQUIRED]
        ).select_related('site', 'reported_by', 'assigned_to').order_by('-occurred_at')[:20]

        incident_items = [
            {
                'id': str(inc.id),
                'type': 'INCIDENT',
                'title': f"[{inc.severity}] {inc.title}",
                'site_name': inc.site.name,
                'priority': inc.severity,
                'status': inc.status,
                'occurred_at': inc.occurred_at.isoformat(),
                'assigned_to': inc.assigned_to.username if inc.assigned_to else None,
                'details': inc.description[:200]
            }
            for inc in incidents
        ]

        # 2. Active Emergencies
        emergencies = EmergencyEvent.objects.filter(
            company_id=company_id,
            status__in=[EmergencyStatus.TRIGGERED, EmergencyStatus.ACKNOWLEDGED, EmergencyStatus.RESPONDING]
        ).select_related('site', 'employee', 'assigned_responder').order_by('-occurred_at')[:10]

        emergency_items = [
            {
                'id': str(em.id),
                'type': 'EMERGENCY_SOS',
                'title': f"EMERGENCY: {em.get_event_type_display()}",
                'site_name': em.site.name,
                'priority': 'CRITICAL',
                'status': em.status,
                'occurred_at': em.occurred_at.isoformat(),
                'assigned_to': em.assigned_responder.username if em.assigned_responder else None,
                'details': em.description or 'Panic alert triggered'
            }
            for em in emergencies
        ]

        # 3. Missed Patrols / Tours
        missed_runs = PatrolRun.objects.filter(
            company_id=company_id,
            status=PatrolRunStatus.MISSED
        ).select_related('site', 'assigned_employee').order_by('-scheduled_start')[:10]

        missed_patrol_items = [
            {
                'id': str(pr.id),
                'type': 'MISSED_PATROL',
                'title': f"Missed Patrol: {pr.run_code or pr.site.name}",
                'site_name': pr.site.name,
                'priority': 'HIGH',
                'status': pr.status,
                'occurred_at': pr.scheduled_start.isoformat(),
                'assigned_to': f"{pr.assigned_employee.first_name} {pr.assigned_employee.last_name}" if pr.assigned_employee else None,
                'details': pr.notes or 'Patrol was scheduled but never initiated'
            }
            for pr in missed_runs
        ]

        # 4. Open Escalations
        escalations = OperationsEscalation.objects.filter(
            company_id=company_id,
            status__in=[EscalationStatus.OPEN, EscalationStatus.ACKNOWLEDGED, EscalationStatus.IN_PROGRESS]
        ).select_related('site', 'assigned_to').order_by('-priority', '-created_at')[:20]

        escalation_items = [
            {
                'id': str(esc.id),
                'type': f"ESCALATION_{esc.source_type}",
                'title': esc.title,
                'site_name': esc.site.name,
                'priority': esc.priority,
                'status': esc.status,
                'occurred_at': esc.created_at.isoformat(),
                'assigned_to': esc.assigned_to.username if esc.assigned_to else None,
                'details': esc.description[:200]
            }
            for esc in escalations
        ]

        # 5. Equipment Incidents
        eq_incidents = EquipmentIncident.objects.filter(
            company_id=company_id,
            status__in=[EquipmentIncidentStatus.REPORTED, EquipmentIncidentStatus.UNDER_INVESTIGATION]
        ).select_related('item', 'site', 'employee').order_by('-incident_date')[:10]

        equipment_items = [
            {
                'id': str(eq.id),
                'type': 'EQUIPMENT_INCIDENT',
                'title': f"Equipment {eq.incident_type}: {eq.item.name}",
                'site_name': eq.site.name if eq.site else 'Armory / Store',
                'priority': 'MEDIUM',
                'status': eq.status,
                'occurred_at': eq.incident_date.isoformat(),
                'assigned_to': None,
                'details': eq.condition_description or 'Equipment incident reported'
            }
            for eq in eq_incidents
        ]

        # Combine all queue items sorted by Priority
        priority_map = {'CRITICAL': 0, 'HIGH': 1, 'MEDIUM': 2, 'LOW': 3}
        all_queue = emergency_items + incident_items + escalation_items + missed_patrol_items + equipment_items
        all_queue.sort(key=lambda x: (priority_map.get(x['priority'], 4), x['occurred_at']), reverse=False)

        return {
            'total_queue_items': len(all_queue),
            'critical_count': len([x for x in all_queue if x['priority'] == 'CRITICAL']),
            'high_count': len([x for x in all_queue if x['priority'] == 'HIGH']),
            'emergencies_active': len(emergency_items),
            'open_incidents_count': len(incident_items),
            'open_escalations_count': len(escalation_items),
            'missed_patrols_count': len(missed_patrol_items),
            'equipment_incidents_count': len(equipment_items),
            'queue': all_queue
        }

    @classmethod
    def get_advanced_ops_dashboard(cls, company_id) -> Dict[str, Any]:
        """
        Authoritative Operational Dashboard for Phase S-7.
        Exposes open/critical incidents, patrol completion %, missed checkpoints,
        overdue escalations, active SOS events, site inspection issues, and site risk ratings.
        """
        now = timezone.now()
        seven_days_ago = now - timezone.timedelta(days=7)

        # 1. Incidents
        open_incidents = IncidentReport.objects.filter(
            company_id=company_id,
            status__in=[IncidentReport.IncidentStatus.OPEN, IncidentReport.IncidentStatus.INVESTIGATING, IncidentReport.IncidentStatus.ACTION_REQUIRED]
        ).count()
        critical_incidents = IncidentReport.objects.filter(
            company_id=company_id,
            severity='CRITICAL',
            status__in=[IncidentReport.IncidentStatus.OPEN, IncidentReport.IncidentStatus.INVESTIGATING, IncidentReport.IncidentStatus.ACTION_REQUIRED]
        ).count()

        # 2. Patrol Completion
        runs_last_7d = PatrolRun.objects.filter(
            company_id=company_id,
            scheduled_start__gte=seven_days_ago
        )
        total_runs = runs_last_7d.count()
        completed_runs = runs_last_7d.filter(status=PatrolRunStatus.COMPLETED).count()
        patrol_completion_rate = (
            float((Decimal(str(completed_runs)) / Decimal(str(total_runs))) * Decimal('100.00'))
            if total_runs > 0 else 100.0
        )

        # 3. Guard Tours & Missed Checkpoints
        tours_last_7d = GuardTour.objects.filter(company_id=company_id, created_at__gte=seven_days_ago)
        missed_checkpoints = sum(t.missed_checkpoints for t in tours_last_7d)

        # 4. Overdue Escalations
        overdue_escalations = OperationsEscalation.objects.filter(
            company_id=company_id,
            status__in=[EscalationStatus.OPEN, EscalationStatus.ACKNOWLEDGED, EscalationStatus.IN_PROGRESS],
            due_at__lt=now
        ).count()

        # 5. Active SOS
        active_emergencies = EmergencyEvent.objects.filter(
            company_id=company_id,
            status__in=[EmergencyStatus.TRIGGERED, EmergencyStatus.ACKNOWLEDGED, EmergencyStatus.RESPONDING]
        ).count()

        # 6. Inspection Issues
        inspection_issues = SupervisorInspection.objects.filter(
            company_id=company_id,
            status=SupervisorInspectionStatus.ACTION_REQUIRED
        ).count()

        # 7. Site Operational Risk Summary
        sites = OperationalSite.objects.filter(company_id=company_id, is_active=True).select_related('crm_entity')
        site_risk_list = []
        for s in sites:
            s_inc = IncidentReport.objects.filter(
                site=s,
                status__in=[IncidentReport.IncidentStatus.OPEN, IncidentReport.IncidentStatus.INVESTIGATING]
            ).count()
            s_sos = EmergencyEvent.objects.filter(
                site=s,
                status__in=[EmergencyStatus.TRIGGERED, EmergencyStatus.ACKNOWLEDGED, EmergencyStatus.RESPONDING]
            ).count()
            s_def = SupervisorInspection.objects.filter(
                site=s,
                status=SupervisorInspectionStatus.ACTION_REQUIRED
            ).count()
            s_missed = PatrolRun.objects.filter(
                site=s,
                status=PatrolRunStatus.MISSED,
                scheduled_start__gte=seven_days_ago
            ).count()

            risk_level = 'LOW'
            if s_sos > 0 or s_inc >= 3:
                risk_level = 'HIGH'
            elif s_inc > 0 or s_def > 0 or s_missed > 0:
                risk_level = 'MEDIUM'

            site_risk_list.append({
                'site_id': str(s.id),
                'site_name': s.name,
                'client_name': s.crm_entity.name if s.crm_entity else 'Direct Site',
                'active_incidents': s_inc,
                'active_emergencies': s_sos,
                'inspection_deficiencies': s_def,
                'missed_patrols': s_missed,
                'risk_level': risk_level,
                'geofence_configured': bool(s.latitude and s.longitude),
                'geofence_radius_meters': s.geofence_radius_meters or 100
            })

        return {
            'open_incidents': open_incidents,
            'critical_incidents': critical_incidents,
            'patrol_completion_rate': round(patrol_completion_rate, 2),
            'total_patrol_runs_7d': total_runs,
            'completed_patrol_runs_7d': completed_runs,
            'missed_checkpoints_7d': missed_checkpoints,
            'overdue_escalations': overdue_escalations,
            'active_emergencies': active_emergencies,
            'inspection_issues': inspection_issues,
            'site_risk_summary': site_risk_list
        }
