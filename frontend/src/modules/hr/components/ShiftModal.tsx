import React, { useState, useEffect } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { apiClient } from '../api';
import type { Shift } from '../types';

interface ShiftModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: () => void;
    shift: Shift | null;
}

export const ShiftModal: React.FC<ShiftModalProps> = ({ isOpen, onClose, onSave, shift }) => {
    const [formData, setFormData] = useState<Partial<Shift>>({
        name: '',
        code: '',
        start_time: '09:00',
        end_time: '17:00',
        break_duration: 60,
        is_night_shift: false,
        is_active: true,
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (shift) {
            setFormData(shift);
        } else {
            setFormData({
                name: '',
                code: '',
                start_time: '09:00:00',
                end_time: '17:00:00',
                break_duration: 60,
                is_night_shift: false,
                is_active: true,
            });
        }
        setError(null);
    }, [shift, isOpen]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            if (shift) {
                await apiClient.put(`/api/hrm/shifts/${shift.id}/`, formData);
            } else {
                await apiClient.post('/api/hrm/shifts/', formData);
            }
            onSave();
            onClose();
        } catch (err: any) {
            setError(err.response?.data?.detail || err.message || 'Failed to save shift');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={shift ? "Edit Shift" : "Add Shift"}>
            <form onSubmit={handleSubmit} className="space-y-4">
                {error && <div className="text-red-500 text-sm mb-4">{error}</div>}
                
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Code</label>
                        <input 
                            type="text" 
                            name="code" 
                            value={formData.code || ''} 
                            onChange={handleChange}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500" 
                            required 
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Name</label>
                        <input 
                            type="text" 
                            name="name" 
                            value={formData.name || ''} 
                            onChange={handleChange}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500" 
                            required 
                        />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Start Time</label>
                        <input 
                            type="time" 
                            name="start_time" 
                            value={formData.start_time || ''} 
                            onChange={handleChange}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500" 
                            required 
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">End Time</label>
                        <input 
                            type="time" 
                            name="end_time" 
                            value={formData.end_time || ''} 
                            onChange={handleChange}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500" 
                            required 
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700">Break Duration (minutes)</label>
                    <input 
                        type="number" 
                        name="break_duration" 
                        value={formData.break_duration || ''} 
                        onChange={handleChange}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500" 
                        required 
                    />
                </div>

                <div className="flex items-center space-x-4">
                    <label className="flex items-center space-x-2">
                        <input 
                            type="checkbox" 
                            name="is_night_shift" 
                            checked={formData.is_night_shift || false} 
                            onChange={handleChange}
                            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-sm font-medium text-gray-700">Night Shift</span>
                    </label>

                    <label className="flex items-center space-x-2">
                        <input 
                            type="checkbox" 
                            name="is_active" 
                            checked={formData.is_active ?? true} 
                            onChange={handleChange}
                            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-sm font-medium text-gray-700">Active</span>
                    </label>
                </div>

                <div className="flex justify-end space-x-2 pt-4 border-t">
                    <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>Cancel</Button>
                    <Button type="submit" variant="primary" loading={loading}>Save</Button>
                </div>
            </form>
        </Modal>
    );
};
