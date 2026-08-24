import React, { useState } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { returnEquipment } from '../api';
import type { EquipmentIssue } from '../types';

interface EquipmentReturnModalProps {
    isOpen: boolean;
    issue: EquipmentIssue;
    onClose: () => void;
    onSave: () => void;
}

export const EquipmentReturnModal: React.FC<EquipmentReturnModalProps> = ({ isOpen, issue, onClose, onSave }) => {
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    const [formData, setFormData] = useState({
        return_condition: issue?.issue_condition || 'Good',
        notes: ''
    });

    const handleChange = (field: keyof typeof formData, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        setError('');
        try {
            await returnEquipment(issue.id, formData.return_condition, formData.notes);
            onSave();
        } catch (err: any) {
            const msg = err.response?.data?.error || err.response?.data?.detail || 'Failed to return equipment';
            if (typeof msg === 'string') {
                setError(msg);
            } else {
                setError(JSON.stringify(msg));
            }
        } finally {
            setSubmitting(false);
        }
    };

    if (!isOpen || !issue) return null;

    return (
        <Modal 
            isOpen={isOpen} 
            onClose={onClose} 
            title="Return Equipment"
        >
            <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                        {error}
                    </div>
                )}
                
                <div className="bg-gray-50 p-3 rounded text-sm text-gray-600 mb-4">
                    <div className="mb-1"><strong>Employee:</strong> {issue.employee_name}</div>
                    <div className="mb-1"><strong>Item:</strong> {issue.item_name} {issue.serial_number ? `(${issue.serial_number})` : ''}</div>
                    <div className="mb-1"><strong>Quantity:</strong> {issue.quantity}</div>
                    <div><strong>Issued At:</strong> {new Date(issue.issued_at).toLocaleString()}</div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Return Condition *
                    </label>
                    <Input
                        value={formData.return_condition}
                        onChange={(e) => handleChange('return_condition', e.target.value)}
                        required
                    />
                </div>
                
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Return Notes
                    </label>
                    <textarea
                        className="w-full border-gray-300 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-2 border"
                        rows={3}
                        value={formData.notes}
                        onChange={(e) => handleChange('notes', e.target.value)}
                    />
                </div>

                <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
                    <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
                        Cancel
                    </Button>
                    <Button type="submit" variant="primary" loading={submitting} disabled={!formData.return_condition}>
                        Confirm Return
                    </Button>
                </div>
            </form>
        </Modal>
    );
};
