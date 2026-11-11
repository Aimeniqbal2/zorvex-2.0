import React, { useState, useEffect, useMemo } from 'react';
import { apiClient, createPayrollDeduction, fetchAllActiveEmployees, filterAssignableEmployees } from '../api';
import type { EmployeeOption, PayrollDeductionType, PayrollDeductionFrequency } from '../types';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSaved: () => void;
    preselectedEmployeeId?: string;
}

export const PayrollDeductionModal: React.FC<Props> = ({
    isOpen,
    onClose,
    onSaved,
    preselectedEmployeeId
}) => {
    const today = new Date().toISOString().split('T')[0];
    const [employees, setEmployees] = useState<EmployeeOption[]>([]);
    const [empSearch, setEmpSearch] = useState('');
    const [employeeAdvances, setEmployeeAdvances] = useState<any[]>([]);
    const [loadingDropdowns, setLoadingDropdowns] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [formData, setFormData] = useState({
        employee: '',
        deduction_type: 'PATROLLING' as PayrollDeductionType,
        name: '',
        amount: '',
        frequency: 'ONE_TIME' as PayrollDeductionFrequency,
        effective_date: today,
        effective_from: today,
        effective_to: '',
        advance: '',
        notes: ''
    });

    useEffect(() => {
        if (isOpen) {
            fetchEmployees();
            setEmpSearch('');
            setEmployeeAdvances([]);
            setFormData({
                employee: preselectedEmployeeId || '',
                deduction_type: 'PATROLLING',
                name: '',
                amount: '',
                frequency: 'ONE_TIME',
                effective_date: today,
                effective_from: today,
                effective_to: '',
                advance: '',
                notes: ''
            });
            setError(null);
        }
    }, [isOpen, preselectedEmployeeId]);

    useEffect(() => {
        if (!isOpen || formData.deduction_type !== 'ADVANCE_RECOVERY' || !formData.employee) {
            setEmployeeAdvances([]);
            return;
        }
        let cancelled = false;
        apiClient
            .get('/api/finance/employee-advances/', {
                params: { employee: formData.employee, status: 'PAID' },
            })
            .then((res) => {
                if (cancelled) return;
                const list = res.data?.results || res.data || [];
                setEmployeeAdvances(
                    Array.isArray(list)
                        ? list.filter((a: any) => parseFloat(String(a.outstanding_balance || 0)) > 0)
                        : []
                );
            })
            .catch(() => {
                if (!cancelled) setEmployeeAdvances([]);
            });
        return () => {
            cancelled = true;
        };
    }, [isOpen, formData.deduction_type, formData.employee]);

    const fetchEmployees = async () => {
        setLoadingDropdowns(true);
        try {
            const list = await fetchAllActiveEmployees();
            setEmployees(list);
        } catch (err) {
            console.error('Failed to load employees', err);
        } finally {
            setLoadingDropdowns(false);
        }
    };

    const filteredEmployees = useMemo(() => {
        const res = filterAssignableEmployees(employees, empSearch, 250).items;
        if (formData.employee && !res.some((e: any) => String(e.id) === String(formData.employee))) {
            const chosen = employees.find((e: any) => String(e.id) === String(formData.employee));
            if (chosen) return [chosen, ...res];
        }
        return res;
    }, [employees, empSearch, formData.employee]);

    const handleChange = (field: string, value: any) => {
        setFormData(prev => {
            const next = { ...prev, [field]: value };
            if (field === 'employee' || (field === 'deduction_type' && value !== 'ADVANCE_RECOVERY')) {
                next.advance = '';
            }
            if (field === 'advance' && value) {
                const adv = employeeAdvances.find((a: any) => String(a.id) === String(value));
                if (adv) {
                    if (!prev.name.trim()) next.name = `Advance Recovery: ${adv.advance_number}`;
                    if (!prev.amount) next.amount = String(adv.outstanding_balance || '');
                }
            }
            return next;
        });
    };

    const handleSave = async () => {
        setError(null);
        if (!formData.employee) {
            setError('Please select an employee.');
            return;
        }
        if (!formData.name.trim()) {
            setError('Please enter a description / name for this deduction.');
            return;
        }
        const amt = parseFloat(formData.amount);
        if (isNaN(amt) || amt <= 0) {
            setError('Please enter a valid positive deduction amount.');
            return;
        }

        setIsSaving(true);
        try {
            await createPayrollDeduction({
                employee: formData.employee,
                deduction_type: formData.deduction_type,
                name: formData.name.trim(),
                amount: amt,
                frequency: formData.frequency,
                effective_date: formData.frequency === 'ONE_TIME' ? formData.effective_date : null,
                effective_from: formData.frequency === 'RECURRING' ? formData.effective_from : null,
                effective_to: formData.frequency === 'RECURRING' && formData.effective_to ? formData.effective_to : null,
                advance: formData.deduction_type === 'ADVANCE_RECOVERY' && formData.advance ? formData.advance : null,
                is_approved: true,
                is_active: true,
                notes: formData.notes
            });
            onSaved();
            onClose();
        } catch (err: any) {
            setError(err.response?.data?.error || err.response?.data?.detail || err.message || 'Failed to save deduction instruction');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Configure Payroll Deduction"
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
                        Employee * ({employees.length} active)
                    </label>
                    <input
                        type="text"
                        placeholder="Filter by code (e.g. 009399) or name..."
                        value={empSearch}
                        onChange={(e) => setEmpSearch(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '6px 10px',
                            marginBottom: '6px',
                            background: 'var(--color-surface, #1e293b)',
                            border: '1px solid var(--color-border, #334155)',
                            borderRadius: '6px',
                            color: 'var(--color-text, #f8fafc)',
                            fontSize: '12px',
                            boxSizing: 'border-box'
                        }}
                    />
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
                        {filteredEmployees.map((emp: any) => (
                            <option key={emp.id} value={emp.id}>
                                {emp.display_code || emp.previous_employee_code || emp.employee_code || 'EMP'} — {emp.first_name} {emp.last_name} {emp.designation_name ? `(${emp.designation_name})` : ''}
                            </option>
                        ))}
                    </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary, #94a3b8)', marginBottom: '4px' }}>
                            Deduction Type *
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
                            value={formData.deduction_type}
                            onChange={(e) => handleChange('deduction_type', e.target.value)}
                        >
                            <option value="PATROLLING">Mobile Patrolling / Supervisor Check</option>
                            <option value="INSURANCE">Insurance / Health Coverage</option>
                            <option value="ADVANCE_RECOVERY">Advance Recovery (Direct)</option>
                            <option value="UNIFORM">Uniform / Kit Replacement</option>
                            <option value="FINE">Disciplinary Fine / Penalty</option>
                            <option value="OTHER">Other Operational Deduction</option>
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

                {formData.deduction_type === 'ADVANCE_RECOVERY' && (
                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary, #94a3b8)', marginBottom: '4px' }}>
                            Link to Disbursed Advance (Optional — settles advance balance automatically)
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
                            value={formData.advance}
                            onChange={(e) => handleChange('advance', e.target.value)}
                        >
                            <option value="">
                                {employeeAdvances.length > 0
                                    ? '-- Select Active Advance (or leave unlinked) --'
                                    : '-- No active unpaid PAID advances found for employee --'}
                            </option>
                            {employeeAdvances.map((adv: any) => (
                                <option key={adv.id} value={adv.id}>
                                    {adv.advance_number} — Bal: PKR {parseFloat(String(adv.outstanding_balance || 0)).toLocaleString()} ({adv.advance_date})
                                </option>
                            ))}
                        </select>
                    </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary, #94a3b8)', marginBottom: '4px' }}>
                            Title / Description *
                        </label>
                        <Input
                            placeholder="e.g. Patrol fuel deduction or fine"
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
                        Notes / Incident Reference
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
                        placeholder="Reason, disciplinary ticket #, or approval reference..."
                        value={formData.notes}
                        onChange={(e) => handleChange('notes', e.target.value)}
                    />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                    <Button variant="secondary" onClick={onClose} disabled={isSaving}>
                        Cancel
                    </Button>
                    <Button variant="primary" onClick={handleSave} disabled={isSaving}>
                        {isSaving ? 'Saving...' : 'Save Deduction'}
                    </Button>
                </div>
            </div>
        </Modal>
    );
};
