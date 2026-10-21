from django.contrib import admin
from .models import Company

@admin.register(Company)
class CompanyAdmin(admin.ModelAdmin):
    list_display = ('name', 'business_type', 'domain', 'is_active', 'created_at')
    search_fields = ('name', 'domain')
    list_filter = ('business_type', 'is_active')

