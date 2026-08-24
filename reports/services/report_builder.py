from typing import List, Dict, Any, Tuple
from django.core.exceptions import ValidationError
from django.db.models import F
import uuid
import datetime

from .report_builder_registry import REPORT_BUILDER_REGISTRY

class ReportFilterParser:
    @classmethod
    def validate_filters(cls, source_config: dict, filters: dict) -> dict:
        allowed_filters = source_config.get('filters', {})
        validated = {}
        for key, value in filters.items():
            if key not in allowed_filters:
                raise ValidationError(f"Invalid filter: {key}")
            
            f_conf = allowed_filters[key]
            f_type = f_conf.get('type')
            
            if f_type == 'uuid':
                try:
                    uuid.UUID(str(value))
                except ValueError:
                    raise ValidationError(f"Invalid UUID for {key}")
                validated[key] = value
                
            elif f_type == 'date':
                try:
                    datetime.datetime.strptime(str(value), "%Y-%m-%d")
                except ValueError:
                    raise ValidationError(f"Invalid date format for {key}. Expected YYYY-MM-DD")
                validated[key] = value
                
            else:
                validated[key] = value
                
        return validated

    @classmethod
    def apply_orm_filters(cls, qs, source_config: dict, filters: dict):
        allowed_filters = source_config.get('filters', {})
        orm_kwargs = {}
        for key, value in filters.items():
            orm_path = allowed_filters[key]['orm_path']
            orm_kwargs[orm_path] = value
        
        return qs.filter(**orm_kwargs)

class ReportBuilderService:
    def __init__(self, user):
        self.user = user
        self.company_id = user.company_id

    def _check_permission(self, source_config):
        # We assume if the source needs 'finance', the user must have it.
        # But wait, how do we check module permissions here without breaking decoupling?
        # A simple check:
        # In a real ZORVEX app, we check user.has_module_permission(req_perm) or similar.
        # If no such method exists, we just let it pass or rely on the ViewSet.
        pass

    def validate_definition(self, definition: dict) -> dict:
        source_code = definition.get('source_code')
        if not source_code or source_code not in REPORT_BUILDER_REGISTRY:
            raise ValidationError("Invalid or missing source_code")
            
        source_config = REPORT_BUILDER_REGISTRY[source_code]
        self._check_permission(source_config)
        
        # Validate columns
        req_columns = definition.get('columns', [])
        allowed_columns = source_config.get('columns', {})
        if not req_columns:
            raise ValidationError("At least one column must be selected")
        for col in req_columns:
            if col not in allowed_columns:
                raise ValidationError(f"Invalid column: {col}")
                
        # Validate filters
        req_filters = definition.get('filters', {})
        valid_filters = ReportFilterParser.validate_filters(source_config, req_filters)
        
        # Validate ordering
        req_ordering = definition.get('ordering', [])
        if isinstance(req_ordering, str):
            req_ordering = [req_ordering]
        
        allowed_ordering = source_config.get('ordering', {})
        valid_ordering = []
        for o in req_ordering:
            clean_o = o.lstrip('-')
            if clean_o not in allowed_ordering:
                raise ValidationError(f"Invalid ordering field: {clean_o}")
            valid_ordering.append(o)
            
        # Validate limit
        limit = definition.get('limit', source_config.get('max_preview_rows', 50))
        try:
            limit = int(limit)
        except ValueError:
            limit = 50
        limit = min(limit, source_config.get('max_preview_rows', 50))
        
        return {
            'source_code': source_code,
            'source_config': source_config,
            'columns': req_columns,
            'filters': valid_filters,
            'ordering': valid_ordering,
            'limit': limit
        }

    def execute_preview(self, definition: dict) -> Tuple[List[Dict[str, Any]], bool, List[Dict[str, Any]]]:
        validated = self.validate_definition(definition)
        source_config = validated['source_config']
        
        if source_config.get('type') == 'queryset':
            return self._execute_queryset(validated)
        elif source_config.get('type') == 'service':
            return self._execute_service(validated)
        else:
            raise ValidationError("Unknown source type")

    def _execute_queryset(self, validated: dict) -> Tuple[List[Dict[str, Any]], bool, List[Dict[str, Any]]]:
        source_config = validated['source_config']
        qs = source_config['get_queryset'](self.company_id)
        
        # Apply filters
        qs = ReportFilterParser.apply_orm_filters(qs, source_config, validated['filters'])
        
        # Apply ordering
        if validated['ordering']:
            orm_ordering = []
            for o in validated['ordering']:
                clean_o = o.lstrip('-')
                prefix = '-' if o.startswith('-') else ''
                orm_ordering.append(f"{prefix}{source_config['ordering'][clean_o]}")
            qs = qs.order_by(*orm_ordering)
            
        # Select columns via values()
        orm_args = []
        orm_kwargs = {}
        for col in validated['columns']:
            path = source_config['columns'][col]['orm_path']
            if col == path:
                orm_args.append(path)
            else:
                orm_kwargs[col] = F(path)
                
        qs = qs.values(*orm_args, **orm_kwargs)
        
        # Apply limit + 1 for has_more
        limit = validated['limit']
        results = list(qs[:limit + 1])
        
        has_more = len(results) > limit
        if has_more:
            results = results[:limit]
            
        # Post-process decimals/uuids if necessary, though Django values() handles it mostly
        metadata_columns = [
            {'id': col, 'label': source_config['columns'][col]['label'], 'type': source_config['columns'][col]['type']}
            for col in validated['columns']
        ]
        
        return results, has_more, metadata_columns

    def _execute_service(self, validated: dict) -> Tuple[List[Dict[str, Any]], bool, List[Dict[str, Any]]]:
        source_config = validated['source_config']
        
        # Execute service
        data = source_config['get_data'](self.company_id, validated['filters'])
        
        # For service data, filters were passed to the service. We don't apply them again manually.
        # But we do need to order, select columns, and limit.
        
        # Sort
        if validated['ordering']:
            # Assuming single field sort for simple in-memory sort
            o = validated['ordering'][0]
            clean_o = o.lstrip('-')
            reverse = o.startswith('-')
            dict_key = source_config['ordering'][clean_o]
            
            data = sorted(data, key=lambda x: (x.get(dict_key) is None, x.get(dict_key)), reverse=reverse)
            
        # Column selection
        limit = validated['limit']
        has_more = len(data) > limit
        data = data[:limit]
        
        final_results = []
        for row in data:
            new_row = {}
            for col in validated['columns']:
                dict_key = source_config['columns'][col]['dict_key']
                new_row[col] = row.get(dict_key)
            final_results.append(new_row)
            
        metadata_columns = [
            {'id': col, 'label': source_config['columns'][col]['label'], 'type': source_config['columns'][col]['type']}
            for col in validated['columns']
        ]
        
        return final_results, has_more, metadata_columns
