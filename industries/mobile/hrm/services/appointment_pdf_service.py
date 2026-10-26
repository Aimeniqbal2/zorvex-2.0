import io
import os
from decimal import Decimal
from datetime import date
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable, Image
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from ..models import OnboardingCandidate

class MobileAppointmentPDFService:
    @staticmethod
    def generate_appointment_pdf(company, candidate: OnboardingCandidate) -> bytes:
        """
        Generates official printable Appointment Letter matching the Softech standard:
        - Branded Company Header & Appointment Month
        - C.E.O Reference & 'Letter of Appointment' heading
        - Candidate Name, Designation & Address
        - Formal Offer Terms: Salary, Allowance, Back up work, Working Hours, Notice Period
        - Congratulations transition notice
        - Director & Employee signature fields
        """
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            leftMargin=40,
            rightMargin=40,
            topMargin=36,
            bottomMargin=36
        )

        styles = getSampleStyleSheet()

        company_name = company.name if company else 'SOFTECH-MOBILE REPAIR SERVICE'
        ceo_name = candidate.ceo_name or 'Sheikh Muhammad Afnan'
        director_name = candidate.director_name or 'Shahzaib Ali'
        month_name = candidate.appointment_month or 'October'
        app_date_str = candidate.appointment_date.strftime('%d %B %Y') if candidate.appointment_date else date.today().strftime('%d %B %Y')
        salary_str = f"{candidate.offered_salary:,.0f} Pkr/=" if candidate.offered_salary else "20,000 Pkr/="

        # Custom Typography
        style_header = ParagraphStyle(
            'HeaderStyle',
            fontName='Helvetica-Bold',
            fontSize=16,
            leading=20,
            alignment=TA_LEFT,
            textColor=colors.HexColor('#0f172a')
        )
        style_subhead = ParagraphStyle(
            'SubheadStyle',
            fontName='Helvetica',
            fontSize=10,
            leading=14,
            alignment=TA_LEFT,
            textColor=colors.HexColor('#475569')
        )
        style_page_meta = ParagraphStyle(
            'PageMetaStyle',
            fontName='Helvetica-Bold',
            fontSize=10,
            leading=14,
            alignment=TA_RIGHT,
            textColor=colors.HexColor('#1e293b')
        )
        style_title = ParagraphStyle(
            'TitleStyle',
            fontName='Helvetica-Bold',
            fontSize=15,
            leading=19,
            alignment=TA_CENTER,
            textColor=colors.HexColor('#0f172a')
        )
        style_body = ParagraphStyle(
            'Body',
            fontName='Helvetica',
            fontSize=10.5,
            leading=16,
            alignment=TA_LEFT,
            textColor=colors.HexColor('#1e293b')
        )
        style_body_bold = ParagraphStyle(
            'BodyBold',
            fontName='Helvetica-Bold',
            fontSize=10.5,
            leading=16,
            alignment=TA_LEFT,
            textColor=colors.HexColor('#0f172a')
        )
        style_bullet = ParagraphStyle(
            'BulletStyle',
            fontName='Helvetica',
            fontSize=10.5,
            leading=18,
            alignment=TA_LEFT,
            textColor=colors.HexColor('#0f172a')
        )

        story = []

        # Company Logo Flowable
        logo_flowable = None
        if company and getattr(company, 'logo', None):
            try:
                if hasattr(company.logo, 'path') and os.path.exists(company.logo.path):
                    logo_flowable = Image(company.logo.path, width=1.1 * inch, height=0.55 * inch)
            except Exception:
                logo_flowable = None

        # Header Table: Company Logo & Name + Appointment Month & Page
        if logo_flowable:
            header_table = Table(
                [
                    [
                        logo_flowable,
                        Paragraph(f"<b>{company_name.upper()}</b>", style_header),
                        Paragraph(f"<b>Appointment Month: {month_name}</b> &nbsp;&nbsp;&nbsp;&nbsp; Page 1 of 1", style_page_meta)
                    ]
                ],
                colWidths=[85, 245, 185]
            )
        else:
            header_table = Table(
                [
                    [
                        Paragraph(f"<b>{company_name.upper()}</b>", style_header),
                        Paragraph(f"<b>Appointment Month: {month_name}</b> &nbsp;&nbsp;&nbsp;&nbsp; Page 1 of 1", style_page_meta)
                    ]
                ],
                colWidths=[330, 185]
            )
        header_table.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ]))
        story.append(header_table)
        story.append(Spacer(1, 4))
        story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor('#0284c7'), spaceAfter=14))

        # CEO Meta
        story.append(Paragraph("<b>C.E.O</b>", style_body_bold))
        story.append(Paragraph(ceo_name, style_body))
        story.append(Spacer(1, 10))

        # Title: Letter of Appointment
        story.append(Paragraph("<u><b>Letter of Appointment</b></u>", style_title))
        story.append(Spacer(1, 14))

        # Candidate Details Table
        meta_table = Table(
            [
                [Paragraph("<b>Date:</b>", style_body_bold), Paragraph(app_date_str, style_body)],
                [Paragraph("<b>Name:</b>", style_body_bold), Paragraph(candidate.full_name, style_body_bold)],
                [Paragraph("<b>Address:</b>", style_body_bold), Paragraph(candidate.address or "Shop#169 Star City Mall, Saddar, Karachi.", style_body)],
            ],
            colWidths=[65, 450]
        )
        meta_table.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('TOPPADDING', (0, 0), (-1, -1), 2),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
        ]))
        story.append(meta_table)
        story.append(Spacer(1, 14))

        # Salutation & Appointed Position
        story.append(Paragraph(f"Dear <b>{candidate.full_name}</b>,", style_body))
        story.append(Spacer(1, 4))
        story.append(Paragraph(f"<b>Appointed as {candidate.position},</b>", style_body_bold))
        story.append(Spacer(1, 8))

        # Offer Introductory Sentence
        intro_text = (
            f"We Refer to your recent interview for the job position & are pleased to inform that we are offering "
            f"you the position with our company effective <b>({app_date_str})</b> under the following terms & conditions."
        )
        story.append(Paragraph(intro_text, style_body))
        story.append(Spacer(1, 12))

        # Terms & Conditions List (Table format for clean alignment)
        terms_data = [
            [Paragraph("•", style_bullet), Paragraph("<b>Salary:</b>", style_bullet), Paragraph(salary_str, style_bullet)],
            [Paragraph("•", style_bullet), Paragraph("<b>Allowance:</b>", style_bullet), Paragraph(candidate.allowance or "-", style_bullet)],
            [Paragraph("•", style_bullet), Paragraph("<b>Back up work:</b>", style_bullet), Paragraph(candidate.backup_work or "-", style_bullet)],
            [Paragraph("•", style_bullet), Paragraph("<b>Working Hour:</b>", style_bullet), Paragraph(candidate.working_hours or "11:00 to 9:00 (Closing)", style_bullet)],
            [Paragraph("•", style_bullet), Paragraph("<b>Notice Period:</b>", style_bullet), Paragraph(candidate.notice_period or "One Month", style_bullet)],
        ]
        terms_table = Table(terms_data, colWidths=[20, 110, 385])
        terms_table.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('TOPPADDING', (0, 0), (-1, -1), 3),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
            ('LEFTPADDING', (0, 0), (-1, -1), 2),
            ('RIGHTPADDING', (0, 0), (-1, -1), 2),
        ]))
        story.append(terms_table)
        story.append(Spacer(1, 16))

        # Congratulatory transition notice
        congrats_text = f"Enjoy this time of transition, & congratulations on your role here at <b>{company_name}</b>."
        story.append(Paragraph(congrats_text, style_body))
        story.append(Spacer(1, 36))

        # Signatures section
        sig_table = Table(
            [
                [
                    Paragraph("<b>Director</b><br/><br/>" + director_name, style_body),
                    Paragraph("<b>Employee Signature</b><br/><br/>________________________________", style_body)
                ]
            ],
            colWidths=[260, 255]
        )
        sig_table.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 4),
            ('RIGHTPADDING', (0, 0), (-1, -1), 4),
        ]))
        story.append(sig_table)

        doc.build(story)
        pdf = buffer.getvalue()
        buffer.close()
        return pdf
