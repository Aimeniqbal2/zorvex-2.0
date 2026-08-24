import React, { useEffect, useState } from 'react';
import { Input } from '../../../components/ui/Input';
import { getItemFieldDefinitions } from '../api';
import type { ItemFieldDefinition } from '../types';

interface DynamicCustomFieldsProps {
    categoryId?: string | null;
    values: Record<string, any>;
    onChange: (values: Record<string, any>) => void;
}

export const DynamicCustomFields: React.FC<DynamicCustomFieldsProps> = ({ categoryId, values, onChange }) => {
    const [fields, setFields] = useState<ItemFieldDefinition[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        let isMounted = true;
        const fetchFields = async () => {
            setIsLoading(true);
            try {
                // Fetch fields for this category (backend also includes global fields)
                const data = await getItemFieldDefinitions(categoryId || '');
                if (isMounted) {
                    setFields(data);
                    
                    // Pre-fill defaults for missing keys
                    const newValues = { ...values };
                    let changed = false;
                    data.forEach(field => {
                        if (field.default_value !== null && field.default_value !== undefined && newValues[field.key] === undefined) {
                            newValues[field.key] = field.default_value;
                            changed = true;
                        }
                    });
                    if (changed) {
                        onChange(newValues);
                    }
                }
            } catch (err) {
                console.error("Failed to load custom fields", err);
            } finally {
                if (isMounted) setIsLoading(false);
            }
        };

        fetchFields();

        return () => {
            isMounted = false;
        };
    }, [categoryId]);

    const handleFieldChange = (key: string, value: any) => {
        onChange({ ...values, [key]: value });
    };

    if (isLoading) {
        return <div style={{ padding: '16px', color: 'var(--color-text-muted)' }}>Loading custom attributes...</div>;
    }

    if (fields.length === 0) {
        return null; // Don't render anything if there are no custom fields
    }

    return (
        <div className="dynamic-custom-fields">
            <h4 style={{ margin: '24px 0 8px 0', color: 'var(--color-primary)' }}>Custom Attributes</h4>
            <div className="form-row" style={{ gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
                {fields.map((field) => {
                    const value = values[field.key] !== undefined ? values[field.key] : '';

                    switch (field.field_type) {
                        case 'TEXT':
                        case 'NUMBER':
                        case 'DECIMAL':
                        case 'DATE':
                        case 'DATETIME':
                            return (
                                <Input
                                    key={field.key}
                                    label={`${field.name}${field.required ? ' *' : ''}`}
                                    type={field.field_type === 'NUMBER' || field.field_type === 'DECIMAL' ? 'number' : field.field_type === 'DATE' ? 'date' : field.field_type === 'DATETIME' ? 'datetime-local' : 'text'}
                                    step={field.field_type === 'DECIMAL' ? '0.01' : undefined}
                                    value={value}
                                    onChange={(e) => handleFieldChange(field.key, e.target.value)}
                                    required={field.required}
                                    helpText={field.description}
                                />
                            );
                        case 'TEXTAREA':
                            return (
                                <div className="form-field" key={field.key} style={{ gridColumn: '1 / -1' }}>
                                    <label className="form-label">{field.name}{field.required ? ' *' : ''}</label>
                                    <textarea
                                        className="input-base"
                                        value={value}
                                        onChange={(e) => handleFieldChange(field.key, e.target.value)}
                                        required={field.required}
                                        rows={3}
                                    />
                                    {field.description && <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px', display: 'block' }}>{field.description}</span>}
                                </div>
                            );
                        case 'BOOLEAN':
                            return (
                                <div className="form-field" key={field.key}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '30px' }}>
                                        <input
                                            type="checkbox"
                                            checked={!!value}
                                            onChange={(e) => handleFieldChange(field.key, e.target.checked)}
                                        />
                                        {field.name}{field.required ? ' *' : ''}
                                    </label>
                                    {field.description && <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px', display: 'block' }}>{field.description}</span>}
                                </div>
                            );
                        case 'SELECT':
                            return (
                                <div className="form-field" key={field.key}>
                                    <label className="form-label">{field.name}{field.required ? ' *' : ''}</label>
                                    <select
                                        className="input-base"
                                        value={value}
                                        onChange={(e) => handleFieldChange(field.key, e.target.value)}
                                        required={field.required}
                                    >
                                        <option value="">-- Select --</option>
                                        {(Array.isArray(field.options) ? field.options : []).map((opt: string, i: number) => (
                                            <option key={i} value={opt}>{opt}</option>
                                        ))}
                                    </select>
                                    {field.description && <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px', display: 'block' }}>{field.description}</span>}
                                </div>
                            );
                        case 'MULTI_SELECT':
                            // For simplicity, using a multiple select. Alternatively, could be a bunch of checkboxes.
                            return (
                                <div className="form-field" key={field.key} style={{ gridColumn: '1 / -1' }}>
                                    <label className="form-label">{field.name}{field.required ? ' *' : ''}</label>
                                    <select
                                        className="input-base"
                                        multiple
                                        value={Array.isArray(value) ? value : []}
                                        onChange={(e) => {
                                            const opts = Array.from(e.target.selectedOptions, option => option.value);
                                            handleFieldChange(field.key, opts);
                                        }}
                                        required={field.required}
                                        style={{ height: 'auto', minHeight: '100px' }}
                                    >
                                        {(Array.isArray(field.options) ? field.options : []).map((opt: string, i: number) => (
                                            <option key={i} value={opt}>{opt}</option>
                                        ))}
                                    </select>
                                    <small style={{ color: 'var(--color-text-muted)', display: 'block', marginTop: '4px' }}>Hold Ctrl (Windows) or Cmd (Mac) to select multiple</small>
                                    {field.description && <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px', display: 'block' }}>{field.description}</span>}
                                </div>
                            );
                        default:
                            return null;
                    }
                })}
            </div>
        </div>
    );
};
