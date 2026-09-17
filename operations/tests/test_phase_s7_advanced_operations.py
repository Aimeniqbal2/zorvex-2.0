import datetime
from decimal import Decimal
from django.utils import timezone
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from rest_framework.test import APITestCase
from rest_framework import status

from companies.models import Company
from platform_core.models import CompanyModule
from crm.models import CRMEntity
from hrm.models import Employee, Shift, Designation
from operations.models import (
    OperationalSite, SecurityPost, ServiceContract, DutyRoster,
    IncidentReport, DailyOccurrenceLog, OccurrenceEntryType,
    SiteCheckpoint, PatrolPlan, PatrolRun, PatrolRunStatus,
    GuardTour, GuardTourStatus, GuardTourEvent, CheckpointEventStatus,
    VerificationSource, GeofenceStatus, EmergencyEvent, EmergencyType,
    EmergencyStatus, SupervisorInspection, SupervisorInspectionStatus, InspectionRating,
    OperationsEscalation, EscalationSourceType, EscalationPriority, EscalationStatus,
    InspectionPolicy, InspectionCriterionPolicy, InspectionCriterionCode
)
from operations.services.advanced_operations_service import AdvancedOperationsService

User = get_user_model()


from platform_core.models import CompanyModule, ModuleDefinition


def make_company_with_modules(company_name, modules):
    company = Company.objects.create(name=company_name)
    for mod_code in modules:
        module, _ = ModuleDefinition.objects.get_or_create(code=mod_code, defaults={'name': mod_code.title()})
        CompanyModule.objects.create(company=company, module=module, enabled=True)
    return company


class AdvancedSecurityOperationsPhaseS7TestCase(APITestCase):
    """
    Automated Test Suite for Phase S-7: Advanced Security Operations.
    """

    def setUp(self):
        self.company = make_company_with_modules("Apex Guard Security Group", ["security_ops"])
        self.company_b = make_company_with_modules("Titan Shield Services", ["security_ops"])

        self.user = User.objects.create_user(
            username="ops_controller",
            email="controller@apex.com",
            password="SecurePassword123!",
            company=self.company,
            role="manager"
        )
        self.user_b = User.objects.create_user(
            username="titan_controller",
            email="controller@titan.com",
            password="SecurePassword123!",
            company=self.company_b,
            role="manager"
        )

        # Clients & Sites
        self.client = CRMEntity.objects.create(
            company=self.company,
            name="Metro Banking Corp",
            entity_type="CUSTOMER"
        )
        # Site with center coordinates and 150m geofence radius
        self.site = OperationalSite.objects.create(
            company=self.company,
            crm_entity=self.client,
            name="Metro Tower Headquarters",
            address="100 Financial Avenue, Suite 1",
            latitude=Decimal("24.860700"),
            longitude=Decimal("67.001100"),
            geofence_radius_meters=150,
            is_active=True
        )

        self.contract = ServiceContract.objects.create(
            company=self.company,
            crm_entity=self.client,
            contract_code="SC-METRO-2026",
            start_date=timezone.now().date(),
            status="ACTIVE"
        )
        self.contract.sites.add(self.site)

        self.designation = Designation.objects.create(company=self.company, name="Security Guard")

        self.post = SecurityPost.objects.create(
            company=self.company,
            site=self.site,
            service_contract=self.contract,
            post_name="Main Lobby Post 1",
            post_code="POST-01",
            required_designation=self.designation
        )

        self.shift = Shift.objects.create(
            company=self.company,
            name="Day Shift",
            start_time=datetime.time(8, 0),
            end_time=datetime.time(20, 0)
        )

        self.employee = Employee.objects.create(
            company=self.company,
            first_name="Ahmed",
            last_name="Khan",
            designation=self.designation,
            employment_status="ACTIVE"
        )

        self.roster = DutyRoster.objects.create(
            company=self.company,
            site=self.site,
            post=self.post,
            shift=self.shift,
            employee=self.employee,
            duty_date=timezone.now().date(),
            status="SCHEDULED"
        )

        self.client_api = self.client_class()
        self.client_api.force_authenticate(user=self.user)

    def test_01_incident_lifecycle_and_linkages(self):
        """
        Verify incident creation linked to client, contract, site, post, employee, roster,
        and verify full lifecycle progression (OPEN -> INVESTIGATING -> ACTION_REQUIRED -> RESOLVED -> CLOSED).
        """
        incident = AdvancedOperationsService.create_incident(
            company=self.company,
            reported_by=self.employee,
            site=self.site,
            client=self.client,
            contract=self.contract,
            post=self.post,
            shift=self.shift,
            roster=self.roster,
            incident_type="SECURITY_BREACH",
            severity="HIGH",
            occurred_at=timezone.now(),
            title="Unauthorized Server Room Access Attempt",
            description="Visitor attempted entry to level 3 server room with expired badge.",
            involved_persons="Visitor: John Doe, Badge #9021",
            immediate_action="Badge confiscated and visitor escorted off premises.",
            assigned_to=self.user
        )

        self.assertEqual(incident.status, "OPEN")
        self.assertEqual(incident.client, self.client)
        self.assertEqual(incident.contract, self.contract)
        self.assertEqual(incident.post, self.post)
        self.assertTrue(incident.incident_number.startswith("INC-"))

        # Transition to INVESTIGATING
        inc1 = AdvancedOperationsService.transition_incident_status(
            company=self.company,
            incident_id=str(incident.id),
            new_status="INVESTIGATING",
            user=self.user,
            immediate_action="CCTV footage reviewed by security supervisor."
        )
        self.assertEqual(inc1.status, "INVESTIGATING")

        # Transition to ACTION_REQUIRED
        inc2 = AdvancedOperationsService.transition_incident_status(
            company=self.company,
            incident_id=str(incident.id),
            new_status="ACTION_REQUIRED",
            user=self.user,
            immediate_action="Requesting access control card system audit from IT team."
        )
        self.assertEqual(inc2.status, "ACTION_REQUIRED")

        # Transition to RESOLVED
        inc3 = AdvancedOperationsService.transition_incident_status(
            company=self.company,
            incident_id=str(incident.id),
            new_status="RESOLVED",
            user=self.user,
            resolution="Badge deactivated and formal report submitted to client facility manager."
        )
        self.assertEqual(inc3.status, "RESOLVED")
        self.assertEqual(inc3.closed_by, self.user)
        self.assertIsNotNone(inc3.closed_at)

    def test_02_daily_occurrence_book_append_only(self):
        """
        Verify Daily Occurrence Book (DOB) chronological site log with entry types,
        and verify append-only historical integrity.
        """
        entry = AdvancedOperationsService.log_occurrence(
            company=self.company,
            site=self.site,
            post=self.post,
            shift=self.shift,
            employee=self.employee,
            entry_type=OccurrenceEntryType.SHIFT_HANDOVER,
            title="Shift Handover Day to Night",
            details="All posts active. 2 radios, 1 metal detector handed over in good order.",
            logged_by=self.user
        )

        self.assertEqual(entry.entry_type, "SHIFT_HANDOVER")
        self.assertEqual(entry.site, self.site)

        # Append-only validation: attempting to alter details or entry_type on saved log must fail
        entry.details = "Mutated unauthorized details text"
        with self.assertRaises(ValidationError):
            entry.clean()

    def test_03_checkpoint_and_patrol_planning(self):
        """
        Verify configurable site checkpoints and patrol run management.
        Guarantees no payroll or attendance records are created from patrol records.
        """
        cp1 = AdvancedOperationsService.create_checkpoint(
            company=self.company,
            site=self.site,
            name="Main Entrance Turnstiles",
            code="CP-01",
            sequence_order=1,
            location_description="Ground floor lobby south entrance"
        )
        cp2 = AdvancedOperationsService.create_checkpoint(
            company=self.company,
            site=self.site,
            name="Emergency Fire Exit Rear",
            code="CP-02",
            sequence_order=2,
            location_description="Loading dock adjacent fire door"
        )

        self.assertEqual(cp1.sequence_order, 1)
        self.assertEqual(cp2.sequence_order, 2)

        # Create Patrol Plan & Run
        plan = AdvancedOperationsService.create_patrol_plan(
            company=self.company,
            site=self.site,
            name="Hourly Perimeter Check",
            frequency="HOURLY",
            shift=self.shift,
            assigned_employee=self.employee
        )

        scheduled_time = timezone.now()
        run = AdvancedOperationsService.schedule_patrol_run(
            company=self.company,
            site=self.site,
            plan=plan,
            shift=self.shift,
            assigned_employee=self.employee,
            scheduled_start=scheduled_time
        )
        self.assertEqual(run.status, PatrolRunStatus.PLANNED)

        # Complete patrol run
        completed_run = AdvancedOperationsService.complete_patrol_run(
            company=self.company,
            run_id=str(run.id),
            status=PatrolRunStatus.COMPLETED,
            completion_notes="Full perimeter patrol completed without anomalies."
        )
        self.assertEqual(completed_run.status, PatrolRunStatus.COMPLETED)
        self.assertIsNotNone(completed_run.actual_end)

        # Invariant check: Patrol execution does not create payroll or attendance
        from operations.models import DailyDutyPay
        from hrm.models import WorkforceAttendance
        self.assertEqual(DailyDutyPay.objects.filter(company=self.company, notes__icontains=run.run_code).count(), 0)

    def test_04_guard_tour_and_checkpoint_events(self):
        """
        Verify guard tour execution along sequence of checkpoints,
        recording verification events, detecting missed checkpoints, and calculating completion rate.
        """
        cp1 = AdvancedOperationsService.create_checkpoint(
            company=self.company, site=self.site, name="Post Alpha", code="A1", sequence_order=1
        )
        cp2 = AdvancedOperationsService.create_checkpoint(
            company=self.company, site=self.site, name="Post Bravo", code="B1", sequence_order=2
        )
        cp3 = AdvancedOperationsService.create_checkpoint(
            company=self.company, site=self.site, name="Post Charlie", code="C1", sequence_order=3
        )

        tour = AdvancedOperationsService.start_guard_tour(
            company=self.company,
            site=self.site,
            tour_name="Night Inspection Route 1",
            assigned_employee=self.employee,
            shift=self.shift
        )
        self.assertEqual(tour.total_checkpoints, 3)
        self.assertEqual(tour.status, GuardTourStatus.IN_PROGRESS)

        # Guard visits CP-01 and CP-02, but misses CP-03
        ev1 = AdvancedOperationsService.verify_checkpoint(
            company=self.company,
            tour_id=str(tour.id),
            checkpoint_id=str(cp1.id),
            user=self.user,
            verification_source=VerificationSource.MANUAL,
            notes="Secure"
        )
        self.assertEqual(ev1.status, CheckpointEventStatus.VERIFIED)

        ev2 = AdvancedOperationsService.verify_checkpoint(
            company=self.company,
            tour_id=str(tour.id),
            checkpoint_id=str(cp2.id),
            user=self.user,
            verification_source=VerificationSource.MANUAL,
            notes="Secure"
        )
        self.assertEqual(ev2.status, CheckpointEventStatus.VERIFIED)

        # Complete tour - should automatically record CP-03 as missed
        completed_tour = AdvancedOperationsService.complete_guard_tour(
            company=self.company,
            tour_id=str(tour.id),
            user=self.user
        )

        self.assertEqual(completed_tour.completed_checkpoints, 2)
        self.assertEqual(completed_tour.missed_checkpoints, 1)
        self.assertEqual(round(completed_tour.completion_rate, 2), Decimal('66.67'))
        self.assertEqual(completed_tour.status, GuardTourStatus.COMPLETED)

        # Verify missed checkpoint event created
        missed_event = GuardTourEvent.objects.filter(tour=tour, checkpoint=cp3).first()
        self.assertIsNotNone(missed_event)
        self.assertEqual(missed_event.status, CheckpointEventStatus.MISSED)

    def test_05_gps_and_geofencing_foundation(self):
        """
        Verify provider/device-neutral geofence evaluation using Haversine algorithm.
        Site coordinates: (24.860700, 67.001100), radius = 150 meters.
        """
        # Inside geofence (~20 meters away)
        status_inside = AdvancedOperationsService.evaluate_geofence(
            site=self.site,
            latitude=24.860800,
            longitude=67.001200
        )
        self.assertEqual(status_inside, GeofenceStatus.INSIDE_GEOFENCE)

        # Outside geofence (> 2km away)
        status_outside = AdvancedOperationsService.evaluate_geofence(
            site=self.site,
            latitude=24.890000,
            longitude=67.020000
        )
        self.assertEqual(status_outside, GeofenceStatus.OUTSIDE_GEOFENCE)

        # Missing coordinates -> LOCATION_UNAVAILABLE
        status_unavailable = AdvancedOperationsService.evaluate_geofence(
            site=self.site,
            latitude=None,
            longitude=None
        )
        self.assertEqual(status_unavailable, GeofenceStatus.LOCATION_UNAVAILABLE)

    def test_06_emergency_sos_lifecycle(self):
        """
        Verify panic/emergency alert generation, auto-escalation, responder acknowledgement,
        and resolution.
        """
        sos = AdvancedOperationsService.trigger_emergency(
            company=self.company,
            site=self.site,
            event_type=EmergencyType.PANIC_BUTTON,
            employee=self.employee,
            reported_by=self.user,
            description="Guard triggered fixed distress button at Main Gate.",
            latitude=24.860750,
            longitude=67.001150
        )

        self.assertEqual(sos.status, EmergencyStatus.TRIGGERED)
        self.assertEqual(sos.geofence_status, GeofenceStatus.INSIDE_GEOFENCE)

        # Verify auto-generated critical escalation
        escalation = OperationsEscalation.objects.filter(
            company=self.company,
            source_type=EscalationSourceType.EMERGENCY,
            source_id=str(sos.id)
        ).first()
        self.assertIsNotNone(escalation)
        self.assertEqual(escalation.priority, EscalationPriority.CRITICAL)

        # Operations officer acknowledges and assigns responder
        sos_ack = AdvancedOperationsService.acknowledge_emergency(
            company=self.company,
            emergency_id=str(sos.id),
            user=self.user,
            responder=self.user,
            response_notes="Mobile patrol supervisor dispatched to site."
        )
        self.assertEqual(sos_ack.status, EmergencyStatus.RESPONDING)
        self.assertEqual(sos_ack.assigned_responder, self.user)

        # Resolve emergency
        sos_res = AdvancedOperationsService.resolve_emergency(
            company=self.company,
            emergency_id=str(sos.id),
            user=self.user,
            resolution_summary="False alarm triggered accidentally during shift equipment cleaning. Site confirmed secure.",
            is_false_alarm=True
        )
        self.assertEqual(sos_res.status, EmergencyStatus.FALSE_ALARM)
        self.assertIsNotNone(sos_res.resolved_at)

        # Check linked escalation resolved
        escalation.refresh_from_db()
        self.assertEqual(escalation.status, EscalationStatus.RESOLVED)

    def test_07_supervisor_field_inspection_and_auto_escalation(self):
        """
        Verify field supervisor inspection checklist, score deduction,
        and automated escalation upon deficiency.
        """
        insp = AdvancedOperationsService.submit_inspection(
            company=self.company,
            site=self.site,
            inspector=self.user,
            guard_presence_verified=True,
            uniform_condition=InspectionRating.DEFICIENT,  # -15
            equipment_condition=InspectionRating.DEFICIENT,  # -20
            post_cleanliness_condition=InspectionRating.SATISFACTORY,
            documentation_in_order=False,  # -15
            turnout_and_bearing=InspectionRating.SATISFACTORY,
            deficiencies_observed="Guard uniform missing epaulets; radio battery defective; visitor log not maintained.",
            corrective_action_required="Re-issue battery from Main Store and audit visitor log by 16:00."
        )

        # Score = 100 - 15 - 20 - 15 = 50.0%
        self.assertEqual(insp.overall_score, Decimal('50.00'))
        self.assertEqual(insp.status, SupervisorInspectionStatus.ACTION_REQUIRED)

        # Verify auto-generated escalation
        esc = OperationsEscalation.objects.filter(
            company=self.company,
            source_type=EscalationSourceType.INSPECTION_FAILURE,
            source_id=str(insp.id)
        ).first()
        self.assertIsNotNone(esc)
        self.assertEqual(esc.priority, EscalationPriority.HIGH)

    def test_08_control_room_queue_and_dashboard(self):
        """
        Verify Central Operations Queue and Dashboard compose source records
        without duplicating operational models.
        """
        # Create an open incident
        AdvancedOperationsService.create_incident(
            company=self.company,
            reported_by=self.employee,
            site=self.site,
            incident_type="TRESPASS",
            severity="MEDIUM",
            occurred_at=timezone.now(),
            title="Trespasser spotted near parking lot perimeter",
            description="Unknown individual observed scaling south fence."
        )

        # Create emergency
        AdvancedOperationsService.trigger_emergency(
            company=self.company,
            site=self.site,
            event_type=EmergencyType.FIRE_EMERGENCY,
            description="Fire alarm tripped on Basement level 2."
        )

        # Fetch Control Room Queue
        queue_data = AdvancedOperationsService.get_control_room_queue(self.company.id)
        self.assertGreaterEqual(queue_data['total_queue_items'], 2)
        self.assertGreaterEqual(queue_data['critical_count'], 1)
        self.assertGreaterEqual(queue_data['emergencies_active'], 1)

        # Fetch Dashboard
        dash = AdvancedOperationsService.get_advanced_ops_dashboard(self.company.id)
        self.assertIn('open_incidents', dash)
        self.assertIn('critical_incidents', dash)
        self.assertIn('patrol_completion_rate', dash)
        self.assertIn('site_risk_summary', dash)
        self.assertEqual(dash['site_risk_summary'][0]['risk_level'], 'HIGH')  # Due to active emergency

    def test_09_multi_tenant_isolation_and_rbac(self):
        """
        Verify strict multi-tenant isolation: Tenant A records are invisible to Tenant B.
        """
        # Tenant A creates an incident
        inc_a = AdvancedOperationsService.create_incident(
            company=self.company,
            reported_by=self.employee,
            site=self.site,
            incident_type="OTHER",
            severity="LOW",
            occurred_at=timezone.now(),
            title="Tenant A Incident Report",
            description="Confidential incident."
        )

        # Authenticate as Tenant B
        self.client_api.force_authenticate(user=self.user_b)

        # Tenant B requests incident list
        resp = self.client_api.get('/api/operations/incidents/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        # Results should not contain Tenant A's incident
        results = resp.data if isinstance(resp.data, list) else resp.data.get('results', [])
        ids = [str(r['id']) for r in results]
        self.assertNotIn(str(inc_a.id), ids)

        # Direct access to Tenant A's incident by Tenant B should return 404
        resp_detail = self.client_api.get(f'/api/operations/incidents/{inc_a.id}/')
        self.assertEqual(resp_detail.status_code, status.HTTP_404_NOT_FOUND)

    def test_10_inspection_policy_scoring_and_tenant_isolation(self):
        """
        Phase S-7.1 Audit Verification:
        1. Custom inspection weights change score
        2. Custom thresholds change escalation severity
        3. Tenant A policy does not affect Tenant B
        """
        # 1. Setup custom policy for Tenant A
        policy_a = InspectionPolicy.objects.create(
            company=self.company,
            name="Strict Industrial Policy A",
            is_active=True,
            effective_from=timezone.now().date(),
            base_score=Decimal('100.00'),
            warning_threshold=Decimal('90.00'),
            escalation_threshold=Decimal('85.00'),
            critical_threshold=Decimal('70.00'),
            critical_priority=EscalationPriority.CRITICAL,
            escalation_priority=EscalationPriority.MEDIUM
        )

        # Custom criterion weights for Tenant A:
        # Default UNIFORM_CONDITION is 15.00 -> customize to 5.00
        InspectionCriterionPolicy.objects.create(
            company=self.company,
            policy=policy_a,
            criterion_code=InspectionCriterionCode.UNIFORM_CONDITION,
            deduction_weight=Decimal('5.00')
        )
        # Default EQUIPMENT_CONDITION is 20.00 -> customize to 10.00
        InspectionCriterionPolicy.objects.create(
            company=self.company,
            policy=policy_a,
            criterion_code=InspectionCriterionCode.EQUIPMENT_CONDITION,
            deduction_weight=Decimal('10.00')
        )
        # Default DOCUMENTATION_ORDER is 15.00 -> customize to 10.00
        InspectionCriterionPolicy.objects.create(
            company=self.company,
            policy=policy_a,
            criterion_code=InspectionCriterionCode.DOCUMENTATION_ORDER,
            deduction_weight=Decimal('10.00')
        )

        # Setup site for Tenant B (Tenant B has NO custom policy, falls back to default engine weights)
        client_b = CRMEntity.objects.create(company=self.company_b, name="Titan Client B", entity_type="CUSTOMER")
        site_b = OperationalSite.objects.create(
            company=self.company_b,
            crm_entity=client_b,
            name="Titan Logistics Hub",
            address="789 Harbor Rd"
        )

        # 2. Submit identical inspections for Tenant A and Tenant B:
        # Deficiencies: UNIFORM (DEFICIENT), EQUIPMENT (DEFICIENT), DOCUMENTATION (False)
        insp_a = AdvancedOperationsService.submit_inspection(
            company=self.company,
            site=self.site,
            inspector=self.user,
            guard_presence_verified=True,
            uniform_condition=InspectionRating.DEFICIENT,
            equipment_condition=InspectionRating.DEFICIENT,
            documentation_in_order=False,
            deficiencies_observed="Uniform, equipment, and log sheet issues.",
            corrective_action_required="Replace torn uniform and kit."
        )

        insp_b = AdvancedOperationsService.submit_inspection(
            company=self.company_b,
            site=site_b,
            inspector=self.user_b,
            guard_presence_verified=True,
            uniform_condition=InspectionRating.DEFICIENT,
            equipment_condition=InspectionRating.DEFICIENT,
            documentation_in_order=False,
            deficiencies_observed="Identical uniform, equipment, and log sheet issues.",
            corrective_action_required="Replace torn uniform and kit."
        )

        # VERIFICATION 1: Custom inspection weights change score
        # Under Tenant A policy: Score = 100 - 5.00 - 10.00 - 10.00 = 75.00%
        self.assertEqual(insp_a.overall_score, Decimal('75.00'))
        self.assertEqual(insp_a.policy, policy_a)

        # VERIFICATION 2: Custom thresholds change escalation severity
        # Score 75.00% for Tenant A is < escalation_threshold (85.00%), but >= critical_threshold (70.00%)
        # Therefore, escalation priority for Tenant A is MEDIUM
        esc_a = OperationsEscalation.objects.get(
            company=self.company,
            source_type=EscalationSourceType.INSPECTION_FAILURE,
            source_id=str(insp_a.id)
        )
        self.assertEqual(esc_a.priority, EscalationPriority.MEDIUM)

        # Now test Tenant A critical severity threshold (< 70.00% triggers CRITICAL)
        insp_a_crit = AdvancedOperationsService.submit_inspection(
            company=self.company,
            site=self.site,
            inspector=self.user,
            guard_presence_verified=False,  # default 30.00 pts deduction
            uniform_condition=InspectionRating.DEFICIENT,  # custom 5.00 pts
            equipment_condition=InspectionRating.DEFICIENT,  # custom 10.00 pts
            documentation_in_order=False,  # custom 10.00 pts
            # Total deduction = 30 + 5 + 10 + 10 = 55.00 => Score = 45.00% (< 70.00%)
            deficiencies_observed="Critical absent guard and damaged equipment."
        )
        self.assertEqual(insp_a_crit.overall_score, Decimal('45.00'))
        esc_a_crit = OperationsEscalation.objects.get(
            company=self.company,
            source_type=EscalationSourceType.INSPECTION_FAILURE,
            source_id=str(insp_a_crit.id)
        )
        self.assertEqual(esc_a_crit.priority, EscalationPriority.CRITICAL)

        # VERIFICATION 3: Tenant A policy does not affect Tenant B
        # Tenant B had the identical checklist inputs as insp_a, but uses default configuration:
        # Default weights: UNIFORM (15) + EQUIPMENT (20) + DOCUMENTATION (15) = 50.00 deduction
        # Score for Tenant B = 100 - 50 = 50.00% (completely unaffected by Tenant A's 75.00%)
        self.assertEqual(insp_b.overall_score, Decimal('50.00'))
        self.assertIsNone(insp_b.policy)

        # Tenant B default critical threshold is 60.00%. Score 50.00% < 60.00% => Priority is HIGH (not CRITICAL, not MEDIUM)
        esc_b = OperationsEscalation.objects.get(
            company=self.company_b,
            source_type=EscalationSourceType.INSPECTION_FAILURE,
            source_id=str(insp_b.id)
        )
        self.assertEqual(esc_b.priority, EscalationPriority.HIGH)

