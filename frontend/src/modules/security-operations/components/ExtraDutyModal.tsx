import React, { useState, useEffect } from 'react';
import { apiClient } from '../api';
import type { ExtraDuty, EmployeeOption, OperationalSite } from '../types';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';

interface ExtraDutyModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSaved: () => void;
    extraDuty?: ExtraDuty;
}

export const ExtraDutyModal: React.FC<ExtraDutyModalProps> = ({ isOpen, onClose, onSaved, extraDuty }) => {
    const [employees, setEmployees] = useState<EmployeeOption[]>([]);
    const [sites, setSites] = useState<OperationalSite[]>([]);
    const [loadingDropdowns, setLoadingDropdowns] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [formData, setFormData] = useState({
        employee: '',
        site: '',
        date: new Date().toISOString().split('T')[0],
        hours: '',
        start_time: '',
        end_time: '',
        description: ''
    });

    useEffect(() => {
        if (isOpen) {
            fetchDropdowns();
            if (extraDuty) {
                setFormData({
                    employee: extraDuty.employee || '',
                    site: extraDuty.site || '',
                    date: extraDuty.date || new Date().toISOString().split('T')[0],
                    hours: extraDuty.hours?.toString() || '',
                    start_time: extraDuty.start_time || '',
                    end_time: extraDuty.end_time || '',
                    description: extraDuty.description || ''
                });
            } else {
                setFormData({
                    employee: '',
                    site: '',
                    date: new Date().toISOString().split('T')[0],
                    hours: '',
                    start_time: '',
                    end_time: '',
                    description: ''
                });
            }
        }
    }, [isOpen, extraDuty]);

    const fetchDropdowns = async () => {
        setLoadingDropdowns(true);
        try {
            const [empRes, siteRes] = await Promise.all([
                apiClient.get('/api/hrm/employees/?limit=100'),
                apiClient.get('/api/operations/sites/?limit=100')
            ]);
            setEmployees(empRes.data.results || empRes.data || []);
            setSites(siteRes.data.results || siteRes.data || []);
        } catch (err) {
            console.error('Failed to load dropdowns', err);
        } finally {
            setLoadingDropdowns(false);
        }
    };

    const handleChange = (field: string, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleSave = async () => {
        setError(null);
        setIsSaving(true);
        try {
            const payload = {
                ...formData,
                site: formData.site || null,
                start_time: formData.start_time || null,
                end_time: formData.end_time || null
            };
            if (extraDuty) {
                await apiClient.patch(`/api/operations/extra-duties/${extraDuty.id}/`, payload);
            } else {
                await apiClient.post('/api/operations/extra-duties/', payload);
            }
            onSaved();
            onClose();
        } catch (err: any) {
            setError(err.response?.data?.detail || err.response?.data?.error || JSON.stringify(err.response?.data) || 'Failed to save extra duty');
        } finally {
            setIsSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <Modal isOpen={isOpen} title={extraDuty ? "Edit Extra Duty" : "New Extra Duty"} onClose={onClose}>
            {error && <div className="zorvex-error-state">{error}</div>}
            
            <div className="zorvex-form-grid" style={{ minWidth: '400px' }}>
                <div className="form-group">
                    <label>Employee *</label>
                    <select 
                        value={formData.employee} 
                        onChange={e => handleChange('employee', e.target.value)}
                        className="zorvex-input"
                        disabled={loadingDropdowns}
                    >
                        <option value="">Select Employee...</option>
                        {employees.map(emp => (
                            <option key={emp.id} value={emp.id}>{emp.first_name} {emp.last_name}</option>
                        ))}
                    </select>
                </div>

                <div className="form-group">
                    <label>Site</label>
                    <select 
                        value={formData.site} 
                        onChange={e => handleChange('site', e.target.value)}
                        className="zorvex-input"
                        disabled={loadingDropdowns}
                    >
                        <option value="">Select Site (Optional)...</option>
                        {sites.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                    </select>
                </div>

                <div className="form-group">
                    <label>Date *</label>
                    <Input 
                        type="date" 
                        value={formData.date} 
                        onChange={e => handleChange('date', e.target.value)} 
                    />
                </div>

                <div className="form-group">
                    <label>Hours *</label>
                    <Input 
                        type="number" 
                        step="0.1"
                        value={formData.hours} 
                        onChange={e => handleChange('hours', e.target.value)} 
                    />
                </div>

                <div className="form-group">
                    <label>Start Time</label>
                    <Input 
                        type="time" 
                        value={formData.start_time} 
                        onChange={e => handleChange('start_time', e.target.value)} 
                    />
                </div>

                <div className="form-group">
                    <label>End Time</label>
                    <Input 
                        type="time" 
                        value={formData.end_time} 
                        onChange={e => handleChange('end_time', e.target.value)} 
                    />
                </div>

                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label>Reason / Description</label>
                    <Input 
                        value={formData.description} 
                        onChange={e => handleChange('description', e.target.value)} 
                    />
                </div>
            </div>

            <div className="modal-actions" style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <Button variant="secondary" onClick={onClose} disabled={isSaving}>Cancel</Button>
                <Button variant="primary" onClick={handleSave} loading={isSaving}>Save</Button>
            </div>
        </Modal>
    );
};
