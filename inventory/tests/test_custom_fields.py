from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from companies.models import Company
from inventory.models import Category, Item, ItemFieldDefinition, ItemFieldValue

User = get_user_model()

class CustomFieldsTests(TestCase):
    def setUp(self):
        # Create companies
        self.company_a = Company.objects.create(name="Company A")
        self.company_b = Company.objects.create(name="Company B")
        
        # Create users
        self.user_a = User.objects.create_user(
            username="user_a", password="password", company=self.company_a, role="admin"
        )
        self.user_b = User.objects.create_user(
            username="user_b", password="password", company=self.company_b, role="admin"
        )
        
        # API Clients
        self.client_a = APIClient()
        self.client_a.force_authenticate(user=self.user_a)
        
        self.client_b = APIClient()
        self.client_b.force_authenticate(user=self.user_b)
        
        # Categories
        self.cat_a = Category.objects.create(name="Cat A", company=self.company_a)
        
        # Field Definitions for Company A
        self.field_text = ItemFieldDefinition.objects.create(
            company=self.company_a, name="Warranty", key="warranty", field_type="TEXT"
        )
        self.field_required = ItemFieldDefinition.objects.create(
            company=self.company_a, name="Serial", key="serial", field_type="TEXT", required=True
        )
        self.field_number = ItemFieldDefinition.objects.create(
            company=self.company_a, name="Voltage", key="voltage", field_type="NUMBER"
        )
        self.field_boolean = ItemFieldDefinition.objects.create(
            company=self.company_a, name="Is Fragile", key="is_fragile", field_type="BOOLEAN", default_value=False
        )
        
        # Field Definitions for Company B
        self.field_b = ItemFieldDefinition.objects.create(
            company=self.company_b, name="Color", key="color", field_type="TEXT"
        )

    def test_tenant_isolation(self):
        """Company A cannot see Company B's custom fields."""
        response = self.client_a.get('/api/inventory/item-field-definitions/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Assuming pagination or flat list
        results = response.data['results'] if 'results' in response.data else response.data
        keys = [f['key'] for f in results]
        self.assertIn('warranty', keys)
        self.assertNotIn('color', keys)

    def test_required_custom_fields_block_item_creation(self):
        """Required Custom Fields block Item creation if missing."""
        payload = {
            "name": "Test Item",
            "item_type": "PRODUCT",
            "custom_fields": {
                "warranty": "1 Year"
            }
        }
        response = self.client_a.post('/api/inventory/items/', payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("serial", str(response.data))

    def test_submitting_valid_custom_fields_creates_item(self):
        """Submitting valid Custom Fields successfully creates an Item and ItemFieldValues."""
        payload = {
            "name": "Test Item Valid",
            "item_type": "PRODUCT",
            "custom_fields": {
                "warranty": "2 Years",
                "serial": "SN123",
                "voltage": 220,
                "is_fragile": True
            }
        }
        response = self.client_a.post('/api/inventory/items/', payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        
        item = Item.objects.get(id=response.data['id'])
        self.assertTrue(ItemFieldValue.objects.filter(item=item, field_definition=self.field_text, value="2 Years").exists())
        self.assertTrue(ItemFieldValue.objects.filter(item=item, field_definition=self.field_number, value=220).exists())
        self.assertTrue(ItemFieldValue.objects.filter(item=item, field_definition=self.field_boolean, value=True).exists())

    def test_valid_custom_field_constraints_respected(self):
        """Validation fails if number field is provided a string."""
        payload = {
            "name": "Test Item Invalid",
            "item_type": "PRODUCT",
            "custom_fields": {
                "serial": "SN123",
                "voltage": "Not a number"
            }
        }
        response = self.client_a.post('/api/inventory/items/', payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("voltage", str(response.data))
        
    def test_deactivated_fields_ignored_by_defaults(self):
        """Deactivated fields should not block validation or add defaults if ignored."""
        self.field_required.active = False
        self.field_required.save()
        
        payload = {
            "name": "Test Item Deactivated",
            "item_type": "PRODUCT",
            "custom_fields": {}
        }
        response = self.client_a.post('/api/inventory/items/', payload, format='json')
        # Should succeed because serial is required but inactive
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
