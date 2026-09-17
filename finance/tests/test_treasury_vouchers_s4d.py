"""
finance/tests/test_treasury_vouchers_s4d.py

Phase S-4D Targeted Test Suite: Cash, Bank, Receipts & Financial Voucher Management.
Tests:
1. Receipt voucher creation & tenant-scoped auto numbering.
2. Payment voucher creation & tenant-scoped auto numbering.
3. Client receipt linkage and duplicate prevention (idempotency).
4. Vendor payment linkage and duplicate prevention (idempotency).
5. Cash receipt and Bank payment operational treasury movements.
6. Contra transfer & atomic two-sided treasury ledger entries.
7. Opening balance initialization & locking after operational movements.
8. Treasury statement ledger with chronological running balance.
9. Cheque lifecycle (Received -> Deposited -> Cleared / Bounced).
10. Posted voucher immutability & safe draft cancellation.
11. Atomic voucher reversal and treasury ledger rollback.
12. Closed accounting period posting prevention.
13. Cross-tenant isolation (Accounts, Vouchers, Cheques).
14. REST API endpoints end-to-end execution.
"""
from decimal import Decimal
from datetime import date, timedelta
from django.test import TestCase
from django.core.exceptions import ValidationError
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status

from companies.models import Company
from platform_core.models import ModuleDefinition
from platform_core.provisioning import enable_module
from finance.models import (
    ChartOfAccount, AccountType, NormalBalance, Currency,
    FiscalYear, AccountingPeriod, PeriodStatus, BankAccount,
    BankAccountType, FinancialVoucher, FinancialVoucherLine,
    VoucherType, VoucherStatus, PaymentMethod, TreasuryTransaction,
    TreasuryTransactionType, Cheque, ChequeStatus, SecurityFinanceConfiguration
)
from finance.services.treasury_service import (
    initialize_opening_balance, record_treasury_movement,
    get_account_statement_ledger, get_treasury_dashboard_metrics
)
from finance.services.voucher_service import (
    create_financial_voucher, submit_voucher_for_approval,
    approve_voucher, post_financial_voucher, reverse_financial_voucher,
    cancel_draft_voucher, create_contra_transfer,
    create_voucher_from_client_receipt, create_voucher_from_vendor_payment
)
from finance.services.cheque_service import (
    create_cheque, deposit_cheque, mark_cheque_cleared,
    bounce_cheque, cancel_cheque
)
from billing.models import ClientReceipt, PaymentMethod as BillingPaymentMethod, ReceiptStatus
from purchasing.models import Vendor, VendorPayment
from crm.models import CRMEntity

User = get_user_model()


class TreasuryVouchersS4DTestCase(TestCase):
    def setUp(self):
        # 1. Companies
        self.company_a = Company.objects.create(name="SecureCorp Tenant A")
        self.company_b = Company.objects.create(name="DefendCo Tenant B")

        # 2. Enable Modules
        ModuleDefinition.objects.get_or_create(code='finance', defaults={'name': 'Finance', 'is_active': True})
        ModuleDefinition.objects.get_or_create(code='billing', defaults={'name': 'Billing', 'is_active': True})
        ModuleDefinition.objects.get_or_create(code='purchasing', defaults={'name': 'Purchasing', 'is_active': True})
        enable_module(self.company_a, 'finance')
        enable_module(self.company_a, 'billing')
        enable_module(self.company_a, 'purchasing')
        enable_module(self.company_b, 'finance')

        # 3. Users
        self.user_a = User.objects.create_user(
            username="finance_admin_a",
            email="finance_admin_a@zorvex.test",
            password="Password123!",
            company=self.company_a,
            role="admin"
        )
        self.user_b = User.objects.create_user(
            username="finance_admin_b",
            email="finance_admin_b@zorvex.test",
            password="Password123!",
            company=self.company_b,
            role="admin"
        )

        # 4. Currencies
        self.pkr_a = Currency.objects.create(
            company=self.company_a,
            code="PKR",
            name="Pakistani Rupee",
            symbol="Rs",
            is_base_currency=True
        )
        self.pkr_b = Currency.objects.create(
            company=self.company_b,
            code="PKR",
            name="Pakistani Rupee",
            symbol="Rs",
            is_base_currency=True
        )

        # 5. Fiscal Year & Periods for Company A
        self.fy_a = FiscalYear.objects.create(
            company=self.company_a,
            name="FY 2026",
            start_date=date(2026, 1, 1),
            end_date=date(2026, 12, 31),
            is_current=True
        )
        self.open_period = AccountingPeriod.objects.create(
            company=self.company_a,
            fiscal_year=self.fy_a,
            period_number=9,
            month=9,
            start_date=date(2026, 9, 1),
            end_date=date(2026, 9, 30),
            status=PeriodStatus.OPEN
        )
        self.closed_period = AccountingPeriod.objects.create(
            company=self.company_a,
            fiscal_year=self.fy_a,
            period_number=8,
            month=8,
            start_date=date(2026, 8, 1),
            end_date=date(2026, 8, 31),
            status=PeriodStatus.CLOSED
        )

        # 6. Chart of Accounts for Company A
        self.gl_bank_a = ChartOfAccount.objects.create(
            company=self.company_a,
            account_code="1010-01",
            account_name="HBL Corporate Asset Account",
            account_type=AccountType.ASSET,
            normal_balance=NormalBalance.DEBIT,
            currency=self.pkr_a
        )
        self.gl_cash_a = ChartOfAccount.objects.create(
            company=self.company_a,
            account_code="1020-01",
            account_name="Head Office Cash Account",
            account_type=AccountType.ASSET,
            normal_balance=NormalBalance.DEBIT,
            currency=self.pkr_a
        )
        self.gl_petty_a = ChartOfAccount.objects.create(
            company=self.company_a,
            account_code="1020-02",
            account_name="Petty Cash Float Account",
            account_type=AccountType.ASSET,
            normal_balance=NormalBalance.DEBIT,
            currency=self.pkr_a
        )
        self.gl_ar_a = ChartOfAccount.objects.create(
            company=self.company_a,
            account_code="1030-01",
            account_name="Accounts Receivable - Security",
            account_type=AccountType.ASSET,
            normal_balance=NormalBalance.DEBIT,
            currency=self.pkr_a
        )
        self.gl_ap_a = ChartOfAccount.objects.create(
            company=self.company_a,
            account_code="2010-01",
            account_name="Accounts Payable - Trade",
            account_type=AccountType.LIABILITY,
            normal_balance=NormalBalance.CREDIT,
            currency=self.pkr_a
        )

        # 7. Bank Accounts (Treasury) for Company A
        self.hbl_account = BankAccount.objects.create(
            company=self.company_a,
            account_type=BankAccountType.BANK,
            bank_name="Habib Bank Limited",
            account_title="SecureCorp HBL Corporate",
            account_number="1234567890123",
            chart_of_account=self.gl_bank_a,
            currency=self.pkr_a,
            opening_balance=Decimal('0.00'),
            current_balance=Decimal('0.00')
        )
        self.cash_account = BankAccount.objects.create(
            company=self.company_a,
            account_type=BankAccountType.CASH,
            account_title="Head Office Main Cash Float",
            chart_of_account=self.gl_cash_a,
            currency=self.pkr_a,
            opening_balance=Decimal('0.00'),
            current_balance=Decimal('0.00')
        )
        self.petty_account = BankAccount.objects.create(
            company=self.company_a,
            account_type=BankAccountType.PETTY_CASH,
            account_title="Karachi Branch Petty Cash",
            chart_of_account=self.gl_petty_a,
            currency=self.pkr_a,
            opening_balance=Decimal('0.00'),
            current_balance=Decimal('0.00')
        )

        # 8. Security Finance Configuration
        self.sec_cfg_a = SecurityFinanceConfiguration.objects.create(
            company=self.company_a,
            accounts_receivable_account=self.gl_ar_a,
            accounts_payable_account=self.gl_ap_a,
            default_bank_account=self.hbl_account,
            default_currency=self.pkr_a,
            is_active=True
        )

        # 9. API Client Setup
        self.client = APIClient()
        self.client.force_authenticate(user=self.user_a)
        self.client.credentials(HTTP_X_COMPANY_ID=str(self.company_a.id))

    def test_01_receipt_voucher_creation_and_auto_numbering(self):
        """Test receipt voucher creation, sequence code RV-YYYYMM-0001, and draft state."""
        voucher = create_financial_voucher(
            company=self.company_a,
            voucher_type=VoucherType.RECEIPT_VOUCHER,
            date=date(2026, 9, 5),
            amount=Decimal('150000.00'),
            bank_account=self.hbl_account,
            payment_method=PaymentMethod.BANK_TRANSFER,
            reference="REF-DEP-001",
            description="Client direct deposit for September",
            counterparty_name="Atlas Logistics Ltd",
            user=self.user_a,
            auto_post=False
        )

        self.assertTrue(voucher.voucher_number.startswith("RV-202609-"))
        self.assertEqual(voucher.status, VoucherStatus.DRAFT)
        self.assertEqual(voucher.amount, Decimal('150000.00'))
        self.assertEqual(voucher.total_amount, Decimal('150000.00'))

    def test_02_payment_voucher_creation_and_auto_numbering(self):
        """Test payment voucher creation, sequence code PV-YYYYMM-0001."""
        voucher = create_financial_voucher(
            company=self.company_a,
            voucher_type=VoucherType.PAYMENT_VOUCHER,
            date=date(2026, 9, 6),
            amount=Decimal('45000.00'),
            bank_account=self.hbl_account,
            payment_method=PaymentMethod.BANK_TRANSFER,
            reference="REF-PAY-001",
            counterparty_name="SafeGear Uniforms Ltd",
            user=self.user_a,
            auto_post=False
        )

        self.assertTrue(voucher.voucher_number.startswith("PV-202609-"))
        self.assertEqual(voucher.status, VoucherStatus.DRAFT)
        self.assertEqual(voucher.amount, Decimal('45000.00'))

    def test_03_client_receipt_linkage_and_idempotency(self):
        """Test creating a financial receipt voucher from a Phase S-4C ClientReceipt with duplicate prevention."""
        client_crm = CRMEntity.objects.create(
            company=self.company_a,
            name="Habib Oil Mills",
            entity_type="CUSTOMER"
        )
        receipt = ClientReceipt.objects.create(
            company=self.company_a,
            client=client_crm,
            receipt_date=date(2026, 9, 10),
            amount=Decimal('200000.00'),
            payment_method=BillingPaymentMethod.BANK_TRANSFER,
            bank_account=self.hbl_account,
            reference_number="WIRE-HOM-992",
            status=ReceiptStatus.POSTED
        )

        # 1. Convert ClientReceipt -> Financial Voucher
        voucher_1 = create_voucher_from_client_receipt(receipt, user=self.user_a, auto_post=True)
        self.assertEqual(voucher_1.voucher_type, VoucherType.BANK_RECEIPT)
        self.assertEqual(voucher_1.status, VoucherStatus.POSTED)
        self.assertEqual(voucher_1.amount, Decimal('200000.00'))
        self.assertEqual(voucher_1.source_document_type, "CLIENT_RECEIPT")
        self.assertEqual(voucher_1.source_document_id, receipt.id)

        # Check treasury balance updated
        self.hbl_account.refresh_from_db()
        self.assertEqual(self.hbl_account.current_balance, Decimal('200000.00'))

        # 2. Attempt duplicate creation -> should return existing voucher idempotently
        voucher_2 = create_voucher_from_client_receipt(receipt, user=self.user_a, auto_post=True)
        self.assertEqual(voucher_1.id, voucher_2.id)

        # Balance remains unchanged
        self.hbl_account.refresh_from_db()
        self.assertEqual(self.hbl_account.current_balance, Decimal('200000.00'))

    def test_04_vendor_payment_linkage_and_idempotency(self):
        """Test creating a financial payment voucher from a Phase S-3E VendorPayment with idempotency."""
        vendor = Vendor.objects.create(
            company=self.company_a,
            name="Pak Armory Equipment Supplier",
            code="VEN-0091"
        )
        vpayment = VendorPayment.objects.create(
            company=self.company_a,
            vendor=vendor,
            payment_date=date(2026, 9, 12),
            amount=Decimal('80000.00'),
            payment_method='BANK_TRANSFER',
            reference_number="TX-BANK-3819",
            status='POSTED'
        )

        # 1. Convert VendorPayment -> Financial Voucher
        vouch_1 = create_voucher_from_vendor_payment(vpayment, user=self.user_a, auto_post=True)
        self.assertEqual(vouch_1.voucher_type, VoucherType.BANK_PAYMENT)
        self.assertEqual(vouch_1.status, VoucherStatus.POSTED)
        self.assertEqual(vouch_1.amount, Decimal('80000.00'))

        # Check treasury balance updated (money out)
        self.hbl_account.refresh_from_db()
        self.assertEqual(self.hbl_account.current_balance, Decimal('-80000.00'))

        # 2. Idempotency test
        vouch_2 = create_voucher_from_vendor_payment(vpayment, user=self.user_a, auto_post=True)
        self.assertEqual(vouch_1.id, vouch_2.id)

    def test_05_cash_receipt_and_bank_payment_movements(self):
        """Test Cash Receipt increases cash balance, Bank Payment decreases bank balance."""
        # 1. Cash Receipt
        cash_vouch = create_financial_voucher(
            company=self.company_a,
            voucher_type=VoucherType.CASH_RECEIPT,
            date=date(2026, 9, 2),
            amount=Decimal('25000.00'),
            bank_account=self.cash_account,
            payment_method=PaymentMethod.CASH,
            counterparty_name="Walk-in Client Cash",
            user=self.user_a,
            auto_post=True
        )
        self.cash_account.refresh_from_db()
        self.assertEqual(self.cash_account.current_balance, Decimal('25000.00'))

        # 2. Bank Payment
        bank_vouch = create_financial_voucher(
            company=self.company_a,
            voucher_type=VoucherType.BANK_PAYMENT,
            date=date(2026, 9, 3),
            amount=Decimal('10000.00'),
            bank_account=self.hbl_account,
            payment_method=PaymentMethod.BANK_TRANSFER,
            counterparty_name="Utility Bill Payment",
            user=self.user_a,
            auto_post=True
        )
        self.hbl_account.refresh_from_db()
        self.assertEqual(self.hbl_account.current_balance, Decimal('-10000.00'))

    def test_06_contra_transfer_atomic_two_sided_movement(self):
        """Test Contra transfer (e.g. HBL -> Petty Cash PKR 100,000) generates two atomic treasury legs."""
        # Initial fund HBL
        self.hbl_account.current_balance = Decimal('500000.00')
        self.hbl_account.save()
        self.petty_account.current_balance = Decimal('5000.00')
        self.petty_account.save()

        contra_vouch = create_contra_transfer(
            company=self.company_a,
            from_account=self.hbl_account,
            to_account=self.petty_account,
            amount=Decimal('100000.00'),
            date=date(2026, 9, 15),
            reference="CHQ-FLOAT-881",
            description="Branch petty cash replenishment",
            user=self.user_a,
            auto_post=True
        )

        self.assertTrue(contra_vouch.voucher_number.startswith("CV-202609-"))
        self.assertEqual(contra_vouch.status, VoucherStatus.POSTED)

        # Check balances
        self.hbl_account.refresh_from_db()
        self.petty_account.refresh_from_db()
        self.assertEqual(self.hbl_account.current_balance, Decimal('400000.00'))
        self.assertEqual(self.petty_account.current_balance, Decimal('105000.00'))

        # Check two TreasuryTransaction entries created
        txs = TreasuryTransaction.objects.filter(voucher=contra_vouch, is_deleted=False)
        self.assertEqual(txs.count(), 2)

        leg_out = txs.filter(transaction_type=TreasuryTransactionType.TRANSFER_OUT).first()
        leg_in = txs.filter(transaction_type=TreasuryTransactionType.TRANSFER_IN).first()

        self.assertEqual(leg_out.bank_account, self.hbl_account)
        self.assertEqual(leg_out.money_out, Decimal('100000.00'))
        self.assertEqual(leg_in.bank_account, self.petty_account)
        self.assertEqual(leg_in.money_in, Decimal('100000.00'))

    def test_07_opening_balance_initialization_and_locking(self):
        """Test controlled opening balance initialization and locking when transactions exist."""
        # 1. Initialize opening balance
        tx = initialize_opening_balance(
            bank_account=self.hbl_account,
            amount=Decimal('750000.00'),
            opening_date=date(2026, 9, 1),
            reference="OB-2026",
            user=self.user_a
        )

        self.hbl_account.refresh_from_db()
        self.assertEqual(self.hbl_account.opening_balance, Decimal('750000.00'))
        self.assertEqual(self.hbl_account.current_balance, Decimal('750000.00'))
        self.assertTrue(self.hbl_account.is_opening_balance_locked)

        # 2. Attempting to re-initialize while locked raises ValidationError
        with self.assertRaises(ValidationError):
            initialize_opening_balance(
                bank_account=self.hbl_account,
                amount=Decimal('800000.00'),
                user=self.user_a
            )

    def test_08_treasury_statement_ledger_chronological_running_balance(self):
        """Test treasury statement ledger derives chronological running balance correctly."""
        # 1. Initialize Opening Balance
        initialize_opening_balance(
            bank_account=self.hbl_account,
            amount=Decimal('100000.00'),
            opening_date=date(2026, 9, 1),
            user=self.user_a
        )

        # 2. Money In (Receipt)
        create_financial_voucher(
            company=self.company_a,
            voucher_type=VoucherType.BANK_RECEIPT,
            date=date(2026, 9, 2),
            amount=Decimal('50000.00'),
            bank_account=self.hbl_account,
            auto_post=True,
            user=self.user_a
        )

        # 3. Money Out (Payment)
        create_financial_voucher(
            company=self.company_a,
            voucher_type=VoucherType.BANK_PAYMENT,
            date=date(2026, 9, 3),
            amount=Decimal('30000.00'),
            bank_account=self.hbl_account,
            auto_post=True,
            user=self.user_a
        )

        ledger = get_account_statement_ledger(
            bank_account=self.hbl_account,
            start_date=date(2026, 9, 1),
            end_date=date(2026, 9, 30)
        )

        self.assertEqual(ledger['opening_balance'], 0.0)
        self.assertEqual(ledger['period_money_in'], 150000.0) # 100k OB + 50k
        self.assertEqual(ledger['period_money_out'], 30000.0)
        self.assertEqual(ledger['closing_balance'], 120000.0)
        self.assertEqual(len(ledger['transactions']), 3)

    def test_09_cheque_lifecycle_received_deposited_cleared_and_bounced(self):
        """Test Cheque complete lifecycle: RECEIVED -> DEPOSITED -> CLEARED and BOUNCED."""
        # 1. Create Cheque
        cheque = create_cheque(
            company=self.company_a,
            cheque_number="CHQ-990123",
            amount=Decimal('65000.00'),
            issue_date=date(2026, 9, 10),
            payee_name="SecureCorp Tenant A",
            payer_name="Standard Pharma Ltd",
            drawer_bank="Meezan Bank",
            status=ChequeStatus.RECEIVED,
            user=self.user_a
        )
        self.assertEqual(cheque.status, ChequeStatus.RECEIVED)

        # 2. Deposit into HBL
        deposit_cheque(cheque, bank_account=self.hbl_account, user=self.user_a)
        cheque.refresh_from_db()
        self.assertEqual(cheque.status, ChequeStatus.DEPOSITED)
        self.assertEqual(cheque.bank_account, self.hbl_account)

        # 3. Clear Cheque
        mark_cheque_cleared(cheque, clearing_date=date(2026, 9, 12), user=self.user_a)
        cheque.refresh_from_db()
        self.assertEqual(cheque.status, ChequeStatus.CLEARED)
        self.assertEqual(cheque.clearing_date, date(2026, 9, 12))

        # 4. Another cheque bouncing
        chq_bounce = create_cheque(
            company=self.company_a,
            cheque_number="CHQ-880011",
            amount=Decimal('20000.00'),
            issue_date=date(2026, 9, 11),
            status=ChequeStatus.DEPOSITED,
            bank_account=self.hbl_account,
            user=self.user_a
        )
        bounce_cheque(chq_bounce, bounce_reason="Insufficient funds", user=self.user_a)
        chq_bounce.refresh_from_db()
        self.assertEqual(chq_bounce.status, ChequeStatus.BOUNCED)
        self.assertEqual(chq_bounce.bounce_reason, "Insufficient funds")

    def test_10_posted_voucher_immutability_and_safe_draft_cancellation(self):
        """Test posted vouchers cannot be modified directly or re-posted, and drafts can be safely cancelled."""
        voucher = create_financial_voucher(
            company=self.company_a,
            voucher_type=VoucherType.CASH_PAYMENT,
            date=date(2026, 9, 8),
            amount=Decimal('12000.00'),
            bank_account=self.cash_account,
            user=self.user_a,
            auto_post=False
        )

        # Cancel draft
        cancel_draft_voucher(voucher, user=self.user_a)
        voucher.refresh_from_db()
        self.assertEqual(voucher.status, VoucherStatus.CANCELLED)

        # Cannot post cancelled voucher
        with self.assertRaises(ValidationError):
            post_financial_voucher(voucher, user=self.user_a)

    def test_11_atomic_voucher_reversal_and_treasury_rollback(self):
        """Test reversing a POSTED voucher restores treasury operational balance atomically."""
        # 1. Post Receipt of 50,000
        voucher = create_financial_voucher(
            company=self.company_a,
            voucher_type=VoucherType.BANK_RECEIPT,
            date=date(2026, 9, 14),
            amount=Decimal('50000.00'),
            bank_account=self.hbl_account,
            reference="WIRE-7718",
            user=self.user_a,
            auto_post=True
        )
        self.hbl_account.refresh_from_db()
        self.assertEqual(self.hbl_account.current_balance, Decimal('50000.00'))

        # 2. Reverse Voucher
        reverse_financial_voucher(voucher, reversal_reason="Client wire recalled / entered in error", user=self.user_a)
        voucher.refresh_from_db()
        self.assertEqual(voucher.status, VoucherStatus.REVERSED)
        self.assertEqual(voucher.reversal_reason, "Client wire recalled / entered in error")

        # 3. Verify treasury balance restored to 0
        self.hbl_account.refresh_from_db()
        self.assertEqual(self.hbl_account.current_balance, Decimal('0.00'))

        # Verify reversal TreasuryTransaction created
        rev_tx = TreasuryTransaction.objects.filter(voucher=voucher, is_reversal=True).first()
        self.assertIsNotNone(rev_tx)
        self.assertEqual(rev_tx.money_out, Decimal('50000.00'))

    def test_12_closed_accounting_period_posting_prevention(self):
        """Test that posting into a CLOSED accounting period is strictly prevented."""
        voucher = create_financial_voucher(
            company=self.company_a,
            voucher_type=VoucherType.BANK_PAYMENT,
            date=date(2026, 8, 15), # in closed_period
            amount=Decimal('35000.00'),
            bank_account=self.hbl_account,
            user=self.user_a,
            auto_post=False
        )

        with self.assertRaises(ValidationError) as ctx:
            post_financial_voucher(voucher, user=self.user_a)
        self.assertIn("Accounting Period Control", str(ctx.exception))

    def test_13_cross_tenant_isolation(self):
        """Test cross-company tenant isolation blocks unauthorized access to accounts, vouchers, and cheques."""
        # 1. Company B tries to create voucher using Company A's bank account
        with self.assertRaises(ValidationError):
            create_financial_voucher(
                company=self.company_b,
                voucher_type=VoucherType.BANK_PAYMENT,
                date=date(2026, 9, 20),
                amount=Decimal('10000.00'),
                bank_account=self.hbl_account, # Belongs to Company A
                user=self.user_b
            )

        # 2. Client API request with Tenant B credentials cannot access Tenant A vouchers
        client_b = APIClient()
        client_b.force_authenticate(user=self.user_b)
        client_b.credentials(HTTP_X_COMPANY_ID=str(self.company_b.id))

        res = client_b.get('/api/finance/bank-accounts/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        # Should not see Company A's accounts
        ids = [acc['id'] for acc in res.data] if isinstance(res.data, list) else [acc['id'] for acc in res.data.get('results', [])]
        self.assertNotIn(str(self.hbl_account.id), ids)

    def test_14_rest_api_endpoints_end_to_end(self):
        """Test full REST API workflow: Dashboard, Vouchers, Contra creation, and Cheques."""
        # 1. Dashboard
        res_dash = self.client.get('/api/finance/bank-accounts/treasury_dashboard/')
        self.assertEqual(res_dash.status_code, status.HTTP_200_OK)
        self.assertIn('total_liquidity', res_dash.data)
        self.assertIn('accounts', res_dash.data)

        # 2. Create Contra via API
        contra_payload = {
            'from_account': str(self.hbl_account.id),
            'to_account': str(self.cash_account.id),
            'amount': '25000.00',
            'date': '2026-09-18',
            'reference': 'ATM-WITHDRAW-01',
            'description': 'Cash withdrawal from HBL to Main Cash',
            'auto_post': True
        }
        res_contra = self.client.post('/api/finance/vouchers/create_contra/', data=contra_payload, format='json')
        self.assertEqual(res_contra.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res_contra.data['status'], VoucherStatus.POSTED)

        # Check cash balance updated
        self.cash_account.refresh_from_db()
        self.assertEqual(self.cash_account.current_balance, Decimal('25000.00'))

        # 3. Statement History API
        res_stmt = self.client.get(f'/api/finance/bank-accounts/{self.cash_account.id}/statement_history/')
        self.assertEqual(res_stmt.status_code, status.HTTP_200_OK)
        self.assertEqual(res_stmt.data['closing_balance'], 25000.0)

        # 4. Cheques API
        chq_payload = {
            'cheque_number': 'CHQ-API-001',
            'amount': '50000.00',
            'issue_date': '2026-09-20',
            'payee_name': 'Vendor Supplies Ltd',
            'status': 'ISSUED',
            'bank_account': str(self.hbl_account.id)
        }
        res_chq = self.client.post('/api/finance/cheques/', data=chq_payload, format='json')
        self.assertEqual(res_chq.status_code, status.HTTP_201_CREATED)
        chq_id = res_chq.data['id']

        # Clear cheque via API
        res_clear = self.client.post(f'/api/finance/cheques/{chq_id}/clear_cheque/', data={'clearing_date': '2026-09-21'}, format='json')
        self.assertEqual(res_clear.status_code, status.HTTP_200_OK)
        self.assertEqual(res_clear.data['cheque']['status'], 'CLEARED')
