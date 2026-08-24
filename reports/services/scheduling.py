import calendar
from datetime import datetime, date, timedelta, time
import zoneinfo
from dateutil.relativedelta import relativedelta

class SchedulingService:
    @staticmethod
    def calculate_next_run_at(subscription, base_time=None):
        """
        Calculates the next_run_at for a subscription, given a base_time (usually timezone.now()).
        Returns an aware datetime in UTC representing the next execution time.
        """
        if base_time is None:
            from django.utils import timezone
            base_time = timezone.now()

        tz = zoneinfo.ZoneInfo(subscription.timezone)
        # Convert base_time to the local timezone of the subscription
        local_base = base_time.astimezone(tz)
        
        exec_time = subscription.execution_time
        
        local_next = None

        if subscription.frequency == 'DAILY':
            candidate = datetime.combine(local_base.date(), exec_time, tzinfo=tz)
            if candidate <= local_base:
                candidate += timedelta(days=1)
            local_next = candidate
            
        elif subscription.frequency == 'WEEKLY':
            # day_of_week: 0=Monday, 6=Sunday
            target_day = subscription.day_of_week if subscription.day_of_week is not None else 0
            candidate = datetime.combine(local_base.date(), exec_time, tzinfo=tz)
            days_ahead = target_day - candidate.weekday()
            if days_ahead < 0 or (days_ahead == 0 and candidate <= local_base):
                days_ahead += 7
            candidate += timedelta(days=days_ahead)
            local_next = candidate
            
        elif subscription.frequency == 'MONTHLY':
            target_day = subscription.day_of_month if subscription.day_of_month is not None else 1
            candidate_date = local_base.date()
            # Try this month
            try:
                candidate = datetime.combine(candidate_date.replace(day=min(target_day, calendar.monthrange(candidate_date.year, candidate_date.month)[1])), exec_time, tzinfo=tz)
            except ValueError:
                candidate = None
                
            if not candidate or candidate <= local_base:
                # Next month
                next_month = candidate_date + relativedelta(months=1)
                safe_day = min(target_day, calendar.monthrange(next_month.year, next_month.month)[1])
                candidate = datetime.combine(next_month.replace(day=safe_day), exec_time, tzinfo=tz)
            local_next = candidate

        elif subscription.frequency == 'QUARTERLY':
            # Run on the 1st day of the next quarter
            target_day = subscription.day_of_month if subscription.day_of_month is not None else 1
            candidate_date = local_base.date()
            current_quarter_month = ((candidate_date.month - 1) // 3) * 3 + 1
            
            try:
                candidate = datetime.combine(candidate_date.replace(month=current_quarter_month, day=min(target_day, calendar.monthrange(candidate_date.year, current_quarter_month)[1])), exec_time, tzinfo=tz)
            except ValueError:
                candidate = None
                
            if not candidate or candidate <= local_base:
                next_quarter_date = candidate_date.replace(day=1) + relativedelta(months=3)
                next_quarter_month = ((next_quarter_date.month - 1) // 3) * 3 + 1
                safe_day = min(target_day, calendar.monthrange(next_quarter_date.year, next_quarter_month)[1])
                candidate = datetime.combine(next_quarter_date.replace(month=next_quarter_month, day=safe_day), exec_time, tzinfo=tz)
            local_next = candidate

        elif subscription.frequency == 'YEARLY':
            target_month = 1
            target_day = subscription.day_of_month if subscription.day_of_month is not None else 1
            candidate_date = local_base.date()
            
            try:
                candidate = datetime.combine(candidate_date.replace(month=target_month, day=target_day), exec_time, tzinfo=tz)
            except ValueError:
                candidate = None
                
            if not candidate or candidate <= local_base:
                candidate = datetime.combine(candidate_date.replace(year=candidate_date.year + 1, month=target_month, day=target_day), exec_time, tzinfo=tz)
            local_next = candidate
            
        if local_next:
            # Convert back to UTC for saving
            return local_next.astimezone(zoneinfo.ZoneInfo('UTC'))
            
        return None

    @staticmethod
    def resolve_relative_parameters(params, reference_date):
        """
        Translates relative date parameters into absolute dates based on the reference_date.
        reference_date should be a `date` object (e.g., today in the subscription's timezone).
        """
        resolved = params.copy()
        
        date_range = params.get('date_range')
        if not date_range:
            return resolved
            
        start_date = None
        end_date = None
        
        if date_range == 'today':
            start_date = end_date = reference_date
        elif date_range == 'yesterday':
            start_date = end_date = reference_date - timedelta(days=1)
        elif date_range == 'current_week':
            start_date = reference_date - timedelta(days=reference_date.weekday())
            end_date = start_date + timedelta(days=6)
        elif date_range == 'previous_week':
            start_date = reference_date - timedelta(days=reference_date.weekday() + 7)
            end_date = start_date + timedelta(days=6)
        elif date_range == 'current_month':
            start_date = reference_date.replace(day=1)
            end_date = reference_date.replace(day=calendar.monthrange(reference_date.year, reference_date.month)[1])
        elif date_range == 'previous_month':
            prev = reference_date.replace(day=1) - timedelta(days=1)
            start_date = prev.replace(day=1)
            end_date = prev
        elif date_range == 'current_quarter':
            q_month = ((reference_date.month - 1) // 3) * 3 + 1
            start_date = reference_date.replace(month=q_month, day=1)
            end_date = start_date + relativedelta(months=3) - timedelta(days=1)
        elif date_range == 'previous_quarter':
            q_month = ((reference_date.month - 1) // 3) * 3 + 1
            q_start = reference_date.replace(month=q_month, day=1)
            end_date = q_start - timedelta(days=1)
            start_date = end_date.replace(day=1) - relativedelta(months=2)
        elif date_range == 'current_year':
            start_date = reference_date.replace(month=1, day=1)
            end_date = reference_date.replace(month=12, day=31)
        elif date_range == 'previous_year':
            start_date = reference_date.replace(year=reference_date.year - 1, month=1, day=1)
            end_date = reference_date.replace(year=reference_date.year - 1, month=12, day=31)
            
        if start_date and end_date:
            resolved['start_date'] = start_date.strftime("%Y-%m-%d")
            resolved['end_date'] = end_date.strftime("%Y-%m-%d")
            
        # Optional fallback for single date reports
        if 'as_of_date_relative' in params:
            # same logic for 'today', 'yesterday', 'end_of_previous_month', etc.
            rel = params['as_of_date_relative']
            if rel == 'today':
                resolved['as_of_date'] = reference_date.strftime("%Y-%m-%d")
            elif rel == 'yesterday':
                resolved['as_of_date'] = (reference_date - timedelta(days=1)).strftime("%Y-%m-%d")
            elif rel == 'end_of_previous_month':
                prev = reference_date.replace(day=1) - timedelta(days=1)
                resolved['as_of_date'] = prev.strftime("%Y-%m-%d")

        return resolved
