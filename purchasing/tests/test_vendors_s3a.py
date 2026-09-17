from decimal import Decimal
from datetime import date, timedelta
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient
from rest_framework import status

from companies.models import Company
from subscriptions.models import SubscriptionPlan, CompanySubscription
from crm.models import CRMEntity, CRMContact
from inventory.models import Item, Category
from platform_core.models import ModuleDefinition, CompanyModule
from purchasing.models import VendorCategory, Vendor, VendorItem, VendorDocument

User = get_user_model()


class VendorFoundationS3ATests(TestCase):
    def setUp(self):
        self.company_a = Company.objects.create(name="Security Tenant Alpha", business_type="security")
        self.company_b = Company.objects.create(name="Security Tenant Beta", business_type="security")

        # Subscriptions setup
        plan, _ = SubscriptionPlan.objects.get_or_create(
            name="Enterprise Plan",
            defaults={'price': Decimal('500.00')}
        )
        today = date.today()
        CompanySubscription.objects.create(
            company=self.company_a,
            plan=plan,
            start_date=today,
            end_date=today + timedelta(days=30),
            is_active=True
        )
        CompanySubscription.objects.create(
            company=self.company_b,
            plan=plan,
            start_date=today,
            end_date=today + timedelta(days=30),
            is_active=True
        )

        # Users
        self.user_a = User.objects.create_user(
            username="admin_a",
            password="password123",
            company=self.company_a,
            role="admin"
        )
        self.user_b = User.objects.create_user(
            username="admin_b",
            password="password123",
            company=self.company_b,
            role="admin"
        )
        self.staff_a = User.objects.create_user(
            username="staff_a",
            password="password123",
            company=self.company_a,
            role="staff"
        )

        # Purchasing Module activation
        self.module_def, _ = ModuleDefinition.objects.get_or_create(
            code="purchasing",
            defaults={'name': "Purchasing", 'category': 'operations'}
        )
        CompanyModule.objects.create(company=self.company_a, module=self.module_def, enabled=True)
        CompanyModule.objects.create(company=self.company_b, module=self.module_def, enabled=True)

        # Categories
        self.cat_equipment = VendorCategory.objects.create(
            company=self.company_a,
            name="Security Equipment",
            code="SEC-EQ"
        )
        self.cat_uniform = VendorCategory.objects.create(
            company=self.company_a,
            name="Uniform Supplier",
            code="UNI-SUP"
        )

        # Inventory Items for Company A
        inv_cat = Category.objects.create(company=self.company_a, name="Tactical Hardware")
        self.walkie_talkie = Item.objects.create(
            company=self.company_a,
            name="Walkie Talkie Long Range UHF",
            sku="WT-UHF-01",
            category=inv_cat,
            cost_price=Decimal("12000.00"),
            selling_price=Decimal("18000.00")
        )
        self.guard_vest = Item.objects.create(
            company=self.company_a,
            name="Tactical Security Vest",
            sku="VEST-TAC-01",
            category=inv_cat,
            cost_price=Decimal("4500.00"),
            selling_price=Decimal("7000.00")
        )

        # API Clients
        self.client_a = APIClient()
        self.client_a.force_authenticate(user=self.user_a)

        self.client_b = APIClient()
        self.client_b.force_authenticate(user=self.user_b)

    def test_vendor_creation_and_auto_crm_bridge(self):
        """Creating a vendor auto-generates sequential VEN code and synchronizes underlying CRMEntity."""
        vendor = Vendor.objects.create(
            company=self.company_a,
            name="Apex Security Hardware Ltd",
            category=self.cat_equipment,
            contact_person="Majid Khan",
            phone="+92 300 1112233",
            email="sales@apexsec.com",
            tax_number="NTN-998877",
            payment_terms="Net 30",
            credit_limit=Decimal("500000.00")
        )
        self.assertTrue(vendor.code.startswith("VEN-"))
        self.assertIsNotNone(vendor.crm_entity)
        self.assertEqual(vendor.crm_entity.entity_type, "SUPPLIER")
        self.assertEqual(vendor.crm_entity.name, "Apex Security Hardware Ltd")
        self.assertEqual(vendor.crm_entity.company_id, self.company_a.id)

    def test_vendor_tenant_isolation(self):
        """Company A vendors cannot be seen or retrieved by Company B."""
        vendor_a = Vendor.objects.create(
            company=self.company_a,
            name="Alpha Exclusive Supplier",
            category=self.cat_equipment
        )
        vendor_b = Vendor.objects.create(
            company=self.company_b,
            name="Beta Exclusive Supplier"
        )

        # List check
        res_a = self.client_a.get('/api/purchasing/vendors/')
        self.assertEqual(res_a.status_code, status.HTTP_200_OK)
        vendor_names_a = [v['name'] for v in res_a.data.get('results', res_a.data)]
        self.assertIn("Alpha Exclusive Supplier", vendor_names_a)
        self.assertNotIn("Beta Exclusive Supplier", vendor_names_a)

        # Direct detail check
        res_b_accessing_a = self.client_b.get(f'/api/purchasing/vendors/{vendor_a.id}/')
        self.assertEqual(res_b_accessing_a.status_code, status.HTTP_404_NOT_FOUND)

    def test_vendor_multiple_contacts(self):
        """Vendor supports multiple contacts linked through CRM entity."""
        vendor = Vendor.objects.create(
            company=self.company_a,
            name="National Uniforms Pvt",
            category=self.cat_uniform
        )

        # Add contact 1
        res_c1 = self.client_a.post(f'/api/purchasing/vendors/{vendor.id}/contacts/', {
            'first_name': 'Hamza',
            'last_name': 'Ali',
            'job_title': 'Account Manager',
            'phone': '+92 321 5554433',
            'email': 'hamza@nationaluniforms.com',
            'is_primary': True
        })
        self.assertEqual(res_c1.status_code, status.HTTP_201_CREATED)

        # Add contact 2
        res_c2 = self.client_a.post(f'/api/purchasing/vendors/{vendor.id}/contacts/', {
            'first_name': 'Zain',
            'last_name': 'Tariq',
            'job_title': 'Dispatch Head',
            'phone': '+92 333 8887766',
            'email': 'dispatch@nationaluniforms.com',
            'is_primary': False
        })
        self.assertEqual(res_c2.status_code, status.HTTP_201_CREATED)

        # Retrieve contacts
        res_list = self.client_a.get(f'/api/purchasing/vendors/{vendor.id}/contacts/')
        self.assertEqual(res_list.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res_list.data), 2)

    def test_one_item_with_multiple_vendors(self):
        """
        One Inventory Item can have multiple suppliers with distinct pricing, SKUs, and lead times.
        Example: Walkie Talkie supplied by Vendor A @ 15,000 and Vendor B @ 14,500.
        """
        vendor_1 = Vendor.objects.create(
            company=self.company_a,
            name="Supplier Alpha Electronics",
            category=self.cat_equipment
        )
        vendor_2 = Vendor.objects.create(
            company=self.company_a,
            name="Supplier Beta Comms",
            category=self.cat_equipment
        )

        # Vendor 1 supplies Walkie Talkie @ 15,000
        vi1 = VendorItem.objects.create(
            company=self.company_a,
            vendor=vendor_1,
            item=self.walkie_talkie,
            vendor_sku="ALPHA-WT-500",
            vendor_price=Decimal("15000.00"),
            currency="PKR",
            minimum_order_quantity=Decimal("5.00"),
            lead_time_days=3,
            is_preferred=False
        )

        # Vendor 2 supplies Walkie Talkie @ 14,500 (Preferred)
        vi2 = VendorItem.objects.create(
            company=self.company_a,
            vendor=vendor_2,
            item=self.walkie_talkie,
            vendor_sku="BETA-RADIO-99",
            vendor_price=Decimal("14500.00"),
            currency="PKR",
            minimum_order_quantity=Decimal("10.00"),
            lead_time_days=7,
            is_preferred=True
        )

        # Query via Vendor Items ViewSet
        res = self.client_a.get(f'/api/purchasing/vendor-items/?item={self.walkie_talkie.id}')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        items = res.data.get('results', res.data)
        self.assertEqual(len(items), 2)
        prices = {i['vendor_name']: float(i['vendor_price']) for i in items}
        self.assertEqual(prices["Supplier Alpha Electronics"], 15000.0)
        self.assertEqual(prices["Supplier Beta Comms"], 14500.0)

    def test_cross_tenant_item_vendor_blocked(self):
        """Cannot map Company A item to Company B vendor or vice versa."""
        vendor_b = Vendor.objects.create(
            company=self.company_b,
            name="Beta Supplier"
        )
        # Attempting to assign Company A item to Company B vendor must fail validation
        with self.assertRaises(ValidationError):
            vi = VendorItem(
                company=self.company_a,
                vendor=vendor_b,
                item=self.walkie_talkie,
                vendor_price=Decimal("1000.00")
            )
            vi.full_clean()

    def test_vendor_documents_tenant_safety(self):
        """Vendor documents are safely stored and isolated per tenant."""
        vendor = Vendor.objects.create(
            company=self.company_a,
            name="Documented Vendor Ltd"
        )
        fake_file = SimpleUploadedFile("vendor_agreement.pdf", b"Vendor NDA and Terms", content_type="application/pdf")

        res = self.client_a.post(f'/api/purchasing/vendors/{vendor.id}/documents/', {
            'document_type': 'AGREEMENT',
            'title': 'Master Supplier Agreement 2026',
            'file': fake_file,
            'notes': 'Executed agreement signed by CEO'
        }, format='multipart')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        # Company B cannot view Company A vendor documents
        res_b = self.client_b.get(f'/api/purchasing/vendor-documents/')
        docs_b = res_b.data.get('results', res_b.data)
        self.assertEqual(len(docs_b), 0)

    def test_purchasing_module_access_enforcement(self):
        """Staff user without purchasing read/write permission is blocked from modifications."""
        client_staff = APIClient()
        client_staff.force_authenticate(user=self.staff_a)

        res = client_staff.post('/api/purchasing/vendors/', {
            'name': 'Unauthorized Vendor Creation'
        })
        # RolePermission blocks staff from write methods on BasePurchasingViewSet
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
