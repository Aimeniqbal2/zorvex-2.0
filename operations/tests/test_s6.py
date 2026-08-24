import json
from datetime import date
from decimal import Decimal
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
User = get_user_model()
from crm.models import CRMEntity
from hrm.models import Employee, Designation
from inventory.models import Item, Category
from platform_core.models import Warehouse, ModuleDefinition, CompanyModule
from companies.models import Company
from operations.models import OperationalSite, EquipmentIssue, EquipmentIssueStatus

def make_company_with_modules(company_name, modules):
    company = Company.objects.create(name=company_name)
    for mod_code in modules:
        module, _ = ModuleDefinition.objects.get_or_create(code=mod_code, defaults={'name': mod_code.title()})
        CompanyModule.objects.create(company=company, module=module)
    return company

class PhaseS6EquipmentIssueTests(APITestCase):
    def setUp(self):
        self.company = make_company_with_modules("Alpha Security", ["security_ops", "inventory"])
        self.user = User.objects.create_user(username="manager123", password="password123", company=self.company, role="manager")
        self.client.force_authenticate(user=self.user)
        
        self.cat = Category.objects.create(name="Security Gear", company=self.company)
        
        self.uniform = Item.objects.create(
            company=self.company,
            name="Security Uniform",
            category=self.cat,
            track_inventory=True,
            track_serial_number=False,
            item_type='PRODUCT'
        )
        
        self.radio = Item.objects.create(
            company=self.company,
            name="Two-Way Radio",
            category=self.cat,
            track_inventory=True,
            track_serial_number=True,
            item_type='ASSET'
        )
        
        self.warehouse = Warehouse.objects.create(
            company=self.company,
            name="Main Warehouse",
            is_active=True
        )
        
        from inventory.services.transaction_service import process_transaction
        
        process_transaction(
            company=self.company,
            item=self.uniform,
            warehouse=self.warehouse,
            movement_type='OPENING_BALANCE',
            quantity=Decimal('100'),
        )
        
        process_transaction(
            company=self.company,
            item=self.radio,
            warehouse=self.warehouse,
            movement_type='OPENING_BALANCE',
            quantity=Decimal('2'),
            serial_numbers=['RAD-000124', 'RAD-000125']
        )
        
        self.desig = Designation.objects.create(company=self.company, name="Security Guard")
        self.emp = Employee.objects.create(
            company=self.company,
            first_name="Ahmed",
            last_name="Khan",
            designation=self.desig,
            is_active=True
        )
        self.emp2 = Employee.objects.create(
            company=self.company,
            first_name="Usman",
            last_name="Ali",
            designation=self.desig,
            is_active=True
        )
        
        self.crm = CRMEntity.objects.create(company=self.company, name="Customer", entity_type="CUSTOMER")
        self.site = OperationalSite.objects.create(company=self.company, crm_entity=self.crm, name="Site A")
        
        self.url = '/api/operations/equipment-issues/'
        
    def test_issue_quantity_item(self):
        from inventory.models import InventoryBalance, StockMovement
        payload = {
            'employee': self.emp.id,
            'item': self.uniform.id,
            'warehouse': self.warehouse.id,
            'quantity': '2.00',
            'site': self.site.id,
            'issue_condition': 'New'
        }
        res = self.client.post(self.url, payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        
        issue_id = res.data['id']
        bal = InventoryBalance.objects.get(item=self.uniform, warehouse=self.warehouse)
        self.assertEqual(bal.quantity, Decimal('98.00'))
        
        mov = StockMovement.objects.filter(item=self.uniform, movement_type='EMPLOYEE_ISSUE').first()
        self.assertIsNotNone(mov)
        self.assertEqual(mov.quantity, Decimal('2.00'))
        self.assertEqual(mov.reference, f"EQP-ISSUE-{issue_id}")

    def test_insufficient_stock(self):
        payload = {
            'employee': self.emp.id,
            'item': self.uniform.id,
            'warehouse': self.warehouse.id,
            'quantity': '101.00',
        }
        res = self.client.post(self.url, payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(EquipmentIssue.objects.count(), 0)

    def test_issue_and_return_serialized_item(self):
        from inventory.models import ItemSerial, InventoryBalance
        serial_obj = ItemSerial.objects.get(item=self.radio, serial_number='RAD-000124')
        self.assertEqual(serial_obj.status, 'IN_STOCK')
        
        payload = {
            'employee': self.emp.id,
            'item': self.radio.id,
            'warehouse': self.warehouse.id,
            'item_serial': serial_obj.id,
            'quantity': '1'
        }
        res = self.client.post(self.url, payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        issue_id = res.data['id']
        
        serial_obj.refresh_from_db()
        self.assertEqual(serial_obj.status, 'ISSUED')
        
        bal = InventoryBalance.objects.get(item=self.radio, warehouse=self.warehouse)
        self.assertEqual(bal.quantity, Decimal('1.00'))
        
        # Double issue attempt
        payload2 = {
            'employee': self.emp2.id,
            'item': self.radio.id,
            'warehouse': self.warehouse.id,
            'item_serial': serial_obj.id,
            'quantity': '1'
        }
        res2 = self.client.post(self.url, payload2, format='json')
        self.assertEqual(res2.status_code, status.HTTP_400_BAD_REQUEST)
        
        # Return
        return_url = f"{self.url}{issue_id}/return/"
        res3 = self.client.post(return_url, {'return_condition': 'Good'}, format='json')
        self.assertEqual(res3.status_code, status.HTTP_200_OK)
        
        serial_obj.refresh_from_db()
        self.assertEqual(serial_obj.status, 'IN_STOCK')
        bal.refresh_from_db()
        self.assertEqual(bal.quantity, Decimal('2.00'))
        
        # Double return
        res4 = self.client.post(return_url, {}, format='json')
        self.assertEqual(res4.status_code, status.HTTP_400_BAD_REQUEST)

    def test_cross_tenant_isolation(self):
        company2 = make_company_with_modules("Bravo Security", ["security_ops", "inventory"])
        desig2 = Designation.objects.create(company=company2, name="Guard")
        emp2 = Employee.objects.create(company=company2, first_name="Ali", last_name="Baba", designation=desig2)
        item2 = Item.objects.create(company=company2, name="Company 2 Uniform", track_inventory=True)
        
        # Issued by company 1 user for company 2 item
        res = self.client.post(self.url, {
            'employee': self.emp.id,
            'item': item2.id,
            'warehouse': self.warehouse.id,
            'quantity': '1'
        }, format='json')
        self.assertIn(res.status_code, [400, 403, 404])
        
        # Issued by company 1 user for company 2 employee
        res = self.client.post(self.url, {
            'employee': emp2.id,
            'item': self.uniform.id,
            'warehouse': self.warehouse.id,
            'quantity': '1'
        }, format='json')
        self.assertIn(res.status_code, [400, 403, 404])
        
    def test_atomicity_on_failure(self):
        payload = {
            'employee': self.emp.id,
            'item': self.radio.id,
            'warehouse': self.warehouse.id,
            'quantity': '1'
        }
        res = self.client.post(self.url, payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(EquipmentIssue.objects.count(), 0)
