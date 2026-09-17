from rest_framework import serializers
from .models import Company

class CompanySerializer(serializers.ModelSerializer):
    logo = serializers.ImageField(required=True, allow_null=False, allow_empty_file=False)
    
    class Meta:
        model = Company
        fields = '__all__'

