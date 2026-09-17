from decimal import Decimal
from typing import Dict, Any, List, Optional
from django.db import transaction
from django.utils import timezone
from django.core.exceptions import ValidationError

from companies.models import Company
from finance.models import (
    ChartOfAccount,
    SecurityFinanceConfiguration,
    FinancialVoucher,
    PurchasingIntegrationSourceType,
    PurchasingAccountingStatus,
    PurchasingItemAccountMapping,
    PurchasingAccountingIntegration,
    PurchasingAccountingLinePreview,
    CostCenter,
    ProfitCenter
)
from purchasing.models import (
    ProcurementDocument,
    ProcurementLine,
    VendorPayment,
    PurchaseReturn,
    PurchaseReturnLine,
    VendorCreditNote
)
from finance.services import period_service


class PurchasingIntegrationService:
    """
    Comprehensive business logic for Phase S-4F: Purchasing -> Finance Accounting Integration.
    Classifies Purchasing events (Bills, Payments, Returns, Credits) for double-entry GL readiness.
    """

    @classmethod
    def resolve_debit_account(
        cls,
        company: Company,
        item=None,
        item_category=None,
        expense_category=None,
        config: Optional[SecurityFinanceConfiguration] = None
    ) -> Optional[ChartOfAccount]:
        """
        Resolves the debit accounting account for a purchase line using precedence:
        1. Specific Item Mapping (PurchasingItemAccountMapping where item=item)
        2. Item Category Mapping (PurchasingItemAccountMapping where item_category=category)
        3. Expense Category Mapping (PurchasingItemAccountMapping where expense_category=expense_category)
        4. Company Default from SecurityFinanceConfiguration (inventory_equipment_account or fallback)
        """
        # 1. Specific Item Mapping
        if item:
            mapping = PurchasingItemAccountMapping.objects.filter(
                company=company,
                item=item,
                is_active=True
            ).select_related('debit_account').first()
            if mapping and mapping.debit_account and mapping.debit_account.is_active and not mapping.debit_account.is_header:
                if mapping.debit_account.company_id == company.id:
                    return mapping.debit_account

        # 2. Item Category Mapping
        cat = item_category or (getattr(item, 'category', None) if item else None)
        if cat:
            mapping = PurchasingItemAccountMapping.objects.filter(
                company=company,
                item_category=cat,
                is_active=True
            ).select_related('debit_account').first()
            if mapping and mapping.debit_account and mapping.debit_account.is_active and not mapping.debit_account.is_header:
                if mapping.debit_account.company_id == company.id:
                    return mapping.debit_account

        # 3. Expense Category Mapping
        if expense_category:
            mapping = PurchasingItemAccountMapping.objects.filter(
                company=company,
                expense_category=expense_category,
                is_active=True
            ).select_related('debit_account').first()
            if mapping and mapping.debit_account and mapping.debit_account.is_active and not mapping.debit_account.is_header:
                if mapping.debit_account.company_id == company.id:
                    return mapping.debit_account

        # 4. Company Default from SecurityFinanceConfiguration
        if not config:
            config = SecurityFinanceConfiguration.objects.filter(company=company, is_active=True).first()

        if config and config.inventory_equipment_account:
            acc = config.inventory_equipment_account
            if acc.is_active and not acc.is_header and acc.company_id == company.id:
                return acc

        return None

    @classmethod
    @transaction.atomic
    def integrate_vendor_bill(
        cls,
        vendor_invoice: ProcurementDocument,
        user=None
    ) -> PurchasingAccountingIntegration:
        """
        Classifies a posted / AP-ready Vendor Invoice (Bill) for double-entry GL readiness.
        Strictly enforces tenant isolation, AP control account resolution, and accounting period validation.
        """
        if vendor_invoice.document_type != 'VENDOR_INVOICE':
            raise ValidationError(f"Document {vendor_invoice.number} is not a VENDOR_INVOICE.")

        company = vendor_invoice.company
        config = SecurityFinanceConfiguration.objects.filter(company=company, is_active=True).first()

        # Check existing integration (Idempotency)
        integration, _ = PurchasingAccountingIntegration.objects.get_or_create(
            company=company,
            source_type=PurchasingIntegrationSourceType.VENDOR_BILL,
            source_id=str(vendor_invoice.id),
            defaults={
                'source_number': vendor_invoice.number,
                'transaction_date': vendor_invoice.document_date or timezone.now().date(),
                'amount': vendor_invoice.total_amount,
                'tax_amount': vendor_invoice.tax_amount,
                'currency_code': vendor_invoice.currency or 'PKR',
                'vendor': vendor_invoice.vendor,
                'crm_entity': vendor_invoice.crm_entity,
                'purchase_order': vendor_invoice.parent_document,
                'finance_config': config,
                'status': PurchasingAccountingStatus.PENDING_CLASSIFICATION,
            }
        )

        # Update metadata snapshot
        integration.source_number = vendor_invoice.number
        integration.transaction_date = vendor_invoice.document_date or timezone.now().date()
        integration.amount = vendor_invoice.total_amount
        integration.tax_amount = vendor_invoice.tax_amount
        integration.currency_code = vendor_invoice.currency or 'PKR'
        integration.vendor = vendor_invoice.vendor
        integration.crm_entity = vendor_invoice.crm_entity
        integration.purchase_order = vendor_invoice.parent_document
        integration.finance_config = config

        blocking_reasons: List[str] = []

        # 1. Validate Accounting Period
        can_post, period_msg, _ = period_service.can_post_transaction(company, integration.transaction_date)
        if not can_post:
            blocking_reasons.append(f"Accounting Period closed/locked: {period_msg}")

        # 2. Validate AP Control Account
        ap_account = config.accounts_payable_account if config else None
        if not ap_account:
            blocking_reasons.append("Missing Accounts Payable control account in Security Finance Configuration.")
        elif ap_account.company_id != company.id:
            blocking_reasons.append("Configured Accounts Payable account belongs to a different company.")
        elif not ap_account.is_active:
            blocking_reasons.append("Configured Accounts Payable account is inactive.")
        elif ap_account.is_header:
            blocking_reasons.append("Configured Accounts Payable account is a header/group account.")
        else:
            integration.ap_control_account = ap_account

        # Clear existing line previews to rebuild cleanly
        integration.lines.all().delete()

        lines = vendor_invoice.lines.all().order_by('line_number')
        line_number = 1

        for p_line in lines:
            line_amount = p_line.total_amount if p_line.total_amount > 0 else (p_line.quantity * p_line.unit_price)
            debit_acc = cls.resolve_debit_account(
                company=company,
                item=p_line.item,
                config=config
            )

            is_unresolved = False
            unresolved_msg = ""

            if not debit_acc:
                is_unresolved = True
                item_label = p_line.item.name if p_line.item else "Unspecified Item"
                unresolved_msg = f"No debit account mapping found for item '{item_label}'."
                blocking_reasons.append(unresolved_msg)
            elif debit_acc.company_id != company.id:
                is_unresolved = True
                unresolved_msg = f"Resolved debit account '{debit_acc.account_name}' belongs to a different company."
                blocking_reasons.append(unresolved_msg)
            elif not debit_acc.is_active or debit_acc.is_header:
                is_unresolved = True
                unresolved_msg = f"Resolved debit account '{debit_acc.account_name}' is inactive or a header account."
                blocking_reasons.append(unresolved_msg)

            # Dimensional attribution
            custom_f = p_line.custom_fields or {}
            site_id = custom_f.get('site_id') or custom_f.get('site')
            cost_center_id = custom_f.get('cost_center_id') or custom_f.get('cost_center')

            PurchasingAccountingLinePreview.objects.create(
                company=company,
                integration=integration,
                source_line_id=str(p_line.id),
                line_number=line_number,
                item_name=p_line.item.name if p_line.item else (p_line.description or "Purchased Item"),
                item_type=getattr(p_line.item, 'item_type', 'INVENTORY_ITEM'),
                description=p_line.description or "",
                amount=line_amount,
                debit_account=debit_acc,
                credit_account=ap_account,
                cost_center_id=cost_center_id if cost_center_id else None,
                site_id=site_id if site_id else None,
                warehouse=vendor_invoice.warehouse,
                is_tax_line=False,
                is_unresolved=is_unresolved,
                unresolved_reason=unresolved_msg
            )
            line_number += 1

        # 3. Handle Separate Tax Component
        if vendor_invoice.tax_amount and vendor_invoice.tax_amount > 0:
            tax_acc = config.tax_payable_account if config else None
            tax_unresolved = False
            tax_reason = ""
            if not tax_acc:
                tax_unresolved = True
                tax_reason = "Missing tax account in Security Finance Configuration."
                blocking_reasons.append(tax_reason)
            elif tax_acc.company_id != company.id or not tax_acc.is_active or tax_acc.is_header:
                tax_unresolved = True
                tax_reason = "Configured tax account is invalid, inactive, or header."
                blocking_reasons.append(tax_reason)

            PurchasingAccountingLinePreview.objects.create(
                company=company,
                integration=integration,
                source_line_id="TAX",
                line_number=line_number,
                item_name="Sales Tax / Value Added Tax",
                item_type="TAX",
                description=f"Tax on Bill #{vendor_invoice.number}",
                amount=vendor_invoice.tax_amount,
                debit_account=tax_acc,
                credit_account=ap_account,
                warehouse=vendor_invoice.warehouse,
                is_tax_line=True,
                is_unresolved=tax_unresolved,
                unresolved_reason=tax_reason
            )

        # Set final status
        if blocking_reasons:
            integration.status = PurchasingAccountingStatus.BLOCKED
            integration.blocking_reason = " | ".join(sorted(list(set(blocking_reasons))))
        else:
            integration.status = PurchasingAccountingStatus.READY
            integration.blocking_reason = ""

        integration.save()
        return integration

    @classmethod
    @transaction.atomic
    def integrate_vendor_payment(
        cls,
        vendor_payment: VendorPayment,
        user=None
    ) -> PurchasingAccountingIntegration:
        """
        Classifies an S-3E VendorPayment for accounting, ensuring linkage with FinancialVoucher
        and generating double-entry settlement preview (Dr Accounts Payable, Cr Bank/Cash).
        """
        company = vendor_payment.company
        config = SecurityFinanceConfiguration.objects.filter(company=company, is_active=True).first()

        # Check existing integration (Idempotency)
        integration, _ = PurchasingAccountingIntegration.objects.get_or_create(
            company=company,
            source_type=PurchasingIntegrationSourceType.VENDOR_PAYMENT,
            source_id=str(vendor_payment.id),
            defaults={
                'source_number': vendor_payment.payment_number,
                'transaction_date': vendor_payment.payment_date or timezone.now().date(),
                'amount': vendor_payment.amount,
                'currency_code': vendor_payment.currency or 'PKR',
                'vendor': vendor_payment.vendor,
                'finance_config': config,
                'status': PurchasingAccountingStatus.PENDING_CLASSIFICATION,
            }
        )

        integration.source_number = vendor_payment.payment_number
        integration.transaction_date = vendor_payment.payment_date or timezone.now().date()
        integration.amount = vendor_payment.amount
        integration.currency_code = vendor_payment.currency or 'PKR'
        integration.vendor = vendor_payment.vendor
        integration.finance_config = config

        blocking_reasons: List[str] = []

        # 1. Period validation
        can_post, period_msg, _ = period_service.can_post_transaction(company, integration.transaction_date)
        if not can_post:
            blocking_reasons.append(f"Accounting Period closed/locked: {period_msg}")

        # 2. AP Control Account
        ap_account = config.accounts_payable_account if config else None
        if not ap_account or ap_account.company_id != company.id or not ap_account.is_active or ap_account.is_header:
            blocking_reasons.append("Invalid or missing Accounts Payable control account.")
        else:
            integration.ap_control_account = ap_account

        # 3. Bank Account & Linkage to FinancialVoucher
        voucher = None
        from finance.models import FinancialVoucher
        existing_voucher = FinancialVoucher.objects.filter(
            company=company,
            source_document_type='VENDOR_PAYMENT',
            source_document_id=str(vendor_payment.id)
        ).first()

        if existing_voucher:
            voucher = existing_voucher
        else:
            # Check if S-4D voucher service can create it
            from finance.services.voucher_service import VoucherService
            try:
                voucher = VoucherService.create_voucher_from_vendor_payment(vendor_payment, user=user)
            except Exception as e:
                blocking_reasons.append(f"Failed to resolve/create Financial Voucher: {str(e)}")

        integration.voucher = voucher

        # Determine credit bank account (ChartOfAccount)
        credit_acc = None
        if voucher and voucher.bank_account and voucher.bank_account.chart_of_account:
            credit_acc = voucher.bank_account.chart_of_account
        elif vendor_payment.account:
            credit_acc = vendor_payment.account

        if not credit_acc or credit_acc.company_id != company.id or not credit_acc.is_active or credit_acc.is_header:
            blocking_reasons.append("Invalid or missing Bank/Cash Chart of Account for payment.")

        # Rebuild lines
        integration.lines.all().delete()

        # Line preview: Dr Accounts Payable, Cr Bank/Cash
        PurchasingAccountingLinePreview.objects.create(
            company=company,
            integration=integration,
            source_line_id=str(vendor_payment.id),
            line_number=1,
            item_name=f"AP Settlement - {vendor_payment.vendor.name if vendor_payment.vendor else 'Vendor'}",
            item_type="AP_SETTLEMENT",
            description=f"Vendor Payment #{vendor_payment.payment_number} via {vendor_payment.payment_method}",
            amount=vendor_payment.amount,
            debit_account=ap_account,
            credit_account=credit_acc,
            is_unresolved=bool(blocking_reasons),
            unresolved_reason=" | ".join(blocking_reasons) if blocking_reasons else ""
        )

        if blocking_reasons:
            integration.status = PurchasingAccountingStatus.BLOCKED
            integration.blocking_reason = " | ".join(sorted(list(set(blocking_reasons))))
        else:
            integration.status = PurchasingAccountingStatus.READY
            integration.blocking_reason = ""

        integration.save()
        return integration

    @classmethod
    @transaction.atomic
    def integrate_purchase_return(
        cls,
        purchase_return: PurchaseReturn,
        user=None
    ) -> PurchasingAccountingIntegration:
        """
        Classifies an S-3F Purchase Return for accounting reversal.
        Dr Accounts Payable / Vendor Credit, Cr Inventory Asset / Original Expense.
        """
        company = purchase_return.company
        config = SecurityFinanceConfiguration.objects.filter(company=company, is_active=True).first()

        integration, _ = PurchasingAccountingIntegration.objects.get_or_create(
            company=company,
            source_type=PurchasingIntegrationSourceType.PURCHASE_RETURN,
            source_id=str(purchase_return.id),
            defaults={
                'source_number': purchase_return.return_number,
                'transaction_date': purchase_return.return_date or timezone.now().date(),
                'amount': purchase_return.total_return_amount,
                'currency_code': purchase_return.currency or 'PKR',
                'vendor': purchase_return.vendor,
                'crm_entity': purchase_return.crm_entity,
                'purchase_order': purchase_return.purchase_order,
                'finance_config': config,
                'status': PurchasingAccountingStatus.PENDING_CLASSIFICATION,
            }
        )

        integration.source_number = purchase_return.return_number
        integration.transaction_date = purchase_return.return_date or timezone.now().date()
        integration.amount = purchase_return.total_return_amount
        integration.currency_code = purchase_return.currency or 'PKR'
        integration.vendor = purchase_return.vendor
        integration.crm_entity = purchase_return.crm_entity
        integration.purchase_order = purchase_return.purchase_order
        integration.finance_config = config

        blocking_reasons: List[str] = []

        can_post, period_msg, _ = period_service.can_post_transaction(company, integration.transaction_date)
        if not can_post:
            blocking_reasons.append(f"Accounting Period closed/locked: {period_msg}")

        ap_account = config.accounts_payable_account if config else None
        if not ap_account or ap_account.company_id != company.id or not ap_account.is_active or ap_account.is_header:
            blocking_reasons.append("Invalid or missing Accounts Payable control account.")
        else:
            integration.ap_control_account = ap_account

        integration.lines.all().delete()
        lines = purchase_return.lines.all().order_by('line_number')
        line_number = 1

        for r_line in lines:
            line_amount = r_line.total_amount
            # Debit: AP Account (reducing AP)
            # Credit: Inventory Asset Account (reducing inventory asset)
            inv_acc = cls.resolve_debit_account(
                company=company,
                item=r_line.item,
                config=config
            )

            is_unresolved = False
            unresolved_msg = ""
            if not inv_acc or inv_acc.company_id != company.id or not inv_acc.is_active or inv_acc.is_header:
                is_unresolved = True
                unresolved_msg = f"No valid inventory asset account resolved for return item '{r_line.item.name}'."
                blocking_reasons.append(unresolved_msg)

            PurchasingAccountingLinePreview.objects.create(
                company=company,
                integration=integration,
                source_line_id=str(r_line.id),
                line_number=line_number,
                item_name=f"Return: {r_line.item.name}",
                item_type="PURCHASE_RETURN",
                description=f"Return Line #{r_line.line_number} ({r_line.reason})",
                amount=line_amount,
                debit_account=ap_account,  # Reversal reduces AP
                credit_account=inv_acc,   # Reversal reduces Inventory Asset
                warehouse=purchase_return.warehouse,
                is_unresolved=is_unresolved,
                unresolved_reason=unresolved_msg
            )
            line_number += 1

        if blocking_reasons:
            integration.status = PurchasingAccountingStatus.BLOCKED
            integration.blocking_reason = " | ".join(sorted(list(set(blocking_reasons))))
        else:
            integration.status = PurchasingAccountingStatus.READY
            integration.blocking_reason = ""

        integration.save()
        return integration

    @classmethod
    @transaction.atomic
    def integrate_vendor_credit_note(
        cls,
        credit_note: VendorCreditNote,
        user=None
    ) -> PurchasingAccountingIntegration:
        """
        Classifies an S-3F VendorCreditNote for accounting, preserving unallocated credit balances.
        """
        company = credit_note.company
        config = SecurityFinanceConfiguration.objects.filter(company=company, is_active=True).first()

        integration, _ = PurchasingAccountingIntegration.objects.get_or_create(
            company=company,
            source_type=PurchasingIntegrationSourceType.VENDOR_CREDIT_NOTE,
            source_id=str(credit_note.id),
            defaults={
                'source_number': credit_note.credit_note_number,
                'transaction_date': credit_note.credit_date or timezone.now().date(),
                'amount': credit_note.amount,
                'currency_code': credit_note.currency or 'PKR',
                'vendor': credit_note.vendor,
                'finance_config': config,
                'status': PurchasingAccountingStatus.PENDING_CLASSIFICATION,
            }
        )

        integration.source_number = credit_note.credit_note_number
        integration.transaction_date = credit_note.credit_date or timezone.now().date()
        integration.amount = credit_note.amount
        integration.currency_code = credit_note.currency or 'PKR'
        integration.vendor = credit_note.vendor
        integration.finance_config = config

        blocking_reasons: List[str] = []

        can_post, period_msg, _ = period_service.can_post_transaction(company, integration.transaction_date)
        if not can_post:
            blocking_reasons.append(f"Accounting Period closed/locked: {period_msg}")

        ap_account = config.accounts_payable_account if config else None
        if not ap_account or ap_account.company_id != company.id or not ap_account.is_active or ap_account.is_header:
            blocking_reasons.append("Invalid or missing Accounts Payable control account.")
        else:
            integration.ap_control_account = ap_account

        # Credit side from config inventory or expense
        credit_side_acc = config.inventory_equipment_account if config else None
        if not credit_side_acc or credit_side_acc.company_id != company.id or not credit_side_acc.is_active or credit_side_acc.is_header:
            blocking_reasons.append("Invalid or missing inventory/expense account for credit note balancing.")

        integration.lines.all().delete()

        PurchasingAccountingLinePreview.objects.create(
            company=company,
            integration=integration,
            source_line_id=str(credit_note.id),
            line_number=1,
            item_name=f"Vendor Credit - {credit_note.vendor.name}",
            item_type="VENDOR_CREDIT",
            description=f"Credit Note #{credit_note.credit_note_number} (Unallocated: {credit_note.unallocated_amount})",
            amount=credit_note.amount,
            debit_account=ap_account,
            credit_account=credit_side_acc,
            is_unresolved=bool(blocking_reasons),
            unresolved_reason=" | ".join(blocking_reasons) if blocking_reasons else ""
        )

        if blocking_reasons:
            integration.status = PurchasingAccountingStatus.BLOCKED
            integration.blocking_reason = " | ".join(sorted(list(set(blocking_reasons))))
        else:
            integration.status = PurchasingAccountingStatus.READY
            integration.blocking_reason = ""

        integration.save()
        return integration

    @classmethod
    @transaction.atomic
    def reclassify_line(
        cls,
        line: PurchasingAccountingLinePreview,
        debit_account_id: Optional[str] = None,
        credit_account_id: Optional[str] = None,
        cost_center_id: Optional[str] = None,
        profit_center_id: Optional[str] = None,
        site_id: Optional[str] = None,
        user=None
    ) -> PurchasingAccountingLinePreview:
        """
        Allows an authorized finance user to reclassify an unresolved line or update dimensions.
        Re-evaluates parent integration status.
        """
        company = line.company

        if debit_account_id:
            deb_acc = ChartOfAccount.objects.filter(id=debit_account_id, company=company, is_active=True).first()
            if not deb_acc:
                raise ValidationError("Selected Debit Account is invalid, inactive, or belongs to a different company.")
            if deb_acc.is_header:
                raise ValidationError("Cannot assign a Header/Group account.")
            line.debit_account = deb_acc

        if credit_account_id:
            cred_acc = ChartOfAccount.objects.filter(id=credit_account_id, company=company, is_active=True).first()
            if not cred_acc:
                raise ValidationError("Selected Credit Account is invalid, inactive, or belongs to a different company.")
            if cred_acc.is_header:
                raise ValidationError("Cannot assign a Header/Group account.")
            line.credit_account = cred_acc

        if cost_center_id is not None:
            if cost_center_id:
                cc = CostCenter.objects.filter(id=cost_center_id, company=company).first()
                if not cc:
                    raise ValidationError("Selected Cost Center is invalid.")
                line.cost_center = cc
            else:
                line.cost_center = None

        if profit_center_id is not None:
            if profit_center_id:
                pc = ProfitCenter.objects.filter(id=profit_center_id, company=company).first()
                if not pc:
                    raise ValidationError("Selected Profit Center is invalid.")
                line.profit_center = pc
            else:
                line.profit_center = None

        # Check if line is now resolved
        if line.debit_account and line.credit_account:
            line.is_unresolved = False
            line.unresolved_reason = ""
        line.save()

        # Re-evaluate parent integration
        integration = line.integration
        all_lines = integration.lines.all()
        any_unresolved = any(l.is_unresolved for l in all_lines)

        can_post, period_msg, _ = period_service.can_post_transaction(company, integration.transaction_date)
        if not can_post:
            integration.status = PurchasingAccountingStatus.BLOCKED
            integration.blocking_reason = f"Accounting Period closed/locked: {period_msg}"
        elif any_unresolved:
            reasons = [l.unresolved_reason for l in all_lines if l.is_unresolved and l.unresolved_reason]
            integration.status = PurchasingAccountingStatus.BLOCKED
            integration.blocking_reason = " | ".join(sorted(list(set(reasons))))
        elif not integration.ap_control_account:
            integration.status = PurchasingAccountingStatus.BLOCKED
            integration.blocking_reason = "Missing Accounts Payable control account."
        else:
            integration.status = PurchasingAccountingStatus.READY
            integration.blocking_reason = ""

        if user:
            integration.reviewed_by = user
            integration.reviewed_at = timezone.now()

        integration.save()
        return line

    @classmethod
    @transaction.atomic
    def sync_all_purchasing_integrations(cls, company: Company, user=None) -> Dict[str, int]:
        """
        Scans all posted vendor invoices, payments, returns, and credits, integrating any unintegrated records.
        """
        stats = {
            'bills_processed': 0,
            'payments_processed': 0,
            'returns_processed': 0,
            'credits_processed': 0,
            'total_ready': 0,
            'total_blocked': 0,
        }

        # 1. Vendor Bills (AP_READY or POSTED)
        bills = ProcurementDocument.objects.filter(
            company=company,
            document_type='VENDOR_INVOICE',
            status__in=['POSTED', 'MATCHED', 'PENDING_MATCH', 'APPROVED']
        )
        for bill in bills:
            res = cls.integrate_vendor_bill(bill, user=user)
            stats['bills_processed'] += 1
            if res.status == PurchasingAccountingStatus.READY:
                stats['total_ready'] += 1
            elif res.status == PurchasingAccountingStatus.BLOCKED:
                stats['total_blocked'] += 1

        # 2. Vendor Payments (POSTED or PAID)
        payments = VendorPayment.objects.filter(
            company=company,
            status__in=['POSTED', 'PAID', 'APPROVED']
        )
        for pay in payments:
            res = cls.integrate_vendor_payment(pay, user=user)
            stats['payments_processed'] += 1
            if res.status == PurchasingAccountingStatus.READY:
                stats['total_ready'] += 1
            elif res.status == PurchasingAccountingStatus.BLOCKED:
                stats['total_blocked'] += 1

        # 3. Purchase Returns (POSTED or APPROVED)
        returns = PurchaseReturn.objects.filter(
            company=company,
            status__in=['POSTED', 'APPROVED']
        )
        for ret in returns:
            res = cls.integrate_purchase_return(ret, user=user)
            stats['returns_processed'] += 1
            if res.status == PurchasingAccountingStatus.READY:
                stats['total_ready'] += 1
            elif res.status == PurchasingAccountingStatus.BLOCKED:
                stats['total_blocked'] += 1

        # 4. Vendor Credit Notes
        credits = VendorCreditNote.objects.filter(
            company=company,
            status='POSTED'
        )
        for cn in credits:
            res = cls.integrate_vendor_credit_note(cn, user=user)
            stats['credits_processed'] += 1
            if res.status == PurchasingAccountingStatus.READY:
                stats['total_ready'] += 1
            elif res.status == PurchasingAccountingStatus.BLOCKED:
                stats['total_blocked'] += 1

        return stats

    @classmethod
    def get_accounting_preview_for_source(
        cls,
        company: Company,
        source_type: str,
        source_id: str
    ) -> Dict[str, Any]:
        """
        Returns structured double-entry preview: total debits, total credits, balanced verification,
        and line-level ledger entries.
        """
        integration = PurchasingAccountingIntegration.objects.filter(
            company=company,
            source_type=source_type,
            source_id=source_id
        ).prefetch_related('lines__debit_account', 'lines__credit_account').first()

        if not integration:
            return {
                'exists': False,
                'message': 'No accounting integration record found for this source document.'
            }

        lines_data = []
        total_debits = Decimal('0.00')
        total_credits = Decimal('0.00')

        for line in integration.lines.all():
            deb_name = f"{line.debit_account.account_code} - {line.debit_account.account_name}" if line.debit_account else "Unresolved Debit"
            cred_name = f"{line.credit_account.account_code} - {line.credit_account.account_name}" if line.credit_account else "Unresolved Credit"

            total_debits += line.amount
            total_credits += line.amount

            lines_data.append({
                'id': str(line.id),
                'line_number': line.line_number,
                'item_name': line.item_name,
                'item_type': line.item_type,
                'description': line.description,
                'amount': float(line.amount),
                'debit_account': {
                    'id': str(line.debit_account.id) if line.debit_account else None,
                    'code': line.debit_account.account_code if line.debit_account else None,
                    'name': line.debit_account.account_name if line.debit_account else None,
                } if line.debit_account else None,
                'credit_account': {
                    'id': str(line.credit_account.id) if line.credit_account else None,
                    'code': line.credit_account.account_code if line.credit_account else None,
                    'name': line.credit_account.account_name if line.credit_account else None,
                } if line.credit_account else None,
                'cost_center_name': line.cost_center.name if line.cost_center else None,
                'site_name': line.site.name if line.site else None,
                'is_tax_line': line.is_tax_line,
                'is_unresolved': line.is_unresolved,
                'unresolved_reason': line.unresolved_reason
            })

        return {
            'exists': True,
            'integration_id': str(integration.id),
            'source_type': integration.source_type,
            'source_number': integration.source_number,
            'transaction_date': integration.transaction_date.isoformat(),
            'status': integration.status,
            'blocking_reason': integration.blocking_reason,
            'amount': float(integration.amount),
            'currency_code': integration.currency_code,
            'total_debits': float(total_debits),
            'total_credits': float(total_credits),
            'is_balanced': (total_debits == total_credits) and not integration.blocking_reason,
            'lines': lines_data,
            'vendor_name': integration.vendor.name if integration.vendor else None,
            'po_number': integration.purchase_order.number if integration.purchase_order else None
        }

    @classmethod
    def get_summary_metrics(cls, company: Company) -> Dict[str, Any]:
        """
        Returns high-level KPI metrics for the Purchasing Finance workspace.
        """
        from django.db.models import Sum, Count

        qs = PurchasingAccountingIntegration.objects.filter(company=company)

        bills_ready = qs.filter(source_type=PurchasingIntegrationSourceType.VENDOR_BILL, status=PurchasingAccountingStatus.READY)
        bills_ready_count = bills_ready.count()
        bills_ready_amount = bills_ready.aggregate(t=Sum('amount'))['t'] or Decimal('0.00')

        payments_ready = qs.filter(source_type=PurchasingIntegrationSourceType.VENDOR_PAYMENT, status=PurchasingAccountingStatus.READY)
        payments_ready_count = payments_ready.count()
        payments_ready_amount = payments_ready.aggregate(t=Sum('amount'))['t'] or Decimal('0.00')

        returns_ready = qs.filter(source_type__in=[PurchasingIntegrationSourceType.PURCHASE_RETURN, PurchasingIntegrationSourceType.VENDOR_CREDIT_NOTE], status=PurchasingAccountingStatus.READY)
        returns_ready_count = returns_ready.count()
        returns_ready_amount = returns_ready.aggregate(t=Sum('amount'))['t'] or Decimal('0.00')

        blocked_items = qs.filter(status=PurchasingAccountingStatus.BLOCKED)
        blocked_count = blocked_items.count()
        blocked_amount = blocked_items.aggregate(t=Sum('amount'))['t'] or Decimal('0.00')

        return {
            'bills_ready_count': bills_ready_count,
            'bills_ready_amount': float(bills_ready_amount),
            'payments_ready_count': payments_ready_count,
            'payments_ready_amount': float(payments_ready_amount),
            'returns_ready_count': returns_ready_count,
            'returns_ready_amount': float(returns_ready_amount),
            'blocked_count': blocked_count,
            'blocked_amount': float(blocked_amount),
            'total_integrated': qs.count()
        }
