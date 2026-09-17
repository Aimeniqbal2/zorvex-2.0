import React, { useState, useEffect } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { apiClient } from '../api';
import type { Designation } from '../types';

interface DesignationModalProps {
    isOpen: boolean;
    onClose: () => void;
    designation: Designation | null;
    onSave: () => void;
}

export const DesignationModal: React.FC<DesignationModalProps> = ({ isOpen, onClose, designation, onSave }) => {
    const [formData, setFormData] = useState<Partial<Designation>>({
        name: '',
        code: ''
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<any>(null);

    useEffect(() => {
        if (designation) {
            setFormData(designation);
        } else {
            setFormData({ name: '', code: '' });
        }
        setError(null);
    }, [designation, isOpen]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            if (designation?.id) {
                await apiClient.patch(`/api/hrm/designations/${designation.id}/`, formData);
            } else {
                await apiClient.post('/api/hrm/designations/', formData);
            }
            onSave();
            onClose();
        } catch (err: any) {
            setError(err.response?.data || 'Failed to save designation. You may be logged in as a Superadmin without a company context.');
        } finally {
            setLoading(false);
        }
    };

    const renderError = () => {
        if (!error) return null;
        if (typeof error === 'string') return <div style={{ color: 'var(--color-danger)', fontSize: '14px', marginBottom: '12px' }}>{error}</div>;
        return (
            <div style={{ color: 'var(--color-danger)', fontSize: '14px', marginBottom: '12px', background: 'var(--color-danger-light)', padding: '8px', borderRadius: '4px' }}>
                {Object.entries(error).map(([k, v]) => (
                    <div key={k}><strong>{k === 'non_field_errors' ? '' : k + ':'}</strong> {Array.isArray(v) ? v.join(' ') : String(v)}</div>
                ))}
            </div>
        );
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={designation ? 'Edit Designation' : 'New Designation'}>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px' }}>
                {renderError()}
                
                <Input
                    label="Name *"
                    name="name"
                    value={formData.name || ''}
                    onChange={handleChange}
                    required
                />
                
                <Input
                    label="Code"
                    name="code"
                    value={formData.code || ''}
                    onChange={handleChange}
                />

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
                    <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button type="submit" variant="primary" loading={loading}>Save</Button>
                </div>
            </form>
        </Modal>
    );
};
