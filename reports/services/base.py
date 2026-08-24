from django.db.models import QuerySet

class BaseReportingService:
    def __init__(self, company_id):
        if not company_id:
            raise ValueError("company_id is required for all reporting queries.")
        self.company_id = company_id

    def filter_by_date(self, qs: QuerySet, date_field: str, start_date=None, end_date=None) -> QuerySet:
        if start_date:
            qs = qs.filter(**{f"{date_field}__gte": start_date})
        if end_date:
            qs = qs.filter(**{f"{date_field}__lte": end_date})
        return qs
