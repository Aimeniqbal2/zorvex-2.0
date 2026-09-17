import React, { useState, useEffect } from 'react';
import { apiClient, createPayrollAddition } from '../api';
import type { EmployeeOption, PayrollAdditionType, PayrollAdditionFrequency } from '../types';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSaved: () => void;
    preselectedEmployeeId?: string;
}

export const PayrollAdditionModal: React.FC<Props> = ({
    isOpen,
    onClose,
    onSaved,
    preselectedEmployeeId
}) => {
    const today = new Date().toISOString().split('T')[0];
    const [employees, setEmployees] = useState<EmployeeOption[]>([]);
    const [loadingDropdowns, setLoadingDropdowns] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [formData, setFormData] = useState({
        employee: '',
        addition_type: 'ALLOWANCE' as PayrollAdditionType,
        name: '',
        amount: '',
        frequency: 'ONE_TIME' as PayrollAdditionFrequency,
        effective_date: today,
        effective_from: today,
        effective_to: '',
        is_taxable: false,
        notes: ''
    });

    useEffect(() => {
        if (isOpen) {
            fetchEmployees();
            setFormData({
                employee: preselectedEmployeeId || '',
                addition_type: 'ALLOWANCE',
                name: '',
                amount: '',
                frequency: 'ONE_TIME',
                effective_date: today,
                effective_from: today,
                effective_to: '',
                is_taxable: false,
                notes: ''
            });
            setError(null);
        }
    }, [isOpen, preselectedEmployeeId]);

    const fetchEmployees = async () => {
        setLoadingDropdowns(true);
        try {
            const res = await apiClient.get('/api/hrm/employees/?limit=100');
            setEmployees(res.data.results || res.data || []);
        } catch (err) {
            console.error('Failed to load employees', err);
        } finally {
            setLoadingDropdowns(false);
        }
    };

    const handleChange = (field: string, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleSave = async () => {
        setError(null);
        if (!formData.employee) {
            setError('Please select an employee.');
            return;
        }
        if (!formData.name.trim()) {
            setError('Please enter a description / name for this addition.');
            return;
        }
        const amt = parseFloat(formData.amount);
        if (isNaN(amt) || amt <= 0) {
            setError('Please enter a valid positive amount.');
            return;
        }

        setIsSaving(true);
        try {
            await createPayrollAddition({
                employee: formData.employee,
                addition_type: formData.addition_type,
                name: formData.name.trim(),
                amount: amt,
                frequency: formData.frequency,
                effective_date: formData.frequency === 'ONE_TIME' ? formData.effective_date : null,
                effective_from: formData.frequency === 'RECURRING' ? formData.effective_from : null,
                effective_to: formData.frequency === 'RECURRING' && formData.effective_to ? formData.effective_to : null,
                is_taxable: formData.is_taxable,
                is_approved: true,
                is_active: true,
                notes: formData.notes
            });
            onSaved();
            onClose();
        } catch (err: any) {
            setError(err.response?.data?.error || err.message || 'Failed to save addition instruction');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Configure Payroll Addition / Allowance"
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {error && (
                    <div style={{
                        padding: '10px 14px',
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid #ef4444',
                        borderRadius: '6px',
                        color: '#f87171',
                        fontSize: '13px'
                    }}>
                        {error}
                    </div>
                )}

                <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary, #94a3b8)', marginBottom: '4px' }}>
                        Employee *
                    </label>
                    <select
                        style={{
                            width: '100%',
                            padding: '8px 12px',
                            background: 'var(--color-surface, #1e293b)',
                            border: '1px solid var(--color-border, #334155)',
                            borderRadius: '6px',
                            color: 'var(--color-text, #f8fafc)',
                            fontSize: '13px'
                        }}
                        value={formData.employee}
                        onChange={(e) => handleChange('employee', e.target.value)}
                        disabled={loadingDropdowns}
                    >
                        <option value="">-- Select Employee --</option>
                        {employees.map(emp => (
                            <option key={emp.id} value={emp.id}>
                                {emp.first_name} {emp.last_name} {emp.designation_name ? `(${emp.designation_name})` : ''}
                            </option>
                        ))}
                    </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary, #94a3b8)', marginBottom: '4px' }}>
                            Addition Type *
                        </label>
                        <select
                            style={{
                                width: '100%',
                                padding: '8px 12px',
                                background: 'var(--color-surface, #1e293b)',
                                border: '1px solid var(--color-border, #334155)',
                                borderRadius: '6px',
                                color: 'var(--color-text, #f8fafc)',
                                fontSize: '13px'
                            }}
                            value={formData.addition_type}
                            onChange={(e) => handleChange('addition_type', e.target.value)}
                        >
                            <option value="ALLOWANCE">Allowance (e.g. Site Hazard, Mess)</option>
                            <option value="BONUS">Bonus (e.g. Performance, Eid)</option>
                            <option value="EXTRA_DUTY">Extra Duty Incentive</option>
                            <option value="ADJUSTMENT">Arrears / Adjustment</option>
                            <option value="OTHER">Other Addition</option>
                        </select>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary, #94a3b8)', marginBottom: '4px' }}>
                            Frequency *
                        </label>
                        <select
                            style={{
                                width: '100%',
                                padding: '8px 12px',
                                background: 'var(--color-surface, #1e293b)',
                                border: '1px solid var(--color-border, #334155)',
                                borderRadius: '6px',
                                color: 'var(--color-text, #f8fafc)',
                                fontSize: '13px'
                            }}
                            value={formData.frequency}
                            onChange={(e) => handleChange('frequency', e.target.value)}
                        >
                            <option value="ONE_TIME">One-Time (Specific Month/Date)</option>
                            <option value="RECURRING">Recurring (Monthly)</option>
                        </select>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary, #94a3b8)', marginBottom: '4px' }}>
                            Title / Name *
                        </label>
                        <Input
                            placeholder="e.g. Hardship Allowance"
                            value={formData.name}
                            onChange={(e) => handleChange('name', e.target.value)}
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary, #94a3b8)', marginBottom: '4px' }}>
                            Amount (₨) *
                        </label>
                        <Input
                            type="number"
                            placeholder="0.00"
                            value={formData.amount}
                            onChange={(e) => handleChange('amount', e.target.value)}
                        />
                    </div>
                </div>

                {formData.frequency === 'ONE_TIME' ? (
                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary, #94a3b8)', marginBottom: '4px' }}>
                            Effective Date *
                        </label>
                        <Input
                            type="date"
                            value={formData.effective_date}
                            onChange={(e) => handleChange('effective_date', e.target.value)}
                        />
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary, #94a3b8)', marginBottom: '4px' }}>
                                Effective From *
                            </label>
                            <Input
                                type="date"
                                value={formData.effective_from}
                                onChange={(e) => handleChange('effective_from', e.target.value)}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary, #94a3b8)', marginBottom: '4px' }}>
                                Effective To (Optional)
                            </label>
                            <Input
                                type="date"
                                value={formData.effective_to}
                                onChange={(e) => handleChange('effective_to', e.target.value)}
                            />
                        </div>
                    </div>
                )}

                <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary, #94a3b8)', marginBottom: '4px' }}>
                        Notes / Rationale
                    </label>
                    <textarea
                        rows={2}
                        style={{
                            width: '100%',
                            padding: '8px 12px',
                            background: 'var(--color-surface, #1e293b)',
                            border: '1px solid var(--color-border, #334155)',
                            borderRadius: '6px',
                            color: 'var(--color-text, #f8fafc)',
                            fontSize: '13px',
                            boxSizing: 'border-box'
                        }}
                        placeholder="Additional details, approval reference, or notes..."
                        value={formData.notes}
                        onChange={(e) => handleChange('notes', e.target.value)}
                    />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                    <Button variant="secondary" onClick={onClose} disabled={isSaving}>
                        Cancel
                    </Button>
                    <Button variant="primary" onClick={handleSave} disabled={isSaving}>
                        {isSaving ? 'Saving...' : 'Save Addition'}
                    </Button>
                </div>
            </div>
        </Modal>
    );
};
