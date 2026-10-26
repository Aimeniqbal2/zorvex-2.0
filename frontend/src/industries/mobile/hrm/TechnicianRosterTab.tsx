import React, { useState, useEffect, useRef } from 'react';
import { mobileHrmApi } from './mobileHrmApi';
import type { Technician, MobileDepartmentType } from './types';

interface TechnicianRosterTabProps {
    onSelectTechnicianForPayslip?: (employeeId: string) => void;
}

const DEPARTMENTS: { label: string; value: MobileDepartmentType | 'ALL' }[] = [
    { label: 'All Departments', value: 'ALL' },
    { label: 'Hardware Lab', value: 'HARDWARE' },
    { label: 'Software Lab', value: 'SOFTWARE' },
    { label: 'Panel / Glass', value: 'PANEL_GLASS' },
    { label: 'Sales / Front Desk', value: 'SALES' },
    { label: 'Management', value: 'MANAGEMENT' },
];

export const TechnicianRosterTab: React.FC<TechnicianRosterTabProps> = ({ onSelectTechnicianForPayslip }) => {
    const [technicians, setTechnicians] = useState<Technician[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [selectedDept, setSelectedDept] = useState<MobileDepartmentType | 'ALL'>('ALL');
    const [seeding, setSeeding] = useState(false);
    const [seedMessage, setSeedMessage] = useState<string | null>(null);

    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingTech, setEditingTech] = useState<Technician | null>(null);
    const [activeModalTab, setActiveModalTab] = useState<'personal' | 'shift' | 'documents'>('personal');
    const [resetting, setResetting] = useState(false);

    // Document Modal State (Standalone & Inside Edit)
    const [docModalTech, setDocModalTech] = useState<Technician | null>(null);
    const [docTitle, setDocTitle] = useState('');
    const [docType, setDocType] = useState('CNIC');
    const [docFile, setDocFile] = useState<File | null>(null);
    const [uploadingDoc, setUploadingDoc] = useState(false);
    const [docSuccess, setDocSuccess] = useState<string | null>(null);
    const [uploadingPhoto, setUploadingPhoto] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const photoInputRef = useRef<HTMLInputElement>(null);

    // Portal User Modal State
    const [portalModalTech, setPortalModalTech] = useState<Technician | null>(null);
    const [portalUsername, setPortalUsername] = useState('');
    const [portalPassword, setPortalPassword] = useState('');
    const [portalRole, setPortalRole] = useState('hardware_technician');
    const [savingPortal, setSavingPortal] = useState(false);
    const [portalSuccess, setPortalSuccess] = useState<string | null>(null);

    const [formData, setFormData] = useState({
        first_name: '',
        last_name: '',
        emp_code: '',
        department_type: 'HARDWARE' as MobileDepartmentType,
        shift_time: '12:00',
        late_grace_minutes: 10,
        half_day_cutoff_minutes: 60,
        allowed_half_days: 0,
        allowed_medical_half_days: 1,
        ot_hourly_rate: 250,
        base_salary_input: 20000,
        phone_1_model: '',
        phone_1_imei_1: '',
        phone_1_imei_2: '',
        phone_2_model: '',
        phone_2_imei_1: '',
        phone_2_imei_2: '',
        // Personal, Contact & Emergency Fields
        cnic: '',
        phone: '',
        email: '',
        residential_address: '',
        emergency_contact_name: '',
        emergency_contact_phone: '',
        blood_group: '',
    });
    const [saving, setSaving] = useState(false);

    const loadTechnicians = async () => {
        try {
            setLoading(true);
            const data = await mobileHrmApi.getTechnicians({
                department_type: selectedDept === 'ALL' ? undefined : selectedDept,
                search: search || undefined
            });
            setTechnicians(data);
        } catch (err) {
            console.error('Failed to load technicians:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadTechnicians();
    }, [selectedDept]);

    const handleSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        loadTechnicians();
    };

    const handleSeedData = async () => {
        if (!window.confirm('Load sample Softech technicians roster, attendance, and formulas?')) return;
        try {
            setSeeding(true);
            setSeedMessage(null);
            const res = await mobileHrmApi.seedSampleData();
            setSeedMessage(res.message || 'Sample Softech data loaded successfully!');
            await loadTechnicians();
        } catch (err: any) {
            setSeedMessage(err?.response?.data?.message || 'Failed to seed sample data.');
        } finally {
            setSeeding(false);
        }
    };

    const handleCleanReset = async () => {
        if (!window.confirm('Are you sure you want to clean all mobile technician and attendance records for this company before re-importing? This allows you to re-import fresh sample data without duplicate employees.')) return;
        try {
            setResetting(true);
            setSeedMessage(null);
            const res = await mobileHrmApi.cleanReset();
            setSeedMessage(res.message);
            await loadTechnicians();
        } catch (err: any) {
            setSeedMessage('Failed to reset records.');
        } finally {
            setResetting(false);
        }
    };

    const handleOpenPortalModal = (tech: Technician) => {
        setPortalModalTech(tech);
        setPortalSuccess(null);
        setPortalUsername(tech.portal_username || tech.employee_name.toLowerCase().replace(/[^a-z0-9]/g, '_'));
        setPortalPassword('');
        setPortalRole(tech.portal_role || (tech.department_type === 'HARDWARE' ? 'hardware_technician' : (tech.department_type === 'SOFTWARE' ? 'software_technician' : 'staff')));
    };

    const handleSavePortalUser = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!portalModalTech) return;
        try {
            setSavingPortal(true);
            const res = await mobileHrmApi.createPortalUser(portalModalTech.id, {
                username: portalUsername,
                password: portalPassword || undefined,
                role: portalRole
            });
            setPortalSuccess(`✓ Portal credentials for @${res.username} saved! Role: ${res.role}`);
            await loadTechnicians();
            setTimeout(() => {
                setPortalModalTech(null);
                setPortalSuccess(null);
            }, 1800);
        } catch (err: any) {
            alert(err?.response?.data?.detail || 'Failed to configure portal user account.');
        } finally {
            setSavingPortal(false);
        }
    };

    const getMediaUrl = (url?: string) => {
        if (!url) return '';
        if (url.startsWith('http')) return url;
        return `http://127.0.0.1:8000${url.startsWith('/') ? '' : '/'}${url}`;
    };

    const formatFileSize = (bytes?: number) => {
        if (!bytes) return '';
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    const handleOpenAdd = () => {
        setEditingTech(null);
        setActiveModalTab('personal');
        setFormData({
            first_name: '',
            last_name: '',
            emp_code: '',
            department_type: 'HARDWARE',
            shift_time: '12:00',
            late_grace_minutes: 10,
            half_day_cutoff_minutes: 60,
            allowed_half_days: 0,
            allowed_medical_half_days: 1,
            ot_hourly_rate: 250,
            base_salary_input: 20000,
            phone_1_model: '',
            phone_1_imei_1: '',
            phone_1_imei_2: '',
            phone_2_model: '',
            phone_2_imei_1: '',
            phone_2_imei_2: '',
            cnic: '',
            phone: '',
            email: '',
            residential_address: '',
            emergency_contact_name: '',
            emergency_contact_phone: '',
            blood_group: '',
        });
        setIsModalOpen(true);
    };

    const handleOpenEdit = (tech: Technician) => {
        setEditingTech(tech);
        setActiveModalTab('personal');
        setDocSuccess(null);
        setFormData({
            first_name: tech.employee_name.split(' ')[0] || '',
            last_name: tech.employee_name.split(' ').slice(1).join(' ') || '',
            emp_code: tech.employee_code || '',
            department_type: tech.department_type,
            shift_time: tech.shift_time ? tech.shift_time.substring(0, 5) : '12:00',
            late_grace_minutes: tech.late_grace_minutes || 10,
            half_day_cutoff_minutes: tech.half_day_cutoff_minutes || 60,
            allowed_half_days: tech.allowed_half_days || 0,
            allowed_medical_half_days: tech.allowed_medical_half_days || 1,
            ot_hourly_rate: tech.ot_hourly_rate || 250,
            base_salary_input: tech.basic_salary || 20000,
            phone_1_model: tech.phone_1_model || '',
            phone_1_imei_1: tech.phone_1_imei_1 || '',
            phone_1_imei_2: tech.phone_1_imei_2 || '',
            phone_2_model: tech.phone_2_model || '',
            phone_2_imei_1: tech.phone_2_imei_1 || '',
            phone_2_imei_2: tech.phone_2_imei_2 || '',
            cnic: tech.cnic || '',
            phone: tech.phone || '',
            email: tech.email || '',
            residential_address: tech.residential_address || '',
            emergency_contact_name: tech.emergency_contact_name || '',
            emergency_contact_phone: tech.emergency_contact_phone || '',
            blood_group: tech.blood_group || '',
        });
        setIsModalOpen(true);
    };

    const handleOpenDocModal = (tech: Technician) => {
        setDocModalTech(tech);
        setDocTitle('');
        setDocType('CNIC');
        setDocFile(null);
        setDocSuccess(null);
    };

    const handleUploadDocument = async (techId: string) => {
        if (!docFile) {
            alert('Please choose a document or image to upload.');
            return;
        }
        try {
            setUploadingDoc(true);
            setDocSuccess(null);
            const res = await mobileHrmApi.uploadDocument(techId, docFile, docTitle || docFile.name, docType);
            setDocSuccess(`✓ "${res.document.name}" uploaded successfully!`);
            setDocFile(null);
            setDocTitle('');
            if (fileInputRef.current) fileInputRef.current.value = '';

            setTechnicians(prev => prev.map(t => (t.id === techId ? { ...t, document_urls: res.documents } : t)));
            if (docModalTech && docModalTech.id === techId) {
                setDocModalTech(prev => (prev ? { ...prev, document_urls: res.documents } : null));
            }
            if (editingTech && editingTech.id === techId) {
                setEditingTech(prev => (prev ? { ...prev, document_urls: res.documents } : null));
            }
        } catch (err: any) {
            alert(err?.response?.data?.detail || 'Failed to upload document.');
        } finally {
            setUploadingDoc(false);
        }
    };

    const handleDeleteDocument = async (techId: string, docId?: string, url?: string) => {
        if (!window.confirm('Are you sure you want to delete this document?')) return;
        try {
            const res = await mobileHrmApi.deleteDocument(techId, docId, url);
            setTechnicians(prev => prev.map(t => (t.id === techId ? { ...t, document_urls: res.documents } : t)));
            if (docModalTech && docModalTech.id === techId) {
                setDocModalTech(prev => (prev ? { ...prev, document_urls: res.documents } : null));
            }
            if (editingTech && editingTech.id === techId) {
                setEditingTech(prev => (prev ? { ...prev, document_urls: res.documents } : null));
            }
        } catch (err: any) {
            alert('Failed to delete document.');
        }
    };

    const handleUploadPhoto = async (techId: string, file: File) => {
        try {
            setUploadingPhoto(true);
            const res = await mobileHrmApi.uploadPhoto(techId, file);
            setTechnicians(prev => prev.map(t => (t.id === techId ? { ...t, photo_url: res.photo_url } : t)));
            if (editingTech && editingTech.id === techId) {
                setEditingTech(prev => (prev ? { ...prev, photo_url: res.photo_url } : null));
            }
            if (docModalTech && docModalTech.id === techId) {
                setDocModalTech(prev => (prev ? { ...prev, photo_url: res.photo_url } : null));
            }
        } catch (err: any) {
            alert('Failed to upload photo.');
        } finally {
            setUploadingPhoto(false);
        }
    };

    const handleDelete = async (id: string, name: string) => {
        if (!window.confirm(`Are you sure you want to remove technician "${name}"?`)) return;
        try {
            await mobileHrmApi.deleteTechnician(id);
            setTechnicians(prev => prev.filter(t => t.id !== id));
        } catch (err) {
            alert('Failed to delete technician.');
        }
    };

    const handleFormSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setSaving(true);
            if (editingTech) {
                const updated = await mobileHrmApi.updateTechnician(editingTech.id, formData);
                setTechnicians(prev => prev.map(t => (t.id === updated.id ? updated : t)));
            } else {
                const created = await mobileHrmApi.createTechnician(formData);
                setTechnicians(prev => [created, ...prev]);
            }
            setIsModalOpen(false);
        } catch (err: any) {
            const data = err?.response?.data;
            const msg = data?.first_name || data?.detail || (typeof data === 'object' ? Object.values(data).flat().join(', ') : 'Failed to save employee.');
            alert(msg || 'Failed to save employee.');
        } finally {
            setSaving(false);
        }
    };

    const getDeptColor = (type: string) => {
        switch (type) {
            case 'HARDWARE': return '#3b82f6';
            case 'SOFTWARE': return '#10b981';
            case 'PANEL_GLASS': return '#f59e0b';
            case 'SALES': return '#8b5cf6';
            case 'MANAGEMENT': return '#ec4899';
            default: return '#64748b';
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '24px' }}>
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
                {/* Search Bar */}
                <form onSubmit={handleSearchSubmit} style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '280px' }}>
                    <div style={{ position: 'relative', width: '100%' }}>
                        <i className="bx bx-search" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                        <input
                            type="text"
                            placeholder="Search name, code, phone, IMEI..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '8px 12px 8px 36px',
                                borderRadius: '8px',
                                border: '1px solid var(--color-border, #cbd5e1)',
                                background: 'var(--color-background, #f8fafc)',
                                color: 'var(--color-text, #1e293b)',
                                fontSize: '14px',
                                outline: 'none'
                            }}
                        />
                    </div>
                    <button
                        type="submit"
                        style={{
                            padding: '8px 16px',
                            background: 'var(--color-primary, #2563eb)',
                            color: '#ffffff',
                            borderRadius: '8px',
                            border: 'none',
                            fontWeight: 500,
                            cursor: 'pointer'
                        }}
                    >
                        Search
                    </button>
                </form>

                {/* Action Buttons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <button
                        type="button"
                        onClick={handleSeedData}
                        disabled={seeding}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '8px 16px',
                            background: '#0284c7',
                            color: '#ffffff',
                            borderRadius: '8px',
                            border: 'none',
                            fontWeight: 500,
                            fontSize: '13px',
                            cursor: seeding ? 'not-allowed' : 'pointer'
                        }}
                    >
                        <i className={`bx ${seeding ? 'bx-loader-alt bx-spin' : 'bx-cloud-download'}`} />
                        {seeding ? 'Importing Softech Data...' : 'Import Softech Sample'}
                    </button>

                    <button
                        type="button"
                        onClick={handleCleanReset}
                        disabled={resetting}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '8px 16px',
                            background: '#ffffff',
                            color: '#dc2626',
                            borderRadius: '8px',
                            border: '1px solid #fca5a5',
                            fontWeight: 600,
                            fontSize: '13px',
                            cursor: resetting ? 'not-allowed' : 'pointer'
                        }}
                    >
                        <i className={`bx ${resetting ? 'bx-loader-alt bx-spin' : 'bx-trash-alt'}`} />
                        {resetting ? 'Resetting Data...' : 'Reset Staff Data'}
                    </button>

                    <button
                        type="button"
                        onClick={handleOpenAdd}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '8px 18px',
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
                        Add Employee / Staff
                    </button>
                </div>
            </div>

            {/* Seed Status Banner */}
            {seedMessage && (
                <div style={{
                    padding: '12px 18px',
                    borderRadius: '8px',
                    background: '#eff6ff',
                    border: '1px solid #bfdbfe',
                    color: '#1e40af',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '14px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <i className="bx bx-info-circle" style={{ fontSize: '18px' }} />
                        <span>{seedMessage}</span>
                    </div>
                    <button
                        onClick={() => setSeedMessage(null)}
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b' }}
                    >
                        <i className="bx bx-x" style={{ fontSize: '18px' }} />
                    </button>
                </div>
            )}

            {/* Department Filter Pills */}
            <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '4px' }}>
                {DEPARTMENTS.map(dept => {
                    const active = selectedDept === dept.value;
                    return (
                        <button
                            key={dept.value}
                            type="button"
                            onClick={() => setSelectedDept(dept.value)}
                            style={{
                                padding: '8px 18px',
                                borderRadius: '20px',
                                fontSize: '13px',
                                fontWeight: active ? 600 : 500,
                                border: '1px solid',
                                borderColor: active ? 'var(--color-primary, #2563eb)' : 'var(--color-border, #cbd5e1)',
                                background: active ? 'var(--color-primary, #2563eb)' : 'var(--color-surface, #ffffff)',
                                color: active ? '#ffffff' : 'var(--color-text, #334155)',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                                whiteSpace: 'nowrap'
                            }}
                        >
                            {dept.label}
                        </button>
                    );
                })}
            </div>

            {/* Employees List / Cards */}
            {loading ? (
                <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>
                    <i className="bx bx-loader-alt bx-spin" style={{ fontSize: '32px', marginBottom: '8px' }} />
                    <div>Loading Employees & Staff Roster...</div>
                </div>
            ) : technicians.length === 0 ? (
                <div style={{
                    padding: '60px',
                    textAlign: 'center',
                    background: 'var(--color-surface, #ffffff)',
                    borderRadius: '12px',
                    border: '1px dashed var(--color-border, #cbd5e1)'
                }}>
                    <i className="bx bx-user-circle" style={{ fontSize: '48px', color: '#94a3b8', marginBottom: '12px' }} />
                    <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--color-text, #1e293b)', margin: '0 0 6px 0' }}>
                        No Employees Registered
                    </h3>
                    <p style={{ color: '#64748b', fontSize: '14px', margin: '0 0 16px 0' }}>
                        Click "Import Softech Sample" to load workshop data or register a new employee manually.
                    </p>
                    <button
                        onClick={handleSeedData}
                        style={{
                            padding: '8px 20px',
                            background: '#0284c7',
                            color: '#ffffff',
                            borderRadius: '8px',
                            border: 'none',
                            fontWeight: 500,
                            cursor: 'pointer'
                        }}
                    >
                        Import Softech Sample Data
                    </button>
                </div>
            ) : (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
                    gap: '20px'
                }}>
                    {technicians.map(tech => {
                        const deptColor = getDeptColor(tech.department_type);
                        return (
                            <div
                                key={tech.id}
                                style={{
                                    background: 'var(--color-surface, #ffffff)',
                                    borderRadius: '14px',
                                    border: '1px solid var(--color-border, #e2e8f0)',
                                    padding: '20px',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'space-between',
                                    transition: 'transform 0.15s ease, box-shadow 0.15s ease'
                                }}
                            >
                                <div>
                                    {/* Card Header */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                            {tech.photo_url ? (
                                                <img
                                                    src={getMediaUrl(tech.photo_url)}
                                                    alt={tech.employee_name}
                                                    style={{ width: '46px', height: '46px', borderRadius: '50%', objectFit: 'cover', border: '2px solid #e2e8f0' }}
                                                />
                                            ) : (
                                                <div style={{
                                                    width: '46px',
                                                    height: '46px',
                                                    borderRadius: '50%',
                                                    background: `${deptColor}15`,
                                                    color: deptColor,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    fontWeight: 700,
                                                    fontSize: '16px',
                                                    border: `1px solid ${deptColor}30`
                                                }}>
                                                    {tech.employee_name ? tech.employee_name.substring(0, 2).toUpperCase() : 'EM'}
                                                </div>
                                            )}
                                            <div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <h4 style={{ margin: 0, fontSize: '16.5px', fontWeight: 700, color: 'var(--color-text, #0f172a)' }}>
                                                        {tech.employee_name}
                                                    </h4>
                                                    <span style={{
                                                        fontSize: '11px',
                                                        fontWeight: 600,
                                                        padding: '2px 8px',
                                                        borderRadius: '6px',
                                                        background: '#f1f5f9',
                                                        color: '#475569'
                                                    }}>
                                                        {tech.employee_code}
                                                    </span>
                                                </div>
                                                <div style={{ marginTop: '4px', display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                                                    <span style={{
                                                        display: 'inline-block',
                                                        fontSize: '11.5px',
                                                        fontWeight: 600,
                                                        padding: '2px 10px',
                                                        borderRadius: '12px',
                                                        background: `${deptColor}15`,
                                                        color: deptColor,
                                                        border: `1px solid ${deptColor}30`
                                                    }}>
                                                        {tech.department_display}
                                                    </span>
                                                    {tech.blood_group && (
                                                        <span style={{
                                                            fontSize: '11px',
                                                            fontWeight: 700,
                                                            padding: '2px 8px',
                                                            borderRadius: '10px',
                                                            background: '#fee2e2',
                                                            color: '#b91c1c'
                                                        }}>
                                                            🩸 {tech.blood_group}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', gap: '6px' }}>
                                            <button
                                                title="Documents & Attachments"
                                                onClick={() => handleOpenDocModal(tech)}
                                                style={{
                                                    background: (tech.document_urls && tech.document_urls.length > 0) ? '#f0fdf4' : 'transparent',
                                                    border: `1px solid ${(tech.document_urls && tech.document_urls.length > 0) ? '#86efac' : 'var(--color-border, #e2e8f0)'}`,
                                                    borderRadius: '6px',
                                                    padding: '6px 8px',
                                                    cursor: 'pointer',
                                                    color: (tech.document_urls && tech.document_urls.length > 0) ? '#16a34a' : '#475569',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    fontSize: '12px',
                                                    fontWeight: 600
                                                }}
                                            >
                                                <i className="bx bx-paperclip" style={{ fontSize: '15px' }} />
                                                <span>{tech.document_urls?.length || 0}</span>
                                            </button>
                                            <button
                                                title="Edit Profile"
                                                onClick={() => handleOpenEdit(tech)}
                                                style={{
                                                    background: 'transparent',
                                                    border: '1px solid var(--color-border, #e2e8f0)',
                                                    borderRadius: '6px',
                                                    padding: '6px',
                                                    cursor: 'pointer',
                                                    color: '#475569'
                                                }}
                                            >
                                                <i className="bx bx-edit" style={{ fontSize: '16px' }} />
                                            </button>
                                            <button
                                                title="Delete"
                                                onClick={() => handleDelete(tech.id, tech.employee_name)}
                                                style={{
                                                    background: 'transparent',
                                                    border: '1px solid #fee2e2',
                                                    borderRadius: '6px',
                                                    padding: '6px',
                                                    cursor: 'pointer',
                                                    color: '#ef4444'
                                                }}
                                            >
                                                <i className="bx bx-trash" style={{ fontSize: '16px' }} />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Personal Contact & KYC Summary */}
                                    <div style={{
                                        marginBottom: '12px',
                                        padding: '10px 12px',
                                        background: 'var(--color-background, #f8fafc)',
                                        borderRadius: '8px',
                                        fontSize: '12.5px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '5px',
                                        border: '1px solid #f1f5f9'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span style={{ color: '#64748b' }}>🪪 CNIC:</span>
                                            <strong style={{ color: '#1e293b', letterSpacing: '0.5px' }}>{tech.cnic || '—'}</strong>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span style={{ color: '#64748b' }}>📞 Phone:</span>
                                            <strong style={{ color: '#1e293b' }}>{tech.phone || '—'}</strong>
                                        </div>
                                        {tech.emergency_contact_phone && (
                                            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #e2e8f0', paddingTop: '4px' }}>
                                                <span style={{ color: '#dc2626', fontWeight: 500 }}>🚨 Emergency:</span>
                                                <strong style={{ color: '#dc2626' }}>
                                                    {tech.emergency_contact_name ? `${tech.emergency_contact_name}: ` : ''}{tech.emergency_contact_phone}
                                                </strong>
                                            </div>
                                        )}
                                    </div>

                                    {/* Work Specs Grid */}
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: '1fr 1fr',
                                        gap: '10px',
                                        background: 'var(--color-background, #f8fafc)',
                                        padding: '12px',
                                        borderRadius: '10px',
                                        fontSize: '13px',
                                        marginBottom: '14px'
                                    }}>
                                        <div>
                                            <div style={{ color: '#64748b', fontSize: '11px', textTransform: 'uppercase' }}>Shift Start</div>
                                            <div style={{ fontWeight: 600, color: '#1e293b' }}>
                                                {tech.shift_time ? tech.shift_time.substring(0, 5) : '12:00'} (Grace: {tech.late_grace_minutes}m)
                                            </div>
                                        </div>
                                        <div>
                                            <div style={{ color: '#64748b', fontSize: '11px', textTransform: 'uppercase' }}>Basic Salary</div>
                                            <div style={{ fontWeight: 600, color: '#059669' }}>
                                                Rs. {tech.basic_salary?.toLocaleString() || '20,000'}
                                            </div>
                                        </div>
                                        <div>
                                            <div style={{ color: '#64748b', fontSize: '11px', textTransform: 'uppercase' }}>Overtime Rate</div>
                                            <div style={{ fontWeight: 600, color: '#2563eb' }}>
                                                Rs. {tech.ot_hourly_rate}/hr
                                            </div>
                                        </div>
                                        <div>
                                            <div style={{ color: '#64748b', fontSize: '11px', textTransform: 'uppercase' }}>Medical / Half Qta</div>
                                            <div style={{ fontWeight: 600, color: '#1e293b' }}>
                                                {tech.allowed_medical_half_days || 1} day / mo
                                            </div>
                                        </div>
                                    </div>

                                    {/* Assigned Phones & IMEIs */}
                                    {(tech.phone_1_model || tech.phone_2_model) && (
                                        <div style={{
                                            borderTop: '1px solid var(--color-border, #f1f5f9)',
                                            paddingTop: '10px',
                                            fontSize: '12px'
                                        }}>
                                            <div style={{ color: '#64748b', fontSize: '11px', fontWeight: 600, marginBottom: '6px' }}>
                                                ASSIGNED TESTING HARDWARE:
                                            </div>
                                            {tech.phone_1_model && (
                                                <div style={{ marginBottom: '4px', color: '#334155' }}>
                                                    <strong>📱 {tech.phone_1_model}</strong>
                                                    {tech.phone_1_imei_1 && (
                                                        <span style={{ color: '#64748b', marginLeft: '6px', fontSize: '11px' }}>
                                                            IMEI: {tech.phone_1_imei_1}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                            {tech.phone_2_model && (
                                                <div style={{ color: '#334155' }}>
                                                    <strong>📱 {tech.phone_2_model}</strong>
                                                    {tech.phone_2_imei_1 && (
                                                        <span style={{ color: '#64748b', marginLeft: '6px', fontSize: '11px' }}>
                                                            IMEI: {tech.phone_2_imei_1}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    {/* Portal Access Status */}
                                    <div style={{
                                        marginTop: '12px',
                                        padding: '10px 12px',
                                        background: tech.has_portal_access ? '#f0fdf4' : '#fffbeb',
                                        borderRadius: '8px',
                                        border: tech.has_portal_access ? '1px solid #bbf7d0' : '1px solid #fde68a',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        fontSize: '12px'
                                    }}>
                                        <div>
                                            <div style={{ fontWeight: 700, color: tech.has_portal_access ? '#15803d' : '#b45309', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <i className={`bx ${tech.has_portal_access ? 'bx-check-shield' : 'bx-lock-alt'}`} />
                                                {tech.has_portal_access ? `Portal: @${tech.portal_username}` : 'No Portal Account'}
                                            </div>
                                            {tech.has_portal_access && (
                                                <div style={{ fontSize: '11px', color: '#64748b' }}>
                                                    Role: {tech.portal_role}
                                                </div>
                                            )}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => handleOpenPortalModal(tech)}
                                            style={{
                                                padding: '5px 10px',
                                                borderRadius: '6px',
                                                border: 'none',
                                                background: tech.has_portal_access ? '#15803d' : '#2563eb',
                                                color: '#ffffff',
                                                fontSize: '11.5px',
                                                fontWeight: 600,
                                                cursor: 'pointer'
                                            }}
                                        >
                                            {tech.has_portal_access ? 'Manage Access' : 'Create Login'}
                                        </button>
                                    </div>
                                </div>

                                {/* Footer Action */}
                                <div style={{ marginTop: '16px', borderTop: '1px solid var(--color-border, #f1f5f9)', paddingTop: '12px' }}>
                                    <button
                                        type="button"
                                        onClick={() => onSelectTechnicianForPayslip && onSelectTechnicianForPayslip(tech.employee)}
                                        style={{
                                            width: '100%',
                                            padding: '8px',
                                            background: '#f8fafc',
                                            border: '1px solid var(--color-border, #cbd5e1)',
                                            borderRadius: '8px',
                                            color: '#334155',
                                            fontSize: '13px',
                                            fontWeight: 500,
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '6px'
                                        }}
                                    >
                                        <i className="bx bx-receipt" />
                                        View Salary Slip
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Add / Edit Modal */}
            {isModalOpen && (
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
                        background: 'var(--color-surface, #ffffff)',
                        borderRadius: '16px',
                        width: '100%',
                        maxWidth: '680px',
                        maxHeight: '90vh',
                        overflowY: 'auto',
                        padding: '24px',
                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h3 style={{ margin: 0, fontSize: '19px', fontWeight: 700, color: 'var(--color-text, #0f172a)' }}>
                                {editingTech ? `Edit Employee / Staff: ${editingTech.employee_name}` : 'Register New Employee / Staff'}
                            </h3>
                            <button
                                onClick={() => setIsModalOpen(false)}
                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#64748b' }}
                            >
                                <i className="bx bx-x" />
                            </button>
                        </div>

                        {/* Tab Bar Navigation */}
                        <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', marginBottom: '18px', overflowX: 'auto' }}>
                            <button
                                type="button"
                                onClick={() => setActiveModalTab('personal')}
                                style={{
                                    padding: '8px 16px',
                                    borderRadius: '8px',
                                    border: 'none',
                                    background: activeModalTab === 'personal' ? 'var(--color-primary, #2563eb)' : '#f1f5f9',
                                    color: activeModalTab === 'personal' ? '#ffffff' : '#475569',
                                    fontWeight: 600,
                                    fontSize: '13px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                }}
                            >
                                <i className="bx bx-id-card" style={{ fontSize: '16px' }} />
                                Personal & Contact Info
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveModalTab('shift')}
                                style={{
                                    padding: '8px 16px',
                                    borderRadius: '8px',
                                    border: 'none',
                                    background: activeModalTab === 'shift' ? 'var(--color-primary, #2563eb)' : '#f1f5f9',
                                    color: activeModalTab === 'shift' ? '#ffffff' : '#475569',
                                    fontWeight: 600,
                                    fontSize: '13px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                }}
                            >
                                <i className="bx bx-time" style={{ fontSize: '16px' }} />
                                Shift, Salary & Hardware
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveModalTab('documents')}
                                style={{
                                    padding: '8px 16px',
                                    borderRadius: '8px',
                                    border: 'none',
                                    background: activeModalTab === 'documents' ? 'var(--color-primary, #2563eb)' : '#f1f5f9',
                                    color: activeModalTab === 'documents' ? '#ffffff' : '#475569',
                                    fontWeight: 600,
                                    fontSize: '13px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                }}
                            >
                                <i className="bx bx-paperclip" style={{ fontSize: '16px' }} />
                                Documents & KYC ({editingTech?.document_urls?.length || 0})
                            </button>
                        </div>

                        <form onSubmit={handleFormSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {/* TAB 1: PERSONAL & CONTACT */}
                            {activeModalTab === 'personal' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                                                First Name *
                                            </label>
                                            <input
                                                type="text"
                                                required
                                                value={formData.first_name}
                                                onChange={e => setFormData({ ...formData, first_name: e.target.value })}
                                                placeholder="e.g. Muhammad"
                                                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--color-border, #cbd5e1)', outline: 'none' }}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                                                Last Name
                                            </label>
                                            <input
                                                type="text"
                                                value={formData.last_name}
                                                onChange={e => setFormData({ ...formData, last_name: e.target.value })}
                                                placeholder="e.g. Jahanzaib"
                                                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--color-border, #cbd5e1)', outline: 'none' }}
                                            />
                                        </div>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                                                Employee Code
                                            </label>
                                            <input
                                                type="text"
                                                value={formData.emp_code}
                                                onChange={e => setFormData({ ...formData, emp_code: e.target.value })}
                                                placeholder="e.g. EMP001 (Auto-generated if empty)"
                                                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--color-border, #cbd5e1)', outline: 'none' }}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                                                Department Lab *
                                            </label>
                                            <select
                                                value={formData.department_type}
                                                onChange={e => setFormData({ ...formData, department_type: e.target.value as MobileDepartmentType })}
                                                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--color-border, #cbd5e1)', outline: 'none' }}
                                            >
                                                <option value="HARDWARE">Hardware Lab</option>
                                                <option value="SOFTWARE">Software Lab</option>
                                                <option value="PANEL_GLASS">Panel / Glass</option>
                                                <option value="SALES">Sales / Front Desk</option>
                                                <option value="MANAGEMENT">Management</option>
                                            </select>
                                        </div>
                                    </div>

                                    {/* CNIC & Blood Group */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '14px' }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                                                🪪 CNIC Number (National ID)
                                            </label>
                                            <input
                                                type="text"
                                                value={formData.cnic}
                                                onChange={e => setFormData({ ...formData, cnic: e.target.value })}
                                                placeholder="e.g. 42101-1234567-1"
                                                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--color-border, #cbd5e1)', outline: 'none' }}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                                                🩸 Blood Group
                                            </label>
                                            <select
                                                value={formData.blood_group}
                                                onChange={e => setFormData({ ...formData, blood_group: e.target.value })}
                                                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--color-border, #cbd5e1)', outline: 'none' }}
                                            >
                                                <option value="">Select</option>
                                                <option value="A+">A+</option>
                                                <option value="A-">A-</option>
                                                <option value="B+">B+</option>
                                                <option value="B-">B-</option>
                                                <option value="O+">O+</option>
                                                <option value="O-">O-</option>
                                                <option value="AB+">AB+</option>
                                                <option value="AB-">AB-</option>
                                            </select>
                                        </div>
                                    </div>

                                    {/* Contact Phone & Email */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                                                📞 Phone / WhatsApp
                                            </label>
                                            <input
                                                type="text"
                                                value={formData.phone}
                                                onChange={e => setFormData({ ...formData, phone: e.target.value })}
                                                placeholder="e.g. 0300-1234567"
                                                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--color-border, #cbd5e1)', outline: 'none' }}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                                                ✉️ Email Address
                                            </label>
                                            <input
                                                type="email"
                                                value={formData.email}
                                                onChange={e => setFormData({ ...formData, email: e.target.value })}
                                                placeholder="e.g. staff@softech.com"
                                                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--color-border, #cbd5e1)', outline: 'none' }}
                                            />
                                        </div>
                                    </div>

                                    {/* Residential Address */}
                                    <div>
                                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                                            🏠 Residential / Home Address
                                        </label>
                                        <textarea
                                            rows={2}
                                            value={formData.residential_address}
                                            onChange={e => setFormData({ ...formData, residential_address: e.target.value })}
                                            placeholder="House / Apartment #, Street, Area, City"
                                            style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--color-border, #cbd5e1)', outline: 'none', resize: 'vertical' }}
                                        />
                                    </div>

                                    {/* Emergency Contact */}
                                    <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '14px' }}>
                                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#991b1b', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <i className="bx bx-error-circle" />
                                            Emergency Contact Information
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#7f1d1d', marginBottom: '4px' }}>
                                                    Contact Person Name & Relation
                                                </label>
                                                <input
                                                    type="text"
                                                    value={formData.emergency_contact_name}
                                                    onChange={e => setFormData({ ...formData, emergency_contact_name: e.target.value })}
                                                    placeholder="e.g. Muhammad Aslam (Father)"
                                                    style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #fca5a5', outline: 'none', background: '#ffffff' }}
                                                />
                                            </div>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#7f1d1d', marginBottom: '4px' }}>
                                                    Emergency Contact Phone
                                                </label>
                                                <input
                                                    type="text"
                                                    value={formData.emergency_contact_phone}
                                                    onChange={e => setFormData({ ...formData, emergency_contact_phone: e.target.value })}
                                                    placeholder="e.g. 0321-9876543"
                                                    style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #fca5a5', outline: 'none', background: '#ffffff' }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* TAB 2: SHIFT, SALARY & HARDWARE */}
                            {activeModalTab === 'shift' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px' }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                                                Shift Start Time
                                            </label>
                                            <input
                                                type="time"
                                                value={formData.shift_time}
                                                onChange={e => setFormData({ ...formData, shift_time: e.target.value })}
                                                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--color-border, #cbd5e1)', outline: 'none' }}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                                                Basic Salary (PKR)
                                            </label>
                                            <input
                                                type="number"
                                                value={formData.base_salary_input}
                                                onChange={e => setFormData({ ...formData, base_salary_input: Number(e.target.value) })}
                                                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--color-border, #cbd5e1)', outline: 'none' }}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                                                OT Hourly Rate (PKR)
                                            </label>
                                            <input
                                                type="number"
                                                value={formData.ot_hourly_rate}
                                                onChange={e => setFormData({ ...formData, ot_hourly_rate: Number(e.target.value) })}
                                                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--color-border, #cbd5e1)', outline: 'none' }}
                                            />
                                        </div>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>
                                                Late Grace Minutes
                                            </label>
                                            <input
                                                type="number"
                                                value={formData.late_grace_minutes}
                                                onChange={e => setFormData({ ...formData, late_grace_minutes: Number(e.target.value) })}
                                                style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>
                                                Half-Day Cutoff Minutes
                                            </label>
                                            <input
                                                type="number"
                                                value={formData.half_day_cutoff_minutes}
                                                onChange={e => setFormData({ ...formData, half_day_cutoff_minutes: Number(e.target.value) })}
                                                style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                                            />
                                        </div>
                                    </div>

                                    {/* Assigned Hardware */}
                                    <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '14px' }}>
                                        <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#334155', marginBottom: '10px' }}>
                                            📱 Assigned Testing Phones & IMEIs (Workshop Inventory)
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '10px' }}>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>
                                                    Phone 1 Model
                                                </label>
                                                <input
                                                    type="text"
                                                    value={formData.phone_1_model}
                                                    onChange={e => setFormData({ ...formData, phone_1_model: e.target.value })}
                                                    placeholder="e.g. Vivo Y21"
                                                    style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                                                />
                                            </div>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>
                                                    Phone 1 IMEI
                                                </label>
                                                <input
                                                    type="text"
                                                    value={formData.phone_1_imei_1}
                                                    onChange={e => setFormData({ ...formData, phone_1_imei_1: e.target.value })}
                                                    placeholder="e.g. 863456051234567"
                                                    style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                                                />
                                            </div>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>
                                                    Phone 2 Model
                                                </label>
                                                <input
                                                    type="text"
                                                    value={formData.phone_2_model}
                                                    onChange={e => setFormData({ ...formData, phone_2_model: e.target.value })}
                                                    placeholder="e.g. Samsung A12"
                                                    style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                                                />
                                            </div>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>
                                                    Phone 2 IMEI
                                                </label>
                                                <input
                                                    type="text"
                                                    value={formData.phone_2_imei_1}
                                                    onChange={e => setFormData({ ...formData, phone_2_imei_1: e.target.value })}
                                                    placeholder="e.g. 863456059876543"
                                                    style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* TAB 3: DOCUMENTS & ATTACHMENTS */}
                            {activeModalTab === 'documents' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                                    {editingTech ? (
                                        <>
                                            {/* Photo Upload Section */}
                                            <div style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '16px',
                                                padding: '14px',
                                                background: '#f8fafc',
                                                borderRadius: '10px',
                                                border: '1px solid #e2e8f0'
                                            }}>
                                                {editingTech.photo_url ? (
                                                    <img
                                                        src={getMediaUrl(editingTech.photo_url)}
                                                        alt="Avatar"
                                                        style={{ width: '60px', height: '60px', borderRadius: '50%', objectFit: 'cover', border: '2px solid #cbd5e1' }}
                                                    />
                                                ) : (
                                                    <div style={{
                                                        width: '60px',
                                                        height: '60px',
                                                        borderRadius: '50%',
                                                        background: '#e2e8f0',
                                                        color: '#475569',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        fontWeight: 700,
                                                        fontSize: '20px'
                                                    }}>
                                                        {editingTech.employee_name ? editingTech.employee_name.substring(0, 2).toUpperCase() : 'EM'}
                                                    </div>
                                                )}
                                                <div>
                                                    <div style={{ fontWeight: 600, fontSize: '14px', color: '#1e293b' }}>Employee Profile Photo</div>
                                                    <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px' }}>Upload a portrait image for roster and portal display</div>
                                                    <input
                                                        type="file"
                                                        ref={photoInputRef}
                                                        accept="image/*"
                                                        style={{ display: 'none' }}
                                                        onChange={e => {
                                                            if (e.target.files && e.target.files[0]) {
                                                                handleUploadPhoto(editingTech.id, e.target.files[0]);
                                                            }
                                                        }}
                                                    />
                                                    <button
                                                        type="button"
                                                        disabled={uploadingPhoto}
                                                        onClick={() => photoInputRef.current?.click()}
                                                        style={{
                                                            padding: '5px 12px',
                                                            borderRadius: '6px',
                                                            border: '1px solid #cbd5e1',
                                                            background: '#ffffff',
                                                            color: '#334155',
                                                            fontSize: '12px',
                                                            fontWeight: 600,
                                                            cursor: uploadingPhoto ? 'not-allowed' : 'pointer'
                                                        }}
                                                    >
                                                        {uploadingPhoto ? 'Uploading Photo...' : 'Choose Portrait Photo'}
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Upload Document Form */}
                                            <div style={{
                                                padding: '16px',
                                                background: '#f8fafc',
                                                borderRadius: '10px',
                                                border: '1px dashed #cbd5e1'
                                            }}>
                                                <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#1e293b', marginBottom: '10px' }}>
                                                    Upload New Document / Certificate / CNIC
                                                </div>
                                                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px', marginBottom: '10px' }}>
                                                    <div>
                                                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                                                            Document Title / Description *
                                                        </label>
                                                        <input
                                                            type="text"
                                                            value={docTitle}
                                                            onChange={e => setDocTitle(e.target.value)}
                                                            placeholder="e.g. CNIC Front, CNIC Back, Resume, Offer Letter"
                                                            style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                                                            Document Type
                                                        </label>
                                                        <select
                                                            value={docType}
                                                            onChange={e => setDocType(e.target.value)}
                                                            style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                                                        >
                                                            <option value="CNIC">CNIC / ID Card</option>
                                                            <option value="Picture / Photo">Picture / Photo</option>
                                                            <option value="Degree / Certificate">Degree / Certificate</option>
                                                            <option value="Experience / Resume">Experience Letter / CV</option>
                                                            <option value="Contract / NDA">Contract / NDA</option>
                                                            <option value="Police Verification">Police Verification</option>
                                                            <option value="Other">Other Document</option>
                                                        </select>
                                                    </div>
                                                </div>

                                                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                                    <input
                                                        type="file"
                                                        ref={fileInputRef}
                                                        accept="image/*,application/pdf,.doc,.docx"
                                                        onChange={e => setDocFile(e.target.files ? e.target.files[0] : null)}
                                                        style={{ fontSize: '12px', color: '#475569' }}
                                                    />
                                                    <button
                                                        type="button"
                                                        disabled={uploadingDoc || !docFile}
                                                        onClick={() => handleUploadDocument(editingTech.id)}
                                                        style={{
                                                            padding: '7px 16px',
                                                            borderRadius: '6px',
                                                            border: 'none',
                                                            background: uploadingDoc || !docFile ? '#94a3b8' : '#16a34a',
                                                            color: '#ffffff',
                                                            fontSize: '12.5px',
                                                            fontWeight: 600,
                                                            cursor: uploadingDoc || !docFile ? 'not-allowed' : 'pointer'
                                                        }}
                                                    >
                                                        {uploadingDoc ? 'Uploading...' : 'Upload Document'}
                                                    </button>
                                                </div>

                                                {docSuccess && (
                                                    <div style={{ marginTop: '8px', fontSize: '12.5px', color: '#16a34a', fontWeight: 600 }}>
                                                        {docSuccess}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Existing Documents List */}
                                            <div>
                                                <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#334155', marginBottom: '8px' }}>
                                                    Attached Documents ({editingTech.document_urls?.length || 0})
                                                </div>
                                                {(!editingTech.document_urls || editingTech.document_urls.length === 0) ? (
                                                    <div style={{ padding: '24px', textAlign: 'center', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1', color: '#64748b', fontSize: '13px' }}>
                                                        No documents uploaded yet. Use the upload box above to attach CNIC, certificates, or contracts.
                                                    </div>
                                                ) : (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                        {editingTech.document_urls.map((doc, idx) => {
                                                            const isImg = doc.url.match(/\.(jpg|jpeg|png|webp|gif)$/i) || doc.doc_type === 'Picture / Photo';
                                                            return (
                                                                <div
                                                                    key={doc.id || idx}
                                                                    style={{
                                                                        display: 'flex',
                                                                        justifyContent: 'space-between',
                                                                        alignItems: 'center',
                                                                        padding: '10px 14px',
                                                                        background: '#ffffff',
                                                                        borderRadius: '8px',
                                                                        border: '1px solid #e2e8f0',
                                                                        fontSize: '13px'
                                                                    }}
                                                                >
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                                        {isImg ? (
                                                                            <img
                                                                                src={getMediaUrl(doc.url)}
                                                                                alt={doc.name}
                                                                                style={{ width: '36px', height: '36px', borderRadius: '4px', objectFit: 'cover' }}
                                                                            />
                                                                        ) : (
                                                                            <div style={{ width: '36px', height: '36px', borderRadius: '4px', background: '#fee2e2', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                                                <i className="bx bxs-file-pdf" style={{ fontSize: '20px' }} />
                                                                            </div>
                                                                        )}
                                                                        <div>
                                                                            <div style={{ fontWeight: 600, color: '#1e293b' }}>
                                                                                {doc.name}
                                                                            </div>
                                                                            <div style={{ display: 'flex', gap: '8px', fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                                                                                <span style={{ padding: '1px 6px', borderRadius: '4px', background: '#f1f5f9', fontWeight: 600 }}>
                                                                                    {doc.doc_type || 'General'}
                                                                                </span>
                                                                                {doc.file_size && <span>{formatFileSize(doc.file_size)}</span>}
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    <div style={{ display: 'flex', gap: '8px' }}>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => window.open(getMediaUrl(doc.url), '_blank')}
                                                                            style={{
                                                                                padding: '5px 10px',
                                                                                borderRadius: '6px',
                                                                                border: '1px solid #cbd5e1',
                                                                                background: '#f8fafc',
                                                                                color: '#2563eb',
                                                                                fontSize: '12px',
                                                                                fontWeight: 600,
                                                                                cursor: 'pointer',
                                                                                display: 'flex',
                                                                                alignItems: 'center',
                                                                                gap: '4px'
                                                                            }}
                                                                        >
                                                                            <i className="bx bx-show" /> View
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleDeleteDocument(editingTech.id, doc.id, doc.url)}
                                                                            style={{
                                                                                padding: '5px 8px',
                                                                                borderRadius: '6px',
                                                                                border: '1px solid #fecaca',
                                                                                background: '#fef2f2',
                                                                                color: '#ef4444',
                                                                                fontSize: '12px',
                                                                                cursor: 'pointer'
                                                                            }}
                                                                        >
                                                                            <i className="bx bx-trash" />
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        </>
                                    ) : (
                                        <div style={{ padding: '30px', textAlign: 'center', background: '#f8fafc', borderRadius: '10px', border: '1px dashed #cbd5e1' }}>
                                            <i className="bx bx-info-circle" style={{ fontSize: '32px', color: '#3b82f6', marginBottom: '8px' }} />
                                            <div style={{ fontWeight: 600, color: '#1e293b' }}>Save Employee First</div>
                                            <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
                                                Fill in the Personal & Contact information and save the profile. You will be able to upload CNIC and documents immediately after registration.
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Modal Actions */}
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px', borderTop: '1px solid #e2e8f0', paddingTop: '14px' }}>
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    style={{
                                        padding: '9px 18px',
                                        borderRadius: '8px',
                                        border: '1px solid #cbd5e1',
                                        background: '#f8fafc',
                                        color: '#475569',
                                        cursor: 'pointer',
                                        fontWeight: 500
                                    }}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    style={{
                                        padding: '9px 24px',
                                        borderRadius: '8px',
                                        border: 'none',
                                        background: 'var(--color-primary, #2563eb)',
                                        color: '#ffffff',
                                        cursor: saving ? 'not-allowed' : 'pointer',
                                        fontWeight: 600
                                    }}
                                >
                                    {saving ? 'Saving...' : editingTech ? 'Update Employee' : 'Register Employee'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Standalone Employee Document Manager Modal */}
            {docModalTech && (
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
                        maxWidth: '640px',
                        maxHeight: '90vh',
                        overflowY: 'auto',
                        padding: '26px',
                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <i className="bx bx-paperclip" style={{ color: '#2563eb' }} />
                                    Employee Documents & KYC: {docModalTech.employee_name}
                                </h3>
                                <div style={{ fontSize: '12.5px', color: '#64748b', marginTop: '3px' }}>
                                    Code: <strong>{docModalTech.employee_code}</strong> | Department: {docModalTech.department_display} | CNIC: {docModalTech.cnic || 'Not recorded'}
                                </div>
                            </div>
                            <button
                                onClick={() => setDocModalTech(null)}
                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '22px', color: '#64748b' }}
                            >
                                <i className="bx bx-x" />
                            </button>
                        </div>

                        {/* Upload Form */}
                        <div style={{
                            padding: '16px',
                            background: '#f8fafc',
                            borderRadius: '10px',
                            border: '1px dashed #cbd5e1',
                            marginBottom: '20px'
                        }}>
                            <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#1e293b', marginBottom: '10px' }}>
                                Attach New Document or Picture
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px', marginBottom: '10px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                                        Document Title *
                                    </label>
                                    <input
                                        type="text"
                                        value={docTitle}
                                        onChange={e => setDocTitle(e.target.value)}
                                        placeholder="e.g. CNIC Front, CNIC Back, Resume, Offer Letter"
                                        style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                                        Document Type
                                    </label>
                                    <select
                                        value={docType}
                                        onChange={e => setDocType(e.target.value)}
                                        style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                                    >
                                        <option value="CNIC">CNIC / ID Card</option>
                                        <option value="Picture / Photo">Picture / Photo</option>
                                        <option value="Degree / Certificate">Degree / Certificate</option>
                                        <option value="Experience / Resume">Experience Letter / CV</option>
                                        <option value="Contract / NDA">Contract / NDA</option>
                                        <option value="Police Verification">Police Verification</option>
                                        <option value="Other">Other Document</option>
                                    </select>
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    accept="image/*,application/pdf,.doc,.docx"
                                    onChange={e => setDocFile(e.target.files ? e.target.files[0] : null)}
                                    style={{ fontSize: '12px', color: '#475569' }}
                                />
                                <button
                                    type="button"
                                    disabled={uploadingDoc || !docFile}
                                    onClick={() => handleUploadDocument(docModalTech.id)}
                                    style={{
                                        padding: '7px 16px',
                                        borderRadius: '6px',
                                        border: 'none',
                                        background: uploadingDoc || !docFile ? '#94a3b8' : '#16a34a',
                                        color: '#ffffff',
                                        fontSize: '12.5px',
                                        fontWeight: 600,
                                        cursor: uploadingDoc || !docFile ? 'not-allowed' : 'pointer'
                                    }}
                                >
                                    {uploadingDoc ? 'Uploading...' : 'Upload Document'}
                                </button>
                            </div>

                            {docSuccess && (
                                <div style={{ marginTop: '8px', fontSize: '12.5px', color: '#16a34a', fontWeight: 600 }}>
                                    {docSuccess}
                                </div>
                            )}
                        </div>

                        {/* Document List */}
                        <div>
                            <div style={{ fontSize: '14px', fontWeight: 700, color: '#334155', marginBottom: '10px' }}>
                                Uploaded Documents ({docModalTech.document_urls?.length || 0})
                            </div>
                            {(!docModalTech.document_urls || docModalTech.document_urls.length === 0) ? (
                                <div style={{ padding: '30px', textAlign: 'center', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1', color: '#64748b', fontSize: '13px' }}>
                                    No documents attached yet for this employee.
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {docModalTech.document_urls.map((doc, idx) => {
                                        const isImg = doc.url.match(/\.(jpg|jpeg|png|webp|gif)$/i) || doc.doc_type === 'Picture / Photo';
                                        return (
                                            <div
                                                key={doc.id || idx}
                                                style={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    padding: '10px 14px',
                                                    background: '#ffffff',
                                                    borderRadius: '8px',
                                                    border: '1px solid #e2e8f0',
                                                    fontSize: '13px'
                                                }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                    {isImg ? (
                                                        <img
                                                            src={getMediaUrl(doc.url)}
                                                            alt={doc.name}
                                                            style={{ width: '38px', height: '38px', borderRadius: '4px', objectFit: 'cover' }}
                                                        />
                                                    ) : (
                                                        <div style={{ width: '38px', height: '38px', borderRadius: '4px', background: '#fee2e2', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                            <i className="bx bxs-file-pdf" style={{ fontSize: '20px' }} />
                                                        </div>
                                                    )}
                                                    <div>
                                                        <div style={{ fontWeight: 600, color: '#1e293b' }}>
                                                            {doc.name}
                                                        </div>
                                                        <div style={{ display: 'flex', gap: '8px', fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                                                            <span style={{ padding: '1px 6px', borderRadius: '4px', background: '#f1f5f9', fontWeight: 600 }}>
                                                                {doc.doc_type || 'General'}
                                                            </span>
                                                            {doc.file_size && <span>{formatFileSize(doc.file_size)}</span>}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div style={{ display: 'flex', gap: '8px' }}>
                                                    <button
                                                        type="button"
                                                        onClick={() => window.open(getMediaUrl(doc.url), '_blank')}
                                                        style={{
                                                            padding: '5px 12px',
                                                            borderRadius: '6px',
                                                            border: '1px solid #cbd5e1',
                                                            background: '#f8fafc',
                                                            color: '#2563eb',
                                                            fontSize: '12px',
                                                            fontWeight: 600,
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '4px'
                                                        }}
                                                    >
                                                        <i className="bx bx-show" /> View
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeleteDocument(docModalTech.id, doc.id, doc.url)}
                                                        style={{
                                                            padding: '5px 8px',
                                                            borderRadius: '6px',
                                                            border: '1px solid #fecaca',
                                                            background: '#fef2f2',
                                                            color: '#ef4444',
                                                            fontSize: '12px',
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        <i className="bx bx-trash" />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
                            <button
                                type="button"
                                onClick={() => setDocModalTech(null)}
                                style={{
                                    padding: '8px 20px',
                                    borderRadius: '8px',
                                    border: '1px solid #cbd5e1',
                                    background: '#f8fafc',
                                    color: '#475569',
                                    fontWeight: 600,
                                    cursor: 'pointer'
                                }}
                            >
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Portal User Account Modal */}
            {portalModalTech && (
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
                        maxWidth: '460px',
                        padding: '28px',
                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>
                                    Staff Portal Login Access
                                </h3>
                                <div style={{ fontSize: '12.5px', color: '#64748b', marginTop: '2px' }}>
                                    {portalModalTech.employee_name} ({portalModalTech.employee_code})
                                </div>
                            </div>
                            <button
                                onClick={() => setPortalModalTech(null)}
                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '22px', color: '#64748b' }}
                            >
                                <i className="bx bx-x" />
                            </button>
                        </div>

                        {portalSuccess ? (
                            <div style={{ padding: '20px', background: '#dcfce7', borderRadius: '10px', color: '#15803d', fontWeight: 600, textAlign: 'center' }}>
                                <i className="bx bx-check-circle" style={{ fontSize: '32px', display: 'block', marginBottom: '8px' }} />
                                {portalSuccess}
                            </div>
                        ) : (
                            <form onSubmit={handleSavePortalUser} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, marginBottom: '4px', color: '#334155' }}>
                                        Username *
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={portalUsername}
                                        onChange={e => setPortalUsername(e.target.value)}
                                        placeholder="e.g. kashif_tech"
                                        style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13.5px' }}
                                    />
                                    <span style={{ fontSize: '11px', color: '#64748b' }}>Unique username for logging into Zorvex ERP</span>
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, marginBottom: '4px', color: '#334155' }}>
                                        Password {portalModalTech.has_portal_access ? '(Leave blank to keep unchanged)' : '*'}
                                    </label>
                                    <input
                                        type="password"
                                        required={!portalModalTech.has_portal_access}
                                        value={portalPassword}
                                        onChange={e => setPortalPassword(e.target.value)}
                                        placeholder={portalModalTech.has_portal_access ? '••••••••' : 'Enter login password'}
                                        style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13.5px' }}
                                    />
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, marginBottom: '4px', color: '#334155' }}>
                                        Assigned Portal Role *
                                    </label>
                                    <select
                                        value={portalRole}
                                        onChange={e => setPortalRole(e.target.value)}
                                        style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13.5px' }}
                                    >
                                        <option value="hardware_technician">Hardware Technician</option>
                                        <option value="software_technician">Software Technician</option>
                                        <option value="cashier">Cashier</option>
                                        <option value="sales">Sales Staff</option>
                                        <option value="staff">Staff / General</option>
                                        <option value="manager">Management</option>
                                    </select>
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                                    <button
                                        type="button"
                                        onClick={() => setPortalModalTech(null)}
                                        style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#f8fafc', cursor: 'pointer' }}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={savingPortal}
                                        style={{ padding: '8px 20px', borderRadius: '8px', border: 'none', background: '#2563eb', color: '#ffffff', fontWeight: 600, cursor: savingPortal ? 'not-allowed' : 'pointer' }}
                                    >
                                        {savingPortal ? 'Saving...' : 'Save & Enable Portal Login'}
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
