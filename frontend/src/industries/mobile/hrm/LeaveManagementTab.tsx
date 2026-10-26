import React, { useState, useEffect } from 'react';
import { mobileHrmApi } from './mobileHrmApi';
import type { EmployeeLeaveRequest } from './types';

export const LeaveManagementTab: React.FC = () => {
    const [leaves, setLeaves] = useState<EmployeeLeaveRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('ALL');
    const [search, setSearch] = useState('');
    const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
    const [adminNotesModalLeave, setAdminNotesModalLeave] = useState<{ id: string; name: string; type: 'APPROVE' | 'REJECT' } | null>(null);
    const [notesText, setNotesText] = useState('');
    const [toastMessage, setToastMessage] = useState<string | null>(null);

    const loadLeaves = async () => {
        try {
            setLoading(true);
            const data = await mobileHrmApi.getLeaveRequests();
            setLeaves(data);
        } catch (err) {
            console.error('Failed to load leave requests:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadLeaves();
    }, []);

    const showToast = (msg: string) => {
        setToastMessage(msg);
        setTimeout(() => setToastMessage(null), 4500);
    };

    const handleConfirmAction = async () => {
        if (!adminNotesModalLeave) return;
        const { id, name, type } = adminNotesModalLeave;
        try {
            setActionLoadingId(id);
            if (type === 'APPROVE') {
                const updated = await mobileHrmApi.approveLeaveRequest(id, notesText);
                setLeaves(prev => prev.map(l => l.id === updated.id ? updated : l));
                showToast(`✓ Leave approved for ${name}! Attendance grid automatically updated for that date.`);
            } else {
                const updated = await mobileHrmApi.rejectLeaveRequest(id, notesText);
                setLeaves(prev => prev.map(l => l.id === updated.id ? updated : l));
                showToast(`✕ Leave request for ${name} marked as rejected.`);
            }
            setAdminNotesModalLeave(null);
            setNotesText('');
        } catch (err) {
            alert('Failed to process leave request.');
        } finally {
            setActionLoadingId(null);
        }
    };

    const pendingCount = leaves.filter(l => l.status === 'PENDING').length;
    const approvedCount = leaves.filter(l => l.status === 'APPROVED').length;
    const rejectedCount = leaves.filter(l => l.status === 'REJECTED').length;

    const filtered = leaves.filter(l => {
        if (statusFilter !== 'ALL' && l.status !== statusFilter) return false;
        if (search) {
            const q = search.toLowerCase();
            return (
                l.employee_name.toLowerCase().includes(q) ||
                l.employee_code.toLowerCase().includes(q) ||
                l.reason.toLowerCase().includes(q)
            );
        }
        return true;
    });

    const getLeaveTypeBadge = (type: string) => {
        switch (type) {
            case 'HALF_DAY':
                return { bg: '#eff6ff', text: '#1d4ed8', label: 'Half Day / Lab Relief (DA)' };
            case 'CASUAL':
                return { bg: '#fef3c7', text: '#b45309', label: 'Casual Leave (HA)' };
            case 'SICK':
                return { bg: '#fee2e2', text: '#b91c1c', label: 'Sick / Medical Leave (HA)' };
            case 'EMERGENCY':
                return { bg: '#fce7f3', text: '#be185d', label: 'Emergency Leave (HA)' };
            default:
                return { bg: '#f1f5f9', text: '#475569', label: type };
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '24px' }}>
            {/* Toast Notification */}
            {toastMessage && (
                <div style={{
                    position: 'fixed',
                    top: '20px',
                    right: '24px',
                    zIndex: 9999,
                    background: '#0f172a',
                    color: '#ffffff',
                    padding: '12px 20px',
                    borderRadius: '10px',
                    boxShadow: '0 10px 25px -5px rgba(0,0,0,0.3)',
                    fontSize: '13.5px',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    animation: 'fadeIn 0.2s ease'
                }}>
                    <i className="bx bx-check-circle" style={{ fontSize: '20px', color: '#4ade80' }} />
                    {toastMessage}
                </div>
            )}

            {/* Metrics Overview Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                <div style={{
                    background: 'var(--color-surface, #ffffff)',
                    padding: '18px 20px',
                    borderRadius: '12px',
                    border: '1px solid var(--color-border, #e2e8f0)',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                }}>
                    <div style={{ fontSize: '13px', color: '#64748b', fontWeight: 600 }}>Total Leave Requests</div>
                    <div style={{ fontSize: '26px', fontWeight: 800, color: 'var(--color-text, #0f172a)', marginTop: '4px' }}>
                        {leaves.length}
                    </div>
                </div>

                <div style={{
                    background: 'var(--color-surface, #ffffff)',
                    padding: '18px 20px',
                    borderRadius: '12px',
                    border: pendingCount > 0 ? '1px solid #f59e0b' : '1px solid var(--color-border, #e2e8f0)',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                }}>
                    <div style={{ fontSize: '13px', color: '#b45309', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {pendingCount > 0 && <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }} />}
                        Pending Admin Approval
                    </div>
                    <div style={{ fontSize: '26px', fontWeight: 800, color: '#b45309', marginTop: '4px' }}>
                        {pendingCount}
                    </div>
                </div>

                <div style={{
                    background: 'var(--color-surface, #ffffff)',
                    padding: '18px 20px',
                    borderRadius: '12px',
                    border: '1px solid var(--color-border, #e2e8f0)',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                }}>
                    <div style={{ fontSize: '13px', color: '#15803d', fontWeight: 600 }}>Approved & Synced</div>
                    <div style={{ fontSize: '26px', fontWeight: 800, color: '#15803d', marginTop: '4px' }}>
                        {approvedCount}
                    </div>
                </div>

                <div style={{
                    background: 'var(--color-surface, #ffffff)',
                    padding: '18px 20px',
                    borderRadius: '12px',
                    border: '1px solid var(--color-border, #e2e8f0)',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                }}>
                    <div style={{ fontSize: '13px', color: '#b91c1c', fontWeight: 600 }}>Rejected Requests</div>
                    <div style={{ fontSize: '26px', fontWeight: 800, color: '#b91c1c', marginTop: '4px' }}>
                        {rejectedCount}
                    </div>
                </div>
            </div>

            {/* Filter and Search Bar */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '16px',
                background: 'var(--color-surface, #ffffff)',
                padding: '14px 20px',
                borderRadius: '12px',
                border: '1px solid var(--color-border, #e2e8f0)'
            }}>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const).map(st => (
                        <button
                            key={st}
                            type="button"
                            onClick={() => setStatusFilter(st)}
                            style={{
                                padding: '6px 14px',
                                borderRadius: '8px',
                                border: '1px solid',
                                borderColor: statusFilter === st ? 'var(--color-primary, #2563eb)' : '#e2e8f0',
                                background: statusFilter === st ? 'var(--color-primary, #2563eb)' : '#ffffff',
                                color: statusFilter === st ? '#ffffff' : '#475569',
                                fontWeight: statusFilter === st ? 600 : 500,
                                fontSize: '13px',
                                cursor: 'pointer',
                                transition: 'all 0.15s'
                            }}
                        >
                            {st === 'ALL' ? 'All Requests' : st.charAt(0) + st.slice(1).toLowerCase()}
                        </button>
                    ))}
                </div>

                <div style={{ position: 'relative', minWidth: '260px' }}>
                    <i className="bx bx-search" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                    <input
                        type="text"
                        placeholder="Search staff, code, or reason..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '8px 12px 8px 36px',
                            borderRadius: '8px',
                            border: '1px solid #cbd5e1',
                            fontSize: '13.5px',
                            outline: 'none'
                        }}
                    />
                </div>
            </div>

            {/* Requests Table */}
            <div style={{
                background: 'var(--color-surface, #ffffff)',
                borderRadius: '12px',
                border: '1px solid var(--color-border, #e2e8f0)',
                overflow: 'hidden',
                boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
            }}>
                {loading ? (
                    <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>
                        <i className="bx bx-loader-alt bx-spin" style={{ fontSize: '32px', marginBottom: '8px' }} />
                        <div>Loading Leave Requests...</div>
                    </div>
                ) : filtered.length === 0 ? (
                    <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>
                        <i className="bx bx-calendar-x" style={{ fontSize: '40px', marginBottom: '8px' }} />
                        <div style={{ fontSize: '15px', fontWeight: 600, color: '#475569' }}>No leave requests found</div>
                        <div style={{ fontSize: '13px', marginTop: '4px' }}>Staff submitted leave & relief requests will appear here for management approval.</div>
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13.5px' }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: 600 }}>
                                    <th style={{ padding: '12px 16px' }}>Staff Member</th>
                                    <th style={{ padding: '12px 16px' }}>Department</th>
                                    <th style={{ padding: '12px 16px' }}>Leave Type</th>
                                    <th style={{ padding: '12px 16px' }}>Request Date</th>
                                    <th style={{ padding: '12px 16px' }}>Reason / Lab Relief</th>
                                    <th style={{ padding: '12px 16px' }}>Status</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'center' }}>Admin Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(req => {
                                    const badge = getLeaveTypeBadge(req.leave_type);
                                    return (
                                        <tr key={req.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: '14px 16px' }}>
                                                <div style={{ fontWeight: 700, color: '#0f172a' }}>{req.employee_name}</div>
                                                <div style={{ fontSize: '12px', color: '#64748b' }}>{req.employee_code}</div>
                                            </td>
                                            <td style={{ padding: '14px 16px', color: '#334155' }}>
                                                {req.department_display || 'Mobile Lab'}
                                            </td>
                                            <td style={{ padding: '14px 16px' }}>
                                                <span style={{
                                                    display: 'inline-block',
                                                    padding: '3px 10px',
                                                    borderRadius: '6px',
                                                    background: badge.bg,
                                                    color: badge.text,
                                                    fontSize: '12px',
                                                    fontWeight: 600
                                                }}>
                                                    {badge.label}
                                                </span>
                                            </td>
                                            <td style={{ padding: '14px 16px', fontWeight: 600, color: '#0f172a' }}>
                                                {req.request_date}
                                                {req.advance_notice_days > 0 && (
                                                    <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 400 }}>
                                                        {req.advance_notice_days}d advance notice
                                                    </div>
                                                )}
                                            </td>
                                            <td style={{ padding: '14px 16px', maxWidth: '280px', color: '#334155', lineHeight: 1.4 }}>
                                                {req.reason}
                                                {req.admin_notes && (
                                                    <div style={{ fontSize: '12px', color: '#0284c7', marginTop: '4px', fontStyle: 'italic' }}>
                                                        Admin: {req.admin_notes}
                                                    </div>
                                                )}
                                            </td>
                                            <td style={{ padding: '14px 16px' }}>
                                                <span style={{
                                                    display: 'inline-block',
                                                    padding: '3px 10px',
                                                    borderRadius: '12px',
                                                    fontSize: '12px',
                                                    fontWeight: 700,
                                                    background:
                                                        req.status === 'APPROVED' ? '#dcfce7' :
                                                        req.status === 'REJECTED' ? '#fee2e2' : '#fef3c7',
                                                    color:
                                                        req.status === 'APPROVED' ? '#15803d' :
                                                        req.status === 'REJECTED' ? '#b91c1c' : '#b45309'
                                                }}>
                                                    {req.status_display || req.status}
                                                </span>
                                            </td>
                                            <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                                                {req.status === 'PENDING' ? (
                                                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                                                        <button
                                                            type="button"
                                                            onClick={() => setAdminNotesModalLeave({ id: req.id, name: req.employee_name, type: 'APPROVE' })}
                                                            disabled={actionLoadingId === req.id}
                                                            style={{
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '4px',
                                                                padding: '6px 12px',
                                                                borderRadius: '6px',
                                                                border: 'none',
                                                                background: '#16a34a',
                                                                color: '#ffffff',
                                                                fontSize: '12.5px',
                                                                fontWeight: 600,
                                                                cursor: 'pointer'
                                                            }}
                                                        >
                                                            <i className="bx bx-check" />
                                                            Approve
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setAdminNotesModalLeave({ id: req.id, name: req.employee_name, type: 'REJECT' })}
                                                            disabled={actionLoadingId === req.id}
                                                            style={{
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '4px',
                                                                padding: '6px 12px',
                                                                borderRadius: '6px',
                                                                border: '1px solid #fca5a5',
                                                                background: '#fff',
                                                                color: '#dc2626',
                                                                fontSize: '12.5px',
                                                                fontWeight: 600,
                                                                cursor: 'pointer'
                                                            }}
                                                        >
                                                            <i className="bx bx-x" />
                                                            Reject
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                                                        Processed
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Approval / Rejection Notes Modal */}
            {adminNotesModalLeave && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(15, 23, 42, 0.6)',
                    backdropFilter: 'blur(3px)',
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
                        maxWidth: '480px',
                        padding: '24px',
                        boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)'
                    }}>
                        <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: '#0f172a' }}>
                            {adminNotesModalLeave.type === 'APPROVE' ? 'Approve Leave Request' : 'Reject Leave Request'}
                        </h3>
                        <p style={{ margin: '6px 0 16px 0', fontSize: '13px', color: '#64748b' }}>
                            {adminNotesModalLeave.type === 'APPROVE'
                                ? `Approving this leave will automatically update ${adminNotesModalLeave.name}'s attendance grid (marked 'DA' or 'HA') and sync the payroll record.`
                                : `Rejecting leave request for ${adminNotesModalLeave.name}. You may provide remarks below.`
                            }
                        </p>

                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: '#334155' }}>
                                Admin Notes / Remarks (Optional)
                            </label>
                            <textarea
                                rows={3}
                                value={notesText}
                                onChange={e => setNotesText(e.target.value)}
                                placeholder="e.g. Relief technician arranged at workstation / Approved by Director"
                                style={{
                                    width: '100%',
                                    padding: '8px 12px',
                                    borderRadius: '8px',
                                    border: '1px solid #cbd5e1',
                                    fontSize: '13px',
                                    outline: 'none'
                                }}
                            />
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                            <button
                                type="button"
                                onClick={() => { setAdminNotesModalLeave(null); setNotesText(''); }}
                                style={{
                                    padding: '8px 16px',
                                    background: '#f1f5f9',
                                    border: '1px solid #cbd5e1',
                                    borderRadius: '8px',
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    cursor: 'pointer'
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmAction}
                                disabled={actionLoadingId !== null}
                                style={{
                                    padding: '8px 18px',
                                    background: adminNotesModalLeave.type === 'APPROVE' ? '#16a34a' : '#dc2626',
                                    color: '#ffffff',
                                    border: 'none',
                                    borderRadius: '8px',
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    cursor: 'pointer'
                                }}
                            >
                                {actionLoadingId !== null
                                    ? 'Processing...'
                                    : (adminNotesModalLeave.type === 'APPROVE' ? 'Confirm Approval & Mark Attendance' : 'Confirm Rejection')
                                }
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
