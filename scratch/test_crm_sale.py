from crm.models import CRMEntity
from sales.models import Sale, POSSession, Customer
from accounts.models import User
import decimal

user = User.objects.exclude(company=None).first()
company = user.company

# Create a fresh CRM customer
crm_customer = CRMEntity.objects.create(
    company=company,
    name="Test React Customer",
    entity_type="CUSTOMER",
    created_by=user
)

# Open a session
session = POSSession.objects.create(
    company=company,
    cashier=user,
    opening_cash=100
)

# Try to do a credit sale
try:
    sale = Sale.objects.create(
        company=company,
        cashier=user,
        pos_session=session,
        crm_entity=crm_customer,
        payment_method='credit',
        total_amount=decimal.Decimal('100.00'),
        status='COMPLETED'
    )
    print("SUCCESS: Sale created")
except Exception as e:
    print(f"FAILED: {type(e).__name__} - {e}")
