from django.contrib import admin
from .models import OperationalSite, ServiceContract, ContractRate

@admin.register(OperationalSite)
class OperationalSiteAdmin(admin.ModelAdmin):
    list_display = ('name', 'company', 'crm_entity', 'is_active', 'is_deleted')
    list_filter = ('company', 'is_active', 'is_deleted')
    search_fields = ('name', 'crm_entity__name')

@admin.register(ServiceContract)
class ServiceContractAdmin(admin.ModelAdmin):
    list_display = ('contract_code', 'company', 'crm_entity', 'start_date', 'end_date', 'status', 'is_deleted')
    list_filter = ('company', 'status', 'is_deleted')
    search_fields = ('contract_code', 'crm_entity__name')

@admin.register(ContractRate)
class ContractRateAdmin(admin.ModelAdmin):
    list_display = ('service_contract', 'designation', 'company', 'billing_rate', 'pay_rate', 'effective_date', 'is_deleted')
    list_filter = ('company', 'is_deleted')
    search_fields = ('service_contract__contract_code', 'designation__name')

from .models import Deployment, DutyAssignment, ExtraDuty

@admin.register(Deployment)
class DeploymentAdmin(admin.ModelAdmin):
    list_display = ('employee', 'site', 'designation', 'company', 'start_date', 'end_date', 'status', 'is_deleted')
    list_filter = ('company', 'status', 'is_deleted')
    search_fields = ('employee__user__first_name', 'employee__user__last_name', 'site__name')

@admin.register(DutyAssignment)
class DutyAssignmentAdmin(admin.ModelAdmin):
    list_display = ('employee', 'site', 'date', 'start_time', 'end_time', 'company', 'status', 'is_deleted')
    list_filter = ('company', 'status', 'date', 'is_deleted')
    search_fields = ('employee__user__first_name', 'employee__user__last_name', 'site__name')

@admin.register(ExtraDuty)
class ExtraDutyAdmin(admin.ModelAdmin):
    list_display = ('employee', 'site', 'date', 'hours', 'company', 'status', 'is_deleted')
    list_filter = ('company', 'status', 'date', 'is_deleted')
    search_fields = ('employee__user__first_name', 'employee__user__last_name', 'site__name')

from .models import InspectionPolicy, InspectionCriterionPolicy

class InspectionCriterionPolicyInline(admin.TabularInline):
    model = InspectionCriterionPolicy
    extra = 1

@admin.register(InspectionPolicy)
class InspectionPolicyAdmin(admin.ModelAdmin):
    list_display = ('name', 'company', 'is_active', 'effective_from', 'effective_to', 'escalation_threshold', 'critical_threshold')
    list_filter = ('company', 'is_active')
    search_fields = ('name',)
    inlines = [InspectionCriterionPolicyInline]

