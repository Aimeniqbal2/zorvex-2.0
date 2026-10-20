from django.contrib import admin
from .models import SubscriptionPlan, CompanySubscription


@admin.register(SubscriptionPlan)
class SubscriptionPlanAdmin(admin.ModelAdmin):
    list_display = ('name', 'price', 'max_users')
    search_fields = ('name',)


@admin.register(CompanySubscription)
class CompanySubscriptionAdmin(admin.ModelAdmin):
    list_display = ('company', 'plan', 'start_date', 'end_date', 'is_active', 'is_deleted')
    list_filter = ('is_active', 'is_deleted', 'plan', 'company')
    search_fields = ('company__name', 'plan__name')
    readonly_fields = ('id', 'created_at', 'updated_at')

    def get_queryset(self, request):
        if request.user.is_superuser:
            return self.model.all_objects.all()
        return super().get_queryset(request)

