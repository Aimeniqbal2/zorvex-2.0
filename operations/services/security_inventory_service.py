"""
operations/services/security_inventory_service.py

Phase S-6: Security Industry Inventory & Store Management Service.
Anchored strictly to Universal Inventory (inventory.Item, platform_core.Warehouse,
InventoryBalance, ItemSerial, StockMovement, transaction_service, transfer_service).
Zero duplicate stock engines or parallel balance trackers.
"""
import logging
from decimal import Decimal
from datetime import date, datetime
from django.db import transaction
from django.db.models import Sum, Q
from django.utils import timezone
from django.core.exceptions import ValidationError, PermissionDenied

from companies.models import Company
from platform_core.models import Warehouse
from hrm.models import Employee
from inventory.models import Item, Category, InventoryBalance, ItemSerial, StockMovement
from inventory.services.transaction_service import process_transaction
from inventory.services.transfer_service import transfer_stock
from inventory.services.serial_service import mark_defective
from inventory.services.exceptions import InventoryException, NegativeStockException

from operations.models import (
    OperationalSite, ServiceContract,
    EquipmentIssue, EquipmentIssueStatus, EquipmentCustodyType,
    EquipmentIncident, EquipmentIncidentType, EquipmentIncidentStatus,
    SecurityItemProfile, SecurityStoreProfile, SecurityStoreType, SecurityEquipmentCategory
)

logger = logging.getLogger(__name__)


class SecurityInventoryService:
    """
    Authoritative service for Security equipment issuance, custody, stores,
    transfers, lost/damaged workflows, and stock reconciliation.
    """

    @classmethod
    def check_controlled_authorization(cls, item, store=None, user=None):
        """
        Validates authorization when issuing or returning controlled/regulated equipment
        or operating within high-security stores (e.g. Armories).
        """
        is_controlled = False
        requires_auth = False

        if hasattr(item, 'security_profile') and item.security_profile:
            prof = item.security_profile
            is_controlled = prof.is_controlled
            requires_auth = prof.requires_authorization

        store_requires_auth = False
        if store and hasattr(store, 'security_profile') and store.security_profile:
            store_requires_auth = store.security_profile.requires_strong_auth or store.security_profile.is_armory

        if is_controlled or requires_auth or store_requires_auth:
            if not user:
                raise PermissionDenied("Authentication required to manage controlled security equipment or armory stock.")
            if getattr(user, 'is_superuser', False) or getattr(user, 'is_staff', False):
                return True
            user_role = getattr(user, 'role', '').lower()
            allowed_roles = ['admin', 'manager', 'armorer', 'armory_officer', 'security_head', 'director']
            if user_role not in allowed_roles:
                raise PermissionDenied(
                    f"Stronger authorization required for controlled equipment ({item.name}) or armory store. "
                    f"User role '{user_role}' is not authorized."
                )
        return True

    @classmethod
    @transaction.atomic
    def issue_equipment(
        cls,
        company,
        warehouse: Warehouse = None,
        item: Item = None,
        quantity=Decimal('1.00'),
        item_serial: ItemSerial = None,
        custody_type: str = EquipmentCustodyType.EMPLOYEE,
        employee=None,
        site: OperationalSite = None,
        contract: ServiceContract = None,
        client=None,
        purpose: str = '',
        expected_return_date: date = None,
        issue_condition: str = 'Good',
        notes: str = '',
        user=None,
        store_id=None,
        item_id=None,
        employee_id=None,
        site_id=None,
        serial_number=None,
        condition=None,
        authorization_code=None,
        **kwargs
    ) -> EquipmentIssue:
        """
        Issues equipment to an Employee or directly to an Operational Site.
        Decreases store balance via universal transaction service (EMPLOYEE_ISSUE / SITE_ISSUE).
        Creates an EquipmentIssue custody record.
        """
        comp_id = company.id if hasattr(company, 'id') else company

        # Resolve warehouse/store
        if not warehouse and store_id:
            warehouse = Warehouse.objects.get(id=store_id, company_id=comp_id)
        elif isinstance(warehouse, (str, int)) or hasattr(warehouse, 'hex'):
            warehouse = Warehouse.objects.get(id=warehouse, company_id=comp_id)

        # Resolve item
        if not item and item_id:
            item = Item.objects.get(id=item_id, company_id=comp_id)
        elif isinstance(item, (str, int)) or hasattr(item, 'hex'):
            item = Item.objects.get(id=item, company_id=comp_id)

        # Resolve employee
        if not employee and employee_id:
            employee = Employee.objects.get(id=employee_id, company_id=comp_id)
        elif isinstance(employee, (str, int)) or hasattr(employee, 'hex'):
            employee = Employee.objects.get(id=employee, company_id=comp_id)

        # Resolve site
        if not site and site_id:
            site = OperationalSite.objects.get(id=site_id, company_id=comp_id)
        elif isinstance(site, (str, int)) or hasattr(site, 'hex'):
            site = OperationalSite.objects.get(id=site, company_id=comp_id)

        # Resolve serial
        if not item_serial and serial_number:
            item_serial = ItemSerial.objects.filter(company_id=comp_id, serial_number=serial_number).first()
            if not item_serial and item and item.track_serial_number:
                raise ValidationError({'serial_number': f"Serial '{serial_number}' not found in company."})

        if condition and not issue_condition:
            issue_condition = condition

        qty = Decimal(str(quantity))
        if qty <= Decimal('0.00'):
            raise ValidationError({'quantity': 'Quantity must be greater than zero.'})

        # Check tenant integrity
        if str(warehouse.company_id) != str(comp_id):
            raise ValidationError({'warehouse': 'Warehouse does not belong to this company.'})
        if str(item.company_id) != str(comp_id):
            raise ValidationError({'item': 'Item does not belong to this company.'})

        # Controlled equipment authorization check
        cls.check_controlled_authorization(item, store=warehouse, user=user)

        # Custody validation
        if custody_type == EquipmentCustodyType.EMPLOYEE:
            if not employee:
                raise ValidationError({'employee': 'Employee is required for employee equipment issue.'})
            if str(employee.company_id) != str(comp_id):
                raise ValidationError({'employee': 'Employee does not belong to this company.'})
        elif custody_type == EquipmentCustodyType.SITE:
            if not site:
                raise ValidationError({'site': 'Operational Site is required for site equipment issue.'})
            if str(site.company_id) != str(comp_id):
                raise ValidationError({'site': 'Site does not belong to this company.'})
            if not client and site.crm_entity_id:
                client = site.crm_entity
            if not contract:
                contract = site.service_contracts.filter(status='ACTIVE').first()

        # Serialized equipment validation
        if item.track_serial_number:
            if not item_serial:
                raise ValidationError({'item_serial': 'Serial number is required for this serialized item.'})
            if qty != Decimal('1.00'):
                raise ValidationError({'quantity': 'Quantity must be exactly 1 for serialized items.'})
            if str(item_serial.company_id) != str(comp_id):
                raise ValidationError({'item_serial': 'Serial does not belong to this company.'})
            if item_serial.item_id != item.id:
                raise ValidationError({'item_serial': 'Serial does not match the chosen item.'})
            if item_serial.warehouse_id != warehouse.id:
                raise ValidationError({'item_serial': f"Serial is currently in {item_serial.warehouse.name}, not {warehouse.name}."})
            if item_serial.status != 'IN_STOCK':
                raise ValidationError({'item_serial': f"Serial is already in status {item_serial.status} and cannot be issued."})

        # Verify stock balance
        bal = InventoryBalance.objects.filter(item=item, warehouse=warehouse).first()
        current_stock = bal.quantity if bal else Decimal('0.00')
        if current_stock < qty:
            raise ValidationError({'quantity': f"Insufficient stock in {warehouse.name}. Available: {current_stock}, Requested: {qty}."})

        # 1. Create Custody record
        issue = EquipmentIssue.objects.create(
            company_id=comp_id,
            custody_type=custody_type,
            employee=employee,
            site=site,
            contract=contract,
            client=client,
            item=item,
            item_serial=item_serial,
            warehouse=warehouse,
            quantity=qty,
            expected_return_date=expected_return_date,
            purpose=purpose,
            issue_condition=issue_condition or 'Good',
            notes=notes,
            status=EquipmentIssueStatus.ISSUED,
            issued_by=user
        )

        # 2. Execute Universal Stock Movement
        mov_type = 'EMPLOYEE_ISSUE' if custody_type == EquipmentCustodyType.EMPLOYEE else 'SITE_ISSUE'
        serial_list = [item_serial.serial_number] if item_serial else None
        custodian_desc = f"Employee {employee.first_name} {employee.last_name}" if employee else f"Site {site.name}"
        ref = f"EQP-ISSUE-{issue.id}"

        process_transaction(
            company=issue.company,
            item=item,
            warehouse=warehouse,
            movement_type=mov_type,
            quantity=qty,
            reference=ref,
            user=user,
            notes=f"Issued to {custodian_desc}. Purpose: {purpose}".strip(),
            serial_numbers=serial_list
        )

        return issue

    @classmethod
    @transaction.atomic
    def return_equipment(
        cls,
        company,
        issue: EquipmentIssue = None,
        return_warehouse: Warehouse = None,
        return_condition: str = 'Good',
        notes: str = '',
        user=None,
        issue_id=None,
        store_id=None,
        condition=None,
        authorization_code=None,
        **kwargs
    ) -> EquipmentIssue:
        """
        Returns issued equipment from Employee or Site custody back into a Store.
        Increases store stock via universal transaction service (EMPLOYEE_RETURN / SITE_RETURN).
        Closes custody record with inspection condition and timestamp.
        """
        comp_id = company.id if hasattr(company, 'id') else company

        # Resolve issue
        if not issue and issue_id:
            issue = EquipmentIssue.objects.get(id=issue_id, company_id=comp_id)
        elif isinstance(issue, (str, int)) or hasattr(issue, 'hex'):
            issue = EquipmentIssue.objects.get(id=issue, company_id=comp_id)

        # Resolve return warehouse
        if not return_warehouse and store_id:
            return_warehouse = Warehouse.objects.get(id=store_id, company_id=comp_id)
        elif isinstance(return_warehouse, (str, int)) or hasattr(return_warehouse, 'hex'):
            return_warehouse = Warehouse.objects.get(id=return_warehouse, company_id=comp_id)

        if condition and not return_condition:
            return_condition = condition

        if str(issue.company_id) != str(comp_id):
            raise ValidationError({'issue': 'Equipment issue record belongs to another company.'})

        if issue.status != EquipmentIssueStatus.ISSUED:
            raise ValidationError({'issue': f"Cannot return equipment with status {issue.status}. Must be ISSUED."})

        target_store = return_warehouse or issue.warehouse
        if str(target_store.company_id) != str(comp_id):
            raise ValidationError({'return_warehouse': 'Target warehouse does not belong to this company.'})

        # Controlled equipment authorization check
        cls.check_controlled_authorization(issue.item, store=target_store, user=user)

        # 1. Update Custody record
        issue.status = EquipmentIssueStatus.RETURNED
        issue.returned_at = timezone.now()
        issue.returned_by = user
        issue.return_condition = return_condition or 'Good'
        if notes:
            issue.notes = f"{issue.notes}\nReturn Notes: {notes}".strip()
        issue.save()

        # 2. Execute Universal Stock Movement
        mov_type = 'EMPLOYEE_RETURN' if issue.custody_type == EquipmentCustodyType.EMPLOYEE else 'SITE_RETURN'
        serial_list = [issue.item_serial.serial_number] if issue.item_serial else None
        custodian_desc = f"Employee {issue.employee.first_name} {issue.employee.last_name}" if issue.employee else f"Site {issue.site.name}"
        ref = f"EQP-RET-{issue.id}"

        process_transaction(
            company=issue.company,
            item=issue.item,
            warehouse=target_store,
            movement_type=mov_type,
            quantity=issue.quantity,
            reference=ref,
            user=user,
            notes=f"Returned by {custodian_desc}. Condition: {return_condition}".strip(),
            serial_numbers=serial_list
        )

        return issue

    @classmethod
    @transaction.atomic
    def transfer_store_stock(
        cls,
        company,
        item: Item = None,
        source_warehouse: Warehouse = None,
        destination_warehouse: Warehouse = None,
        quantity=Decimal('1.00'),
        serial_numbers=None,
        user=None,
        reference='',
        notes='',
        item_id=None,
        from_store_id=None,
        to_store_id=None,
        authorization_code=None,
        **kwargs
    ):
        """
        Transfers equipment stock between stores (Store->Store, Store->Site Store, etc.)
        using the universal transfer_stock engine.
        """
        comp_id = company.id if hasattr(company, 'id') else company

        # Resolve item
        if not item and item_id:
            item = Item.objects.get(id=item_id, company_id=comp_id)
        elif isinstance(item, (str, int)) or hasattr(item, 'hex'):
            item = Item.objects.get(id=item, company_id=comp_id)

        # Resolve source warehouse
        if not source_warehouse and from_store_id:
            source_warehouse = Warehouse.objects.get(id=from_store_id, company_id=comp_id)
        elif isinstance(source_warehouse, (str, int)) or hasattr(source_warehouse, 'hex'):
            source_warehouse = Warehouse.objects.get(id=source_warehouse, company_id=comp_id)

        # Resolve destination warehouse
        if not destination_warehouse and to_store_id:
            destination_warehouse = Warehouse.objects.get(id=to_store_id, company_id=comp_id)
        elif isinstance(destination_warehouse, (str, int)) or hasattr(destination_warehouse, 'hex'):
            destination_warehouse = Warehouse.objects.get(id=destination_warehouse, company_id=comp_id)

        if str(item.company_id) != str(comp_id):
            raise ValidationError({'item': 'Item belongs to another company.'})
        if str(source_warehouse.company_id) != str(comp_id) or str(destination_warehouse.company_id) != str(comp_id):
            raise ValidationError({'warehouse': 'Warehouses must belong to the same company.'})

        # Check controlled authorization
        cls.check_controlled_authorization(item, store=source_warehouse, user=user)
        cls.check_controlled_authorization(item, store=destination_warehouse, user=user)

        qty = Decimal(str(quantity))
        ref = reference or f"SEC-TRF-{source_warehouse.code or 'SRC'}->{destination_warehouse.code or 'DEST'}"

        out_mov, in_mov = transfer_stock(
            item=item,
            source_warehouse=source_warehouse,
            destination_warehouse=destination_warehouse,
            quantity=qty,
            user=user,
            reference=ref,
            serial_numbers=serial_numbers
        )

        return out_mov

    @classmethod
    @transaction.atomic
    def report_incident(
        cls,
        company,
        item: Item = None,
        incident_type: str = EquipmentIncidentType.DAMAGED,
        incident_date: date = None,
        quantity=Decimal('1.00'),
        item_serial: ItemSerial = None,
        warehouse: Warehouse = None,
        employee=None,
        site: OperationalSite = None,
        equipment_issue: EquipmentIssue = None,
        condition_description: str = '',
        evidence_notes: str = '',
        estimated_loss_value=Decimal('0.00'),
        user=None,
        issue_id=None,
        store_id=None,
        item_id=None,
        serial_number=None,
        notes=None,
        damage_severity=None,
        condition_on_incident=None,
        **kwargs
    ) -> EquipmentIncident:
        """
        Reports lost, damaged, or unusable equipment without automatically mutating payroll.
        Updates custody status if linked to an active issue, and adjusts store stock if lost from store.
        """
        comp_id = company.id if hasattr(company, 'id') else company

        # Resolve equipment issue
        if not equipment_issue and issue_id:
            equipment_issue = EquipmentIssue.objects.get(id=issue_id, company_id=comp_id)
        elif isinstance(equipment_issue, (str, int)) or hasattr(equipment_issue, 'hex'):
            equipment_issue = EquipmentIssue.objects.get(id=equipment_issue, company_id=comp_id)

        # Resolve warehouse/store
        if not warehouse and store_id:
            warehouse = Warehouse.objects.get(id=store_id, company_id=comp_id)
        elif isinstance(warehouse, (str, int)) or hasattr(warehouse, 'hex'):
            warehouse = Warehouse.objects.get(id=warehouse, company_id=comp_id)

        # Resolve item
        if not item and item_id:
            item = Item.objects.get(id=item_id, company_id=comp_id)
        elif isinstance(item, (str, int)) or hasattr(item, 'hex'):
            item = Item.objects.get(id=item, company_id=comp_id)

        # Resolve serial
        if not item_serial and serial_number:
            item_serial = ItemSerial.objects.filter(company_id=comp_id, serial_number=serial_number).first()

        if notes and not evidence_notes:
            evidence_notes = notes
        if (damage_severity or condition_on_incident) and not condition_description:
            condition_description = f"{damage_severity or ''} {condition_on_incident or ''}".strip()

        qty = Decimal(str(quantity))

        if incident_type not in EquipmentIncidentType.values:
            raise ValidationError({'incident_type': f"Invalid incident type {incident_type}."})

        # Link from issue if provided
        if equipment_issue:
            item = equipment_issue.item
            item_serial = equipment_issue.item_serial
            warehouse = equipment_issue.warehouse
            employee = equipment_issue.employee
            site = equipment_issue.site
            qty = equipment_issue.quantity

        # Create Incident record
        incident = EquipmentIncident.objects.create(
            company_id=comp_id,
            equipment_issue=equipment_issue,
            item=item,
            item_serial=item_serial,
            warehouse=warehouse,
            employee=employee,
            site=site,
            incident_type=incident_type,
            incident_date=incident_date or date.today(),
            reported_by=user,
            quantity=qty,
            condition_description=condition_description,
            evidence_notes=evidence_notes,
            estimated_loss_value=Decimal(str(estimated_loss_value or 0)),
            status=EquipmentIncidentStatus.REPORTED
        )

        # Update linked custody record status
        if equipment_issue:
            if incident_type == EquipmentIncidentType.LOST:
                equipment_issue.status = EquipmentIssueStatus.LOST
            elif incident_type in [EquipmentIncidentType.DAMAGED, EquipmentIncidentType.UNUSABLE]:
                equipment_issue.status = EquipmentIssueStatus.DAMAGED

            equipment_issue.incident_date = incident_date or date.today()
            equipment_issue.damage_severity = condition_description
            equipment_issue.save(update_fields=['status', 'incident_date', 'damage_severity', 'updated_at'])

            # If serialized, mark serial defective
            if item_serial and incident_type in [EquipmentIncidentType.DAMAGED, EquipmentIncidentType.UNUSABLE]:
                mark_defective(item_serial)

        # If incident happened directly to stock in a store (not currently in employee/site custody):
        elif warehouse and not equipment_issue:
            mov_type = 'DAMAGE' if incident_type in [EquipmentIncidentType.DAMAGED, EquipmentIncidentType.UNUSABLE] else 'LOSS'
            serial_list = [item_serial.serial_number] if item_serial else None
            process_transaction(
                company=incident.company,
                item=item,
                warehouse=warehouse,
                movement_type=mov_type,
                quantity=qty,
                reference=f"INCIDENT-{incident.id}",
                user=user,
                notes=f"{incident.get_incident_type_display()} reported in {warehouse.name}: {condition_description}",
                serial_numbers=serial_list
            )

        return incident

    @classmethod
    @transaction.atomic
    def resolve_incident(
        cls,
        company,
        incident: EquipmentIncident = None,
        resolution_status: str = '',
        approved_resolution: str = '',
        user=None,
        payroll_deduction_recommended: bool = False,
        payroll_deduction_amount=Decimal('0.00'),
        incident_id=None,
        status=None,
        resolution_notes=None,
        approved_write_off=False,
        recommended_payroll_deduction=None,
        deduction_notes=None,
        **kwargs
    ) -> EquipmentIncident:
        """
        Resolves an equipment loss/damage incident.
        Does NOT directly mutate employee payroll — merely records authorized recommendation.
        """
        comp_id = company.id if hasattr(company, 'id') else company

        # Resolve incident
        if not incident and incident_id:
            incident = EquipmentIncident.objects.get(id=incident_id, company_id=comp_id)
        elif isinstance(incident, (str, int)) or hasattr(incident, 'hex'):
            incident = EquipmentIncident.objects.get(id=incident, company_id=comp_id)

        if status and not resolution_status:
            resolution_status = status
        if resolution_notes and not approved_resolution:
            approved_resolution = resolution_notes
        if approved_write_off:
            resolution_status = EquipmentIncidentStatus.APPROVED_WRITE_OFF
        if recommended_payroll_deduction is not None:
            payroll_deduction_amount = Decimal(str(recommended_payroll_deduction))
            if payroll_deduction_amount > 0:
                payroll_deduction_recommended = True

        if str(incident.company_id) != str(comp_id):
            raise ValidationError({'incident': 'Incident belongs to another company.'})

        if resolution_status not in EquipmentIncidentStatus.values:
            raise ValidationError({'resolution_status': f"Invalid resolution status {resolution_status}."})

        incident.status = resolution_status
        incident.approved_resolution = approved_resolution
        incident.resolved_by = user
        incident.resolved_at = timezone.now()
        incident.payroll_deduction_recommended = payroll_deduction_recommended
        incident.payroll_deduction_amount = Decimal(str(payroll_deduction_amount or 0))
        incident.save()

        # If write-off approved for an issue, transition to WRITTEN_OFF
        if resolution_status == EquipmentIncidentStatus.APPROVED_WRITE_OFF and incident.equipment_issue:
            eq = incident.equipment_issue
            eq.status = EquipmentIssueStatus.WRITTEN_OFF
            eq.resolution_status = 'APPROVED_WRITE_OFF'
            eq.resolution_notes = approved_resolution
            eq.resolved_by = user
            eq.resolved_at = timezone.now()
            eq.save(update_fields=['status', 'resolution_status', 'resolution_notes', 'resolved_by', 'resolved_at', 'updated_at'])

        return incident

    @classmethod
    def get_stock_availability(
        cls,
        company_id,
        warehouse_id=None,
        site_id=None,
        category_id=None,
        security_category=None,
        search=None,
        is_controlled=None
    ) -> dict:
        """
        Provides complete Security Inventory visibility reconciled against Universal Inventory.
        Returns store stock balances, employee custody counts, site custody counts,
        and loss/damage metrics without discrepancies.
        """
        items_qs = Item.objects.filter(company_id=company_id, is_active=True).select_related(
            'category', 'security_profile'
        )

        if category_id:
            items_qs = items_qs.filter(category_id=category_id)
        if security_category:
            items_qs = items_qs.filter(security_profile__security_category=security_category)
        if is_controlled is not None:
            items_qs = items_qs.filter(security_profile__is_controlled=is_controlled)
        if search:
            items_qs = items_qs.filter(
                Q(name__icontains=search) | Q(item_code__icontains=search) | Q(sku__icontains=search)
            )

        # Pre-fetch balances
        bal_qs = InventoryBalance.objects.filter(company_id=company_id).select_related('warehouse', 'warehouse__security_profile')
        if warehouse_id:
            bal_qs = bal_qs.filter(warehouse_id=warehouse_id)
        if site_id:
            bal_qs = bal_qs.filter(warehouse__security_profile__site_id=site_id)

        balances_by_item = {}
        for b in bal_qs:
            if b.item_id not in balances_by_item:
                balances_by_item[b.item_id] = []
            balances_by_item[b.item_id].append({
                'warehouse_id': str(b.warehouse_id),
                'warehouse_name': b.warehouse.name,
                'store_type': getattr(getattr(b.warehouse, 'security_profile', None), 'store_type', 'STANDARD'),
                'quantity': float(b.quantity)
            })

        # Pre-fetch custody counts
        issues_qs = EquipmentIssue.objects.filter(
            company_id=company_id,
            status__in=[
                EquipmentIssueStatus.ISSUED,
                EquipmentIssueStatus.LOST,
                EquipmentIssueStatus.DAMAGED
            ]
        )
        if warehouse_id:
            issues_qs = issues_qs.filter(warehouse_id=warehouse_id)
        if site_id:
            issues_qs = issues_qs.filter(site_id=site_id)

        custody_by_item = {}
        for iss in issues_qs:
            i_id = iss.item_id
            if i_id not in custody_by_item:
                custody_by_item[i_id] = {
                    'issued_employees': Decimal('0.00'),
                    'issued_sites': Decimal('0.00'),
                    'damaged': Decimal('0.00'),
                    'lost': Decimal('0.00')
                }
            if iss.status == EquipmentIssueStatus.ISSUED:
                if iss.custody_type == EquipmentCustodyType.EMPLOYEE:
                    custody_by_item[i_id]['issued_employees'] += iss.quantity
                else:
                    custody_by_item[i_id]['issued_sites'] += iss.quantity
            elif iss.status == EquipmentIssueStatus.DAMAGED:
                custody_by_item[i_id]['damaged'] += iss.quantity
            elif iss.status == EquipmentIssueStatus.LOST:
                custody_by_item[i_id]['lost'] += iss.quantity

        # Aggregate items list
        items_data = []
        total_store_stock = Decimal('0.00')
        total_issued_staff = Decimal('0.00')
        total_issued_sites = Decimal('0.00')
        total_damaged = Decimal('0.00')
        total_lost = Decimal('0.00')

        for itm in items_qs:
            bals = balances_by_item.get(itm.id, [])
            in_store_qty = sum(Decimal(str(b['quantity'])) for b in bals)
            cust = custody_by_item.get(itm.id, {
                'issued_employees': Decimal('0.00'),
                'issued_sites': Decimal('0.00'),
                'damaged': Decimal('0.00'),
                'lost': Decimal('0.00')
            })

            sec_prof = getattr(itm, 'security_profile', None)
            total_managed = in_store_qty + cust['issued_employees'] + cust['issued_sites']

            total_store_stock += in_store_qty
            total_issued_staff += cust['issued_employees']
            total_issued_sites += cust['issued_sites']
            total_damaged += cust['damaged']
            total_lost += cust['lost']

            items_data.append({
                'id': str(itm.id),
                'item_id': str(itm.id),
                'item_code': itm.item_code or itm.sku or '',
                'name': itm.name,
                'item_name': itm.name,
                'category': sec_prof.get_security_category_display() if sec_prof else (itm.category.name if itm.category else 'Other'),
                'category_name': itm.category.name if itm.category else 'Uncategorized',
                'security_category': sec_prof.security_category if sec_prof else SecurityEquipmentCategory.OTHER,
                'security_category_display': sec_prof.get_security_category_display() if sec_prof else 'Other',
                'is_controlled': sec_prof.is_controlled if sec_prof else False,
                'track_serial_number': itm.track_serial_number,
                'is_serialized': itm.track_serial_number,
                'unit_of_measure': itm.unit_of_measure,
                'cost_price': float(itm.cost_price),
                'in_store_quantity': float(in_store_qty),
                'store_balance': float(in_store_qty),
                'store_stock': float(in_store_qty),
                'available_store_stock': float(in_store_qty),
                'issued_to_employees': float(cust['issued_employees']),
                'issued_employees': float(cust['issued_employees']),
                'issued_to_sites': float(cust['issued_sites']),
                'issued_sites': float(cust['issued_sites']),
                'damaged_quantity': float(cust['damaged']),
                'damaged': float(cust['damaged']),
                'lost_quantity': float(cust['lost']),
                'lost': float(cust['lost']),
                'total_managed_quantity': float(total_managed),
                'total_managed': float(total_managed),
                'store_breakdown': bals
            })

        return {
            'summary': {
                'total_items_count': len(items_data),
                'total_in_store_quantity': float(total_store_stock),
                'total_issued_employees_quantity': float(total_issued_staff),
                'total_issued_sites_quantity': float(total_issued_sites),
                'total_damaged_quantity': float(total_damaged),
                'total_lost_quantity': float(total_lost),
                'total_equipment_assets': float(total_store_stock + total_issued_staff + total_issued_sites)
            },
            'items': items_data
        }

    @classmethod
    def get_stock_overview(cls, company, **kwargs) -> dict:
        comp_id = company.id if hasattr(company, 'id') else company
        return cls.get_stock_availability(company_id=comp_id, **kwargs)

    @classmethod
    def get_employee_custody(cls, company_id, employee_id) -> dict:
        """
        Retrieves all equipment issued to an employee, returned history, and loss/damage incidents.
        """
        issues = EquipmentIssue.objects.filter(
            company_id=company_id,
            employee_id=employee_id
        ).select_related('item', 'item_serial', 'warehouse', 'site', 'issued_by', 'returned_by').order_by('-issued_at')

        active_issues = [iss for iss in issues if iss.status == EquipmentIssueStatus.ISSUED]
        returned_issues = [iss for iss in issues if iss.status == EquipmentIssueStatus.RETURNED]
        lost_damaged = [iss for iss in issues if iss.status in [EquipmentIssueStatus.LOST, EquipmentIssueStatus.DAMAGED, EquipmentIssueStatus.WRITTEN_OFF]]

        return {
            'employee_id': str(employee_id),
            'active_equipment_count': len(active_issues),
            'returned_equipment_count': len(returned_issues),
            'lost_damaged_count': len(lost_damaged),
            'active_equipment': [
                {
                    'id': str(iss.id),
                    'item_id': str(iss.item_id),
                    'item_name': iss.item.name,
                    'serial_number': iss.item_serial.serial_number if iss.item_serial else None,
                    'quantity': float(iss.quantity),
                    'warehouse_name': iss.warehouse.name,
                    'site_name': iss.site.name if iss.site else None,
                    'purpose': iss.purpose,
                    'issued_at': iss.issued_at.isoformat(),
                    'expected_return_date': iss.expected_return_date.isoformat() if iss.expected_return_date else None,
                    'issue_condition': iss.issue_condition,
                    'status': iss.status
                }
                for iss in active_issues
            ],
            'history': [
                {
                    'id': str(iss.id),
                    'item_name': iss.item.name,
                    'serial_number': iss.item_serial.serial_number if iss.item_serial else None,
                    'quantity': float(iss.quantity),
                    'status': iss.status,
                    'issued_at': iss.issued_at.isoformat(),
                    'returned_at': iss.returned_at.isoformat() if iss.returned_at else None,
                    'return_condition': iss.return_condition,
                    'notes': iss.notes
                }
                for iss in issues
            ]
        }

    @classmethod
    def get_site_equipment(cls, company_id, site_id) -> dict:
        """
        Retrieves all equipment issued directly to an Operational Site or held in site stock rooms.
        """
        site_issues = EquipmentIssue.objects.filter(
            company_id=company_id,
            site_id=site_id
        ).select_related('item', 'item_serial', 'warehouse', 'employee', 'issued_by', 'returned_by').order_by('-issued_at')

        currently_assigned = [iss for iss in site_issues if iss.status == EquipmentIssueStatus.ISSUED]

        # Site store balances if this site has associated security stores
        site_store_bals = InventoryBalance.objects.filter(
            company_id=company_id,
            warehouse__security_profile__site_id=site_id
        ).select_related('item', 'warehouse')

        return {
            'site_id': str(site_id),
            'currently_assigned_count': len(currently_assigned),
            'site_store_balances_count': site_store_bals.count(),
            'assigned_equipment': [
                {
                    'id': str(iss.id),
                    'custody_type': iss.custody_type,
                    'item_id': str(iss.item_id),
                    'item_name': iss.item.name,
                    'serial_number': iss.item_serial.serial_number if iss.item_serial else None,
                    'quantity': float(iss.quantity),
                    'custodian': f"{iss.employee.first_name} {iss.employee.last_name}" if iss.employee else f"Site Asset",
                    'issued_at': iss.issued_at.isoformat(),
                    'issue_condition': iss.issue_condition,
                    'status': iss.status
                }
                for iss in currently_assigned
            ],
            'site_stores_stock': [
                {
                    'warehouse_id': str(b.warehouse_id),
                    'warehouse_name': b.warehouse.name,
                    'item_name': b.item.name,
                    'quantity': float(b.quantity)
                }
                for b in site_store_bals
            ]
        }

    @classmethod
    def get_serialized_equipment_history(cls, company_id, serial_identifier) -> dict:
        """
        Exposes full lifecycle history for a serialized piece of equipment:
        Current location, current custodian, all past issues/returns, condition changes, incidents.
        Never overwrites historical custody.
        """
        try:
            if '-' in str(serial_identifier) and len(str(serial_identifier)) == 36:
                serial_obj = ItemSerial.objects.select_related('item', 'warehouse').get(
                    company_id=company_id, id=serial_identifier
                )
            else:
                serial_obj = ItemSerial.objects.select_related('item', 'warehouse').get(
                    company_id=company_id, serial_number=serial_identifier
                )
        except ItemSerial.DoesNotExist:
            raise ValidationError({'serial': f"Serial '{serial_identifier}' not found."})

        # Past and current issues
        issues = EquipmentIssue.objects.filter(
            company_id=company_id,
            item_serial=serial_obj
        ).select_related('employee', 'site', 'warehouse', 'issued_by', 'returned_by').order_by('-issued_at')

        current_issue = issues.filter(status=EquipmentIssueStatus.ISSUED).first()
        incidents = EquipmentIncident.objects.filter(
            company_id=company_id,
            item_serial=serial_obj
        ).select_related('reported_by', 'resolved_by').order_by('-incident_date')

        custodian_info = None
        if current_issue:
            custodian_info = {
                'custody_type': current_issue.custody_type,
                'custodian_name': (
                    f"{current_issue.employee.first_name} {current_issue.employee.last_name}"
                    if current_issue.employee else current_issue.site.name
                ),
                'custodian_id': str(current_issue.employee_id or current_issue.site_id),
                'issued_at': current_issue.issued_at.isoformat(),
                'expected_return_date': current_issue.expected_return_date.isoformat() if current_issue.expected_return_date else None,
                'issue_condition': current_issue.issue_condition
            }

        return {
            'serial_id': str(serial_obj.id),
            'serial_number': serial_obj.serial_number,
            'item_id': str(serial_obj.item_id),
            'item_name': serial_obj.item.name,
            'status': serial_obj.status,
            'current_status': serial_obj.status,
            'current_home_store': serial_obj.warehouse.name,
            'current_custodian': custodian_info,
            'custody_history': [
                {
                    'issue_id': str(iss.id),
                    'custody_type': iss.custody_type,
                    'custodian_name': (
                        f"{iss.employee.first_name} {iss.employee.last_name}"
                        if iss.employee else (iss.site.name if iss.site else 'Site Asset')
                    ),
                    'store_name': iss.warehouse.name,
                    'issued_at': iss.issued_at.isoformat(),
                    'returned_at': iss.returned_at.isoformat() if iss.returned_at else None,
                    'status': iss.status,
                    'issue_condition': iss.issue_condition,
                    'return_condition': iss.return_condition,
                    'notes': iss.notes
                }
                for iss in issues
            ],
            'incidents': [
                {
                    'incident_id': str(inc.id),
                    'incident_type': inc.incident_type,
                    'incident_date': inc.incident_date.isoformat(),
                    'status': inc.status,
                    'condition_description': inc.condition_description,
                    'approved_resolution': inc.approved_resolution
                }
                for inc in incidents
            ]
        }
