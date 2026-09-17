import React, { useState, useEffect } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { apiClient } from '../api';
import type { WorkSchedule, Employee, Shift } from '../types';

interface WorkScheduleModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: () => void;
    schedule: WorkSchedule | null;
}

export const WorkScheduleModal: React.FC<WorkScheduleModalProps> = ({ isOpen, onClose, onSave, schedule }) => {
    const [formData, setFormData] = useState<Partial<WorkSchedule>>({
        employee: '',
        shift: '',
        effective_from: '',
        effective_to: '',
        days_of_week: '0,1,2,3,4,5,6',
        is_active: true,
    });
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            fetchOptions();
        }
    }, [isOpen]);

    useEffect(() => {
        if (schedule) {
            setFormData(schedule);
        } else {
            setFormData({
                employee: '',
                shift: '',
                effective_from: new Date().toISOString().split('T')[0],
                effective_to: '',
                days_of_week: '0,1,2,3,4,5,6',
                is_active: true,
            });
        }
        setError(null);
    }, [schedule, isOpen]);

    const fetchOptions = async () => {
        try {
            const [empRes, shiftRes] = await Promise.all([
                apiClient.get('/api/hrm/employees/'),
                apiClient.get('/api/hrm/shifts/')
            ]);
            setEmployees(empRes.data.results || (Array.isArray(empRes.data) ? empRes.data : []));
            setShifts(shiftRes.data.results || (Array.isArray(shiftRes.data) ? shiftRes.data : []));
        } catch (err: any) {
            console.error("Failed to load options", err);
        }
    };

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
            const payload = { ...formData };
            if (!payload.effective_to) {
                delete payload.effective_to;
            }
            if (schedule) {
                await apiClient.put(`/api/hrm/work_schedules/${schedule.id}/`, payload);
            } else {
                await apiClient.post('/api/hrm/work_schedules/', payload);
            }
            onSave();
            onClose();
        } catch (err: any) {
            setError(err.response?.data?.detail || err.response?.data?.non_field_errors?.[0] || err.message || 'Failed to save schedule');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={schedule ? "Edit Work Schedule" : "Add Work Schedule"}>
            <form onSubmit={handleSubmit} className="space-y-4">
                {error && <div className="text-red-500 text-sm mb-4">{error}</div>}
                
                <div>
                    <label className="block text-sm font-medium text-gray-700">Employee</label>
                    <select 
                        name="employee" 
                        value={formData.employee || ''} 
                        onChange={handleChange}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500" 
                        required 
                    >
                        <option value="">Select Employee...</option>
                        {employees.map(emp => (
                            <option key={emp.id} value={emp.id}>{emp.first_name} {emp.last_name} ({emp.employee_code})</option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700">Shift</label>
                    <select 
                        name="shift" 
                        value={formData.shift || ''} 
                        onChange={handleChange}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500" 
                        required 
                    >
                        <option value="">Select Shift...</option>
                        {shifts.map(shift => (
                            <option key={shift.id} value={shift.id}>{shift.name} ({shift.start_time} - {shift.end_time})</option>
                        ))}
                    </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Effective From</label>
                        <input 
                            type="date" 
                            name="effective_from" 
                            value={formData.effective_from || ''} 
                            onChange={handleChange}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500" 
                            required 
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Effective To (Optional)</label>
                        <input 
                            type="date" 
                            name="effective_to" 
                            value={formData.effective_to || ''} 
                            onChange={handleChange}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500" 
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700">Days of Week (0=Monday, 6=Sunday)</label>
                    <input 
                        type="text" 
                        name="days_of_week" 
                        value={formData.days_of_week || ''} 
                        onChange={handleChange}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500" 
                        required 
                    />
                </div>

                <div className="flex items-center space-x-2">
                    <input 
                        type="checkbox" 
                        name="is_active" 
                        checked={formData.is_active ?? true} 
                        onChange={handleChange}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <label className="text-sm font-medium text-gray-700">Active</label>
                </div>

                <div className="flex justify-end space-x-2 pt-4 border-t">
                    <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>Cancel</Button>
                    <Button type="submit" variant="primary" loading={loading}>Save</Button>
                </div>
            </form>
        </Modal>
    );
};
