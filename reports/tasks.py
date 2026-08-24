import os
import logging
from celery import shared_task
from companies.models import Company
from reports.services.dashboard import DashboardReportingService
from reports.services.cache import ReportingCacheService
from django.utils import timezone
from django.core.files.base import ContentFile
from reports.models import GeneratedReport
from reports.services.report_registry import REPORT_REGISTRY, build_pdf_context
from reports.services.pdf import PDFReportService
from datetime import timedelta
logger = logging.getLogger(__name__)

@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def refresh_dashboard_cache(self, company_id):
    """
    Precomputes the dashboard KPIs and stores them in the tenant-scoped cache.
    """
    try:
        if not Company.objects.filter(id=company_id, is_active=True).exists():
            logger.warning(f"Task refresh_dashboard_cache aborted: Company {company_id} does not exist or is inactive.")
            return

        logger.info(f"Starting dashboard cache refresh for company {company_id}")

        service = DashboardReportingService(company_id=company_id)
        data = service.get_dashboard_kpis()

        cache_service = ReportingCacheService(company_id=company_id)
        ttl = int(os.environ.get('REPORT_CACHE_TTL', 300))
        
        cache_key = cache_service.generate_key(
            namespace='dashboard_kpis',
            category='dashboard'
        )
        
        cache_service.set(cache_key, data, timeout=ttl)
        logger.info(f"Successfully refreshed dashboard cache for company {company_id}")
        
    except Exception as exc:
        logger.error(f"Failed to refresh dashboard cache for company {company_id}: {exc}")
        # Bound retry
        raise self.retry(exc=exc)

@shared_task(bind=True, max_retries=3)
def generate_pdf_report(self, generated_report_id):
    try:
        report = GeneratedReport.objects.select_related('company').get(id=generated_report_id)
    except GeneratedReport.DoesNotExist:
        logger.error(f"GeneratedReport {generated_report_id} not found.")
        return

    # Update status to processing
    report.status = GeneratedReport.Status.PROCESSING
    report.started_at = timezone.now()
    report.save(update_fields=['status', 'started_at'])

    try:
        registry_entry = REPORT_REGISTRY.get(report.report_type)
        if not registry_entry:
            raise ValueError(f"Unknown report type: {report.report_type}")

        # Instantiate service
        service_class = registry_entry['service_class']
        service = service_class(company_id=report.company_id)

        # Extract only the parameters allowed by the registry
        service_params = {}
        for param_name in registry_entry['param_names']:
            if param_name in report.parameters:
                # We may need to do parsing, but assuming services handle string dates properly
                # because they go through views. Views usually parse them.
                # Actually, views use _parse_date. The service might expect datetime.date objects.
                # If they are passed as strings, the service might crash if not prepared.
                # Let's inspect _parse_date logic. It converts YYYY-MM-DD strings to date objects.
                # We can do a quick check: if string resembles a date, parse it?
                # For safety, let's parse them here if they end in _date.
                val = report.parameters[param_name]
                if param_name.endswith('_date') and isinstance(val, str):
                    from datetime import datetime
                    val = datetime.strptime(val, "%Y-%m-%d").date()
                service_params[param_name] = val

        # Call the method
        method = getattr(service, registry_entry['method'])
        data = method(**service_params)

        # Build context
        context = build_pdf_context(
            company=report.company,
            report_title=registry_entry['title'],
            data=data,
            params=report.parameters
        )

        # Generate bytes
        pdf_bytes = PDFReportService.generate_pdf_bytes(registry_entry['template'], context)

        # Save to storage
        filename = f"{report.report_type}_{report.started_at.strftime('%Y%m%d_%H%M%S')}.pdf"
        report.file.save(filename, ContentFile(pdf_bytes), save=False)
        report.file_name = filename

        # Mark Success
        report.status = GeneratedReport.Status.SUCCESS
        report.completed_at = timezone.now()
        report.expires_at = timezone.now() + timedelta(days=7) # configurable retention
        report.save()

        # If linked to a subscription, trigger delivery
        if report.subscription_id:
            from reports.tasks import deliver_generated_report
            deliver_generated_report.delay(report.id)

    except Exception as exc:
        logger.exception(f"Error generating report {generated_report_id}")
        report.status = GeneratedReport.Status.FAILED
        report.error_message = str(exc)
        report.completed_at = timezone.now()
        report.save()
        
        # Also update subscription failure if linked
        if report.subscription_id:
            sub = report.subscription
            sub.last_failure_at = timezone.now()
            sub.failure_count += 1
            sub.save(update_fields=['last_failure_at', 'failure_count'])

        if not isinstance(exc, ValueError):
            raise self.retry(exc=exc, countdown=10)

@shared_task
def dispatch_due_reports():
    """
    Called periodically (e.g. every minute) to find due subscriptions.
    """
    from django.db import transaction
    from reports.models import ReportSubscription
    from reports.services.scheduling import SchedulingService
    import zoneinfo

    now = timezone.now()
    
    # 1. Fetch active subscriptions where next_run_at <= now
    # select_for_update(skip_locked=True) ensures workers don't grab the same record
    with transaction.atomic():
        due_subs = ReportSubscription.objects.select_for_update(skip_locked=True).filter(
            is_active=True,
            next_run_at__lte=now
        )
        
        for sub in due_subs:
            try:
                # 2. Prevent duplicate runs
                # A robust way is to check if a GeneratedReport already exists for this subscription near this time,
                # but since we hold the DB lock and immediately advance next_run_at, it is safe.
                
                # 3. Resolve parameters relative to the local subscription date
                tz = zoneinfo.ZoneInfo(sub.timezone)
                local_now = now.astimezone(tz).date()
                resolved_params = SchedulingService.resolve_relative_parameters(sub.parameters, local_now)

                # 4. Create GeneratedReport
                report = GeneratedReport.objects.create(
                    company_id=sub.company_id,
                    created_by=sub.created_by,
                    report_type=sub.report_type,
                    parameters=resolved_params,
                    status=GeneratedReport.Status.PENDING,
                    subscription_id=sub.id
                )
                
                # 5. Dispatch task
                task = generate_pdf_report.delay(report.id)
                report.task_id = task.id
                report.save(update_fields=['task_id'])
                
                # 6. Update subscription state
                sub.last_run_at = now
                sub.next_run_at = SchedulingService.calculate_next_run_at(sub, base_time=now)
                sub.save(update_fields=['last_run_at', 'next_run_at'])
                
            except Exception as e:
                logger.error(f"Failed to dispatch subscription {sub.id}: {e}")
                sub.last_failure_at = now
                sub.failure_count += 1
                sub.save(update_fields=['last_failure_at', 'failure_count'])

@shared_task(bind=True, max_retries=3)
def deliver_generated_report(self, generated_report_id):
    """
    Delivers a successful GeneratedReport to its subscription's recipients via Email.
    """
    try:
        report = GeneratedReport.objects.select_related('company', 'subscription').get(id=generated_report_id)
    except GeneratedReport.DoesNotExist:
        return

    sub = report.subscription
    if not sub or report.status != GeneratedReport.Status.SUCCESS:
        return

    # Check recipient resolution (for now we assume simple email strings, or we lookup users)
    recipients = sub.recipients
    if not recipients:
        return

    from django.core.mail import EmailMessage
    from django.conf import settings
    
    subject = f"Scheduled Report: {sub.name}"
    body = f"Please find your scheduled {sub.report_type} report attached.\n\nGenerated on {report.completed_at}"
    
    from_email = getattr(settings, 'DEFAULT_FROM_EMAIL', 'reports@zorvex.com')
    
    msg = EmailMessage(
        subject=subject,
        body=body,
        from_email=from_email,
        to=recipients
    )
    
    # Attachment threshold limit
    REPORT_EMAIL_ATTACHMENT_MAX_MB = getattr(settings, 'REPORT_EMAIL_ATTACHMENT_MAX_MB', 10)
    
    if report.file:
        file_size_mb = report.file.size / (1024 * 1024)
        if file_size_mb <= REPORT_EMAIL_ATTACHMENT_MAX_MB:
            msg.attach(report.file_name, report.file.read(), 'application/pdf')
        else:
            # Provide link instead
            link = f"{getattr(settings, 'SITE_URL', 'http://localhost:8000')}/api/reports/generated/{report.id}/download/"
            msg.body = f"Your scheduled {sub.report_type} report is ready.\n\nThe file is too large to attach. You can download it securely here: {link}\n\nGenerated on {report.completed_at}"
            
    try:
        msg.send(fail_silently=False)
        sub.last_success_at = timezone.now()
        sub.save(update_fields=['last_success_at'])
    except Exception as e:
        logger.error(f"Failed to deliver report {report.id}: {e}")
        raise self.retry(exc=e, countdown=60)

@shared_task(bind=True, max_retries=2, default_retry_delay=60)
def forecast_metric(self, company_id, metric, parameters):
    try:
        from reports.services.analytics.forecasting import ForecastingService
        from reports.services.cache import ReportingCacheService
        
        service = ForecastingService(company_id)
        periods = parameters.get("periods", 3)
        method = parameters.get("method", "moving_average")
        
        result = service.get_forecast(metric, periods=periods, method=method)
        
        # Cache the result temporarily if needed
        cache_service = ReportingCacheService(company_id)
        cache_key = cache_service.generate_key(
            f"forecast_{metric}_{method}",
            category="analytics",
            periods=periods
        )
        cache_service.set(cache_key, result, timeout=3600)
        
        return result
    except Exception as e:
        logger.error(f"Failed to forecast {metric} for company {company_id}: {e}")
        raise self.retry(exc=e)

@shared_task(bind=True, max_retries=2, default_retry_delay=60)
def detect_anomalies_task(self, company_id, metric):
    try:
        from reports.services.analytics.anomalies import AnomalyDetectionService
        from reports.services.cache import ReportingCacheService
        
        service = AnomalyDetectionService(company_id)
        result = service.detect_anomalies(metric)
        
        cache_service = ReportingCacheService(company_id)
        cache_key = cache_service.generate_key(
            f"anomalies_{metric}",
            category="analytics"
        )
        cache_service.set(cache_key, result, timeout=3600)
        
        return result
    except Exception as e:
        logger.error(f"Failed to detect anomalies for {metric} in company {company_id}: {e}")
        raise self.retry(exc=e)

@shared_task(bind=True, max_retries=3)
def generate_builder_report(self, generated_report_id, user_id):
    try:
        from reports.models import GeneratedReport
        from django.contrib.auth import get_user_model
        from reports.services.report_builder import ReportBuilderService
        from reports.services.export import UniversalExportService
        import csv
        import io
        
        User = get_user_model()
        user = User.objects.get(id=user_id)
        report = GeneratedReport.objects.select_related('company').get(id=generated_report_id)
        
        report.status = GeneratedReport.Status.PROCESSING
        report.started_at = timezone.now()
        report.save(update_fields=['status', 'started_at'])
        
        service = ReportBuilderService(user)
        results, has_more, metadata_columns = service.execute_preview(report.parameters)
        
        # Build CSV
        output = io.StringIO()
        writer = csv.writer(output)
        
        headers = [col['label'] for col in metadata_columns]
        keys = [col['id'] for col in metadata_columns]
        writer.writerow(headers)
        
        for row in results:
            writer.writerow([row.get(k, '') for k in keys])
            
        csv_bytes = output.getvalue().encode('utf-8')
        
        filename = f"builder_export_{report.started_at.strftime('%Y%m%d_%H%M%S')}.csv"
        report.file.save(filename, ContentFile(csv_bytes), save=False)
        report.file_name = filename
        
        report.status = GeneratedReport.Status.SUCCESS
        report.completed_at = timezone.now()
        report.expires_at = timezone.now() + timedelta(days=7)
        report.save()
        
    except Exception as exc:
        logger.exception(f"Error generating builder report {generated_report_id}")
        report.status = GeneratedReport.Status.FAILED
        report.error_message = str(exc)
        report.completed_at = timezone.now()
        report.save()
        raise self.retry(exc=exc, countdown=10)
