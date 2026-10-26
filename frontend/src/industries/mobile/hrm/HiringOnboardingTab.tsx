import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../../../auth/authStore';
import { mobileHrmApi } from './mobileHrmApi';
import type { OnboardingCandidate, MobileDepartmentType, OnboardingCandidateStatus } from './types';

const STATUS_CONFIG: Record<OnboardingCandidateStatus, { label: string; color: string; bg: string }> = {
    APPLIED: { label: 'Applied', color: '#64748b', bg: '#f1f5f9' },
    INTERVIEWING: { label: 'Interviewing', color: '#0284c7', bg: '#e0f2fe' },
    OFFERED: { label: 'Offer Letter Generated', color: '#d97706', bg: '#fef3c7' },
    HIRED: { label: 'Hired & Converted', color: '#16a34a', bg: '#dcfce7' },
    REJECTED: { label: 'Rejected', color: '#dc2626', bg: '#fee2e2' },
};

const DEPARTMENTS: { label: string; value: MobileDepartmentType }[] = [
    { label: 'Hardware Lab', value: 'HARDWARE' },
    { label: 'Software Lab', value: 'SOFTWARE' },
    { label: 'Panel / Glass Lab', value: 'PANEL_GLASS' },
    { label: 'Sales / Front Desk', value: 'SALES' },
    { label: 'Management', value: 'MANAGEMENT' },
];

export const HiringOnboardingTab: React.FC = () => {
    const user = useAuthStore(s => s.user);
    const companyLogoUrl = user?.company_logo
        ? (user.company_logo.startsWith('http') ? user.company_logo : `http://127.0.0.1:8000${user.company_logo}`)
        : null;
    const companyName = user?.company_name || 'SOFTECH-MOBILE REPAIR SERVICE';

    const [candidates, setCandidates] = useState<OnboardingCandidate[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [selectedStatus, setSelectedStatus] = useState<string>('ALL');

    // Modals
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [editingCandidate, setEditingCandidate] = useState<OnboardingCandidate | null>(null);
    const [letterPreviewCandidate, setLetterPreviewCandidate] = useState<OnboardingCandidate | null>(null);
    const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

    // Form State
    const [formData, setFormData] = useState({
        full_name: '',
        phone: '',
        email: '',
        address: '1st floor Shop#169 Star City Mall, Saddar, Karachi.',
        position: 'Mobile Hardware Technician',
        department_type: 'HARDWARE' as MobileDepartmentType,
        offered_salary: 20000,
        allowance: 'Travel 1000 Pkr/= (Every Week)',
        backup_work: '-',
        working_hours: '11:00 to 9:00',
        notice_period: 'One Month',
        appointment_date: new Date().toISOString().split('T')[0],
        appointment_month: 'October',
        ceo_name: 'Sheikh Muhammad Afnan',
        director_name: 'Shahzaib Ali',
        status: 'OFFERED' as OnboardingCandidateStatus,
        notes: ''
    });

    const loadCandidates = async () => {
        try {
            setLoading(true);
            const data = await mobileHrmApi.getCandidates({ search: search || undefined });
            setCandidates(data);
        } catch (err) {
            console.error('Failed to load onboarding candidates:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadCandidates();
    }, []);

    const handleOpenAdd = () => {
        setEditingCandidate(null);
        setFormData({
            full_name: '',
            phone: '',
            email: '',
            address: '1st floor Shop#169 Star City Mall, Saddar, Karachi.',
            position: 'Mobile Hardware Technician',
            department_type: 'HARDWARE',
            offered_salary: 20000,
            allowance: 'Travel 1000 Pkr/= (Every Week)',
            backup_work: '-',
            working_hours: '11:00 to 9:00',
            notice_period: 'One Month',
            appointment_date: new Date().toISOString().split('T')[0],
            appointment_month: 'October',
            ceo_name: 'Sheikh Muhammad Afnan',
            director_name: 'Shahzaib Ali',
            status: 'OFFERED',
            notes: ''
        });
        setIsAddModalOpen(true);
    };

    const handleOpenEdit = (cand: OnboardingCandidate) => {
        setEditingCandidate(cand);
        setFormData({
            full_name: cand.full_name,
            phone: cand.phone || '',
            email: cand.email || '',
            address: cand.address || '',
            position: cand.position,
            department_type: cand.department_type,
            offered_salary: Number(cand.offered_salary) || 20000,
            allowance: cand.allowance || '-',
            backup_work: cand.backup_work || '-',
            working_hours: cand.working_hours || '11:00 to 9:00',
            notice_period: cand.notice_period || 'One Month',
            appointment_date: cand.appointment_date || new Date().toISOString().split('T')[0],
            appointment_month: cand.appointment_month || 'October',
            ceo_name: cand.ceo_name || 'Sheikh Muhammad Afnan',
            director_name: cand.director_name || 'Shahzaib Ali',
            status: cand.status,
            notes: cand.notes || ''
        });
        setIsAddModalOpen(true);
    };

    const handleFormSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editingCandidate) {
                const updated = await mobileHrmApi.updateCandidate(editingCandidate.id, formData);
                setCandidates(prev => prev.map(c => c.id === updated.id ? updated : c));
            } else {
                const created = await mobileHrmApi.createCandidate(formData);
                setCandidates(prev => [created, ...prev]);
            }
            setIsAddModalOpen(false);
        } catch (err: any) {
            alert('Failed to save candidate details.');
        }
    };

    const handleConvertToEmployee = async (cand: OnboardingCandidate) => {
        if (!window.confirm(`Convert "${cand.full_name}" into an active workshop employee? This will automatically create an Employee profile, initial attendance grid, and payroll record.`)) return;
        try {
            setActionLoadingId(cand.id);
            const res = await mobileHrmApi.convertCandidateToEmployee(cand.id);
            alert(res.message || 'Candidate converted to Employee successfully!');
            await loadCandidates();
        } catch (err) {
            alert('Failed to convert candidate to employee.');
        } finally {
            setActionLoadingId(null);
        }
    };

    const handleDownloadLetter = async (cand: OnboardingCandidate) => {
        try {
            setActionLoadingId(cand.id);
            const blob = await mobileHrmApi.downloadAppointmentLetterPdf(cand.id);
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Appointment_Letter_${cand.full_name.replace(/\s+/g, '_')}.pdf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (err) {
            alert('Failed to generate appointment letter PDF.');
        } finally {
            setActionLoadingId(null);
        }
    };

    const handleToggleChecklist = async (cand: OnboardingCandidate, itemKey: string) => {
        const currentChecklist = cand.first_week_checklist || {};
        const updatedChecklist = {
            ...currentChecklist,
            [itemKey]: !currentChecklist[itemKey]
        };
        try {
            const updated = await mobileHrmApi.updateCandidate(cand.id, { first_week_checklist: updatedChecklist });
            setCandidates(prev => prev.map(c => c.id === updated.id ? updated : c));
        } catch (err) {
            console.error('Failed to update checklist:', err);
        }
    };

    const filtered = candidates.filter(c => {
        if (selectedStatus !== 'ALL' && c.status !== selectedStatus) return false;
        if (search) {
            const q = search.toLowerCase();
            return c.full_name.toLowerCase().includes(q) || c.position.toLowerCase().includes(q) || (c.phone && c.phone.includes(q));
        }
        return true;
    });

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', padding: '24px' }}>
            {/* Header Toolbar */}
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ position: 'relative', minWidth: '260px' }}>
                        <i className="bx bx-search" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                        <input
                            type="text"
                            placeholder="Search candidate name, position, phone..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '8px 12px 8px 36px',
                                borderRadius: '8px',
                                border: '1px solid var(--color-border, #cbd5e1)',
                                fontSize: '14px',
                                outline: 'none'
                            }}
                        />
                    </div>

                    <select
                        value={selectedStatus}
                        onChange={e => setSelectedStatus(e.target.value)}
                        style={{
                            padding: '8px 12px',
                            borderRadius: '8px',
                            border: '1px solid var(--color-border, #cbd5e1)',
                            fontSize: '13px',
                            fontWeight: 500,
                            background: '#f8fafc',
                            outline: 'none'
                        }}
                    >
                        <option value="ALL">All Pipeline Stages</option>
                        <option value="APPLIED">Applied</option>
                        <option value="INTERVIEWING">Interviewing</option>
                        <option value="OFFERED">Offer Letter Generated</option>
                        <option value="HIRED">Hired & Converted</option>
                        <option value="REJECTED">Rejected</option>
                    </select>
                </div>

                <button
                    type="button"
                    onClick={handleOpenAdd}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '9px 18px',
                        background: '#16a34a',
                        color: '#ffffff',
                        borderRadius: '8px',
                        border: 'none',
                        fontWeight: 600,
                        fontSize: '14px',
                        cursor: 'pointer'
                    }}
                >
                    <i className="bx bx-user-plus" />
                    New Candidate & Offer Letter
                </button>
            </div>

            {/* Candidates Pipeline Cards */}
            {loading ? (
                <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>
                    <i className="bx bx-loader-alt bx-spin" style={{ fontSize: '32px', marginBottom: '8px' }} />
                    <div>Loading hiring pipeline & offer letters...</div>
                </div>
            ) : filtered.length === 0 ? (
                <div style={{
                    padding: '60px',
                    textAlign: 'center',
                    background: 'var(--color-surface, #ffffff)',
                    borderRadius: '12px',
                    border: '1px dashed var(--color-border, #cbd5e1)'
                }}>
                    <i className="bx bx-file" style={{ fontSize: '48px', color: '#94a3b8', marginBottom: '12px' }} />
                    <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--color-text, #1e293b)', margin: '0 0 6px 0' }}>
                        No Candidates in this Pipeline Stage
                    </h3>
                    <p style={{ color: '#64748b', fontSize: '14px', margin: '0 0 16px 0' }}>
                        Click "+ New Candidate & Offer Letter" to issue appointment letters or track applicants.
                    </p>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: '20px' }}>
                    {filtered.map(cand => {
                        const statusMeta = STATUS_CONFIG[cand.status] || STATUS_CONFIG.APPLIED;
                        const isActionLoading = actionLoadingId === cand.id;
                        const checklist = cand.first_week_checklist || {};

                        return (
                            <div
                                key={cand.id}
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
                                    {/* Top Meta */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                                        <div>
                                            <h4 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--color-text, #0f172a)' }}>
                                                {cand.full_name}
                                            </h4>
                                            <div style={{ fontSize: '13px', fontWeight: 600, color: '#0284c7', marginTop: '2px' }}>
                                                {cand.position} ({cand.department_display})
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
                                            <button
                                                title="Edit Candidate Details"
                                                onClick={() => handleOpenEdit(cand)}
                                                style={{ background: 'transparent', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '4px', cursor: 'pointer', color: '#64748b' }}
                                            >
                                                <i className="bx bx-edit" style={{ fontSize: '16px' }} />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Key Terms Grid */}
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: '1fr 1fr',
                                        gap: '8px',
                                        background: '#f8fafc',
                                        padding: '12px',
                                        borderRadius: '8px',
                                        fontSize: '12px',
                                        border: '1px solid #f1f5f9',
                                        marginBottom: '14px'
                                    }}>
                                        <div>
                                            <span style={{ color: '#64748b' }}>Salary: </span>
                                            <strong style={{ color: '#16a34a' }}>Rs. {Number(cand.offered_salary).toLocaleString()}</strong>
                                        </div>
                                        <div>
                                            <span style={{ color: '#64748b' }}>Working Hours: </span>
                                            <strong>{cand.working_hours || '11:00 to 9:00'}</strong>
                                        </div>
                                        <div>
                                            <span style={{ color: '#64748b' }}>Notice Period: </span>
                                            <strong>{cand.notice_period || 'One Month'}</strong>
                                        </div>
                                        <div>
                                            <span style={{ color: '#64748b' }}>Appt. Month: </span>
                                            <strong>{cand.appointment_month} {cand.appointment_date ? `(${cand.appointment_date})` : ''}</strong>
                                        </div>
                                        {cand.allowance && cand.allowance !== '-' && (
                                            <div style={{ gridColumn: 'span 2' }}>
                                                <span style={{ color: '#64748b' }}>Allowance: </span>
                                                <strong style={{ color: '#0284c7' }}>{cand.allowance}</strong>
                                            </div>
                                        )}
                                    </div>

                                    {/* First-Week Checklist */}
                                    <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '10px' }}>
                                        <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>
                                            FIRST-WEEK ONBOARDING CHECKLIST:
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                                            {[
                                                { key: 'induction', label: 'Shop Induction' },
                                                { key: 'toolset_assigned', label: 'Toolset Assigned' },
                                                { key: 'policy_signed', label: 'Policy Signed' },
                                                { key: 'login_created', label: 'Portal Access' }
                                            ].map(item => {
                                                const checked = !!checklist[item.key];
                                                return (
                                                    <label
                                                        key={item.key}
                                                        style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '6px',
                                                            fontSize: '12px',
                                                            color: checked ? '#15803d' : '#64748b',
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={checked}
                                                            onChange={() => handleToggleChecklist(cand, item.key)}
                                                        />
                                                        {item.label}
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>

                                {/* Action Buttons */}
                                <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid #f1f5f9', paddingTop: '12px' }}>
                                    <button
                                        type="button"
                                        onClick={() => setLetterPreviewCandidate(cand)}
                                        style={{
                                            flex: 1,
                                            padding: '8px',
                                            borderRadius: '8px',
                                            border: '1px solid #cbd5e1',
                                            background: '#ffffff',
                                            color: '#334155',
                                            fontSize: '12px',
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '4px'
                                        }}
                                    >
                                        <i className="bx bx-show" />
                                        Preview Letter
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => handleDownloadLetter(cand)}
                                        disabled={isActionLoading}
                                        style={{
                                            flex: 1,
                                            padding: '8px',
                                            borderRadius: '8px',
                                            border: 'none',
                                            background: '#0284c7',
                                            color: '#ffffff',
                                            fontSize: '12px',
                                            fontWeight: 600,
                                            cursor: isActionLoading ? 'not-allowed' : 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '4px'
                                        }}
                                    >
                                        <i className={`bx ${isActionLoading ? 'bx-loader-alt bx-spin' : 'bx-download'}`} />
                                        PDF Letter
                                    </button>

                                    {cand.status !== 'HIRED' && (
                                        <button
                                            type="button"
                                            onClick={() => handleConvertToEmployee(cand)}
                                            disabled={isActionLoading}
                                            style={{
                                                flex: 1.2,
                                                padding: '8px',
                                                borderRadius: '8px',
                                                border: 'none',
                                                background: '#16a34a',
                                                color: '#ffffff',
                                                fontSize: '12px',
                                                fontWeight: 600,
                                                cursor: isActionLoading ? 'not-allowed' : 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '4px'
                                            }}
                                        >
                                            <i className="bx bx-check-circle" />
                                            Convert to Staff
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Letter Preview Modal */}
            {letterPreviewCandidate && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(15, 23, 42, 0.65)',
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
                        maxWidth: '640px',
                        maxHeight: '90vh',
                        overflowY: 'auto',
                        padding: '32px',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                        fontFamily: 'serif',
                        color: '#0f172a'
                    }}>
                        {/* Letterhead */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #0284c7', paddingBottom: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                                {companyLogoUrl && (
                                    <img
                                        src={companyLogoUrl}
                                        alt={companyName}
                                        style={{ height: '42px', maxWidth: '100px', objectFit: 'contain' }}
                                    />
                                )}
                                <div>
                                    <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, letterSpacing: '0.5px' }}>
                                        {companyName.toUpperCase()}
                                    </h2>
                                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                                        Official Employee Appointment Letter
                                    </div>
                                </div>
                            </div>
                            <div style={{ textAlign: 'right', fontSize: '12px', fontWeight: 700 }}>
                                Appointment Month: {letterPreviewCandidate.appointment_month}
                                <div style={{ fontSize: '11px', color: '#64748b' }}>Page 1 of 1</div>
                            </div>
                        </div>

                        {/* CEO Line */}
                        <div style={{ marginTop: '16px', fontSize: '13px' }}>
                            <strong>C.E.O</strong><br />
                            {letterPreviewCandidate.ceo_name || 'Sheikh Muhammad Afnan'}
                        </div>

                        {/* Title */}
                        <div style={{ textAlign: 'center', margin: '20px 0 16px 0' }}>
                            <span style={{ fontSize: '18px', fontWeight: 700, textDecoration: 'underline' }}>
                                Letter of Appointment
                            </span>
                        </div>

                        {/* Meta Table */}
                        <div style={{ fontSize: '13px', lineHeight: '1.8' }}>
                            <div><strong>Date:</strong> {letterPreviewCandidate.appointment_date || '11 June 2025'}</div>
                            <div><strong>Name:</strong> {letterPreviewCandidate.full_name}</div>
                            <div><strong>Address:</strong> {letterPreviewCandidate.address}</div>
                        </div>

                        {/* Salutation & Body */}
                        <div style={{ marginTop: '16px', fontSize: '13px', lineHeight: '1.7' }}>
                            <p>Dear {letterPreviewCandidate.full_name},</p>
                            <p><strong>Appointed as {letterPreviewCandidate.position},</strong></p>
                            <p>
                                We Refer to your recent interview for the job position & are pleased to inform that we are offering you the position with our company effective ({letterPreviewCandidate.appointment_date || 'Current Date'}) under the following terms & conditions.
                            </p>
                            <ul style={{ paddingLeft: '20px', lineHeight: '2' }}>
                                <li><strong>Salary:</strong> {Number(letterPreviewCandidate.offered_salary).toLocaleString()} Pkr/=</li>
                                <li><strong>Allowance:</strong> {letterPreviewCandidate.allowance || '-'}</li>
                                <li><strong>Back up work:</strong> {letterPreviewCandidate.backup_work || '-'}</li>
                                <li><strong>Working Hour:</strong> {letterPreviewCandidate.working_hours || '11:00 to 9:00 (Closing)'}</li>
                                <li><strong>Notice Period:</strong> {letterPreviewCandidate.notice_period || 'One Month'}</li>
                            </ul>
                            <p style={{ marginTop: '16px' }}>
                                Enjoy this time of transition, & congratulations on your role here at {companyName}.
                            </p>
                        </div>

                        {/* Signatures */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '40px', paddingTop: '20px' }}>
                            <div>
                                <strong>Director</strong><br /><br />
                                {letterPreviewCandidate.director_name || 'Shahzaib Ali'}
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <strong>Employee</strong><br /><br />
                                --------------------------------
                            </div>
                        </div>

                        {/* Modal Footer Controls */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '30px', borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}>
                            <button
                                onClick={() => setLetterPreviewCandidate(null)}
                                style={{ padding: '8px 16px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}
                            >
                                Close
                            </button>
                            <button
                                onClick={() => handleDownloadLetter(letterPreviewCandidate)}
                                style={{ padding: '8px 18px', background: '#0284c7', color: '#ffffff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}
                            >
                                <i className="bx bx-download" />
                                Download PDF
                            </button>
                            <button
                                onClick={() => window.print()}
                                style={{ padding: '8px 18px', background: '#16a34a', color: '#ffffff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}
                            >
                                <i className="bx bx-printer" />
                                Print Letter
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add / Edit Candidate Modal */}
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
                        maxWidth: '680px',
                        maxHeight: '90vh',
                        overflowY: 'auto',
                        padding: '28px',
                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h3 style={{ margin: 0, fontSize: '19px', fontWeight: 700, color: '#0f172a' }}>
                                {editingCandidate ? `Edit Candidate: ${editingCandidate.full_name}` : 'New Candidate & Appointment Terms'}
                            </h3>
                            <button onClick={() => setIsAddModalOpen(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '22px', color: '#64748b' }}>
                                <i className="bx bx-x" />
                            </button>
                        </div>

                        <form onSubmit={handleFormSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Candidate Full Name *</label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.full_name}
                                        onChange={e => setFormData({ ...formData, full_name: e.target.value })}
                                        placeholder="e.g. Shahzaib Akbar"
                                        style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Phone Number</label>
                                    <input
                                        type="text"
                                        value={formData.phone}
                                        onChange={e => setFormData({ ...formData, phone: e.target.value })}
                                        placeholder="0300-1234567"
                                        style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                                    />
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Appointed Position *</label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.position}
                                        onChange={e => setFormData({ ...formData, position: e.target.value })}
                                        placeholder="e.g. Mobile Hardware Technician"
                                        style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Department</label>
                                    <select
                                        value={formData.department_type}
                                        onChange={e => setFormData({ ...formData, department_type: e.target.value as MobileDepartmentType })}
                                        style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                                    >
                                        {DEPARTMENTS.map(d => (
                                            <option key={d.value} value={d.value}>{d.label}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Offered Monthly Salary (PKR) *</label>
                                    <input
                                        type="number"
                                        required
                                        value={formData.offered_salary}
                                        onChange={e => setFormData({ ...formData, offered_salary: Number(e.target.value) })}
                                        style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Allowance (Travel / Weekly)</label>
                                    <input
                                        type="text"
                                        value={formData.allowance}
                                        onChange={e => setFormData({ ...formData, allowance: e.target.value })}
                                        placeholder="e.g. Travel 1000 Pkr/= (Every Week) or -"
                                        style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                                    />
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Working Hours</label>
                                    <input
                                        type="text"
                                        value={formData.working_hours}
                                        onChange={e => setFormData({ ...formData, working_hours: e.target.value })}
                                        placeholder="11:00 to 9:00"
                                        style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Notice Period</label>
                                    <input
                                        type="text"
                                        value={formData.notice_period}
                                        onChange={e => setFormData({ ...formData, notice_period: e.target.value })}
                                        placeholder="One Month"
                                        style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                                    />
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Appointment Month</label>
                                    <input
                                        type="text"
                                        value={formData.appointment_month}
                                        onChange={e => setFormData({ ...formData, appointment_month: e.target.value })}
                                        placeholder="e.g. October"
                                        style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Effective Date</label>
                                    <input
                                        type="date"
                                        value={formData.appointment_date}
                                        onChange={e => setFormData({ ...formData, appointment_date: e.target.value })}
                                        style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                                    />
                                </div>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Address</label>
                                <textarea
                                    rows={2}
                                    value={formData.address}
                                    onChange={e => setFormData({ ...formData, address: e.target.value })}
                                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                                />
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                                <button type="button" onClick={() => setIsAddModalOpen(false)} style={{ padding: '8px 16px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer' }}>
                                    Cancel
                                </button>
                                <button type="submit" style={{ padding: '8px 20px', background: '#16a34a', color: '#ffffff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}>
                                    {editingCandidate ? 'Update Candidate' : 'Save & Issue Offer'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
