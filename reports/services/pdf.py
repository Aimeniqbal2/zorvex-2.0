import logging
from io import BytesIO
from django.template.loader import get_template
from django.http import HttpResponse, JsonResponse
from xhtml2pdf import pisa
from datetime import datetime

logger = logging.getLogger(__name__)

class PDFReportService:
    @staticmethod
    def generate_pdf_bytes(template_name, context):
        """
        Returns raw PDF bytes, or raises an Exception if failed.
        """
        template = get_template(template_name)
        html = template.render(context)
        
        result = BytesIO()
        # Generate PDF
        pdf = pisa.pisaDocument(BytesIO(html.encode("UTF-8")), result)
        
        if pdf.err:
            logger.error(f"Error rendering PDF: {pdf.err}")
            raise Exception("Unable to generate PDF report bytes.")
            
        return result.getvalue()

    @staticmethod
    def render_pdf(template_name, context, filename_prefix="report"):
        """
        Renders a Django HTML template to a PDF HttpResponse.
        Returns a 500 JSON response if rendering fails.
        """
        try:
            pdf_bytes = PDFReportService.generate_pdf_bytes(template_name, context)
            
            response = HttpResponse(pdf_bytes, content_type='application/pdf')
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"{filename_prefix}_{timestamp}.pdf"
            response['Content-Disposition'] = f'attachment; filename="{filename}"'
            return response
            
        except Exception as e:
            logger.exception("Exception in PDF rendering")
            return JsonResponse({"detail": "Unable to generate PDF report."}, status=500)
