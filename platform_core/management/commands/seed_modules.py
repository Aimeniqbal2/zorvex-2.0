"""
platform_core/management/commands/seed_modules.py

Seeds the initial system ModuleDefinition records.
Run with:  python manage.py seed_modules
"""
from django.core.management.base import BaseCommand
from platform_core.models import ModuleDefinition, ModuleCategory


INITIAL_MODULES = [
    # Core / Operations
    {
        'code': 'crm',
        'name': 'CRM',
        'description': 'Customer Relationship Management — leads, contacts, pipelines.',
        'category': ModuleCategory.OPERATIONS,
        'icon': 'fas fa-users',
        'is_core': False,
    },
    {
        'code': 'sales',
        'name': 'Sales',
        'description': 'Quotes, sales orders, invoices, and revenue tracking.',
        'category': ModuleCategory.OPERATIONS,
        'icon': 'fas fa-chart-line',
        'is_core': True,
    },
    {
        'code': 'pos',
        'name': 'POS',
        'description': 'Point of Sale — fast retail checkout, cash drawer, receipts.',
        'category': ModuleCategory.OPERATIONS,
        'icon': 'fas fa-cash-register',
        'is_core': False,
    },
    {
        'code': 'inventory',
        'name': 'Inventory',
        'description': 'Stock management, movements, adjustments, and valuation.',
        'category': ModuleCategory.OPERATIONS,
        'icon': 'fas fa-boxes',
        'is_core': True,
    },
    {
        'code': 'purchasing',
        'name': 'Purchasing',
        'description': 'Purchase orders, vendor management, and goods receipts.',
        'category': ModuleCategory.OPERATIONS,
        'icon': 'fas fa-truck',
        'is_core': False,
    },
    # Finance
    {
        'code': 'finance',
        'name': 'Finance',
        'description': 'Cash flow, expense tracking, and financial transactions.',
        'category': ModuleCategory.FINANCE,
        'icon': 'fas fa-wallet',
        'is_core': True,
    },
    {
        'code': 'accounting',
        'name': 'Accounting',
        'description': 'Double-entry ledger, chart of accounts, trial balance.',
        'category': ModuleCategory.FINANCE,
        'icon': 'fas fa-calculator',
        'is_core': False,
    },
    # HR
    {
        'code': 'hr',
        'name': 'HR',
        'description': 'Employee profiles, attendance, leave management.',
        'category': ModuleCategory.HR,
        'icon': 'fas fa-id-badge',
        'is_core': False,
    },
    {
        'code': 'payroll',
        'name': 'Payroll',
        'description': 'Salary processing, deductions, payslip generation.',
        'category': ModuleCategory.HR,
        'icon': 'fas fa-money-check-alt',
        'is_core': False,
    },
    # Operations / Projects
    {
        'code': 'projects',
        'name': 'Projects',
        'description': 'Project planning, task management, and milestones.',
        'category': ModuleCategory.OPERATIONS,
        'icon': 'fas fa-project-diagram',
        'is_core': False,
    },
    {
        'code': 'services',
        'name': 'Services',
        'description': 'Service/Repair order management and job tracking.',
        'category': ModuleCategory.OPERATIONS,
        'icon': 'fas fa-tools',
        'is_core': False,
    },
    # Utility
    {
        'code': 'documents',
        'name': 'Documents',
        'description': 'Document storage, templates, and e-signatures.',
        'category': ModuleCategory.DOCUMENTS,
        'icon': 'fas fa-file-alt',
        'is_core': False,
    },
    {
        'code': 'reports',
        'name': 'Reports',
        'description': 'Standard reporting across all business modules.',
        'category': ModuleCategory.ANALYTICS,
        'icon': 'fas fa-file-chart-bar',
        'is_core': True,
    },
    {
        'code': 'analytics',
        'name': 'Analytics',
        'description': 'Advanced dashboards, KPIs, and data visualisations.',
        'category': ModuleCategory.ANALYTICS,
        'icon': 'fas fa-chart-pie',
        'is_core': False,
    },
    {
        'code': 'automation',
        'name': 'Automation',
        'description': 'Workflow automation, triggers, and scheduled tasks.',
        'category': ModuleCategory.AUTOMATION,
        'icon': 'fas fa-robot',
        'is_core': False,
    },
    # Security
    {
        'code': 'security_ops',
        'name': 'Security Operations',
        'description': 'Guard deployment, patrol schedules, incident reporting.',
        'category': ModuleCategory.SECURITY,
        'icon': 'fas fa-shield-alt',
        'is_core': False,
    },
    # Industry verticals
    {
        'code': 'restaurant',
        'name': 'Restaurant',
        'description': 'Table management, kitchen orders, menu, and delivery.',
        'category': ModuleCategory.INDUSTRY,
        'icon': 'fas fa-utensils',
        'is_core': False,
    },
    {
        'code': 'manufacturing',
        'name': 'Manufacturing',
        'description': 'Bills of materials, work orders, production planning.',
        'category': ModuleCategory.INDUSTRY,
        'icon': 'fas fa-industry',
        'is_core': False,
    },
    {
        'code': 'hospital',
        'name': 'Hospital',
        'description': 'Patient records, appointments, wards, and clinical ops.',
        'category': ModuleCategory.INDUSTRY,
        'icon': 'fas fa-hospital',
        'is_core': False,
    },
    {
        'code': 'school',
        'name': 'School',
        'description': 'Student enrollment, attendance, grades, and timetables.',
        'category': ModuleCategory.INDUSTRY,
        'icon': 'fas fa-graduation-cap',
        'is_core': False,
    },
    {
        'code': 'retail',
        'name': 'Retail',
        'description': 'Retail-specific POS, loyalty programs, and promotions.',
        'category': ModuleCategory.INDUSTRY,
        'icon': 'fas fa-store',
        'is_core': False,
    },
    {
        'code': 'mobile_repair',
        'name': 'Mobile Repair',
        'description': 'Mobile & electronics repair job cards, parts, and diagnostics.',
        'category': ModuleCategory.INDUSTRY,
        'icon': 'fas fa-mobile-alt',
        'is_core': False,
    },
]


class Command(BaseCommand):
    help = 'Seeds initial system ModuleDefinition records into the database.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--update',
            action='store_true',
            help='Update existing module records with seed data (name, description, etc.).',
        )

    def handle(self, *args, **options):
        update = options['update']
        created_count = 0
        updated_count = 0

        for mod_data in INITIAL_MODULES:
            code = mod_data['code']
            defaults = {k: v for k, v in mod_data.items() if k != 'code'}

            if update:
                obj, created = ModuleDefinition.objects.update_or_create(
                    code=code,
                    defaults=defaults,
                )
            else:
                obj, created = ModuleDefinition.objects.get_or_create(
                    code=code,
                    defaults=defaults,
                )

            if created:
                created_count += 1
                self.stdout.write(self.style.SUCCESS(f'  Created: {code}'))
            elif update:
                updated_count += 1
                self.stdout.write(f'  Updated: {code}')
            else:
                self.stdout.write(f'  Exists:  {code}')

        self.stdout.write(
            self.style.SUCCESS(
                f'\nDone. {created_count} created, {updated_count} updated.'
            )
        )
