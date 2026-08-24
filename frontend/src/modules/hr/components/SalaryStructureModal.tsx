import React, { useState, useEffect } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { apiClient } from '../api';
import type { SalaryStructure, SalaryComponent } from '../types';

interface SalaryStructureModalProps {
    isOpen: boolean;
    onClose: () => void;
    structure?: SalaryStructure | null;
    onSave: () => void;
}

export const SalaryStructureModal: React.FC<SalaryStructureModalProps> = ({
    isOpen,
    onClose,
    structure,
    onSave
}) => {
    const [formData, setFormData] = useState({
        code: '',
        name: '',
        currency: 'PKR',
        effective_from: '',
        is_active: true
    });
    
    // Components inside structure
    const [structureComponents, setStructureComponents] = useState<any[]>([]);
    const [availableComponents, setAvailableComponents] = useState<SalaryComponent[]>([]);
    
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            fetchComponents();
        }
    }, [isOpen]);

    useEffect(() => {
        if (structure) {
            setFormData({
                code: structure.code,
                name: structure.name,
                currency: structure.currency || 'PKR',
                effective_from: structure.effective_from || '',
                is_active: structure.is_active ?? true
            });
            fetchStructureComponents(structure.id);
        } else {
            setFormData({
                code: '',
                name: '',
                currency: 'PKR',
                effective_from: '',
                is_active: true
            });
            setStructureComponents([]);
        }
    }, [structure, isOpen]);

    const fetchComponents = async () => {
        try {
            const res = await apiClient.get('/api/hrm/salary-components/');
            setAvailableComponents(res.data.results || (Array.isArray(res.data) ? res.data : []));
        } catch (err) {
            console.error(err);
        }
    };

    const fetchStructureComponents = async (structureId: string) => {
        try {
            const res = await apiClient.get(`/api/hrm/salary-structure-components/?salary_structure=${structureId}`);
            setStructureComponents(res.data.results || (Array.isArray(res.data) ? res.data : []));
        } catch (err) {
            console.error(err);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        const val = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;
        setFormData(prev => ({ ...prev, [name]: val }));
    };

    const handleAddComponent = () => {
        setStructureComponents(prev => [
            ...prev,
            { salary_component: '', amount: 0, percentage: 0, formula: '', sequence: prev.length + 1 }
        ]);
    };

    const handleUpdateComponent = (index: number, field: string, value: any) => {
        setStructureComponents(prev => {
            const updated = [...prev];
            updated[index] = { ...updated[index], [field]: value };
            return updated;
        });
    };

    const handleRemoveComponent = (index: number) => {
        setStructureComponents(prev => prev.filter((_, i) => i !== index));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            let structId = structure?.id;
            
            // 1. Save Structure
            if (structId) {
                await apiClient.put(`/api/hrm/salary-structures/${structId}/`, formData);
            } else {
                const res = await apiClient.post('/api/hrm/salary-structures/', formData);
                structId = res.data.id;
            }
            
            // 2. Delete and recreate for simplicity in C-2B
            if (structure?.id) {
                const existing = await apiClient.get(`/api/hrm/salary-structure-components/?salary_structure=${structId}`);
                const existArr = existing.data.results || (Array.isArray(existing.data) ? existing.data : []);
                for (const ex of existArr) {
                    await apiClient.delete(`/api/hrm/salary-structure-components/${ex.id}/`);
                }
            }
            
            for (const sc of structureComponents) {
                if (sc.salary_component) {
                    await apiClient.post('/api/hrm/salary-structure-components/', {
                        salary_structure: structId,
                        salary_component: sc.salary_component,
                        amount: sc.amount || 0,
                        percentage: sc.percentage || 0,
                        formula: sc.formula || '',
                        sequence: sc.sequence || 1
                    });
                }
            }
            
            onSave();
            onClose();
        } catch (err: any) {
            setError(err.response?.data?.detail || err.message || 'Error saving structure');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={structure ? 'Edit Structure' : 'Create Structure'}>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {error && <div style={{ color: 'red' }}>{error}</div>}
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <Input label="Code" name="code" value={formData.code} onChange={handleChange} required />
                    <Input label="Name" name="name" value={formData.name} onChange={handleChange} required />
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <Input label="Currency" name="currency" value={formData.currency} onChange={handleChange} required />
                    <Input type="date" label="Effective From" name="effective_from" value={formData.effective_from} onChange={handleChange} required />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input type="checkbox" id="is_active_s" name="is_active" checked={formData.is_active} onChange={handleChange} />
                    <label htmlFor="is_active_s">Is Active</label>
                </div>

                <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', margin: '8px 0' }} />
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h4 style={{ margin: 0 }}>Components</h4>
                    <Button type="button" variant="secondary" onClick={handleAddComponent}>+ Add Component</Button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {structureComponents.map((sc, index) => (
                        <div key={index} style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '8px', border: '1px solid #f3f4f6', borderRadius: '4px' }}>
                            <select 
                                value={sc.salary_component} 
                                onChange={(e) => handleUpdateComponent(index, 'salary_component', e.target.value)}
                                style={{ flex: 1, padding: '8px', borderRadius: '4px', border: '1px solid #d1d5db' }}
                                required
                            >
                                <option value="">Select Component...</option>
                                {availableComponents.map(c => (
                                    <option key={c.id} value={c.id}>{c.name} ({c.calculation_type})</option>
                                ))}
                            </select>
                            
                            <Input 
                                type="number" 
                                placeholder="Amount" 
                                value={sc.amount} 
                                onChange={(e) => handleUpdateComponent(index, 'amount', e.target.value)} 
                            />
                            
                            <Button type="button" variant="secondary" onClick={() => handleRemoveComponent(index)}>X</Button>
                        </div>
                    ))}
                    {structureComponents.length === 0 && <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>No components added yet.</span>}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
                    <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button type="submit" variant="primary" disabled={loading}>
                        {loading ? 'Saving...' : 'Save Structure'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
};
