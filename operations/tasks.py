from celery import shared_task
import logging
from companies.models import Company
from operations.models import AutoAttendanceConfig
from operations.services.monthly_muster_service import MonthlyMusterService

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=2, default_retry_delay=60)
def run_daily_auto_attendance_task(self):
    """
    Periodic Celery Beat task that automatically runs auto attendance
    for all active tenant companies with AutoAttendanceConfig enabled.
    Executed hourly (including 00:05 right after midnight) to ensure attendance
    is generated automatically without requiring manual user interaction.
    """
    logger.info("Starting periodic run_daily_auto_attendance_task...")
    try:
        active_companies = Company.objects.filter(is_active=True)
        executed_count = 0
        for company in active_companies:
            config = AutoAttendanceConfig.objects.filter(company=company).first()
            if config and not config.is_enabled:
                continue
            did_run = MonthlyMusterService.check_and_trigger_daily_auto_attendance(company)
            if did_run:
                executed_count += 1
        logger.info(f"Finished run_daily_auto_attendance_task. Executed for {executed_count} companies.")
        return {'status': 'success', 'executed_companies': executed_count}
    except Exception as exc:
        logger.error(f"Error in run_daily_auto_attendance_task: {exc}", exc_info=True)
        raise self.retry(exc=exc)

