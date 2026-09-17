import React, { useState, useEffect } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { apiClient } from '../api';
import type { LeaveRequest, Employee, LeaveType } from '../types';

interface LeaveRequestModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: () => void;
    leaveRequest: LeaveRequest | null;
}

export const LeaveRequestModal: React.FC<LeaveRequestModalProps> = ({ isOpen, onClose, onSave, leaveRequest }) => {
    const [formData, setFormData] = useState<Partial<LeaveRequest>>({
        employee: '',
        leave_type: '',
        start_date: '',
        end_date: '',
        reason: '',
    });
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            fetchOptions();
        }
    }, [isOpen]);

    useEffect(() => {
        if (leaveRequest) {
            setFormData(leaveRequest);
        } else {
            setFormData({
                employee: '',
                leave_type: '',
                start_date: '',
                end_date: '',
                reason: '',
            });
        }
        setError(null);
    }, [leaveRequest, isOpen]);

    const fetchOptions = async () => {
        try {
            const [empRes, ltRes] = await Promise.all([
                apiClient.get('/api/hrm/employees/'),
                apiClient.get('/api/hrm/leave-types/')
            ]);
            setEmployees(empRes.data.results || (Array.isArray(empRes.data) ? empRes.data : []));
            setLeaveTypes(ltRes.data.results || (Array.isArray(ltRes.data) ? ltRes.data : []));
        } catch (err: any) {
            console.error("Failed to load options", err);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            if (leaveRequest) {
                await apiClient.put(`/api/hrm/leave-requests/${leaveRequest.id}/`, formData);
            } else {
                await apiClient.post('/api/hrm/leave-requests/', formData);
            }
            onSave();
            onClose();
        } catch (err: any) {
            setError(err.response?.data?.detail || err.response?.data?.non_field_errors?.[0] || err.message || 'Failed to save leave request');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={leaveRequest ? "Edit Leave Request" : "Request Leave"}>
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
                    <label className="block text-sm font-medium text-gray-700">Leave Type</label>
                    <select 
                        name="leave_type" 
                        value={formData.leave_type || ''} 
                        onChange={handleChange}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500" 
                        required 
                    >
                        <option value="">Select Type...</option>
                        {leaveTypes.map(lt => (
                            <option key={lt.id} value={lt.id}>{lt.name}</option>
                        ))}
                    </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Start Date</label>
                        <input 
                            type="date" 
                            name="start_date" 
                            value={formData.start_date || ''} 
                            onChange={handleChange}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500" 
                            required 
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">End Date</label>
                        <input 
                            type="date" 
                            name="end_date" 
                            value={formData.end_date || ''} 
                            onChange={handleChange}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500" 
                            required 
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700">Reason</label>
                    <textarea 
                        name="reason" 
                        value={formData.reason || ''} 
                        onChange={handleChange}
                        rows={3}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500" 
                    />
                </div>

                <div className="flex justify-end space-x-2 pt-4 border-t">
                    <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>Cancel</Button>
                    <Button type="submit" variant="primary" loading={loading}>Save</Button>
                </div>
            </form>
        </Modal>
    );
};
