import React, { useState, useEffect } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { apiClient } from '../api';
import type { DutyAssignment, Deployment } from '../types';

interface DutyAssignmentModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: () => void;
    assignment: DutyAssignment | null;
    /** Pre-select a deployment when opening from the roster/deployment row */
    preselectedDeploymentId?: string;
}

const DUTY_STATUSES = ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'ABSENT', 'CANCELLED'] as const;

export const DutyAssignmentModal: React.FC<DutyAssignmentModalProps> = ({
    isOpen, onClose, onSave, assignment, preselectedDeploymentId
}) => {
    const [deployments, setDeployments] = useState<Deployment[]>([]);
    const [loadingDeployments, setLoadingDeployments] = useState(false);

    const [formData, setFormData] = useState<Partial<DutyAssignment>>({
        deployment: preselectedDeploymentId || '',
        date: '',
        start_time: '',
        end_time: '',
        status: 'SCHEDULED',
        notes: '',
    });

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | Record<string, string[]> | null>(null);

    useEffect(() => {
        if (isOpen) {
            fetchActiveDeployments();
            if (assignment) {
                setFormData({
                    deployment: assignment.deployment,
                    date: assignment.date,
                    start_time: assignment.start_time,
                    end_time: assignment.end_time,
                    status: assignment.status,
                    notes: assignment.notes || '',
                });
            } else {
                setFormData({
                    deployment: preselectedDeploymentId || '',
                    date: new Date().toISOString().split('T')[0],
                    start_time: '',
                    end_time: '',
                    status: 'SCHEDULED',
                    notes: '',
                });
            }
            setError(null);
        }
    }, [isOpen, assignment, preselectedDeploymentId]);

    const fetchActiveDeployments = async () => {
        setLoadingDeployments(true);
        try {
            const res = await apiClient.get('/api/operations/deployments/?page_size=200');
            setDeployments(res.data.results || res.data);
        } catch (err) {
            console.error('Failed to fetch deployments', err);
        } finally {
            setLoadingDeployments(false);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        // Backend auto-fills employee + site from deployment
        const payload = {
            deployment: formData.deployment,
            date: formData.date,
            start_time: formData.start_time,
            end_time: formData.end_time,
            status: formData.status,
            notes: formData.notes || '',
        };

        try {
            if (assignment?.id) {
                await apiClient.patch(`/api/operations/duty-assignments/${assignment.id}/`, payload);
            } else {
                await apiClient.post('/api/operations/duty-assignments/', payload);
            }
            onSave();
            onClose();
        } catch (err: any) {
            const errData = err.response?.data;
            setError(errData || 'Failed to save duty assignment');
        } finally {
            setLoading(false);
        }
    };

    const renderError = () => {
        if (!error) return null;
        if (typeof error === 'string') return <div className="text-red-500 text-sm mb-3">{error}</div>;
        return (
            <div className="text-red-500 text-sm mb-3 bg-red-50 p-2 rounded">
                {Object.entries(error).map(([k, v]) => (
                    <div key={k}><strong>{k === 'non_field_errors' ? '' : k + ':'}</strong> {Array.isArray(v) ? v.join(' ') : String(v)}</div>
                ))}
            </div>
        );
    };

    const isCompleted = assignment?.status === 'COMPLETED';

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={assignment ? 'Edit Duty Assignment' : 'New Duty Assignment'}>
            <form onSubmit={handleSubmit} className="space-y-4 p-4">
                {renderError()}

                {isCompleted && (
                    <div className="text-amber-600 text-sm bg-amber-50 p-2 rounded">
                        ⚠️ Completed duty — core fields are locked.
                    </div>
                )}

                <div className="form-field">
                    <label className="form-label">Deployment <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                    <select
                        name="deployment"
                        value={formData.deployment || ''}
                        onChange={handleChange}
                        className="input-base"
                        required
                        disabled={isCompleted}
                    >
                        <option value="">
                            {loadingDeployments ? 'Loading deployments...' : '— Select Deployment —'}
                        </option>
                        {deployments.map(d => (
                            <option key={d.id} value={d.id}>
                                {d.employee_name || d.employee} @ {d.site_name || d.site}
                                {d.designation_name ? ` [${d.designation_name}]` : ''}
                            </option>
                        ))}
                    </select>
                    <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                        Employee and site are auto-assigned from the selected deployment.
                    </p>
                </div>

                <Input
                    label="Date *"
                    type="date"
                    name="date"
                    value={formData.date || ''}
                    onChange={handleChange}
                    required
                    disabled={isCompleted}
                />

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <Input
                        label="Start Time *"
                        type="time"
                        name="start_time"
                        value={formData.start_time || ''}
                        onChange={handleChange}
                        required
                        disabled={isCompleted}
                    />
                    <Input
                        label="End Time *"
                        type="time"
                        name="end_time"
                        value={formData.end_time || ''}
                        onChange={handleChange}
                        required
                        disabled={isCompleted}
                    />
                </div>

                <div className="form-field">
                    <label className="form-label">Status</label>
                    <select
                        name="status"
                        value={formData.status || 'SCHEDULED'}
                        onChange={handleChange}
                        className="input-base"
                    >
                        {DUTY_STATUSES.map(s => (
                            <option key={s} value={s}>{s.replace('_', ' ')}</option>
                        ))}
                    </select>
                </div>

                <div className="form-field">
                    <label className="form-label">Notes</label>
                    <textarea
                        name="notes"
                        value={formData.notes || ''}
                        onChange={handleChange}
                        className="input-base"
                        rows={2}
                    />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingTop: '16px' }}>
                    <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button type="submit" variant="primary" loading={loading}>
                        {assignment ? 'Save Changes' : 'Assign Duty'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
};
