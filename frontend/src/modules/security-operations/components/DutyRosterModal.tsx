import React, { useState, useEffect } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { apiClient } from '../api';
import { createDutyRoster, updateDutyRoster, getShifts, getSecurityPosts } from '../api';
import type { DutyRoster, OperationalSite, SecurityPost, Shift } from '../types';

interface DutyRosterModalProps {
    isOpen: boolean;
    onClose: () => void;
    site?: OperationalSite | null;
    defaultDate?: string;
    defaultDutyDate?: string;
    defaultSiteId?: string;
    defaultShiftId?: string;
    defaultPostId?: string;
    roster?: DutyRoster | null;
    editingRoster?: DutyRoster | null;
    onSuccess?: () => void;
    onSave?: () => void;
}

export const DutyRosterModal: React.FC<DutyRosterModalProps> = ({
    isOpen,
    onClose,
    site,
    defaultDate,
    defaultDutyDate,
    defaultSiteId,
    defaultShiftId,
    defaultPostId,
    roster,
    editingRoster,
    onSuccess,
    onSave
}) => {
    const activeRoster = roster || editingRoster;
    const effectiveSiteId = site?.id || defaultSiteId || (activeRoster ? activeRoster.site : '');
    const today = new Date().toISOString().split('T')[0];

    const [shifts, setShifts] = useState<Shift[]>([]);
    const [posts, setPosts] = useState<SecurityPost[]>([]);
    const [employees, setEmployees] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [formData, setFormData] = useState({
        duty_date: defaultDutyDate || defaultDate || today,
        shift: defaultShiftId || '',
        post: defaultPostId || '',
        employee: '',
        status: 'SCHEDULED',
        notes: ''
    });

    useEffect(() => {
        if (isOpen && effectiveSiteId) {
            setError(null);
            setFormData({
                duty_date: activeRoster ? activeRoster.duty_date : (defaultDutyDate || defaultDate || today),
                shift: activeRoster ? activeRoster.shift : (defaultShiftId || ''),
                post: activeRoster ? (activeRoster.post || '') : (defaultPostId || ''),
                employee: activeRoster ? activeRoster.employee : '',
                status: activeRoster ? activeRoster.status : 'SCHEDULED',
                notes: activeRoster ? (activeRoster.notes || '') : ''
            });

            Promise.all([
                getShifts({ is_active: true }),
                getSecurityPosts({ site: effectiveSiteId, is_active: true }),
                apiClient.get('/api/hrm/employees/?employment_status=ACTIVE&page_size=200')
            ]).then(([shs, pstsRes, empRes]) => {
                setShifts(shs);
                const postList = pstsRes.results || (Array.isArray(pstsRes) ? pstsRes : []);
                setPosts(postList);
                const empList = empRes.data.results || (Array.isArray(empRes.data) ? empRes.data : []);
                setEmployees(empList);

                if (!activeRoster) {
                    if (shs.length > 0) setFormData(prev => ({ ...prev, shift: prev.shift || shs[0].id }));
                    if (postList.length > 0) setFormData(prev => ({ ...prev, post: prev.post || postList[0].id }));
                    if (empList.length > 0) setFormData(prev => ({ ...prev, employee: prev.employee || empList[0].id }));
                }
            }).catch(e => console.error('Failed to load roster dropdowns', e));
        }
    }, [isOpen, effectiveSiteId, defaultDate, defaultDutyDate, defaultShiftId, defaultPostId, activeRoster, today]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!effectiveSiteId) return;
        setLoading(true);
        setError(null);

        const payload: any = {
            site: effectiveSiteId,
            duty_date: formData.duty_date,
            shift: formData.shift,
            employee: formData.employee,
            status: formData.status,
            notes: formData.notes
        };
        if (formData.post) payload.post = formData.post;

        try {
            if (activeRoster) {
                await updateDutyRoster(activeRoster.id, payload);
            } else {
                await createDutyRoster(payload);
            }
            if (onSuccess) onSuccess();
            if (onSave) onSave();
            onClose();
        } catch (err: any) {
            const errData = err.response?.data;
            let msg = 'Failed to save duty roster';
            if (typeof errData === 'object') {
                if (errData.non_field_errors) {
                    msg = Array.isArray(errData.non_field_errors) ? errData.non_field_errors.join(' ') : String(errData.non_field_errors);
                } else {
                    msg = Object.entries(errData).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(' ') : v}`).join(' | ');
                }
            } else if (errData) {
                msg = String(errData);
            }
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal 
            isOpen={isOpen} 
            onClose={onClose} 
            title={activeRoster ? 'Edit Scheduled Duty' : `Schedule Duty Slot — ${site?.name || 'Site'}`}
        >
            <form onSubmit={handleSubmit} style={{ padding: '16px', maxWidth: '520px', width: '100%', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {error && (
                    <div style={{ padding: '10px 14px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderRadius: '6px', fontSize: '13px' }}>
                        {error}
                    </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <Input 
                        label="Duty Date *" 
                        type="date" 
                        value={formData.duty_date} 
                        onChange={e => setFormData({ ...formData, duty_date: e.target.value })} 
                        required 
                    />
                    <div className="form-field">
                        <label className="form-label" style={{ fontSize: '12px', fontWeight: 600 }}>Shift *</label>
                        <select
                            value={formData.shift}
                            onChange={e => setFormData({ ...formData, shift: e.target.value })}
                            className="input-base"
                            style={{ width: '100%', padding: '8px', fontSize: '13px' }}
                            required
                        >
                            {shifts.map(s => (
                                <option key={s.id} value={s.id}>{s.name} ({s.start_time} - {s.end_time})</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="form-field">
                    <label className="form-label" style={{ fontSize: '12px', fontWeight: 600 }}>Security Post</label>
                    <select
                        value={formData.post}
                        onChange={e => setFormData({ ...formData, post: e.target.value })}
                        className="input-base"
                        style={{ width: '100%', padding: '8px', fontSize: '13px' }}
                    >
                        <option value="">-- General Site Duty (No Post) --</option>
                        {posts.map(p => (
                            <option key={p.id} value={p.id}>{p.post_name} ({p.post_code})</option>
                        ))}
                    </select>
                </div>

                <div className="form-field">
                    <label className="form-label" style={{ fontSize: '12px', fontWeight: 600 }}>Assigned Guard / Employee *</label>
                    <select
                        value={formData.employee}
                        onChange={e => setFormData({ ...formData, employee: e.target.value })}
                        className="input-base"
                        style={{ width: '100%', padding: '8px', fontSize: '13px' }}
                        required
                    >
                        {employees.map(emp => (
                            <option key={emp.id} value={emp.id}>
                                {emp.first_name} {emp.last_name} ({emp.employee_code || emp.id.substring(0, 8)}) - {emp.designation_name || 'Guard'}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="form-field">
                    <label className="form-label" style={{ fontSize: '12px', fontWeight: 600 }}>Status</label>
                    <select
                        value={formData.status}
                        onChange={e => setFormData({ ...formData, status: e.target.value })}
                        className="input-base"
                        style={{ width: '100%', padding: '8px', fontSize: '13px' }}
                    >
                        <option value="SCHEDULED">Scheduled</option>
                        <option value="COMPLETED">Completed</option>
                        <option value="CANCELLED">Cancelled</option>
                    </select>
                </div>

                <Input 
                    label="Operational Notes" 
                    value={formData.notes} 
                    onChange={e => setFormData({ ...formData, notes: e.target.value })} 
                    placeholder="e.g. Assigned to main gate visitor screening" 
                />

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                    <Button variant="secondary" type="button" onClick={onClose} disabled={loading}>
                        Cancel
                    </Button>
                    <Button variant="primary" type="submit" disabled={loading}>
                        {loading ? 'Saving...' : activeRoster ? 'Update Duty' : 'Schedule Duty'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
};
