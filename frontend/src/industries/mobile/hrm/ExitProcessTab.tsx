import React, { useState, useEffect } from 'react';
import { mobileHrmApi } from './mobileHrmApi';
import type { EmployeeExitRequest, ExitClearanceStatusChoice, Technician } from './types';

const CLEARANCE_META: Record<ExitClearanceStatusChoice, { label: string; color: string; bg: string }> = {
    PENDING: { label: 'Notice Period Active', color: '#d97706', bg: '#fef3c7' },
    CLEARANCE: { label: 'Under Clearance', color: '#0284c7', bg: '#e0f2fe' },
    COMPLETED: { label: 'Exit Completed / Relieved', color: '#16a34a', bg: '#dcfce7' },
    WITHDRAWN: { label: 'Withdrawn', color: '#64748b', bg: '#f1f5f9' },
};

export const ExitProcessTab: React.FC = () => {
    const [exitRequests, setExitRequests] = useState<EmployeeExitRequest[]>([]);
    const [technicians, setTechnicians] = useState<Technician[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

    // Form
    const [formData, setFormData] = useState({
        employee: '',
        resignation_date: new Date().toISOString().split('T')[0],
        last_working_day: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        reason: 'Seeking career growth in mobile hardware technology'
    });

    const loadData = async () => {
        try {
            setLoading(true);
            const [exits, techs] = await Promise.all([
                mobileHrmApi.getExitRequests(),
                mobileHrmApi.getTechnicians()
            ]);
            setExitRequests(exits);
            setTechnicians(techs);
            if (techs.length > 0 && !formData.employee) {
                setFormData(prev => ({ ...prev, employee: techs[0].employee }));
            }
        } catch (err) {
            console.error('Failed to load exit requests:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const handleFormSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const created = await mobileHrmApi.createExitRequest(formData);
            setExitRequests(prev => [created, ...prev]);
            setIsAddModalOpen(false);
            alert('Exit and resignation request registered. 1-month notice period tracker started.');
        } catch (err) {
            alert('Failed to register exit request.');
        }
    };

    const handleToggleClearance = async (
        exitReq: EmployeeExitRequest,
        field: 'handover_completed' | 'devices_returned'
    ) => {
        try {
            setActionLoadingId(exitReq.id);
            const val = !exitReq[field];
            const updated = await mobileHrmApi.updateExitClearance(exitReq.id, { [field]: val });
            setExitRequests(prev => prev.map(r => r.id === updated.id ? updated : r));
        } catch (err) {
            alert('Failed to update clearance checklist.');
        } finally {
            setActionLoadingId(null);
        }
    };

    const handleUpdateStatus = async (exitReq: EmployeeExitRequest, newStatus: ExitClearanceStatusChoice) => {
        try {
            setActionLoadingId(exitReq.id);
            const updated = await mobileHrmApi.updateExitClearance(exitReq.id, { clearance_status: newStatus });
            setExitRequests(prev => prev.map(r => r.id === updated.id ? updated : r));
        } catch (err) {
            alert('Failed to update clearance status.');
        } finally {
            setActionLoadingId(null);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', padding: '24px' }}>
            {/* Top Toolbar */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '16px',
                background: 'var(--color-surface, #ffffff)',
                padding: '16px 20px',
                borderRadius: '12px',
                border: '1px solid var(--color-border, #e2e8f0)',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
            }}>
                <div>
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--color-text, #0f172a)' }}>
                        Staff Exit & 1-Month Notice Period Tracker
                    </h3>
                    <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>
                        Notice period countdown, toolset & testing device return clearance, and relieving approvals
                    </p>
                </div>

                <button
                    type="button"
                    onClick={() => setIsAddModalOpen(true)}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '9px 18px',
                        background: '#dc2626',
                        color: '#ffffff',
                        borderRadius: '8px',
                        border: 'none',
                        fontWeight: 600,
                        fontSize: '14px',
                        cursor: 'pointer'
                    }}
                >
                    <i className="bx bx-log-out-circle" />
                    + Log Resignation / Exit
                </button>
            </div>

            {/* Exit List / Cards */}
            {loading ? (
                <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>
                    <i className="bx bx-loader-alt bx-spin" style={{ fontSize: '32px', marginBottom: '8px' }} />
                    <div>Loading exit workflows...</div>
                </div>
            ) : exitRequests.length === 0 ? (
                <div style={{
                    padding: '60px',
                    textAlign: 'center',
                    background: 'var(--color-surface, #ffffff)',
                    borderRadius: '12px',
                    border: '1px dashed var(--color-border, #cbd5e1)'
                }}>
                    <i className="bx bx-check-shield" style={{ fontSize: '48px', color: '#22c55e', marginBottom: '12px' }} />
                    <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--color-text, #1e293b)', margin: '0 0 6px 0' }}>
                        No Active Resignations / Exits
                    </h3>
                    <p style={{ color: '#64748b', fontSize: '14px', margin: '0 0 16px 0' }}>
                        All technicians and staff members are currently active with zero pending notice periods.
                    </p>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: '20px' }}>
                    {exitRequests.map(req => {
                        const statusMeta = CLEARANCE_META[req.clearance_status] || CLEARANCE_META.PENDING;
                        const isActionLoading = actionLoadingId === req.id;

                        return (
                            <div
                                key={req.id}
                                style={{
                                    background: 'var(--color-surface, #ffffff)',
                                    borderRadius: '14px',
                                    border: '1px solid var(--color-border, #e2e8f0)',
                                    padding: '20px',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'space-between',
                                    gap: '16px'
                                }}
                            >
                                <div>
                                    {/* Header */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                                        <div>
                                            <h4 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: '#0f172a' }}>
                                                {req.employee_name}
                                            </h4>
                                            <span style={{ fontSize: '12px', color: '#64748b' }}>
                                                Employee Code: <strong>{req.employee_code}</strong>
                                            </span>
                                        </div>
                                        <span style={{
                                            fontSize: '11px',
                                            fontWeight: 600,
                                            padding: '3px 10px',
                                            borderRadius: '12px',
                                            background: statusMeta.bg,
                                            color: statusMeta.color,
                                            border: `1px solid ${statusMeta.color}30`
                                        }}>
                                            {statusMeta.label}
                                        </span>
                                    </div>

                                    {/* Notice Period Timeline Bar */}
                                    <div style={{
                                        background: '#f8fafc',
                                        padding: '12px 14px',
                                        borderRadius: '8px',
                                        border: '1px solid #f1f5f9',
                                        fontSize: '13px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '6px',
                                        marginBottom: '14px'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span style={{ color: '#64748b' }}>Resignation Date:</span>
                                            <strong>{req.resignation_date}</strong>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span style={{ color: '#64748b' }}>Last Working Day:</span>
                                            <strong style={{ color: '#dc2626' }}>{req.last_working_day}</strong>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
                                            <span style={{ color: '#64748b' }}>Countdown Remaining:</span>
                                            <strong style={{ color: req.days_remaining > 0 ? '#d97706' : '#16a34a' }}>
                                                {req.days_remaining > 0 ? `⏳ ${req.days_remaining} Days Remaining` : '✅ Notice Complete'}
                                            </strong>
                                        </div>
                                    </div>

                                    {/* Reason */}
                                    <div style={{ fontSize: '13px', color: '#334155', marginBottom: '14px' }}>
                                        <span style={{ color: '#64748b' }}>Stated Reason: </span>
                                        "{req.reason}"
                                    </div>

                                    {/* Handover & Clearance Items */}
                                    <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '12px' }}>
                                        <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', marginBottom: '8px' }}>
                                            WORKSHOP CLEARANCE CHECKLIST:
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={req.handover_completed}
                                                    onChange={() => handleToggleClearance(req, 'handover_completed')}
                                                />
                                                <span style={{ color: req.handover_completed ? '#15803d' : '#64748b', fontWeight: req.handover_completed ? 600 : 400 }}>
                                                    Toolkits, Microscopes & Lab Keys Handover
                                                </span>
                                            </label>

                                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={req.devices_returned}
                                                    onChange={() => handleToggleClearance(req, 'devices_returned')}
                                                />
                                                <span style={{ color: req.devices_returned ? '#15803d' : '#64748b', fontWeight: req.devices_returned ? 600 : 400 }}>
                                                    Testing Mobile Phones & IMEIs Returned & Inspected
                                                </span>
                                            </label>
                                        </div>
                                    </div>
                                </div>

                                {/* Status Transitions */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #f1f5f9', paddingTop: '14px' }}>
                                    <span style={{ fontSize: '12px', color: '#64748b' }}>Update Status:</span>
                                    <div style={{ display: 'flex', gap: '6px' }}>
                                        {req.clearance_status !== 'CLEARANCE' && (
                                            <button
                                                type="button"
                                                onClick={() => handleUpdateStatus(req, 'CLEARANCE')}
                                                disabled={isActionLoading}
                                                style={{ padding: '6px 12px', background: '#e0f2fe', color: '#0284c7', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                                            >
                                                Start Clearance
                                            </button>
                                        )}
                                        {req.clearance_status !== 'COMPLETED' && (
                                            <button
                                                type="button"
                                                onClick={() => handleUpdateStatus(req, 'COMPLETED')}
                                                disabled={isActionLoading}
                                                style={{ padding: '6px 14px', background: '#16a34a', color: '#ffffff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                                            >
                                                Approve Exit & Relieve
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Modal */}
            {isAddModalOpen && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(15, 23, 42, 0.6)',
                    backdropFilter: 'blur(4px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 9999,
                    padding: '20px'
                }}>
                    <div style={{
                        background: '#ffffff',
                        borderRadius: '16px',
                        width: '100%',
                        maxWidth: '540px',
                        padding: '28px',
                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h3 style={{ margin: 0, fontSize: '19px', fontWeight: 700, color: '#0f172a' }}>
                                Register Staff Resignation
                            </h3>
                            <button onClick={() => setIsAddModalOpen(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '22px', color: '#64748b' }}>
                                <i className="bx bx-x" />
                            </button>
                        </div>

                        <form onSubmit={handleFormSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Staff Member *</label>
                                <select
                                    value={formData.employee}
                                    onChange={e => setFormData({ ...formData, employee: e.target.value })}
                                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                                >
                                    {technicians.map(t => (
                                        <option key={t.employee} value={t.employee}>
                                            {t.employee_name} ({t.employee_code} - {t.department_display})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Resignation Date</label>
                                    <input
                                        type="date"
                                        required
                                        value={formData.resignation_date}
                                        onChange={e => {
                                            const rDate = new Date(e.target.value);
                                            const lwd = new Date(rDate.getTime() + 30 * 24 * 60 * 60 * 1000);
                                            setFormData({
                                                ...formData,
                                                resignation_date: e.target.value,
                                                last_working_day: lwd.toISOString().split('T')[0]
                                            });
                                        }}
                                        style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Last Working Day (1-Mo)</label>
                                    <input
                                        type="date"
                                        required
                                        value={formData.last_working_day}
                                        onChange={e => setFormData({ ...formData, last_working_day: e.target.value })}
                                        style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                                    />
                                </div>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Reason for Leaving *</label>
                                <textarea
                                    rows={3}
                                    required
                                    value={formData.reason}
                                    onChange={e => setFormData({ ...formData, reason: e.target.value })}
                                    placeholder="Enter resignation reason..."
                                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                                />
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                                <button type="button" onClick={() => setIsAddModalOpen(false)} style={{ padding: '8px 16px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer' }}>
                                    Cancel
                                </button>
                                <button type="submit" style={{ padding: '8px 20px', background: '#dc2626', color: '#ffffff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}>
                                    Confirm Resignation & Start Notice
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
