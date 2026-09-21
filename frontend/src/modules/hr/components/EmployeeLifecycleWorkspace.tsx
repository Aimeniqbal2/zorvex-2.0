import React, { useState, useEffect } from 'react';
import { apiClient } from '../api';
import type { Employee, Designation, Department, UnifiedTimelineItem } from '../types';
import { Button } from '../../../components/ui/Button';

interface EmployeeLifecycleWorkspaceProps {
    employee: Employee;
    designations: Designation[];
    departments: Department[];
    onRefresh: () => void;
    isSecurity?: boolean;
}

type ActionType = 
    | 'PROMOTE' 
    | 'CHANGE_DEPT' 
    | 'CHANGE_CLASS' 
    | 'REVISE_SALARY' 
    | 'TRANSFER' 
    | 'RELIEVE' 
    | 'SUSPEND' 
    | 'REINSTATE' 
    | 'RESIGN' 
    | 'TERMINATE' 
    | 'RESOLVE_JUMP' 
    | 'REHIRE';

export const EmployeeLifecycleWorkspace: React.FC<EmployeeLifecycleWorkspaceProps> = ({
    employee,
    designations,
    departments,
    onRefresh,
    isSecurity = false
}) => {
    const [timeline, setTimeline] = useState<UnifiedTimelineItem[]>([]);
    const [loadingTimeline, setLoadingTimeline] = useState(false);
    const [sites, setSites] = useState<any[]>([]);

    // Action dialog state
    const [activeAction, setActiveAction] = useState<ActionType | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);

    // Form inputs
    const [formData, setFormData] = useState<Record<string, any>>({});

    const fetchTimeline = async () => {
        if (!employee?.id) return;
        setLoadingTimeline(true);
        try {
            const res = await apiClient.get(`/api/hrm/employees/${employee.id}/timeline/`);
            setTimeline(res.data || []);
        } catch (err) {
            console.error('Failed to load timeline', err);
        } finally {
            setLoadingTimeline(false);
        }
    };

    const fetchSites = async () => {
        try {
            const res = await apiClient.get('/api/operations/sites/?page_size=100');
            setSites(res.data.results || (Array.isArray(res.data) ? res.data : []));
        } catch (err) {
            console.error('Failed to load sites', err);
        }
    };

    useEffect(() => {
        fetchTimeline();
        if (isSecurity) {
            fetchSites();
        }
    }, [employee.id, isSecurity]);

    useEffect(() => {
        if (!isSecurity && (activeAction === 'TRANSFER' || activeAction === 'RELIEVE' || activeAction === 'RESOLVE_JUMP' || activeAction === 'CHANGE_CLASS')) {
            setActiveAction(null);
        }
    }, [isSecurity, activeAction]);

    const openAction = (action: ActionType) => {
        setActionError(null);
        setActiveAction(action);
        const today = new Date().toISOString().split('T')[0];

        switch (action) {
            case 'PROMOTE':
                setFormData({
                    new_designation: employee.designation || '',
                    effective_date: today,
                    is_promotion: true,
                    reason: '',
                    notes: ''
                });
                break;
            case 'CHANGE_DEPT':
                setFormData({
                    new_department: employee.department || '',
                    effective_date: today,
                    reason: '',
                    notes: ''
                });
                break;
            case 'CHANGE_CLASS':
                setFormData({
                    new_classification: employee.classification === 'DIRECT' ? 'INDIRECT' : 'DIRECT',
                    effective_date: today,
                    reason: '',
                    notes: ''
                });
                break;
            case 'REVISE_SALARY':
                setFormData({
                    base_salary: '',
                    daily_rate: '',
                    single_ot_rate: '0',
                    double_ot_rate: '0',
                    effective_date: today,
                    reason: '',
                    notes: ''
                });
                break;
            case 'TRANSFER':
                setFormData({
                    new_site: '',
                    start_date: today,
                    relief_reason: '',
                    notes: ''
                });
                break;
            case 'RELIEVE':
                setFormData({
                    relieved_date: today,
                    relief_reason: '',
                    notes: ''
                });
                break;
            case 'SUSPEND':
                setFormData({
                    effective_date: today,
                    reason: '',
                    notes: ''
                });
                break;
            case 'REINSTATE':
                setFormData({
                    effective_date: today,
                    reason: '',
                    notes: ''
                });
                break;
            case 'RESIGN':
                setFormData({
                    resignation_date: today,
                    last_working_date: today,
                    reason: '',
                    notice_details: '',
                    notes: ''
                });
                break;
            case 'TERMINATE':
                setFormData({
                    effective_date: today,
                    reason: '',
                    category: 'MISCONDUCT',
                    notes: ''
                });
                break;
            case 'RESOLVE_JUMP':
                setFormData({
                    outcome: 'REINSTATED',
                    effective_date: today,
                    reason: '',
                    notes: ''
                });
                break;
            case 'REHIRE':
                setFormData({
                    rehire_date: today,
                    designation: employee.designation || '',
                    department: employee.department || '',
                    classification: employee.classification || 'DIRECT',
                    base_salary: '',
                    daily_rate: '',
                    notes: ''
                });
                break;
        }
    };

    const handleFormSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!activeAction || !employee.id) return;
        setSubmitting(true);
        setActionError(null);

        try {
            let endpoint = '';
            const payload = { ...formData };

            switch (activeAction) {
                case 'PROMOTE':
                    endpoint = `/api/hrm/employees/${employee.id}/promote/`;
                    break;
                case 'CHANGE_DEPT':
                    endpoint = `/api/hrm/employees/${employee.id}/change-department/`;
                    break;
                case 'CHANGE_CLASS':
                    endpoint = `/api/hrm/employees/${employee.id}/change-classification/`;
                    break;
                case 'REVISE_SALARY':
                    endpoint = `/api/hrm/employees/${employee.id}/revise-salary/`;
                    break;
                case 'TRANSFER':
                    endpoint = `/api/hrm/employees/${employee.id}/transfer/`;
                    break;
                case 'RELIEVE':
                    endpoint = `/api/hrm/employees/${employee.id}/relieve/`;
                    break;
                case 'SUSPEND':
                    endpoint = `/api/hrm/employees/${employee.id}/suspend/`;
                    break;
                case 'REINSTATE':
                    endpoint = `/api/hrm/employees/${employee.id}/reinstate/`;
                    break;
                case 'RESIGN':
                    endpoint = `/api/hrm/employees/${employee.id}/resign/`;
                    break;
                case 'TERMINATE':
                    endpoint = `/api/hrm/employees/${employee.id}/terminate/`;
                    break;
                case 'RESOLVE_JUMP':
                    endpoint = `/api/hrm/employees/${employee.id}/resolve-jump/`;
                    break;
                case 'REHIRE':
                    endpoint = `/api/hrm/employees/${employee.id}/rehire/`;
                    break;
            }

            await apiClient.post(endpoint, payload);
            setActiveAction(null);
            fetchTimeline();
            onRefresh();
        } catch (err: any) {
            const msg = err.response?.data?.error || 
                (typeof err.response?.data === 'object' ? JSON.stringify(err.response.data) : 'Action failed');
            setActionError(msg);
        } finally {
            setSubmitting(false);
        }
    };

    const getStatusBadge = (st: string) => {
        switch (st) {
            case 'ACTIVE':
                return <span className="badge badge-success" style={{ fontSize: '12px', padding: '4px 10px' }}>ACTIVE</span>;
            case 'SUSPENDED':
                return <span className="badge badge-warning" style={{ fontSize: '12px', padding: '4px 10px', background: '#d97706', color: '#fff' }}>SUSPENDED</span>;
            case 'RESIGNED':
                return <span className="badge badge-danger" style={{ fontSize: '12px', padding: '4px 10px' }}>RESIGNED</span>;
            case 'TERMINATED':
                return <span className="badge badge-danger" style={{ fontSize: '12px', padding: '4px 10px', background: '#b91c1c' }}>TERMINATED</span>;
            case 'JUMP':
                return <span className="badge" style={{ fontSize: '12px', padding: '4px 10px', background: '#7c3aed', color: '#fff' }}>JUMP (ABSENT)</span>;
            default:
                return <span className="badge badge-secondary" style={{ fontSize: '12px', padding: '4px 10px' }}>{st || 'INACTIVE'}</span>;
        }
    };

    const getEventBadge = (eventType: string) => {
        switch (eventType) {
            case 'PROMOTION':
            case 'DESIGNATION_CHANGE':
                return <span className="badge badge-primary">Promotion / Role</span>;
            case 'SALARY_REVISION':
                return <span className="badge badge-success">Salary Revision</span>;
            case 'TRANSFER':
            case 'DEPLOYMENT_START':
                return <span className="badge badge-primary">Transfer / Deployed</span>;
            case 'RELIEF':
            case 'DEPLOYMENT_RELIEF':
                return <span className="badge badge-warning">Relieved</span>;
            case 'SUSPENSION':
                return <span className="badge" style={{ background: '#d97706', color: '#fff' }}>Suspended</span>;
            case 'REINSTATEMENT':
                return <span className="badge badge-success">Reinstated</span>;
            case 'RESIGNATION':
            case 'TERMINATION':
                return <span className="badge badge-danger">Separation</span>;
            case 'JUMP_TRIGGERED':
            case 'JUMP_OUTCOME':
                return <span className="badge" style={{ background: '#7c3aed', color: '#fff' }}>JUMP</span>;
            case 'REHIRE':
                return <span className="badge badge-success" style={{ background: '#059669', color: '#fff' }}>Rehire</span>;
            default:
                return <span className="badge badge-secondary">{eventType}</span>;
        }
    };

    const isSeparated = ['RESIGNED', 'TERMINATED', 'INACTIVE'].includes(employee.employment_status);
    const isSuspended = employee.employment_status === 'SUSPENDED';
    const isJump = employee.employment_status === 'JUMP';
    const isActive = employee.employment_status === 'ACTIVE';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Status & Quick Stats Banner */}
            <div style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: '8px',
                padding: '16px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '12px',
                alignItems: 'center'
            }}>
                <div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Current Status</div>
                    <div style={{ marginTop: '4px' }}>{getStatusBadge(employee.employment_status)}</div>
                </div>
                <div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Designation</div>
                    <div style={{ fontSize: '14px', fontWeight: 600 }}>{employee.designation_name || '—'}</div>
                </div>
                <div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Department</div>
                    <div style={{ fontSize: '14px', fontWeight: 600 }}>{employee.department_name || '—'}</div>
                </div>
                {isSecurity ? (
                    <div>
                        <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Classification</div>
                        <div style={{ fontSize: '14px', fontWeight: 600 }}>
                            <span className={`badge ${employee.classification === 'DIRECT' ? 'badge-primary' : 'badge-secondary'}`}>
                                {employee.classification === 'DIRECT' ? 'Direct (Field Guard)' : 'Indirect (Office)'}
                            </span>
                        </div>
                    </div>
                ) : (
                    <div>
                        <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Employee Type</div>
                        <div style={{ fontSize: '14px', fontWeight: 600 }}>
                            <span className="badge badge-secondary">
                                {employee.classification === 'DIRECT' ? 'Field Staff' : 'Office Staff'}
                            </span>
                        </div>
                    </div>
                )}
                <div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Joining Date</div>
                    <div style={{ fontSize: '13px' }}>{employee.hire_date || employee.joining_date || '—'}</div>
                </div>
                {employee.rehire_date && (
                    <div>
                        <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Last Rehired</div>
                        <div style={{ fontSize: '13px', color: '#059669', fontWeight: 600 }}>{employee.rehire_date}</div>
                    </div>
                )}
            </div>

            {/* Lifecycle Quick Actions Bar */}
            <div style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: '8px',
                padding: '12px 16px'
            }}>
                <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '8px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
                    Available Lifecycle Actions
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {isActive && (
                        <>
                            <Button size="sm" variant="secondary" onClick={() => openAction('PROMOTE')}>
                                <i className="bx bx-award" style={{ marginRight: '4px' }}></i> Promote / Role
                            </Button>
                            <Button size="sm" variant="secondary" onClick={() => openAction('CHANGE_DEPT')}>
                                <i className="bx bx-buildings" style={{ marginRight: '4px' }}></i> Change Dept
                            </Button>
                            {isSecurity && (
                                <Button size="sm" variant="secondary" onClick={() => openAction('CHANGE_CLASS')}>
                                    <i className="bx bx-transfer-alt" style={{ marginRight: '4px' }}></i> Toggle Class
                                </Button>
                            )}
                            <Button size="sm" variant="secondary" onClick={() => openAction('REVISE_SALARY')}>
                                <i className="bx bx-money" style={{ marginRight: '4px' }}></i> Revise Salary
                            </Button>
                            {isSecurity && (
                                <>
                                    <Button size="sm" variant="secondary" onClick={() => openAction('TRANSFER')}>
                                        <i className="bx bx-map-pin" style={{ marginRight: '4px' }}></i> Transfer Site
                                    </Button>
                                    <Button size="sm" variant="secondary" onClick={() => openAction('RELIEVE')}>
                                        <i className="bx bx-log-out" style={{ marginRight: '4px' }}></i> Relieve Duty
                                    </Button>
                                </>
                            )}
                            <Button size="sm" variant="secondary" onClick={() => openAction('SUSPEND')} style={{ color: '#d97706' }}>
                                <i className="bx bx-pause-circle" style={{ marginRight: '4px' }}></i> Suspend
                            </Button>
                            <Button size="sm" variant="secondary" onClick={() => openAction('RESIGN')} style={{ color: 'var(--color-danger)' }}>
                                <i className="bx bx-exit" style={{ marginRight: '4px' }}></i> Resign
                            </Button>
                            <Button size="sm" variant="secondary" onClick={() => openAction('TERMINATE')} style={{ color: 'var(--color-danger)' }}>
                                <i className="bx bx-x-circle" style={{ marginRight: '4px' }}></i> Terminate
                            </Button>
                        </>
                    )}

                    {isSuspended && (
                        <>
                            <Button size="sm" variant="primary" onClick={() => openAction('REINSTATE')}>
                                <i className="bx bx-play-circle" style={{ marginRight: '4px' }}></i> Reinstate to Active
                            </Button>
                            <Button size="sm" variant="secondary" onClick={() => openAction('TERMINATE')} style={{ color: 'var(--color-danger)' }}>
                                <i className="bx bx-x-circle" style={{ marginRight: '4px' }}></i> Terminate
                            </Button>
                            <Button size="sm" variant="secondary" onClick={() => openAction('RESIGN')}>
                                <i className="bx bx-exit" style={{ marginRight: '4px' }}></i> Resign
                            </Button>
                        </>
                    )}

                    {isJump && isSecurity && (
                        <>
                            <Button size="sm" variant="primary" onClick={() => openAction('RESOLVE_JUMP')}>
                                <i className="bx bx-check-shield" style={{ marginRight: '4px' }}></i> Resolve JUMP Status
                            </Button>
                        </>
                    )}

                    {isSeparated && (
                        <>
                            <Button size="sm" variant="primary" onClick={() => openAction('REHIRE')}>
                                <i className="bx bx-user-plus" style={{ marginRight: '4px' }}></i> Rehire Employee
                            </Button>
                        </>
                    )}
                </div>
            </div>

            {/* Modal / Action Form Box (Rendered when action is selected) */}
            {activeAction && (
                <div style={{
                    background: 'var(--color-background)',
                    border: '1px solid var(--color-primary)',
                    borderRadius: '8px',
                    padding: '16px',
                    animation: 'fadeIn 0.2s ease-in-out'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <i className="bx bx-cog"></i> Execute Lifecycle Action: {activeAction.replace('_', ' ')}
                        </h4>
                        <button
                            type="button"
                            onClick={() => setActiveAction(null)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: 'var(--color-text-secondary)' }}
                        >
                            &times;
                        </button>
                    </div>

                    {actionError && (
                        <div style={{ padding: '8px 12px', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--color-danger)', borderRadius: '4px', fontSize: '13px', marginBottom: '12px' }}>
                            {actionError}
                        </div>
                    )}

                    <form onSubmit={handleFormSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {activeAction === 'PROMOTE' && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 600 }}>New Designation *</label>
                                    <select
                                        value={formData.new_designation || ''}
                                        onChange={e => setFormData({ ...formData, new_designation: e.target.value })}
                                        required
                                        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }}
                                    >
                                        <option value="">-- Select Designation --</option>
                                        {designations.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 600 }}>Effective Date *</label>
                                    <input
                                        type="date"
                                        value={formData.effective_date || ''}
                                        onChange={e => setFormData({ ...formData, effective_date: e.target.value })}
                                        required
                                        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 600 }}>Role Type</label>
                                    <select
                                        value={formData.is_promotion ? 'true' : 'false'}
                                        onChange={e => setFormData({ ...formData, is_promotion: e.target.value === 'true' })}
                                        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }}
                                    >
                                        <option value="true">Promotion</option>
                                        <option value="false">Designation / Role Change</option>
                                    </select>
                                </div>
                            </div>
                        )}

                        {activeAction === 'CHANGE_DEPT' && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 600 }}>New Department *</label>
                                    <select
                                        value={formData.new_department || ''}
                                        onChange={e => setFormData({ ...formData, new_department: e.target.value })}
                                        required
                                        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }}
                                    >
                                        <option value="">-- Select Department --</option>
                                        {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 600 }}>Effective Date *</label>
                                    <input
                                        type="date"
                                        value={formData.effective_date || ''}
                                        onChange={e => setFormData({ ...formData, effective_date: e.target.value })}
                                        required
                                        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }}
                                    />
                                </div>
                            </div>
                        )}

                        {activeAction === 'CHANGE_CLASS' && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 600 }}>New Classification *</label>
                                    <select
                                        value={formData.new_classification || 'DIRECT'}
                                        onChange={e => setFormData({ ...formData, new_classification: e.target.value })}
                                        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }}
                                    >
                                        <option value="DIRECT">DIRECT (Field Guard / Operational)</option>
                                        <option value="INDIRECT">INDIRECT (Office Staff / Management)</option>
                                    </select>
                                </div>
                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 600 }}>Effective Date *</label>
                                    <input
                                        type="date"
                                        value={formData.effective_date || ''}
                                        onChange={e => setFormData({ ...formData, effective_date: e.target.value })}
                                        required
                                        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }}
                                    />
                                </div>
                            </div>
                        )}

                        {activeAction === 'REVISE_SALARY' && (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 600 }}>New Base Salary (PKR) *</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={formData.base_salary || ''}
                                        onChange={e => setFormData({ ...formData, base_salary: e.target.value })}
                                        required
                                        placeholder="e.g. 36000"
                                        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 600 }}>Daily Rate (Optional)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={formData.daily_rate || ''}
                                        onChange={e => setFormData({ ...formData, daily_rate: e.target.value })}
                                        placeholder="Auto if empty"
                                        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 600 }}>Single OT Rate</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={formData.single_ot_rate || ''}
                                        onChange={e => setFormData({ ...formData, single_ot_rate: e.target.value })}
                                        placeholder="150"
                                        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 600 }}>Double OT Rate</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={formData.double_ot_rate || ''}
                                        onChange={e => setFormData({ ...formData, double_ot_rate: e.target.value })}
                                        placeholder="300"
                                        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 600 }}>Effective Date *</label>
                                    <input
                                        type="date"
                                        value={formData.effective_date || ''}
                                        onChange={e => setFormData({ ...formData, effective_date: e.target.value })}
                                        required
                                        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }}
                                    />
                                </div>
                            </div>
                        )}

                        {activeAction === 'TRANSFER' && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 600 }}>Destination Site *</label>
                                    <select
                                        value={formData.new_site || ''}
                                        onChange={e => setFormData({ ...formData, new_site: e.target.value })}
                                        required
                                        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }}
                                    >
                                        <option value="">-- Select Destination Site --</option>
                                        {sites.map(s => <option key={s.id} value={s.id}>{s.name} ({s.code || s.city || 'Site'})</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 600 }}>Transfer Date *</label>
                                    <input
                                        type="date"
                                        value={formData.start_date || ''}
                                        onChange={e => setFormData({ ...formData, start_date: e.target.value })}
                                        required
                                        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 600 }}>Relief Reason</label>
                                    <input
                                        type="text"
                                        value={formData.relief_reason || ''}
                                        onChange={e => setFormData({ ...formData, relief_reason: e.target.value })}
                                        placeholder="Client rotation, operational need..."
                                        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }}
                                    />
                                </div>
                            </div>
                        )}

                        {activeAction === 'RELIEVE' && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 600 }}>Relieved Date *</label>
                                    <input
                                        type="date"
                                        value={formData.relieved_date || ''}
                                        onChange={e => setFormData({ ...formData, relieved_date: e.target.value })}
                                        required
                                        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 600 }}>Relief Reason</label>
                                    <input
                                        type="text"
                                        value={formData.relief_reason || ''}
                                        onChange={e => setFormData({ ...formData, relief_reason: e.target.value })}
                                        placeholder="Site contract ended, temporary withdrawal..."
                                        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }}
                                    />
                                </div>
                            </div>
                        )}

                        {(activeAction === 'SUSPEND' || activeAction === 'REINSTATE') && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 600 }}>Effective Date *</label>
                                    <input
                                        type="date"
                                        value={formData.effective_date || ''}
                                        onChange={e => setFormData({ ...formData, effective_date: e.target.value })}
                                        required
                                        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 600 }}>Formal Reason *</label>
                                    <input
                                        type="text"
                                        value={formData.reason || ''}
                                        onChange={e => setFormData({ ...formData, reason: e.target.value })}
                                        required
                                        placeholder={activeAction === 'SUSPEND' ? 'Disciplinary inquiry, misconduct...' : 'Inquiry completed, reinstatement granted...'}
                                        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }}
                                    />
                                </div>
                            </div>
                        )}

                        {activeAction === 'RESIGN' && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 600 }}>Resignation Date *</label>
                                    <input
                                        type="date"
                                        value={formData.resignation_date || ''}
                                        onChange={e => setFormData({ ...formData, resignation_date: e.target.value })}
                                        required
                                        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 600 }}>Last Working Date</label>
                                    <input
                                        type="date"
                                        value={formData.last_working_date || ''}
                                        onChange={e => setFormData({ ...formData, last_working_date: e.target.value })}
                                        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 600 }}>Notice Details</label>
                                    <input
                                        type="text"
                                        value={formData.notice_details || ''}
                                        onChange={e => setFormData({ ...formData, notice_details: e.target.value })}
                                        placeholder="1 month notice served / payment in lieu"
                                        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }}
                                    />
                                </div>
                            </div>
                        )}

                        {activeAction === 'TERMINATE' && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 600 }}>Termination Date *</label>
                                    <input
                                        type="date"
                                        value={formData.effective_date || ''}
                                        onChange={e => setFormData({ ...formData, effective_date: e.target.value })}
                                        required
                                        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 600 }}>Category *</label>
                                    <select
                                        value={formData.category || 'MISCONDUCT'}
                                        onChange={e => setFormData({ ...formData, category: e.target.value })}
                                        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }}
                                    >
                                        <option value="MISCONDUCT">Misconduct / Breach</option>
                                        <option value="ABSENTEEISM">Chronic Absenteeism / JUMP</option>
                                        <option value="PERFORMANCE">Performance Deficiency</option>
                                        <option value="REDUNDANCY">Operational Redundancy</option>
                                        <option value="OTHER">Other</option>
                                    </select>
                                </div>
                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 600 }}>Reason / Ground *</label>
                                    <input
                                        type="text"
                                        value={formData.reason || ''}
                                        onChange={e => setFormData({ ...formData, reason: e.target.value })}
                                        required
                                        placeholder="Formal grounds for termination"
                                        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }}
                                    />
                                </div>
                            </div>
                        )}

                        {activeAction === 'RESOLVE_JUMP' && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 600 }}>HR Outcome Choice *</label>
                                    <select
                                        value={formData.outcome || 'REINSTATED'}
                                        onChange={e => setFormData({ ...formData, outcome: e.target.value })}
                                        required
                                        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }}
                                    >
                                        <option value="REINSTATED">RETURNED / REINSTATED to Duty</option>
                                        <option value="RESIGNED">Formal Voluntary Resignation</option>
                                        <option value="TERMINATED">Company Termination (Abandonment)</option>
                                        <option value="OTHER">Other Administrative Resolution</option>
                                    </select>
                                </div>
                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 600 }}>Resolution Date *</label>
                                    <input
                                        type="date"
                                        value={formData.effective_date || ''}
                                        onChange={e => setFormData({ ...formData, effective_date: e.target.value })}
                                        required
                                        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 600 }}>Notes / Explanation</label>
                                    <input
                                        type="text"
                                        value={formData.notes || ''}
                                        onChange={e => setFormData({ ...formData, notes: e.target.value })}
                                        placeholder="Medical cert, contact log, summary..."
                                        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }}
                                    />
                                </div>
                            </div>
                        )}

                        {activeAction === 'REHIRE' && (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 600 }}>Rehire Date *</label>
                                    <input
                                        type="date"
                                        value={formData.rehire_date || ''}
                                        onChange={e => setFormData({ ...formData, rehire_date: e.target.value })}
                                        required
                                        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 600 }}>Designation</label>
                                    <select
                                        value={formData.designation || ''}
                                        onChange={e => setFormData({ ...formData, designation: e.target.value })}
                                        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }}
                                    >
                                        <option value="">-- Keep Current / None --</option>
                                        {designations.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 600 }}>Department</label>
                                    <select
                                        value={formData.department || ''}
                                        onChange={e => setFormData({ ...formData, department: e.target.value })}
                                        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }}
                                    >
                                        <option value="">-- Keep Current / None --</option>
                                        {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 600 }}>Base Salary (PKR)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={formData.base_salary || ''}
                                        onChange={e => setFormData({ ...formData, base_salary: e.target.value })}
                                        placeholder="e.g. 35000"
                                        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }}
                                    />
                                </div>
                            </div>
                        )}

                        <div>
                            <label style={{ fontSize: '12px', fontWeight: 600 }}>Notes / Summary</label>
                            <input
                                type="text"
                                value={formData.notes || ''}
                                onChange={e => setFormData({ ...formData, notes: e.target.value })}
                                placeholder="Optional explanatory remarks"
                                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }}
                            />
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                            <Button type="button" variant="secondary" size="sm" onClick={() => setActiveAction(null)}>
                                Cancel
                            </Button>
                            <Button type="submit" variant="primary" size="sm" loading={submitting}>
                                Confirm {activeAction.replace('_', ' ')}
                            </Button>
                        </div>
                    </form>
                </div>
            )}

            {/* Unified Chronological Timeline */}
            <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <i className="bx bx-history"></i> Unified Employment & Career Timeline
                    </h4>
                    <Button size="sm" variant="secondary" onClick={fetchTimeline} loading={loadingTimeline}>
                        <i className="bx bx-refresh"></i> Refresh Timeline
                    </Button>
                </div>

                {loadingTimeline ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                        Loading unified employment timeline...
                    </div>
                ) : timeline.length === 0 ? (
                    <div style={{
                        padding: '24px',
                        textAlign: 'center',
                        background: 'var(--color-surface)',
                        borderRadius: '8px',
                        border: '1px dashed var(--color-border)',
                        color: 'var(--color-text-secondary)'
                    }}>
                        No employment history or deployment events recorded for this employee yet.
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {timeline.map((item) => (
                            <div
                                key={item.id}
                                style={{
                                    display: 'flex',
                                    gap: '12px',
                                    background: 'var(--color-surface)',
                                    border: '1px solid var(--color-border)',
                                    borderRadius: '6px',
                                    padding: '12px 16px',
                                    alignItems: 'flex-start'
                                }}
                            >
                                <div style={{ minWidth: '90px', fontSize: '12px', fontWeight: 600, color: 'var(--color-primary)' }}>
                                    {item.date}
                                </div>
                                <div style={{ minWidth: '130px' }}>
                                    {getEventBadge(item.event_type)}
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 600, fontSize: '13px' }}>
                                        {item.title}
                                    </div>
                                    {item.description && (
                                        <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                                            {item.description}
                                        </div>
                                    )}
                                    {(item.old_value || item.new_value) && (
                                        <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                                            {item.old_value && <span>From: <strong>{item.old_value}</strong> </span>}
                                            {item.new_value && <span>&rarr; To: <strong>{item.new_value}</strong></span>}
                                        </div>
                                    )}
                                </div>
                                {item.actor && (
                                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', textAlign: 'right', minWidth: '100px' }}>
                                        Authorized by:<br />
                                        <strong>{item.actor}</strong>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
