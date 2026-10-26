import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../../../auth/authStore';
import { mobileHrmApi } from './mobileHrmApi';
import type { SelfServiceData, Technician } from './types';

interface EmployeeSelfServicePortalProps {
    isStaffOnly?: boolean;
}

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

export const EmployeeSelfServicePortal: React.FC<EmployeeSelfServicePortalProps> = ({ isStaffOnly = false }) => {
    const user = useAuthStore(s => s.user);
    const isAdminRole = user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'manager' || user?.role === 'owner' || user?.role === 'management';
    const canSwitchStaff = !isStaffOnly && isAdminRole;

    const [technicians, setTechnicians] = useState<Technician[]>([]);
    const [selectedEmpId, setSelectedEmpId] = useState<string>('');
    const [selectedYear, setSelectedYear] = useState<number>(2026);
    const [selectedMonth, setSelectedMonth] = useState<number>(9);

    const [data, setData] = useState<SelfServiceData | null>(null);
    const [loading, setLoading] = useState(true);
    const [activePortalTab, setActivePortalTab] = useState<'profile' | 'attendance' | 'leaves' | 'policies' | 'exit' | 'payslip'>('profile');

    // Leave Form
    const [leaveType, setLeaveType] = useState('HALF_DAY');
    const [leaveDate, setLeaveDate] = useState(new Date().toISOString().split('T')[0]);
    const [leaveReason, setLeaveReason] = useState('Medical appointment / lab relief required');
    const [submittingLeave, setSubmittingLeave] = useState(false);

    // Exit Form
    const [exitReason, setExitReason] = useState('');
    const [submittingExit, setSubmittingExit] = useState(false);

    // Company logo & branding
    const companyLogoUrl = user?.company_logo
        ? (user.company_logo.startsWith('http') ? user.company_logo : `http://127.0.0.1:8000${user.company_logo}`)
        : null;
    const companyName = user?.company_name || 'SOFTECH';

    const getMediaUrl = (url?: string) => {
        if (!url) return '';
        if (url.startsWith('http://') || url.startsWith('https://')) return url;
        return `http://127.0.0.1:8000${url.startsWith('/') ? '' : '/'}${url}`;
    };

    const formatFileSize = (bytes?: number) => {
        if (!bytes) return '';
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    useEffect(() => {
        if (canSwitchStaff) {
            const loadTechs = async () => {
                try {
                    const list = await mobileHrmApi.getTechnicians();
                    setTechnicians(list);
                    if (list.length > 0 && !selectedEmpId) {
                        setSelectedEmpId(list[0].employee);
                    }
                } catch (err) {
                    console.error('Failed to load employee list:', err);
                }
            };
            loadTechs();
        }
    }, [canSwitchStaff]);

    const loadPortalData = async (empId?: string, year: number = selectedYear, month: number = selectedMonth) => {
        try {
            setLoading(true);
            const queryParams: any = { year, month };
            if (canSwitchStaff && empId) {
                queryParams.employee_id = empId;
            }
            const res = await mobileHrmApi.getSelfServiceData(queryParams);
            setData(res);
            if (res.employee?.id && !selectedEmpId) {
                setSelectedEmpId(res.employee.id);
            }
        } catch (err) {
            console.error('Failed to load self service portal data:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadPortalData(selectedEmpId, selectedYear, selectedMonth);
    }, [selectedEmpId, selectedYear, selectedMonth]);

    const handleCreateLeave = async (e: React.FormEvent) => {
        e.preventDefault();
        const targetEmpId = data?.employee.id || selectedEmpId;
        if (!targetEmpId) return;
        try {
            setSubmittingLeave(true);
            await mobileHrmApi.createLeaveRequest({
                employee: targetEmpId,
                leave_type: leaveType,
                request_date: leaveDate,
                reason: leaveReason
            });
            alert('Leave request submitted successfully! Administration has been notified.');
            await loadPortalData(targetEmpId, selectedYear, selectedMonth);
        } catch (err) {
            alert('Failed to submit leave request.');
        } finally {
            setSubmittingLeave(false);
        }
    };

    const handleCreateExit = async (e: React.FormEvent) => {
        e.preventDefault();
        const targetEmpId = data?.employee.id || selectedEmpId;
        if (!targetEmpId || !exitReason.trim()) return;
        if (!window.confirm('Submit resignation with standard 1-month notice period?')) return;
        try {
            setSubmittingExit(true);
            const today = new Date();
            const lwd = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
            await mobileHrmApi.createExitRequest({
                employee: targetEmpId,
                resignation_date: today.toISOString().split('T')[0],
                last_working_day: lwd.toISOString().split('T')[0],
                reason: exitReason
            });
            alert('Resignation submitted. 1-Month notice period timeline initiated.');
            await loadPortalData(targetEmpId, selectedYear, selectedMonth);
        } catch (err) {
            alert('Failed to submit exit request.');
        } finally {
            setSubmittingExit(false);
        }
    };

    const handleDownloadMyPayslip = async () => {
        const targetEmpId = data?.employee.id || selectedEmpId;
        if (!targetEmpId) return;
        try {
            const blob = await mobileHrmApi.downloadPayslipPdf(targetEmpId, selectedYear, selectedMonth);
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `My_Payslip_${MONTH_NAMES[selectedMonth - 1]}_${selectedYear}_${data?.employee.first_name || 'Staff'}.pdf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (err) {
            alert('Failed to download payslip.');
        }
    };

    const emp = data?.employee;
    const profile = data?.profile;
    const att = data?.attendance;
    const leaves = data?.leaves || [];
    const exitReq = data?.exit_request;

    // Calculate days in the selected month
    const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '24px' }}>
            {/* Top Bar: Identity Banner & Optional Admin Switcher */}
            <div style={{
                background: 'linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%)',
                color: '#ffffff',
                padding: '20px 24px',
                borderRadius: '16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '16px',
                boxShadow: '0 4px 12px rgba(30, 58, 138, 0.25)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    {/* Employee Profile Photo or Initials */}
                    {profile?.photo_url ? (
                        <div style={{
                            width: '48px',
                            height: '48px',
                            borderRadius: '50%',
                            border: '2px solid rgba(255,255,255,0.85)',
                            overflow: 'hidden',
                            flexShrink: 0
                        }}>
                            <img
                                src={getMediaUrl(profile.photo_url)}
                                alt={emp ? `${emp.first_name} ${emp.last_name}` : 'Staff'}
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                        </div>
                    ) : companyLogoUrl ? (
                        <div style={{
                            width: '48px',
                            height: '48px',
                            borderRadius: '10px',
                            background: '#ffffff',
                            padding: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            overflow: 'hidden',
                            flexShrink: 0
                        }}>
                            <img
                                src={companyLogoUrl}
                                alt={companyName}
                                style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                            />
                        </div>
                    ) : (
                        <div style={{
                            width: '48px',
                            height: '48px',
                            borderRadius: '50%',
                            background: '#ffffff',
                            color: '#1e3a8a',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 800,
                            fontSize: '18px',
                            flexShrink: 0
                        }}>
                            {emp ? `${emp.first_name[0]}${emp.last_name ? emp.last_name[0] : ''}` : 'E'}
                        </div>
                    )}

                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700 }}>
                                {emp ? `${emp.first_name} ${emp.last_name}` : 'Loading...'}
                            </h2>
                            <span style={{ fontSize: '11px', background: 'rgba(255,255,255,0.2)', padding: '2px 8px', borderRadius: '12px' }}>
                                {emp?.employee_code || 'EMP'}
                            </span>
                            <span style={{ fontSize: '11px', background: '#dcfce7', color: '#15803d', padding: '2px 8px', borderRadius: '12px', fontWeight: 600 }}>
                                {companyName}
                            </span>
                        </div>
                        <div style={{ fontSize: '13px', color: '#bfdbfe', marginTop: '3px' }}>
                            Department: <strong>{emp?.department || 'Technician'}</strong> &nbsp;|&nbsp;
                            Joining Date: <strong>{emp?.joining_date || '2025-06-01'}</strong>
                        </div>
                    </div>
                </div>

                {/* Only Admin / Manager can switch staff to preview; Regular Staff NEVER see this */}
                {canSwitchStaff && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '12px', color: '#bfdbfe' }}>Admin Preview As:</span>
                        <select
                            value={selectedEmpId}
                            onChange={e => setSelectedEmpId(e.target.value)}
                            style={{
                                padding: '8px 12px',
                                borderRadius: '8px',
                                border: '1px solid rgba(255, 255, 255, 0.3)',
                                background: '#ffffff',
                                color: '#1e293b',
                                fontSize: '13px',
                                fontWeight: 600,
                                outline: 'none'
                            }}
                        >
                            {technicians.map(t => (
                                <option key={t.employee} value={t.employee}>
                                    {t.employee_name} ({t.employee_code} - {t.department_display})
                                </option>
                            ))}
                        </select>
                    </div>
                )}
            </div>

            {/* Portal Navigation Pills */}
            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
                {[
                    { id: 'profile', label: 'My Profile & Terms', icon: 'bx-user' },
                    { id: 'attendance', label: 'My Monthly Attendance', icon: 'bx-calendar-check' },
                    { id: 'leaves', label: 'Leave & Relief Requests', icon: 'bx-envelope' },
                    { id: 'policies', label: 'Company Policies', icon: 'bx-book-open' },
                    { id: 'exit', label: 'Exit & Notice Window', icon: 'bx-log-out-circle' },
                    { id: 'payslip', label: 'My Salary Slips', icon: 'bx-receipt' },
                ].map(tab => {
                    const active = activePortalTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => setActivePortalTab(tab.id as any)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '10px 18px',
                                borderRadius: '10px',
                                border: '1px solid',
                                borderColor: active ? '#2563eb' : '#cbd5e1',
                                background: active ? '#2563eb' : '#ffffff',
                                color: active ? '#ffffff' : '#334155',
                                fontSize: '13px',
                                fontWeight: active ? 700 : 500,
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                                whiteSpace: 'nowrap',
                                boxShadow: active ? '0 2px 4px rgba(37,99,235,0.2)' : 'none'
                            }}
                        >
                            <i className={`bx ${tab.icon}`} style={{ fontSize: '16px' }} />
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* Content Area */}
            {loading ? (
                <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>
                    <i className="bx bx-loader-alt bx-spin" style={{ fontSize: '32px', marginBottom: '8px' }} />
                    <div>Loading Self-Service Workspace...</div>
                </div>
            ) : (
                <div style={{ flex: 1 }}>
                    {/* 1. MY PROFILE & TERMS */}
                    {activePortalTab === 'profile' && profile && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
                                {/* Card 1: Personal, Contact & Emergency Details */}
                                <div style={{ background: '#ffffff', padding: '24px', borderRadius: '14px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                                        <i className="bx bx-id-card" style={{ fontSize: '20px', color: '#2563eb' }} />
                                        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
                                            Personal & Contact Information
                                        </h3>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13.5px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                                            <span style={{ color: '#64748b' }}>CNIC / National ID:</span>
                                            <strong style={{ letterSpacing: '0.5px' }}>{profile.cnic || 'Not recorded'}</strong>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                                            <span style={{ color: '#64748b' }}>Mobile Number:</span>
                                            <strong>{profile.phone || 'Not recorded'}</strong>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                                            <span style={{ color: '#64748b' }}>Email Address:</span>
                                            <strong>{profile.email || 'Not recorded'}</strong>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                                            <span style={{ color: '#64748b' }}>Blood Group:</span>
                                            <span style={{ padding: '2px 8px', borderRadius: '4px', background: '#fee2e2', color: '#b91c1c', fontWeight: 700, fontSize: '12px' }}>
                                                🩸 {profile.blood_group || 'O+'}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                                            <span style={{ color: '#64748b' }}>Home / Residential Address:</span>
                                            <span style={{ fontWeight: 600, color: '#1e293b' }}>{profile.residential_address || 'Not recorded'}</span>
                                        </div>

                                        {/* Emergency Contact Box */}
                                        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 12px' }}>
                                            <div style={{ fontSize: '11px', color: '#991b1b', fontWeight: 700, marginBottom: '2px' }}>EMERGENCY CONTACT</div>
                                            <div style={{ fontSize: '13px', fontWeight: 600, color: '#7f1d1d' }}>
                                                {profile.emergency_contact_name || 'HR on file'}
                                            </div>
                                            <div style={{ fontSize: '12px', color: '#b91c1c', marginTop: '2px' }}>
                                                📞 {profile.emergency_contact_phone || 'HR Helpline'}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Card 2: Shift & Grace Terms */}
                                <div style={{ background: '#ffffff', padding: '24px', borderRadius: '14px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                                        <i className="bx bx-time" style={{ fontSize: '20px', color: '#2563eb' }} />
                                        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
                                            Shift & Workshop Attendance Terms
                                        </h3>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13.5px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                                            <span style={{ color: '#64748b' }}>Shift Start Time:</span>
                                            <strong>{profile.shift_time}</strong>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                                            <span style={{ color: '#64748b' }}>Late Grace Window:</span>
                                            <strong>{profile.late_grace_minutes} Minutes</strong>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                                            <span style={{ color: '#64748b' }}>Half-Day Cutoff:</span>
                                            <strong>{profile.half_day_cutoff_minutes} Minutes</strong>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                                            <span style={{ color: '#64748b' }}>Monthly Allowed Half Days:</span>
                                            <strong style={{ color: '#16a34a' }}>{profile.allowed_half_days}</strong>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                                            <span style={{ color: '#64748b' }}>Monthly Medical Half Days:</span>
                                            <strong style={{ color: '#16a34a' }}>{profile.allowed_medical_half_days}</strong>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span style={{ color: '#64748b' }}>Overtime Hourly Rate:</span>
                                            <strong style={{ color: '#2563eb' }}>Rs. {Number(profile.ot_hourly_rate).toFixed(2)}/hr</strong>
                                        </div>
                                    </div>
                                </div>

                                {/* Card 3: Assigned Equipment & Verification */}
                                <div style={{ background: '#ffffff', padding: '24px', borderRadius: '14px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                                        <i className="bx bx-devices" style={{ fontSize: '20px', color: '#10b981' }} />
                                        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
                                            Assigned Devices & Shop Verification
                                        </h3>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13.5px' }}>
                                        {profile.phone_1_model && (
                                            <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: '8px' }}>
                                                <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>
                                                    PRIMARY TESTING PHONE
                                                </div>
                                                <div style={{ fontWeight: 600, color: '#1e293b' }}>
                                                    📱 {profile.phone_1_model}
                                                </div>
                                                {profile.phone_1_imei_1 && (
                                                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                                                        IMEI 1: {profile.phone_1_imei_1}
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {profile.phone_2_model && (
                                            <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: '8px' }}>
                                                <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>
                                                    SECONDARY TESTING PHONE
                                                </div>
                                                <div style={{ fontWeight: 600, color: '#1e293b' }}>
                                                    📱 {profile.phone_2_model}
                                                </div>
                                                {profile.phone_2_imei_1 && (
                                                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                                                        IMEI: {profile.phone_2_imei_1}
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '6px' }}>
                                            <span style={{ color: '#64748b' }}>Designation Code:</span>
                                            <strong>{profile.department_display}</strong>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span style={{ color: '#64748b' }}>Employee Code:</span>
                                            <strong>{profile.employee_code}</strong>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Card 4: Uploaded Official Documents & Records */}
                            <div style={{ background: '#ffffff', padding: '24px', borderRadius: '14px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <i className="bx bx-paperclip" style={{ fontSize: '20px', color: '#2563eb' }} />
                                        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
                                            My Uploaded Documents & Records ({profile.document_urls?.length || 0})
                                        </h3>
                                    </div>
                                    <span style={{ fontSize: '12px', color: '#64748b' }}>
                                        HR Verified Digital Files
                                    </span>
                                </div>

                                {(!profile.document_urls || profile.document_urls.length === 0) ? (
                                    <div style={{ padding: '30px', textAlign: 'center', background: '#f8fafc', borderRadius: '10px', border: '1px dashed #cbd5e1', color: '#64748b', fontSize: '13.5px' }}>
                                        <i className="bx bx-folder-open" style={{ fontSize: '32px', color: '#94a3b8', display: 'block', marginBottom: '8px' }} />
                                        No official documents attached to your file yet. Your HR administrator can upload your CNIC copy, certifications, or appointment papers from the Staff Roster.
                                    </div>
                                ) : (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
                                        {profile.document_urls.map((doc, idx) => {
                                            const isImg = doc.url.match(/\.(jpg|jpeg|png|webp|gif)$/i) || doc.doc_type === 'Picture / Photo';
                                            return (
                                                <div
                                                    key={doc.id || idx}
                                                    style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'space-between',
                                                        padding: '12px 14px',
                                                        borderRadius: '10px',
                                                        border: '1px solid #e2e8f0',
                                                        background: '#f8fafc',
                                                        gap: '12px'
                                                    }}
                                                >
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
                                                        {isImg ? (
                                                            <img
                                                                src={getMediaUrl(doc.url)}
                                                                alt={doc.name}
                                                                style={{ width: '40px', height: '40px', borderRadius: '6px', objectFit: 'cover', flexShrink: 0 }}
                                                            />
                                                        ) : (
                                                            <div style={{ width: '40px', height: '40px', borderRadius: '6px', background: '#fee2e2', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                                <i className="bx bxs-file-pdf" style={{ fontSize: '22px' }} />
                                                            </div>
                                                        )}
                                                        <div style={{ overflow: 'hidden' }}>
                                                            <div style={{ fontWeight: 600, fontSize: '13px', color: '#0f172a', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                                                                {doc.name}
                                                            </div>
                                                            <div style={{ display: 'flex', gap: '6px', fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                                                                <span style={{ padding: '1px 6px', borderRadius: '4px', background: '#e2e8f0', fontWeight: 600 }}>
                                                                    {doc.doc_type || 'Document'}
                                                                </span>
                                                                {doc.file_size && <span>{formatFileSize(doc.file_size)}</span>}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <button
                                                        type="button"
                                                        onClick={() => window.open(getMediaUrl(doc.url), '_blank')}
                                                        style={{
                                                            padding: '6px 12px',
                                                            borderRadius: '6px',
                                                            border: '1px solid #cbd5e1',
                                                            background: '#ffffff',
                                                            color: '#2563eb',
                                                            fontSize: '12px',
                                                            fontWeight: 600,
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '4px',
                                                            flexShrink: 0
                                                        }}
                                                    >
                                                        <i className="bx bx-show" /> View
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* 2. MY ATTENDANCE WITH MONTH & YEAR SELECTORS */}
                    {activePortalTab === 'attendance' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            {/* Month & Year Selection Bar */}
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                flexWrap: 'wrap',
                                gap: '14px',
                                background: '#ffffff',
                                padding: '14px 20px',
                                borderRadius: '12px',
                                border: '1px solid #e2e8f0'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <i className="bx bx-calendar" style={{ fontSize: '20px', color: '#2563eb' }} />
                                    <span style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
                                        Attendance History Filter:
                                    </span>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <select
                                        value={selectedMonth}
                                        onChange={e => setSelectedMonth(Number(e.target.value))}
                                        style={{
                                            padding: '8px 14px',
                                            borderRadius: '8px',
                                            border: '1px solid #cbd5e1',
                                            background: '#f8fafc',
                                            fontSize: '13.5px',
                                            fontWeight: 600,
                                            outline: 'none',
                                            color: '#1e293b'
                                        }}
                                    >
                                        {MONTH_NAMES.map((name, i) => (
                                            <option key={i + 1} value={i + 1}>{name}</option>
                                        ))}
                                    </select>

                                    <select
                                        value={selectedYear}
                                        onChange={e => setSelectedYear(Number(e.target.value))}
                                        style={{
                                            padding: '8px 14px',
                                            borderRadius: '8px',
                                            border: '1px solid #cbd5e1',
                                            background: '#f8fafc',
                                            fontSize: '13.5px',
                                            fontWeight: 600,
                                            outline: 'none',
                                            color: '#1e293b'
                                        }}
                                    >
                                        {[2024, 2025, 2026, 2027].map(yr => (
                                            <option key={yr} value={yr}>{yr}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Summary Cards */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '14px' }}>
                                <div style={{ background: '#ffffff', padding: '14px 18px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                                    <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>PRESENTS (P)</div>
                                    <div style={{ fontSize: '24px', fontWeight: 800, color: '#16a34a', marginTop: '4px' }}>{att?.present_count || 0} Days</div>
                                </div>
                                <div style={{ background: '#ffffff', padding: '14px 18px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                                    <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>LATES (L)</div>
                                    <div style={{ fontSize: '24px', fontWeight: 800, color: '#d97706', marginTop: '4px' }}>{att?.late_count || 0}</div>
                                </div>
                                <div style={{ background: '#ffffff', padding: '14px 18px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                                    <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>HALF DAYS (D)</div>
                                    <div style={{ fontSize: '24px', fontWeight: 800, color: '#f97316', marginTop: '4px' }}>{att?.half_day_count || 0}</div>
                                </div>
                                <div style={{ background: '#ffffff', padding: '14px 18px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                                    <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>ALLOWED LEAVES (DA/HA)</div>
                                    <div style={{ fontSize: '24px', fontWeight: 800, color: '#7e22ce', marginTop: '4px' }}>
                                        {(att?.allowed_half_day_count || 0) + (att?.allowed_holiday_count || 0)}
                                    </div>
                                </div>
                                <div style={{ background: '#ffffff', padding: '14px 18px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                                    <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>UNAPPROVED ABSENT (H)</div>
                                    <div style={{ fontSize: '24px', fontWeight: 800, color: '#dc2626', marginTop: '4px' }}>{att?.holiday_count || 0}</div>
                                </div>
                                <div style={{ background: '#ffffff', padding: '14px 18px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                                    <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>OVERTIME (O)</div>
                                    <div style={{ fontSize: '24px', fontWeight: 800, color: '#2563eb', marginTop: '4px' }}>{att?.overtime_hours || 0} Hrs</div>
                                </div>
                            </div>

                            {/* Monthly Grid */}
                            <div style={{ background: '#ffffff', padding: '24px', borderRadius: '14px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
                                        {MONTH_NAMES[selectedMonth - 1]} {selectedYear} Daily Breakdown (Days 1 to {daysInMonth})
                                    </h3>
                                    <div style={{ display: 'flex', gap: '8px', fontSize: '11px', flexWrap: 'wrap' }}>
                                        <span style={{ padding: '2px 6px', background: '#dcfce7', color: '#15803d', borderRadius: '4px', fontWeight: 600 }}>P: Present</span>
                                        <span style={{ padding: '2px 6px', background: '#fef3c7', color: '#b45309', borderRadius: '4px', fontWeight: 600 }}>L: Late</span>
                                        <span style={{ padding: '2px 6px', background: '#ffedd5', color: '#c2410c', borderRadius: '4px', fontWeight: 600 }}>D: Half Day</span>
                                        <span style={{ padding: '2px 6px', background: '#f3e8ff', color: '#7e22ce', borderRadius: '4px', fontWeight: 600 }}>HA/DA: Allowed Leave</span>
                                        <span style={{ padding: '2px 6px', background: '#fee2e2', color: '#b91c1c', borderRadius: '4px', fontWeight: 600 }}>H: Absent</span>
                                    </div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(70px, 1fr))', gap: '8px' }}>
                                    {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
                                        const code = (att?.days_data || {})[String(day)] || '-';
                                        let bg = '#f8fafc';
                                        let color = '#334155';
                                        if (code === 'P') { bg = '#dcfce7'; color = '#15803d'; }
                                        else if (code === 'L') { bg = '#fef3c7'; color = '#b45309'; }
                                        else if (code === 'D') { bg = '#ffedd5'; color = '#c2410c'; }
                                        else if (code === 'H') { bg = '#fee2e2'; color = '#b91c1c'; }
                                        else if (code === 'O') { bg = '#dbeafe'; color = '#1d4ed8'; }
                                        else if (code === 'DA' || code === 'HA') { bg = '#f3e8ff'; color = '#7e22ce'; }

                                        return (
                                            <div
                                                key={day}
                                                style={{
                                                    background: bg,
                                                    color: color,
                                                    borderRadius: '8px',
                                                    padding: '10px 4px',
                                                    textAlign: 'center',
                                                    border: '1px solid rgba(0,0,0,0.06)'
                                                }}
                                            >
                                                <div style={{ fontSize: '11px', color: '#64748b' }}>Day {day}</div>
                                                <div style={{ fontSize: '16px', fontWeight: 800, marginTop: '2px' }}>{code}</div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 3. LEAVES & PERMISSIONS */}
                    {activePortalTab === 'leaves' && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 2fr', gap: '20px' }}>
                            {/* Request Form */}
                            <div style={{ background: '#ffffff', padding: '24px', borderRadius: '14px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                                <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
                                    Submit Permission / Leave Request
                                </h3>
                                <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 16px 0' }}>
                                    Per workshop rules, Half-Day & Casual leave requests must be submitted in advance so relief staff can be coordinated.
                                </p>
                                <form onSubmit={handleCreateLeave} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Leave Category *</label>
                                        <select
                                            value={leaveType}
                                            onChange={e => setLeaveType(e.target.value)}
                                            style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                                        >
                                            <option value="HALF_DAY">Half Day / Lab Relief (DA)</option>
                                            <option value="CASUAL">Casual Leave (HA)</option>
                                            <option value="SICK">Sick / Medical Leave (HA)</option>
                                            <option value="EMERGENCY">Emergency Leave (HA)</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Date Required *</label>
                                        <input
                                            type="date"
                                            required
                                            value={leaveDate}
                                            onChange={e => setLeaveDate(e.target.value)}
                                            style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Reason & Handover Details *</label>
                                        <textarea
                                            rows={3}
                                            required
                                            value={leaveReason}
                                            onChange={e => setLeaveReason(e.target.value)}
                                            placeholder="Provide reason and specify relief cover..."
                                            style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                                        />
                                    </div>
                                    <button
                                        type="submit"
                                        disabled={submittingLeave}
                                        style={{ padding: '9px 18px', background: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: submittingLeave ? 'not-allowed' : 'pointer' }}
                                    >
                                        {submittingLeave ? 'Submitting...' : 'Submit Request'}
                                    </button>
                                </form>
                            </div>

                            {/* Request History */}
                            <div style={{ background: '#ffffff', padding: '24px', borderRadius: '14px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                                <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
                                    My Leave Requests Status
                                </h3>
                                {leaves.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                                        No leave requests submitted yet.
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        {leaves.map(l => (
                                            <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                                <div>
                                                    <div style={{ fontWeight: 600, color: '#0f172a' }}>
                                                        {l.leave_type_display} — {l.request_date}
                                                    </div>
                                                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                                                        {l.reason}
                                                    </div>
                                                    {l.admin_notes && (
                                                        <div style={{ fontSize: '11px', color: '#0284c7', marginTop: '3px' }}>
                                                            Admin note: {l.admin_notes}
                                                        </div>
                                                    )}
                                                </div>
                                                <span style={{
                                                    fontSize: '11px',
                                                    fontWeight: 600,
                                                    padding: '3px 10px',
                                                    borderRadius: '12px',
                                                    background: l.status === 'APPROVED' ? '#dcfce7' : (l.status === 'REJECTED' ? '#fee2e2' : '#fef3c7'),
                                                    color: l.status === 'APPROVED' ? '#15803d' : (l.status === 'REJECTED' ? '#dc2626' : '#d97706')
                                                }}>
                                                    {l.status_display}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* 4. COMPANY POLICIES */}
                    {activePortalTab === 'policies' && data?.active_policy && (
                        <div style={{ background: '#ffffff', padding: '28px', borderRadius: '14px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                            <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>
                                Active Rules & Regulations (v{data.active_policy.version})
                            </h3>
                            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '20px' }}>
                                Certified under company executive directives. All staff members are required to observe these workshop standards.
                            </p>
                            <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '10px', border: '1px solid #e2e8f0', whiteSpace: 'pre-line', fontSize: '13.5px', lineHeight: '1.8', color: '#1e293b' }}>
                                {data.active_policy.content}
                            </div>
                        </div>
                    )}

                    {/* 5. EXIT WINDOW */}
                    {activePortalTab === 'exit' && (
                        <div style={{ background: '#ffffff', padding: '24px', borderRadius: '14px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', maxWidth: '680px' }}>
                            <h3 style={{ margin: '0 0 14px 0', fontSize: '17px', fontWeight: 700, color: '#0f172a' }}>
                                Resignation & Notice Period Portal
                            </h3>
                            {exitReq ? (
                                <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                        <h4 style={{ margin: 0, fontSize: '15px', color: '#1e293b' }}>Resignation Notice Active</h4>
                                        <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '12px', background: '#fef3c7', color: '#b45309' }}>
                                            {exitReq.clearance_status_display}
                                        </span>
                                    </div>
                                    <div style={{ fontSize: '13px', color: '#475569', lineHeight: '1.7' }}>
                                        <div>Submitted on: <strong>{exitReq.resignation_date}</strong></div>
                                        <div>Last Working Day: <strong>{exitReq.last_working_day}</strong></div>
                                        <div style={{ color: '#d97706', fontWeight: 700, marginTop: '4px' }}>
                                            ⏳ {exitReq.days_remaining} Days Remaining in 1-Month Notice Period
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <form onSubmit={handleCreateExit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                    <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
                                        Per Appointment Letter terms, employees must serve a <strong>1-Month Notice Period</strong> before final relieving and settlement.
                                    </p>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Reason for Resignation *</label>
                                        <textarea
                                            rows={4}
                                            required
                                            value={exitReason}
                                            onChange={e => setExitReason(e.target.value)}
                                            placeholder="State your reason for resignation..."
                                            style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                                        />
                                    </div>
                                    <button
                                        type="submit"
                                        disabled={submittingExit}
                                        style={{ padding: '9px 18px', background: '#dc2626', color: '#ffffff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: submittingExit ? 'not-allowed' : 'pointer' }}
                                    >
                                        {submittingExit ? 'Submitting...' : 'Submit Resignation & Start 1-Month Notice'}
                                    </button>
                                </form>
                            )}
                        </div>
                    )}

                    {/* 6. MY PAYSLIP WITH MONTH/YEAR SELECTOR & COMPANY LOGO */}
                    {activePortalTab === 'payslip' && (
                        <div style={{ background: '#ffffff', padding: '24px', borderRadius: '14px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', maxWidth: '680px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: '#0f172a' }}>
                                        {MONTH_NAMES[selectedMonth - 1]} {selectedYear} Salary Slip
                                    </h3>
                                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                                        Issued by {companyName}
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <select
                                        value={selectedMonth}
                                        onChange={e => setSelectedMonth(Number(e.target.value))}
                                        style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                                    >
                                        {MONTH_NAMES.map((name, i) => (
                                            <option key={i + 1} value={i + 1}>{name}</option>
                                        ))}
                                    </select>
                                    <select
                                        value={selectedYear}
                                        onChange={e => setSelectedYear(Number(e.target.value))}
                                        style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                                    >
                                        {[2024, 2025, 2026, 2027].map(yr => (
                                            <option key={yr} value={yr}>{yr}</option>
                                        ))}
                                    </select>
                                    <button
                                        type="button"
                                        onClick={handleDownloadMyPayslip}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            padding: '7px 14px',
                                            background: '#0284c7',
                                            color: '#ffffff',
                                            borderRadius: '8px',
                                            border: 'none',
                                            fontSize: '13px',
                                            fontWeight: 600,
                                            cursor: 'pointer'
                                        }}
                                    >
                                        <i className="bx bx-download" />
                                        PDF Slip
                                    </button>
                                </div>
                            </div>

                            {/* Header with Logo */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0', marginBottom: '16px' }}>
                                {companyLogoUrl && (
                                    <img
                                        src={companyLogoUrl}
                                        alt={companyName}
                                        style={{ height: '36px', objectFit: 'contain' }}
                                    />
                                )}
                                <div>
                                    <div style={{ fontWeight: 800, fontSize: '15px', color: '#0f172a' }}>{companyName.toUpperCase()}</div>
                                    <div style={{ fontSize: '12px', color: '#64748b' }}>Official Employee Compensation Slip</div>
                                </div>
                            </div>

                            {data?.payroll ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                                        <span style={{ color: '#64748b' }}>Basic Salary:</span>
                                        <strong>Rs. {Number(data.payroll.basic_salary).toLocaleString()}</strong>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                                        <span style={{ color: '#64748b' }}>Time Bonus:</span>
                                        <strong style={{ color: '#16a34a' }}>+ Rs. {Number(data.payroll.bonus_time).toLocaleString()}</strong>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                                        <span style={{ color: '#64748b' }}>Zero Holiday Bonus:</span>
                                        <strong style={{ color: '#16a34a' }}>+ Rs. {Number(data.payroll.bonus_zero_holiday).toLocaleString()}</strong>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                                        <span style={{ color: '#64748b' }}>Overtime Pay:</span>
                                        <strong>+ Rs. {Number(data.payroll.overtime_pay).toLocaleString()}</strong>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                                        <span style={{ color: '#64748b' }}>Total Deductions (Attendance + Penalty):</span>
                                        <strong style={{ color: '#dc2626' }}>- Rs. {Number(data.payroll.total_attendance_deduction).toLocaleString()}</strong>
                                    </div>
                                    <div style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        background: '#ecfdf5',
                                        padding: '12px',
                                        borderRadius: '8px',
                                        border: '1px solid #a7f3d0',
                                        fontSize: '15px'
                                    }}>
                                        <span style={{ fontWeight: 700, color: '#065f46' }}>Net Take-Home Pay:</span>
                                        <strong style={{ fontWeight: 800, color: '#047857' }}>Rs. {Number(data.payroll.gross_total).toLocaleString()}</strong>
                                    </div>
                                </div>
                            ) : (
                                <div style={{ color: '#64748b', fontSize: '13px', textAlign: 'center', padding: '24px' }}>
                                    No salary record found for {MONTH_NAMES[selectedMonth - 1]} {selectedYear}.
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
