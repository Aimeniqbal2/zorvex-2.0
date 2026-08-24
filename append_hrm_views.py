import sys

serializers_content = """
# ============================================================================
# PHASE C-1: RECRUITMENT & VETTING
# ============================================================================

class CandidateDocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = CandidateDocument
        fields = '__all__'
        read_only_fields = ['company', 'created_at', 'updated_at', 'is_deleted', 'deleted_at']

class CandidateVerificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = CandidateVerification
        fields = '__all__'
        read_only_fields = ['company', 'created_at', 'updated_at', 'is_deleted', 'deleted_at']

class CandidateSerializer(serializers.ModelSerializer):
    documents = CandidateDocumentSerializer(many=True, read_only=True)
    verifications = CandidateVerificationSerializer(many=True, read_only=True)
    applied_designation_name = serializers.CharField(source='applied_designation.name', read_only=True)
    
    class Meta:
        model = Candidate
        fields = '__all__'
        read_only_fields = ['company', 'created_at', 'updated_at', 'is_deleted', 'deleted_at', 'candidate_number', 'converted_employee']

"""

with open(r'c:\Users\Aimen Iqbal\Desktop\ERP\hrm\serializers.py', 'a') as f:
    f.write(serializers_content)


views_content = """
# ============================================================================
# PHASE C-1: RECRUITMENT & VETTING
# ============================================================================
from .models import Candidate, CandidateDocument, CandidateVerification
from .serializers import CandidateSerializer, CandidateDocumentSerializer, CandidateVerificationSerializer
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db import transaction
import datetime
from django.http import HttpResponseForbidden, FileResponse

class CandidateViewSet(BaseCompanyViewSet):
    queryset = Candidate.objects.all()
    serializer_class = CandidateSerializer
    filterset_fields = ['status', 'applied_designation']
    search_fields = ['candidate_number', 'first_name', 'last_name', 'national_id', 'phone']

    @action(detail=True, methods=['post'])
    def select(self, request, pk=None):
        candidate = self.get_object()
        if candidate.status not in ['APPLIED', 'SCREENING', 'VERIFICATION']:
            return Response({'error': 'Invalid status transition'}, status=400)
        candidate.status = 'SELECTED'
        candidate.selection_date = datetime.date.today()
        candidate.selected_by = request.user
        candidate.save()
        return Response(CandidateSerializer(candidate).data)

    @action(detail=True, methods=['post'])
    def hire(self, request, pk=None):
        candidate = self.get_object()
        if candidate.status != 'SELECTED' and candidate.status != 'VERIFICATION':
            return Response({'error': 'Candidate must be SELECTED or VERIFICATION to hire'}, status=400)
        
        if candidate.converted_employee:
            return Response({'error': 'Candidate already hired'}, status=400)

        with transaction.atomic():
            from .models import Employee, Employment
            employee = Employee.objects.create(
                company=request.company,
                first_name=candidate.first_name,
                last_name=candidate.last_name,
                email=candidate.email,
                phone=candidate.phone,
                date_of_birth=candidate.date_of_birth,
                hire_date=datetime.date.today(),
                designation=candidate.applied_designation,
                is_active=True
            )
            
            employment = Employment.objects.create(
                company=request.company,
                employee=employee,
                employment_type='FULL_TIME',
                employment_status='ACTIVE',
                designation=candidate.applied_designation,
                start_date=datetime.date.today(),
                is_current=True
            )
            
            candidate.converted_employee = employee
            candidate.status = 'HIRED'
            candidate.save()

        return Response(CandidateSerializer(candidate).data)

class CandidateDocumentViewSet(BaseCompanyViewSet):
    queryset = CandidateDocument.objects.all()
    serializer_class = CandidateDocumentSerializer
    filterset_fields = ['candidate', 'document_type']

    @action(detail=True, methods=['get'])
    def download(self, request, pk=None):
        doc = self.get_object()
        if not doc.attachment:
            return Response({'error': 'No attachment'}, status=404)
        return FileResponse(doc.attachment.open('rb'), as_attachment=True, filename=doc.attachment.name)

class CandidateVerificationViewSet(BaseCompanyViewSet):
    queryset = CandidateVerification.objects.all()
    serializer_class = CandidateVerificationSerializer
    filterset_fields = ['candidate', 'status', 'verification_type']

    @action(detail=True, methods=['get'])
    def download(self, request, pk=None):
        ver = self.get_object()
        if not ver.attachment:
            return Response({'error': 'No attachment'}, status=404)
        return FileResponse(ver.attachment.open('rb'), as_attachment=True, filename=ver.attachment.name)
"""

with open(r'c:\Users\Aimen Iqbal\Desktop\ERP\hrm\views.py', 'a') as f:
    f.write(views_content)

urls_content = """
# C-1 URLs
router.register(r'candidates', CandidateViewSet, basename='candidate')
router.register(r'candidate-documents', CandidateDocumentViewSet, basename='candidatedocument')
router.register(r'candidate-verifications', CandidateVerificationViewSet, basename='candidateverification')

"""
with open(r'c:\Users\Aimen Iqbal\Desktop\ERP\hrm\urls.py', 'a') as f:
    f.write(urls_content)

# We need to add the imports for Views
views_file = r'c:\Users\Aimen Iqbal\Desktop\ERP\hrm\urls.py'
with open(views_file, 'r') as f:
    c = f.read()

c = c.replace('from .views import (', 'from .views import (\n    CandidateViewSet, CandidateDocumentViewSet, CandidateVerificationViewSet,')

with open(views_file, 'w') as f:
    f.write(c)
