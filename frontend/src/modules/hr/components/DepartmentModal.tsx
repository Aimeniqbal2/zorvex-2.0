import React, { useState, useEffect } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { apiClient } from '../api';
import type { Department } from '../types';

interface DepartmentModalProps {
    isOpen: boolean;
    onClose: () => void;
    department: Department | null;
    onSave: () => void;
}

export const DepartmentModal: React.FC<DepartmentModalProps> = ({ isOpen, onClose, department, onSave }) => {
    const [formData, setFormData] = useState<Partial<Department>>({
        name: ''
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<any>(null);

    useEffect(() => {
        if (department) {
            setFormData(department);
        } else {
            setFormData({ name: '' });
        }
        setError(null);
    }, [department, isOpen]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            if (department?.id) {
                await apiClient.patch(`/api/hrm/departments/${department.id}/`, formData);
            } else {
                await apiClient.post('/api/hrm/departments/', formData);
            }
            onSave();
            onClose();
        } catch (err: any) {
            setError(err.response?.data || 'Failed to save department. You may be logged in as a Superadmin without a company context.');
        } finally {
            setLoading(false);
        }
    };

    const renderError = () => {
        if (!error) return null;
        if (typeof error === 'string') return <div style={{ color: 'var(--color-danger)', fontSize: '14px', marginBottom: '12px' }}>{error}</div>;
        return (
            <div style={{ color: 'var(--color-danger)', fontSize: '14px', marginBottom: '12px', background: 'rgba(239, 68, 68, 0.1)', padding: '8px', borderRadius: '4px' }}>
                {Object.entries(error).map(([k, v]) => (
                    <div key={k}><strong>{k === 'non_field_errors' ? '' : k + ':'}</strong> {Array.isArray(v) ? v.join(' ') : String(v)}</div>
                ))}
            </div>
        );
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={department ? "Edit Department" : "New Department"}>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px', minWidth: '300px' }}>
                {renderError()}
                
                <Input
                    label="Name"
                    name="name"
                    value={formData.name || ''}
                    onChange={handleChange}
                    required
                />
                
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
                    <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
                        Cancel
                    </Button>
                    <Button type="submit" variant="primary" disabled={loading}>
                        {loading ? 'Saving...' : 'Save'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
};
