from industries.common.base import IndustryPackage, Capability
from industries.common.registry import register_industry_package

@register_industry_package
class MobilePackage(IndustryPackage):
    code = "mobile"
    name = "Mobile Services & Repair"
    version = "1.0"
    
    capabilities = [
        Capability("technicians_staff", "Technicians & Staff", "hr", "Technician rosters, assigned test devices, IMEI tracking, and lab entry policies"),
        Capability("mobile_attendance", "Monthly Attendance Sheet", "hr", "30-day attendance grid with P/L/D/H/O codes and automated late/half-day counters"),
        Capability("mobile_payroll", "Payroll & Compensation", "hr", "Punctuality bonuses, overtime pay, late/absence penalties, and net wage calculations"),
        Capability("mobile_payslips", "Pay Slips & Reports", "hr", "High-fidelity Softech format salary slips and PDF generation"),
        Capability("repair_services", "Repair Jobs & Tickets", "services", "Hardware, Software, and Glass replacement workflows"),
        Capability("pos_sales", "POS & Accessories", "pos", "Counter sales and spare part billing"),
        Capability("parts_inventory", "Spare Parts & Store", "inventory", "Displays, ICs, flex cables, and components store"),
        Capability("finance", "Finance & Accounts", "finance", "Cashbook, technician ledgers, and shop expenses"),
    ]
