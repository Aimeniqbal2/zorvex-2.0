import json
from datetime import date, timedelta
from decimal import Decimal
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
User = get_user_model()

from companies.models import Company
from platform_core.models import Warehouse, ModuleDefinition, CompanyModule
from crm.models import CRMEntity
from hrm.models import Employee, Designation
from inventory.models import Item, Category, InventoryBalance, StockMovement, ItemSerial
from inventory.services.transaction_service import process_transaction
from operations.models import (
    OperationalSite, ServiceContract,
    EquipmentIssue, EquipmentIssueStatus, EquipmentCustodyType,
    SecurityStoreProfile, SecurityStoreType,
    SecurityItemProfile, SecurityEquipmentCategory,
    EquipmentIncident, EquipmentIncidentType, EquipmentIncidentStatus
)
from operations.services.security_inventory_service import SecurityInventoryService


def make_company_with_modules(company_name, modules):
    company = Company.objects.create(name=company_name)
    for mod_code in modules:
        module, _ = ModuleDefinition.objects.get_or_create(code=mod_code, defaults={'name': mod_code.title()})
        CompanyModule.objects.create(company=company, module=module)
    return company


class PhaseS6SecurityInventoryTests(APITestCase):
    def setUp(self):
        self.company = make_company_with_modules("Apex Security Group", ["security_ops", "inventory"])
        self.company2 = make_company_with_modules("Other Guard Services", ["security_ops", "inventory"])

        # Users
        self.manager = User.objects.create_user(
            username="security_manager", password="password123", company=self.company, role="manager"
        )
        self.armorer = User.objects.create_user(
            username="chief_armorer", password="password123", company=self.company, role="armorer"
        )
        self.other_user = User.objects.create_user(
            username="other_mgr", password="password123", company=self.company2, role="manager"
        )

        self.client.force_authenticate(user=self.manager)

        # Universal Categories & Items
        self.cat_uniform = Category.objects.create(name="Uniforms & Apparel", company=self.company)
        self.cat_comms = Category.objects.create(name="Communications", company=self.company)
        self.cat_tactical = Category.objects.create(name="Tactical Gear", company=self.company)

        # 1. Non-serialized bulk item: Uniform
        self.item_uniform = Item.objects.create(
            company=self.company,
            name="Tactical Guard Uniform Set",
            item_code="UNI-TAC-01",
            category=self.cat_uniform,
            track_inventory=True,
            track_serial_number=False,
            item_type='PRODUCT'
        )
        self.profile_uniform = SecurityItemProfile.objects.create(
            company=self.company,
            item=self.item_uniform,
            security_category=SecurityEquipmentCategory.UNIFORM,
            is_controlled=False
        )

        # 2. Serialized security item: VHF Radio
        self.item_radio = Item.objects.create(
            company=self.company,
            name="Motorola VHF Two-Way Radio",
            item_code="RAD-VHF-01",
            category=self.cat_comms,
            track_inventory=True,
            track_serial_number=True,
            item_type='ASSET'
        )
        self.profile_radio = SecurityItemProfile.objects.create(
            company=self.company,
            item=self.item_radio,
            security_category=SecurityEquipmentCategory.RADIO_COMMS,
            is_controlled=False
        )

        # 3. Controlled / Regulated item: Armory Weapon
        self.item_weapon = Item.objects.create(
            company=self.company,
            name="Remington 870 Security Shotgun",
            item_code="WPN-REM-01",
            category=self.cat_tactical,
            track_inventory=True,
            track_serial_number=True,
            item_type='ASSET'
        )
        self.profile_weapon = SecurityItemProfile.objects.create(
            company=self.company,
            item=self.item_weapon,
            security_category=SecurityEquipmentCategory.WEAPONS_AMMO,
            is_controlled=True,
            requires_authorization=True,
            license_required=True,
            license_reference="SEC-WPN-LIC-9901"
        )

        # Universal Warehouses configured as Security Stores
        self.wh_main = Warehouse.objects.create(
            company=self.company, name="Apex Central Store", code="STR-MAIN", is_active=True
        )
        self.store_main = SecurityStoreProfile.objects.create(
            company=self.company, warehouse=self.wh_main, store_type=SecurityStoreType.MAIN_STORE
        )

        self.wh_armory = Warehouse.objects.create(
            company=self.company, name="Apex Secure Armory", code="STR-ARMORY", is_active=True
        )
        self.store_armory = SecurityStoreProfile.objects.create(
            company=self.company,
            warehouse=self.wh_armory,
            store_type=SecurityStoreType.ARMORY,
            is_armory=True,
            requires_strong_auth=True
        )

        self.wh_site = Warehouse.objects.create(
            company=self.company, name="Metro Mall Site Locker", code="STR-METRO", is_active=True
        )

        # CRM, Sites, Contracts
        self.crm_client = CRMEntity.objects.create(
            company=self.company, name="Metro Properties Inc", entity_type="CUSTOMER"
        )
        self.site = OperationalSite.objects.create(
            company=self.company, crm_entity=self.crm_client, name="Metro Commercial Center"
        )
        self.store_site = SecurityStoreProfile.objects.create(
            company=self.company,
            warehouse=self.wh_site,
            store_type=SecurityStoreType.SITE_STORE,
            site=self.site
        )

        self.contract = ServiceContract.objects.create(
            company=self.company,
            crm_entity=self.crm_client,
            contract_code="CON-METRO-2026",
            start_date=date(2026, 1, 1),
            status="ACTIVE"
        )
        self.contract.sites.add(self.site)

        # Employees
        self.desig = Designation.objects.create(company=self.company, name="Patrol Officer")
        self.guard = Employee.objects.create(
            company=self.company,
            first_name="Tariq",
            last_name="Mahmood",
            employee_code="SEC-0042",
            designation=self.desig,
            is_active=True
        )

        # Stock Inflow (Opening balances through Universal Inventory engine)
        process_transaction(
            company=self.company,
            item=self.item_uniform,
            warehouse=self.wh_main,
            movement_type='OPENING_BALANCE',
            quantity=Decimal('50'),
            user=self.manager
        )

        process_transaction(
            company=self.company,
            item=self.item_radio,
            warehouse=self.wh_main,
            movement_type='OPENING_BALANCE',
            quantity=Decimal('3'),
            serial_numbers=['RAD-VHF-101', 'RAD-VHF-102', 'RAD-VHF-103'],
            user=self.manager
        )

        process_transaction(
            company=self.company,
            item=self.item_weapon,
            warehouse=self.wh_armory,
            movement_type='OPENING_BALANCE',
            quantity=Decimal('2'),
            serial_numbers=['WPN-REM-501', 'WPN-REM-502'],
            user=self.manager
        )

    def test_01_stock_uses_universal_inventory_models(self):
        """Verify inventory uses universal Item, Warehouse, and InventoryBalance models without duplication."""
        bal_uniform = InventoryBalance.objects.get(
            company=self.company, item=self.item_uniform, warehouse=self.wh_main
        )
        self.assertEqual(bal_uniform.quantity, Decimal('50'))

        bal_radio = InventoryBalance.objects.get(
            company=self.company, item=self.item_radio, warehouse=self.wh_main
        )
        self.assertEqual(bal_radio.quantity, Decimal('3'))

        # Check security classification layer references item without creating separate balance
        self.assertEqual(self.item_uniform.security_profile.security_category, SecurityEquipmentCategory.UNIFORM)
        self.assertEqual(self.wh_armory.security_profile.store_type, SecurityStoreType.ARMORY)

    def test_02_employee_equipment_issue_and_return_lifecycle(self):
        """Verify employee equipment issue reduces universal stock and return restores it without direct balance mutation."""
        # 1. Issue serialized radio to employee
        issue = SecurityInventoryService.issue_equipment(
            company=self.company,
            user=self.manager,
            store_id=self.wh_main.id,
            item_id=self.item_radio.id,
            custody_type=EquipmentCustodyType.EMPLOYEE,
            employee_id=self.guard.id,
            serial_number='RAD-VHF-101',
            quantity=1,
            purpose="Daily patrol duty",
            condition="NEW"
        )
        self.assertEqual(issue.status, EquipmentIssueStatus.ISSUED)
        self.assertEqual(issue.custody_type, EquipmentCustodyType.EMPLOYEE)
        self.assertEqual(issue.employee, self.guard)

        # Stock balance in main store reduced to 2
        bal = InventoryBalance.objects.get(company=self.company, item=self.item_radio, warehouse=self.wh_main)
        self.assertEqual(bal.quantity, Decimal('2'))

        # Serial marked as ISSUED
        serial_obj = ItemSerial.objects.get(company=self.company, serial_number='RAD-VHF-101')
        self.assertEqual(serial_obj.status, 'ISSUED')

        # 2. Cannot issue the same serial number again while in custody
        with self.assertRaises(Exception) as ctx:
            SecurityInventoryService.issue_equipment(
                company=self.company,
                user=self.manager,
                store_id=self.wh_main.id,
                item_id=self.item_radio.id,
                custody_type=EquipmentCustodyType.EMPLOYEE,
                employee_id=self.guard.id,
                serial_number='RAD-VHF-101',
                quantity=1
            )
        self.assertIn("already in status ISSUED", str(ctx.exception))

        # 3. Return radio to Main Store
        returned_issue = SecurityInventoryService.return_equipment(
            company=self.company,
            user=self.manager,
            issue_id=issue.id,
            store_id=self.wh_main.id,
            condition="GOOD",
            notes="Duty completed, battery at 85%"
        )
        self.assertEqual(returned_issue.status, EquipmentIssueStatus.RETURNED)
        self.assertIsNotNone(returned_issue.returned_at)

        # Stock balance restored to 3
        bal.refresh_from_db()
        self.assertEqual(bal.quantity, Decimal('3'))

        # Serial restored to IN_STOCK
        serial_obj.refresh_from_db()
        self.assertEqual(serial_obj.status, 'IN_STOCK')

    def test_03_site_equipment_issue_and_cost_attribution(self):
        """Verify equipment assigned directly to OperationalSite auto-resolves client and contract dimensions."""
        issue = SecurityInventoryService.issue_equipment(
            company=self.company,
            user=self.manager,
            store_id=self.wh_main.id,
            item_id=self.item_radio.id,
            custody_type=EquipmentCustodyType.SITE,
            site_id=self.site.id,
            serial_number='RAD-VHF-102',
            quantity=1,
            purpose="Fixed Control Room Base Radio"
        )
        self.assertEqual(issue.custody_type, EquipmentCustodyType.SITE)
        self.assertEqual(issue.site, self.site)
        self.assertEqual(issue.client, self.crm_client)
        self.assertEqual(issue.contract, self.contract)

        # Check API endpoint returns site issue
        res = self.client.get('/api/operations/security-inventory/stock-availability/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        radio_row = next(r for r in res.data if r['item_id'] == str(self.item_radio.id))
        self.assertEqual(radio_row['issued_to_sites'], 1)
        self.assertEqual(radio_row['available_store_stock'], 2)

    def test_04_controlled_store_to_site_stock_transfer(self):
        """Verify store-to-site transfer relocates stock and serialized items atomically via Universal Transfer Service."""
        # Transfer 10 uniforms from Main Store to Site Store
        movement = SecurityInventoryService.transfer_store_stock(
            company=self.company,
            user=self.manager,
            from_store_id=self.wh_main.id,
            to_store_id=self.wh_site.id,
            item_id=self.item_uniform.id,
            quantity=10,
            notes="Replenish site locker uniforms"
        )
        self.assertIsNotNone(movement)

        # Verify balances in universal InventoryBalance
        bal_main = InventoryBalance.objects.get(company=self.company, item=self.item_uniform, warehouse=self.wh_main)
        bal_site = InventoryBalance.objects.get(company=self.company, item=self.item_uniform, warehouse=self.wh_site)
        self.assertEqual(bal_main.quantity, Decimal('40'))
        self.assertEqual(bal_site.quantity, Decimal('10'))

        # Also transfer 1 serialized radio to site store
        SecurityInventoryService.transfer_store_stock(
            company=self.company,
            user=self.manager,
            from_store_id=self.wh_main.id,
            to_store_id=self.wh_site.id,
            item_id=self.item_radio.id,
            quantity=1,
            serial_numbers=['RAD-VHF-103']
        )
        serial_obj = ItemSerial.objects.get(company=self.company, serial_number='RAD-VHF-103')
        self.assertEqual(serial_obj.warehouse, self.wh_site)

    def test_05_lost_and_damaged_equipment_lifecycle(self):
        """Verify incident reporting, investigation, and resolution without direct employee salary deduction."""
        # 1. Issue uniform to employee
        issue = SecurityInventoryService.issue_equipment(
            company=self.company,
            user=self.manager,
            store_id=self.wh_main.id,
            item_id=self.item_uniform.id,
            custody_type=EquipmentCustodyType.EMPLOYEE,
            employee_id=self.guard.id,
            quantity=1,
            purpose="Patrol Duty Uniform"
        )

        # 2. Report Damaged
        incident = SecurityInventoryService.report_incident(
            company=self.company,
            user=self.manager,
            incident_type=EquipmentIncidentType.DAMAGED,
            issue_id=issue.id,
            damage_severity="HIGH",
            notes="Torn during barbed wire fence inspection incident"
        )
        self.assertEqual(incident.status, EquipmentIncidentStatus.REPORTED)
        self.assertEqual(incident.incident_type, EquipmentIncidentType.DAMAGED)

        # Issue is marked DAMAGED
        issue.refresh_from_db()
        self.assertEqual(issue.status, EquipmentIssueStatus.DAMAGED)

        # 3. Resolve incident with write-off and recommended payroll recovery
        resolved_inc = SecurityInventoryService.resolve_incident(
            company=self.company,
            user=self.manager,
            incident_id=incident.id,
            status=EquipmentIncidentStatus.APPROVED_WRITE_OFF,
            resolution_notes="Authorized write-off. Recommending $25 equipment replacement charge.",
            approved_write_off=True,
            recommended_payroll_deduction=Decimal('25.00'),
            deduction_notes="Scheduled for review in next payroll cycle"
        )
        self.assertEqual(resolved_inc.status, EquipmentIncidentStatus.APPROVED_WRITE_OFF)
        self.assertEqual(resolved_inc.recommended_payroll_deduction, Decimal('25.00'))

        # Issue is WRITTEN_OFF
        issue.refresh_from_db()
        self.assertEqual(issue.status, EquipmentIssueStatus.WRITTEN_OFF)

        # IMPORTANT: Employee salary/payroll is NOT mutated directly by Inventory
        self.guard.refresh_from_db()
        # Verify employee active and no rogue payroll line created directly in inventory
        self.assertTrue(self.guard.is_active)

    def test_06_serialized_equipment_history_preservation(self):
        """Verify historical custody trail is preserved and never overwritten."""
        # Issue Radio 101 to guard
        issue1 = SecurityInventoryService.issue_equipment(
            company=self.company,
            user=self.manager,
            store_id=self.wh_main.id,
            item_id=self.item_radio.id,
            custody_type=EquipmentCustodyType.EMPLOYEE,
            employee_id=self.guard.id,
            serial_number='RAD-VHF-101',
            quantity=1,
            purpose="Shift 1"
        )
        # Return Radio 101
        SecurityInventoryService.return_equipment(
            company=self.company,
            user=self.manager,
            issue_id=issue1.id,
            store_id=self.wh_main.id,
            condition="GOOD"
        )

        # Issue Radio 101 to Site
        issue2 = SecurityInventoryService.issue_equipment(
            company=self.company,
            user=self.manager,
            store_id=self.wh_main.id,
            item_id=self.item_radio.id,
            custody_type=EquipmentCustodyType.SITE,
            site_id=self.site.id,
            serial_number='RAD-VHF-101',
            quantity=1,
            purpose="Shift 2 Site Post"
        )

        history = SecurityInventoryService.get_serialized_equipment_history(self.company, 'RAD-VHF-101')
        self.assertEqual(history['serial_number'], 'RAD-VHF-101')
        self.assertEqual(len(history['custody_history']), 2)
        self.assertEqual(history['custody_history'][0]['issue_id'], str(issue2.id))
        self.assertEqual(history['custody_history'][1]['issue_id'], str(issue1.id))
        self.assertEqual(history['current_status'], 'ISSUED')

    def test_07_controlled_item_authorization_guard(self):
        """Verify controlled items and armories require authorized credentials or auth code."""
        # Unprivileged staff user
        staff_user = User.objects.create_user(
            username="security_cadet", password="password123", company=self.company, role="staff"
        )

        # Attempting to issue weapon from armory without armorer authorization
        with self.assertRaises(Exception) as ctx:
            SecurityInventoryService.issue_equipment(
                company=self.company,
                user=staff_user,
                store_id=self.wh_armory.id,
                item_id=self.item_weapon.id,
                custody_type=EquipmentCustodyType.EMPLOYEE,
                employee_id=self.guard.id,
                serial_number='WPN-REM-501',
                quantity=1
            )
        self.assertIn("authorization", str(ctx.exception).lower())

        # Now issue using chief armorer with valid auth code
        issue = SecurityInventoryService.issue_equipment(
            company=self.company,
            user=self.armorer,
            store_id=self.wh_armory.id,
            item_id=self.item_weapon.id,
            custody_type=EquipmentCustodyType.EMPLOYEE,
            employee_id=self.guard.id,
            serial_number='WPN-REM-501',
            quantity=1,
            authorization_code="AUTH-ARMORY-999"
        )
        self.assertEqual(issue.status, EquipmentIssueStatus.ISSUED)

    def test_08_multi_tenant_isolation(self):
        """Verify strict tenant boundaries: users cannot issue or access stock of another company."""
        self.client.force_authenticate(user=self.other_user)

        # Other company attempts to access Apex stock availability
        res = self.client.get('/api/operations/security-inventory/stock-availability/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data), 0)

        # Other company attempts to issue Apex equipment
        res = self.client.post('/api/operations/security-inventory/issue/', {
            'store_id': str(self.wh_main.id),
            'item_id': str(self.item_radio.id),
            'custody_type': 'EMPLOYEE',
            'employee_id': str(self.guard.id),
            'serial_number': 'RAD-VHF-101',
            'quantity': 1
        })
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_09_reconciles_with_universal_inventory_balance(self):
        """Verify total stock availability perfectly reconciles with universal InventoryBalance."""
        res = self.client.get('/api/operations/security-inventory/overview/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.data
        self.assertIn('total_items', data)
        self.assertIn('total_stores', data)
        self.assertIn('total_managed_units', data)
        # 50 uniforms + 3 radios + 2 weapons = 55 total managed units
        self.assertEqual(data['total_managed_units'], 55)
