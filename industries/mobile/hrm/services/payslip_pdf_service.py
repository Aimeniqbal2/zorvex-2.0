import io
import os
from decimal import Decimal
from datetime import date
from reportlab.lib.pagesizes import letter, A4
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable, Image
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from hrm.models import Employee
from ..models import MobileMonthlyPayroll, TechnicianProfile

def format_rs(val) -> str:
    """Format numeric/decimal value as Pakistani Rupees."""
    try:
        n = float(val or 0)
        return f"{n:,.0f}" if n.is_integer() else f"{n:,.2f}"
    except (ValueError, TypeError):
        return "0"

class MobilePayslipPDFService:
    @staticmethod
    def generate_payslip_pdf(company, employee: Employee, year: int, month: int) -> bytes:
        """
        Generates a high-fidelity PDF salary slip matching the official Softech layout:
        - Company header with business name & subtitle
        - Employee meta (Name, Designation, Department, Month)
        - 3 Structured Sections:
            1. Allowance & Facilities (Basic, Time Bonus, Zero Holiday Bonus, Overtime)
            2. Attendance Chart (Late, Half Days, Holidays, Penalty)
            3. Loan & Incident Deductions (Loan, Deduction, Balance, Damaged Parts, Bill)
        - Net Gross Total in prominent bold highlight
        - Signatures section
        """
        payroll = MobileMonthlyPayroll.objects.filter(
            company=company,
            employee=employee,
            year=year,
            month=month,
            is_deleted=False
        ).first()

        if not payroll:
            # Generate calculation on the fly
            from .payroll_service import MobilePayrollService
            calc = MobilePayrollService.calculate_employee_payroll(company, employee, year, month)
        else:
            calc = {
                'basic_salary': payroll.basic_salary,
                'bonus_time': payroll.bonus_time,
                'bonus_zero_holiday': payroll.bonus_zero_holiday,
                'overtime_hours': payroll.overtime_hours,
                'overtime_rate': payroll.overtime_rate,
                'overtime_pay': payroll.overtime_pay,
                'pay_and_allowances': payroll.pay_and_allowances,
                'late_count': payroll.late_count,
                'late_deduction': payroll.late_deduction,
                'half_day_count': payroll.half_day_count,
                'half_day_deduction': payroll.half_day_deduction,
                'holiday_count': payroll.holiday_count,
                'holiday_deduction': payroll.holiday_deduction,
                'penalty': payroll.penalty,
                'total_attendance_deduction': payroll.total_attendance_deduction,
                'loan_principal': payroll.loan_principal,
                'loan_deduction': payroll.loan_deduction,
                'loan_balance': payroll.loan_balance,
                'damaged_parts': payroll.damaged_parts,
                'bill_deduction': payroll.bill_deduction,
                'total_other_deductions': payroll.total_other_deductions,
                'gross_total': payroll.gross_total,
            }

        tech = getattr(employee, 'mobile_technician_profile', None)
        dept_name = tech.get_department_type_display() if tech else (employee.department.name if employee.department else 'General')
        desig_name = employee.designation.name if employee.designation else (dept_name + ' Technician')
        month_label = date(year, month, 1).strftime('%B %Y')

        buffer = io.BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=letter,
            leftMargin=36,
            rightMargin=36,
            topMargin=36,
            bottomMargin=36
        )

        styles = getSampleStyleSheet()

        title_style = ParagraphStyle(
            'TitleStyle',
            parent=styles['Normal'],
            fontName='Helvetica-Bold',
            fontSize=18,
            leading=22,
            textColor=colors.HexColor('#0f172a'),
            alignment=TA_CENTER
        )
        subtitle_style = ParagraphStyle(
            'SubtitleStyle',
            parent=styles['Normal'],
            fontName='Helvetica',
            fontSize=11,
            leading=15,
            textColor=colors.HexColor('#475569'),
            alignment=TA_CENTER
        )
        badge_style = ParagraphStyle(
            'BadgeStyle',
            parent=styles['Normal'],
            fontName='Helvetica-Bold',
            fontSize=12,
            leading=16,
            textColor=colors.HexColor('#1d4ed8'),
            alignment=TA_CENTER
        )
        bold_left = ParagraphStyle(
            'BoldLeft',
            parent=styles['Normal'],
            fontName='Helvetica-Bold',
            fontSize=9,
            leading=12,
            textColor=colors.HexColor('#1e293b')
        )
        norm_left = ParagraphStyle(
            'NormLeft',
            parent=styles['Normal'],
            fontName='Helvetica',
            fontSize=9,
            leading=12,
            textColor=colors.HexColor('#334155')
        )
        bold_right = ParagraphStyle(
            'BoldRight',
            parent=styles['Normal'],
            fontName='Helvetica-Bold',
            fontSize=9,
            leading=12,
            textColor=colors.HexColor('#1e293b'),
            alignment=TA_RIGHT
        )
        norm_right = ParagraphStyle(
            'NormRight',
            parent=styles['Normal'],
            fontName='Helvetica',
            fontSize=9,
            leading=12,
            textColor=colors.HexColor('#334155'),
            alignment=TA_RIGHT
        )

        story = []

        # Company Header with Logo support
        company_name = company.name if company else "SOFTECH Mobile Pvt Limited"
        logo_flowable = None
        if company and getattr(company, 'logo', None):
            try:
                if hasattr(company.logo, 'path') and os.path.exists(company.logo.path):
                    logo_flowable = Image(company.logo.path, width=1.1 * inch, height=0.55 * inch)
            except Exception:
                logo_flowable = None

        if logo_flowable:
            hdr_table = Table(
                [
                    [
                        logo_flowable,
                        [
                            Paragraph(company_name.upper(), title_style),
                            Paragraph("Mobile Sales, Services & Technical Repair Lab", subtitle_style),
                        ]
                    ]
                ],
                colWidths=[90, 450]
            )
            hdr_table.setStyle(TableStyle([
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('ALIGN', (0, 0), (0, 0), 'CENTER'),
                ('ALIGN', (1, 0), (1, 0), 'CENTER'),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ]))
            story.append(hdr_table)
        else:
            story.append(Paragraph(company_name.upper(), title_style))
            story.append(Paragraph("Mobile Sales, Services & Technical Repair Lab", subtitle_style))

        story.append(Spacer(1, 6))
        story.append(Paragraph(f"SALARY SLIP — {month_label.upper()}", badge_style))
        story.append(Spacer(1, 14))

        # Employee Information Table
        info_data = [
            [
                Paragraph("<b>Employee Name:</b>", bold_left),
                Paragraph(f"{employee.first_name} {employee.last_name}".strip(), norm_left),
                Paragraph("<b>Salary Month:</b>", bold_left),
                Paragraph(month_label, norm_left)
            ],
            [
                Paragraph("<b>Employee ID:</b>", bold_left),
                Paragraph(employee.employee_code or "N/A", norm_left),
                Paragraph("<b>Department:</b>", bold_left),
                Paragraph(dept_name, norm_left)
            ],
            [
                Paragraph("<b>Designation:</b>", bold_left),
                Paragraph(desig_name, norm_left),
                Paragraph("<b>Shift Start:</b>", bold_left),
                Paragraph(tech.shift_time.strftime('%I:%M %p') if tech and tech.shift_time else '12:00 PM', norm_left)
            ],
        ]

        if tech and (tech.phone_1_model or tech.phone_2_model):
            phones_assigned = []
            if tech.phone_1_model:
                p1_str = tech.phone_1_model
                if tech.phone_1_imei_1:
                    p1_str += f" (IMEI: {tech.phone_1_imei_1})"
                phones_assigned.append(p1_str)
            if tech.phone_2_model:
                p2_str = tech.phone_2_model
                if tech.phone_2_imei_1:
                    p2_str += f" (IMEI: {tech.phone_2_imei_1})"
                phones_assigned.append(p2_str)

            info_data.append([
                Paragraph("<b>Assigned Phones:</b>", bold_left),
                Paragraph(" | ".join(phones_assigned), norm_left),
                Paragraph("<b>OT Rate:</b>", bold_left),
                Paragraph(f"Rs. {format_rs(calc['overtime_rate'])} / hr", norm_left)
            ])

        info_table = Table(info_data, colWidths=[105, 185, 95, 155])
        info_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#f8fafc')),
            ('BOX', (0, 0), (-1, -1), 1, colors.HexColor('#cbd5e1')),
            ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e2e8f0')),
            ('PADDING', (0, 0), (-1, -1), 6),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))
        story.append(info_table)
        story.append(Spacer(1, 16))

        # 3 Panels Matrix matching Softech Excel:
        # Col 1: Allowance & Facilities | Col 2: Attendance Chart | Col 3: Loan & Incident
        matrix_header = [
            [
                Paragraph("<b>1. ALLOWANCES & FACILITIES</b>", bold_left),
                Paragraph("<b>2. ATTENDANCE & PENALTIES</b>", bold_left),
                Paragraph("<b>3. LOAN & DEDUCTIONS</b>", bold_left)
            ]
        ]
        
        matrix_rows = [
            # Row 1
            [
                Paragraph(f"Basic Salary: <font color='#047857'><b>Rs. {format_rs(calc['basic_salary'])}</b></font>", norm_left),
                Paragraph(f"Late Arrivals ({calc['late_count']}): Rs. {format_rs(calc['late_deduction'])}", norm_left),
                Paragraph(f"Opening Loan: Rs. {format_rs(calc['loan_principal'])}", norm_left)
            ],
            # Row 2
            [
                Paragraph(f"Bonus - Time (Punctuality): Rs. {format_rs(calc['bonus_time'])}", norm_left),
                Paragraph(f"Half Days ({calc['half_day_count']}): Rs. {format_rs(calc['half_day_deduction'])}", norm_left),
                Paragraph(f"Loan Repayment: Rs. {format_rs(calc['loan_deduction'])}", norm_left)
            ],
            # Row 3
            [
                Paragraph(f"Bonus - Zero Holiday: Rs. {format_rs(calc['bonus_zero_holiday'])}", norm_left),
                Paragraph(f"Absences / Holidays ({calc['holiday_count']}): Rs. {format_rs(calc['holiday_deduction'])}", norm_left),
                Paragraph(f"Remaining Balance: <b>Rs. {format_rs(calc['loan_balance'])}</b>", norm_left)
            ],
            # Row 4
            [
                Paragraph(f"Overtime ({calc['overtime_hours']} hrs): Rs. {format_rs(calc['overtime_pay'])}", norm_left),
                Paragraph(f"Absence Penalty: <font color='#b91c1c'>Rs. {format_rs(calc['penalty'])}</font>", norm_left),
                Paragraph(f"Damaged Parts: <font color='#b91c1c'>Rs. {format_rs(calc['damaged_parts'])}</font>", norm_left)
            ],
            # Row 5
            [
                Paragraph("", norm_left),
                Paragraph("", norm_left),
                Paragraph(f"Phone / Utility Bill: Rs. {format_rs(calc['bill_deduction'])}", norm_left)
            ],
            # Subtotals Row
            [
                Paragraph(f"<b>Pay & Allowance:<br/>Rs. {format_rs(calc['pay_and_allowances'])}</b>", bold_left),
                Paragraph(f"<b>Attendance Ded.:<br/>- Rs. {format_rs(calc['total_attendance_deduction'])}</b>", bold_left),
                Paragraph(f"<b>Other Deductions:<br/>- Rs. {format_rs(calc['total_other_deductions'])}</b>", bold_left)
            ]
        ]

        full_matrix = matrix_header + matrix_rows
        matrix_table = Table(full_matrix, colWidths=[180, 180, 180])
        matrix_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e2e8f0')),
            ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#f1f5f9')),
            ('BOX', (0, 0), (-1, -1), 1, colors.HexColor('#94a3b8')),
            ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e1')),
            ('PADDING', (0, 0), (-1, -1), 6),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ]))
        story.append(matrix_table)
        story.append(Spacer(1, 16))

        # Net Payable Gross Total Card
        gross_val = calc['gross_total']
        net_table_data = [
            [
                Paragraph("<b>NET SALARY PAYABLE (GROSS TOTAL)</b>", ParagraphStyle(
                    'NetLabel', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=12, textColor=colors.HexColor('#ffffff')
                )),
                Paragraph(f"<b>Rs. {format_rs(gross_val)}</b>", ParagraphStyle(
                    'NetVal', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=16, textColor=colors.HexColor('#ffffff'), alignment=TA_RIGHT
                ))
            ]
        ]
        net_table = Table(net_table_data, colWidths=[320, 220])
        net_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#1e3a8a')),
            ('BOX', (0, 0), (-1, -1), 1, colors.HexColor('#1e40af')),
            ('PADDING', (0, 0), (-1, -1), 10),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))
        story.append(net_table)
        story.append(Spacer(1, 45))

        # Signatures
        sig_data = [
            [
                Paragraph("_______________________________<br/><b>Employee Signature</b>", ParagraphStyle('SigL', parent=styles['Normal'], alignment=TA_CENTER, fontSize=9)),
                Paragraph("_______________________________<br/><b>Lab Manager / Incharge</b>", ParagraphStyle('SigM', parent=styles['Normal'], alignment=TA_CENTER, fontSize=9)),
                Paragraph("_______________________________<br/><b>Authorized Signature</b>", ParagraphStyle('SigR', parent=styles['Normal'], alignment=TA_CENTER, fontSize=9)),
            ]
        ]
        sig_table = Table(sig_data, colWidths=[180, 180, 180])
        sig_table.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('PADDING', (0, 0), (-1, -1), 0),
        ]))
        story.append(sig_table)

        doc.build(story)
        pdf_bytes = buffer.getvalue()
        buffer.close()
        return pdf_bytes
