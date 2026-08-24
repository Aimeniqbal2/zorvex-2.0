import React, { useState, useEffect } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { apiClient } from '../api';

interface StaffingRequirementModalProps {
    isOpen: boolean;
    onClose: () => void;
    requirement?: any | null;
    onSave: () => void;
}

export const StaffingRequirementModal: React.FC<StaffingRequirementModalProps> = ({
    isOpen,
    onClose,
    requirement,
    onSave
}) => {
    const [formData, setFormData] = useState({
        service_contract: '',
        site: '',
        designation: '',
        shift: '',
        required_headcount: 1,
        effective_from: new Date().toISOString().split('T')[0],
        effective_to: '',
        is_active: true,
        notes: ''
    });

    const [contracts, setContracts] = useState<any[]>([]);
    const [sites, setSites] = useState<any[]>([]);
    const [designations, setDesignations] = useState<any[]>([]);
    const [shifts, setShifts] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            fetchDependencies();
            if (requirement) {
                setFormData({
                    service_contract: requirement.service_contract,
                    site: requirement.site,
                    designation: requirement.designation,
                    shift: requirement.shift,
                    required_headcount: requirement.required_headcount,
                    effective_from: requirement.effective_from,
                    effective_to: requirement.effective_to || '',
                    is_active: requirement.is_active,
                    notes: requirement.notes || ''
                });
            } else {
                setFormData({
                    service_contract: '',
                    site: '',
                    designation: '',
                    shift: '',
                    required_headcount: 1,
                    effective_from: new Date().toISOString().split('T')[0],
                    effective_to: '',
                    is_active: true,
                    notes: ''
                });
            }
        }
    }, [isOpen, requirement]);

    const fetchDependencies = async () => {
        try {
            const [conRes, siteRes, desigRes, shiftRes] = await Promise.all([
                apiClient.get('/api/operations/contracts/'),
                apiClient.get('/api/operations/sites/'),
                apiClient.get('/api/hrm/designations/'),
                apiClient.get('/api/hrm/shifts/')
            ]);
            setContracts(conRes.data.results || (Array.isArray(conRes.data) ? conRes.data : []));
            setSites(siteRes.data.results || (Array.isArray(siteRes.data) ? siteRes.data : []));
            setDesignations(desigRes.data.results || (Array.isArray(desigRes.data) ? desigRes.data : []));
            setShifts(shiftRes.data.results || (Array.isArray(shiftRes.data) ? shiftRes.data : []));
        } catch (err: any) {
            console.error("Failed to load dependencies", err);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;
        if (type === 'checkbox') {
            const checked = (e.target as HTMLInputElement).checked;
            setFormData(prev => ({ ...prev, [name]: checked }));
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        
        const payload = {
            ...formData,
            effective_to: formData.effective_to || null
        };

        try {
            if (requirement && requirement.id) {
                await apiClient.put(`/api/operations/staffing-requirements/${requirement.id}/`, payload);
            } else {
                await apiClient.post('/api/operations/staffing-requirements/', payload);
            }
            onSave();
            onClose();
        } catch (err: any) {
            let msg = 'Failed to save staffing requirement';
            if (err.response?.data) {
                if (typeof err.response.data === 'object') {
                    msg = Object.values(err.response.data).flat().join(' ');
                } else {
                    msg = String(err.response.data);
                }
            }
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={requirement ? 'Edit Staffing Requirement' : 'Add Staffing Requirement'}>
            {error && <div style={{ color: 'red', marginBottom: '16px' }}>{error}</div>}
            
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', gap: '16px' }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label>Service Contract</label>
                        <select name="service_contract" value={formData.service_contract} onChange={handleChange} required>
                            <option value="">Select Contract</option>
                            {contracts.map(c => <option key={c.id} value={c.id}>{c.contract_code}</option>)}
                        </select>
                    </div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label>Operational Site</label>
                        <select name="site" value={formData.site} onChange={handleChange} required>
                            <option value="">Select Site</option>
                            {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '16px' }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label>Designation</label>
                        <select name="designation" value={formData.designation} onChange={handleChange} required>
                            <option value="">Select Designation</option>
                            {designations.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                    </div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label>Shift</label>
                        <select name="shift" value={formData.shift} onChange={handleChange} required>
                            <option value="">Select Shift</option>
                            {shifts.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '16px' }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label>Required Headcount</label>
                        <input type="number" name="required_headcount" min="0" value={formData.required_headcount} onChange={handleChange} required />
                    </div>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '24px' }}>
                        <input type="checkbox" name="is_active" id="is_active" checked={formData.is_active} onChange={handleChange} />
                        <label htmlFor="is_active">Is Active</label>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '16px' }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label>Effective From</label>
                        <input type="date" name="effective_from" value={formData.effective_from} onChange={handleChange} required />
                    </div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label>Effective To (Optional)</label>
                        <input type="date" name="effective_to" value={formData.effective_to} onChange={handleChange} />
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label>Notes</label>
                    <textarea name="notes" value={formData.notes} onChange={handleChange} rows={2} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
                    <Button variant="secondary" onClick={onClose} type="button">Cancel</Button>
                    <Button variant="primary" type="submit" disabled={loading}>
                        {loading ? 'Saving...' : 'Save'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
};
