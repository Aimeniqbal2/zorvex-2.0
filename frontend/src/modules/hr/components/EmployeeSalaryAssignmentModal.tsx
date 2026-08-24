import React, { useState, useEffect } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { apiClient } from '../api';
import type { EmployeeSalaryAssignment, Employee, SalaryStructure, Employment } from '../types';

interface EmployeeSalaryAssignmentModalProps {
    isOpen: boolean;
    onClose: () => void;
    assignment?: EmployeeSalaryAssignment | null;
    onSave: () => void;
}

export const EmployeeSalaryAssignmentModal: React.FC<EmployeeSalaryAssignmentModalProps> = ({
    isOpen,
    onClose,
    assignment,
    onSave
}) => {
    const [formData, setFormData] = useState({
        employee: '',
        employment: '',
        salary_structure: '',
        currency: 'PKR',
        base_salary: 0,
        effective_from: '',
        effective_to: '',
        status: 'ACTIVE'
    });
    
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [employments, setEmployments] = useState<Employment[]>([]);
    const [structures, setStructures] = useState<SalaryStructure[]>([]);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            fetchDependencies();
        }
    }, [isOpen]);

    useEffect(() => {
        if (assignment) {
            setFormData({
                employee: assignment.employee || '',
                employment: assignment.employment || '',
                salary_structure: assignment.salary_structure || '',
                currency: assignment.currency || 'PKR',
                base_salary: assignment.base_salary || 0,
                effective_from: assignment.effective_from || '',
                effective_to: assignment.effective_to || '',
                status: assignment.status || 'ACTIVE'
            });
        } else {
            setFormData({
                employee: '',
                employment: '',
                salary_structure: '',
                currency: 'PKR',
                base_salary: 0,
                effective_from: '',
                effective_to: '',
                status: 'ACTIVE'
            });
        }
    }, [assignment, isOpen]);

    const fetchDependencies = async () => {
        try {
            const empRes = await apiClient.get('/api/hrm/employees/');
            setEmployees(empRes.data.results || (Array.isArray(empRes.data) ? empRes.data : []));
            
            const structRes = await apiClient.get('/api/hrm/salary-structures/');
            setStructures(structRes.data.results || (Array.isArray(structRes.data) ? structRes.data : []));
            
            const employRes = await apiClient.get('/api/hrm/employments/');
            setEmployments(employRes.data.results || (Array.isArray(employRes.data) ? employRes.data : []));
        } catch (err) {
            console.error(err);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            const dataToSubmit = { ...formData };
            if (!dataToSubmit.effective_to) {
                delete (dataToSubmit as any).effective_to;
            }
            if (assignment?.id) {
                await apiClient.put(`/api/hrm/employee-salary-assignments/${assignment.id}/`, dataToSubmit);
            } else {
                await apiClient.post('/api/hrm/employee-salary-assignments/', dataToSubmit);
            }
            onSave();
            onClose();
        } catch (err: any) {
            setError(err.response?.data?.detail || err.response?.data?.non_field_errors?.[0] || err.message || 'Error saving assignment');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={assignment ? 'Edit Assignment' : 'New Assignment'}>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {error && <div style={{ color: 'red' }}>{error}</div>}
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '0.875rem', fontWeight: 500 }}>Employee</label>
                    <select
                        name="employee"
                        value={formData.employee}
                        onChange={handleChange}
                        style={{ padding: '8px', borderRadius: '4px', border: '1px solid #d1d5db' }}
                        required
                    >
                        <option value="">Select Employee...</option>
                        {employees.map(e => (
                            <option key={e.id} value={e.id}>{e.first_name} {e.last_name} ({e.employee_code || 'No ID'})</option>
                        ))}
                    </select>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '0.875rem', fontWeight: 500 }}>Employment</label>
                    <select
                        name="employment"
                        value={formData.employment}
                        onChange={handleChange}
                        style={{ padding: '8px', borderRadius: '4px', border: '1px solid #d1d5db' }}
                        required
                    >
                        <option value="">Select Employment...</option>
                        {employments.map(e => (
                            <option key={e.id} value={e.id}>{e.id} (Employee: {e.employee})</option>
                        ))}
                    </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '0.875rem', fontWeight: 500 }}>Salary Structure</label>
                    <select
                        name="salary_structure"
                        value={formData.salary_structure}
                        onChange={handleChange}
                        style={{ padding: '8px', borderRadius: '4px', border: '1px solid #d1d5db' }}
                        required
                    >
                        <option value="">Select Structure...</option>
                        {structures.map(s => (
                            <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                        ))}
                    </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <Input type="number" label="Base Salary" name="base_salary" value={formData.base_salary} onChange={handleChange} required />
                    <Input label="Currency" name="currency" value={formData.currency} onChange={handleChange} required />
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <Input type="date" label="Effective From" name="effective_from" value={formData.effective_from} onChange={handleChange} required />
                    <Input type="date" label="Effective To" name="effective_to" value={formData.effective_to} onChange={handleChange} />
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '0.875rem', fontWeight: 500 }}>Status</label>
                    <select
                        name="status"
                        value={formData.status}
                        onChange={handleChange}
                        style={{ padding: '8px', borderRadius: '4px', border: '1px solid #d1d5db' }}
                        required
                    >
                        <option value="ACTIVE">Active</option>
                        <option value="INACTIVE">Inactive</option>
                    </select>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
                    <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button type="submit" variant="primary" disabled={loading}>
                        {loading ? 'Saving...' : 'Save Assignment'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
};
