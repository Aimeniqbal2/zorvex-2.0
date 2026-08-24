from django.core.management.base import BaseCommand
from django.db.models import Sum, Count, Q
from django.db.models.functions import Coalesce
from decimal import Decimal
from finance.models import JournalEntry, JournalEntryLine, ChartOfAccount, AccountingPeriod, FiscalYear
from companies.models import Company

class Command(BaseCommand):
    help = 'Verify the integrity of the Universal Finance Ledger'

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS("Starting Finance Integrity Verification..."))
        overall_status = "PASS"
        issues = []
        from django.db.models import F
        companies = Company.objects.filter(is_active=True)
        for company in companies:
            self.stdout.write(f"\nChecking Company: {company.name} ({company.id})")
            
            # 1. Unbalanced JournalEntries
            unbalanced_entries = JournalEntry.objects.filter(
                company=company, status='POSTED', is_deleted=False
            ).annotate(
                t_debit=Coalesce(Sum('lines__debit', filter=Q(lines__is_deleted=False)), Decimal('0.0000')),
                t_credit=Coalesce(Sum('lines__credit', filter=Q(lines__is_deleted=False)), Decimal('0.0000'))
            ).filter(~Q(t_debit=F('t_credit')) | Q(t_debit=Decimal('0.0000')))
            
            for entry in unbalanced_entries:
                overall_status = "CRITICAL"
                issues.append(f"[CRITICAL] {company.name} - Unbalanced or Empty POSTED Entry: {entry.entry_number}")

            # 2. Orphan JournalEntryLines
            orphan_lines = JournalEntryLine.objects.filter(
                company=company, is_deleted=False, journal_entry__isnull=True
            )
            for line in orphan_lines:
                overall_status = "CRITICAL"
                issues.append(f"[CRITICAL] {company.name} - Orphan JournalEntryLine ID: {line.id}")

            # 3. Duplicate Entry Numbers
            duplicate_entries = JournalEntry.objects.filter(
                company=company, is_deleted=False
            ).values('entry_number').annotate(c=Count('id')).filter(c__gt=1)
            for dup in duplicate_entries:
                overall_status = "CRITICAL"
                issues.append(f"[CRITICAL] {company.name} - Duplicate Entry Number: {dup['entry_number']}")

            # 4. ChartOfAccount Balances
            accounts = ChartOfAccount.objects.filter(company=company, is_deleted=False)
            for account in accounts:
                # Calculate expected balance based on lines
                # Usually Asset/Expense increase with debit, Liability/Equity/Income increase with credit.
                # But here we just check if we can compute it. If account_type isn't rigidly defined, we just compute net debit/credit.
                # Since we don't have strict type mappings in the model (group_type is in AccountGroup), we calculate Net = Debit - Credit
                
                # To be precise, current_balance is normally cached. Let's compute calculated_balance = opening_balance + (debit - credit) for Debit accounts.
                pass
                
                group_type = account.account_group.group_type if account.account_group else None
                lines_agg = JournalEntryLine.objects.filter(
                    account=account, is_deleted=False, journal_entry__status='POSTED', journal_entry__is_deleted=False
                ).aggregate(
                    t_debit=Coalesce(Sum('debit'), Decimal('0.0000')),
                    t_credit=Coalesce(Sum('credit'), Decimal('0.0000'))
                )
                
                t_debit = lines_agg['t_debit']
                t_credit = lines_agg['t_credit']
                
                if group_type in ['ASSET', 'EXPENSE', 'COST_OF_SALES', 'OTHER_EXPENSE']:
                    calculated_balance = account.opening_balance + t_debit - t_credit
                else:
                    calculated_balance = account.opening_balance + t_credit - t_debit
                    
                if account.current_balance != calculated_balance:
                    overall_status = "WARNING" if overall_status == "PASS" else overall_status
                    issues.append(
                        f"[WARNING] {company.name} - Account Balance Mismatch: {account.account_code}. "
                        f"Expected {calculated_balance}, Actual {account.current_balance}, Diff {account.current_balance - calculated_balance}"
                    )

            # 5. Fiscal Period Integrity
            periods = AccountingPeriod.objects.filter(company=company, is_deleted=False).order_by('start_date')
            prev_end = None
            for p in periods:
                if prev_end and p.start_date <= prev_end:
                    overall_status = "CRITICAL"
                    issues.append(f"[CRITICAL] {company.name} - Overlapping Periods: {p.month} ({p.fiscal_year.name})")
                
                # check for closed period postings
                closed_postings = JournalEntry.objects.filter(
                    company=company, status='POSTED', is_deleted=False,
                    entry_date__gte=p.start_date, entry_date__lte=p.end_date
                )
                if p.status in ['CLOSED', 'LOCKED'] and closed_postings.exists():
                    overall_status = "CRITICAL"
                    issues.append(f"[CRITICAL] {company.name} - Postings in {p.status} period: {p.month} ({p.fiscal_year.name})")

                prev_end = p.end_date

            # 6. Audit Chain Verification
            # Every POSTED JournalEntry should ideally have a created_by or source_module if generated via API/system
            audit_entries = JournalEntry.objects.filter(
                company=company, status='POSTED', is_deleted=False,
                created_by__isnull=True, source_module=''
            )
            for entry in audit_entries:
                overall_status = "WARNING" if overall_status == "PASS" else overall_status
                issues.append(f"[WARNING] {company.name} - Missing Audit Chain (created_by/source_module) for POSTED Entry: {entry.entry_number}")

        self.stdout.write("\nVerification Complete.")
        if issues:
            for issue in issues:
                if issue.startswith("[CRITICAL]"):
                    self.stdout.write(self.style.ERROR(issue))
                else:
                    self.stdout.write(self.style.WARNING(issue))
        
        if overall_status == "PASS":
            self.stdout.write(self.style.SUCCESS("Result: PASS - No integrity issues found."))
        elif overall_status == "WARNING":
            self.stdout.write(self.style.WARNING("Result: WARNING - Audit chains or balances need review."))
        else:
            self.stdout.write(self.style.ERROR("Result: CRITICAL - Data integrity violations found."))
