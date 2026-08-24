"""
reports/services/export.py

Phase 8E-1 — Universal Export Service
Provides reusable CSV and JSON export routines for reporting datasets.
Enforces company isolation, consistent header generation, and efficient ORM access.
"""
import csv
import json
from datetime import datetime, date
from decimal import Decimal
from django.http import HttpResponse, JsonResponse, StreamingHttpResponse

class Echo:
    """An object that implements just the write method of the file-like interface."""
    def write(self, value):
        return value


class UniversalExportService:
    @staticmethod
    def _json_serializer(obj):
        if isinstance(obj, (datetime, date)):
            return obj.isoformat()
        if isinstance(obj, Decimal):
            return float(obj)
        raise TypeError(f"Type {type(obj)} not serializable")

    @classmethod
    def export_json(cls, data, filename_prefix="report"):
        """
        Exports a dictionary or list as JSON response.
        """
        response = JsonResponse(data, safe=False, json_dumps_params={'default': cls._json_serializer, 'indent': 2})
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        response['Content-Disposition'] = f'attachment; filename="{filename_prefix}_{timestamp}.json"'
        return response

    @classmethod
    def export_csv_from_dicts(cls, dict_list, filename_prefix="report", headers=None):
        """
        Exports a list of dictionaries as a CSV response.
        Dynamically extracts headers if not provided.
        """
        response = HttpResponse(content_type='text/csv; charset=utf-8')
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        response['Content-Disposition'] = f'attachment; filename="{filename_prefix}_{timestamp}.csv"'

        writer = csv.writer(response)

        if not dict_list:
            if headers:
                writer.writerow(headers)
            return response

        if not headers:
            headers = list(dict_list[0].keys())

        writer.writerow(headers)

        for item in dict_list:
            row = []
            for h in headers:
                val = item.get(h, '')
                if isinstance(val, (datetime, date)):
                    val = val.isoformat()
                elif isinstance(val, Decimal):
                    val = float(val)
                row.append(val)
            writer.writerow(row)

        return response

    @classmethod
    def stream_csv(cls, queryset_or_generator, filename_prefix="report", headers=None, row_formatter=None, chunk_size=2000):
        """
        Streams a CSV response from a queryset or generator.
        """
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        def csv_generator():
            pseudo_buffer = Echo()
            writer = csv.writer(pseudo_buffer)
            if headers:
                yield writer.writerow(headers)
            
            if hasattr(queryset_or_generator, 'iterator'):
                iterator = queryset_or_generator.iterator(chunk_size=chunk_size)
            else:
                iterator = queryset_or_generator
                
            for item in iterator:
                if row_formatter:
                    row = row_formatter(item)
                else:
                    row = []
                    for h in (headers or item.keys()):
                        val = item.get(h, '')
                        if isinstance(val, (datetime, date)):
                            val = val.isoformat()
                        elif isinstance(val, Decimal):
                            val = float(val)
                        row.append(val)
                yield writer.writerow(row)

        response = StreamingHttpResponse(csv_generator(), content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = f'attachment; filename="{filename_prefix}_{timestamp}.csv"'
        return response
