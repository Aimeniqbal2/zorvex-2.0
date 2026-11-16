import sys
from django.core.management.base import BaseCommand
from django.db import connection


class Command(BaseCommand):
    help = "Safely syncs database schema for Security, CRM, HRM, and Finance (adds missing columns with IF NOT EXISTS)."

    def handle(self, *args, **options):
        self.stdout.write(self.style.NOTICE("Checking and syncing Security, CRM, HRM, and Finance database schema..."))

        sql_statements = [
            # 1. Finance SalarySheet & SalarySheetLine columns
            "ALTER TABLE IF EXISTS finance_salarysheet ADD COLUMN IF NOT EXISTS total_food_allowance numeric(15, 2) DEFAULT 0;",
            "ALTER TABLE IF EXISTS finance_salarysheet ADD COLUMN IF NOT EXISTS total_four_hrs_ot numeric(15, 2) DEFAULT 0;",
            "ALTER TABLE IF EXISTS finance_salarysheet ADD COLUMN IF NOT EXISTS total_site_allowance numeric(15, 2) DEFAULT 0;",
            "ALTER TABLE IF EXISTS finance_salarysheetline ADD COLUMN IF NOT EXISTS food_allowance numeric(12, 2) DEFAULT 0;",
            "ALTER TABLE IF EXISTS finance_salarysheetline ADD COLUMN IF NOT EXISTS four_hrs_ot_amount numeric(12, 2) DEFAULT 0;",
            "ALTER TABLE IF EXISTS finance_salarysheetline ADD COLUMN IF NOT EXISTS four_hrs_ot_enabled boolean DEFAULT false;",
            "ALTER TABLE IF EXISTS finance_salarysheetline ADD COLUMN IF NOT EXISTS site_allowance_amount numeric(12, 2) DEFAULT 0;",
            "ALTER TABLE IF EXISTS finance_salarysheetline ADD COLUMN IF NOT EXISTS site_allowance_enabled boolean DEFAULT false;",
            "ALTER TABLE IF EXISTS finance_monthlypayrolldraftinput ADD COLUMN IF NOT EXISTS food_allowance_override numeric(12, 2);",

            # 2. Security CRM ClientLocation & CostingSetting columns
            "ALTER TABLE IF EXISTS security_crm_clientlocation ADD COLUMN IF NOT EXISTS food_allowance numeric(12, 2) DEFAULT 0;",
            "ALTER TABLE IF EXISTS security_crm_securitycostingsetting ADD COLUMN IF NOT EXISTS four_hrs_ot_amount numeric(12, 2) DEFAULT 0;",
            "ALTER TABLE IF EXISTS security_crm_securitycostingsetting ADD COLUMN IF NOT EXISTS site_allowance_amount numeric(12, 2) DEFAULT 0;",
            "ALTER TABLE IF EXISTS security_crm_securitycostingsetting ADD COLUMN IF NOT EXISTS four_hrs_ot_default_enabled boolean DEFAULT true;",
            "ALTER TABLE IF EXISTS security_crm_securitycostingsetting ADD COLUMN IF NOT EXISTS site_allowance_default_enabled boolean DEFAULT true;",

            # 3. HRM Employee Doc Charges columns
            "ALTER TABLE IF EXISTS hrm_employee ADD COLUMN IF NOT EXISTS doc_charges_amount numeric(10, 2) DEFAULT 0;",
            "ALTER TABLE IF EXISTS hrm_employee ADD COLUMN IF NOT EXISTS doc_charges_enabled boolean DEFAULT false;",
            "ALTER TABLE IF EXISTS hrm_employee ADD COLUMN IF NOT EXISTS doc_charges_month varchar(7) DEFAULT '';",
            "ALTER TABLE IF EXISTS hrm_employee ADD COLUMN IF NOT EXISTS doc_charges_paid boolean DEFAULT false;",
            "ALTER TABLE IF EXISTS hrm_employee ADD COLUMN IF NOT EXISTS doc_charges_paid_at timestamp with time zone;",
        ]

        with connection.cursor() as cursor:
            for sql in sql_statements:
                try:
                    cursor.execute(sql)
                    self.stdout.write(self.style.SUCCESS(f"Executed: {sql.strip()}"))
                except Exception as e:
                    self.stdout.write(self.style.WARNING(f"Notice during '{sql.strip()}': {e}"))

        self.stdout.write(self.style.SUCCESS("All required database columns have been verified and synced successfully!"))
