import React, { useState, useEffect } from 'react';
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

    const handleOpenAdd = () => {
        setEditingTech(null);
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
        });
        setIsModalOpen(true);
    };

    const handleOpenEdit = (tech: Technician) => {
        setEditingTech(tech);
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
        });
        setIsModalOpen(true);
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
            alert(err?.response?.data?.first_name || 'Failed to save technician.');
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
                        Add Technician
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

            {/* Technicians List / Cards */}
            {loading ? (
                <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>
                    <i className="bx bx-loader-alt bx-spin" style={{ fontSize: '32px', marginBottom: '8px' }} />
                    <div>Loading Mobile Technicians & Staff...</div>
                </div>
            ) : technicians.length === 0 ? (
                <div style={{
                    padding: '60px',
                    textAlign: 'center',
                    background: 'var(--color-surface, #ffffff)',
                    borderRadius: '12px',
                    border: '1px dashed var(--color-border, #cbd5e1)'
                }}>
                    <i className="bx bx-wrench" style={{ fontSize: '48px', color: '#94a3b8', marginBottom: '12px' }} />
                    <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--color-text, #1e293b)', margin: '0 0 6px 0' }}>
                        No Technicians Registered
                    </h3>
                    <p style={{ color: '#64748b', fontSize: '14px', margin: '0 0 16px 0' }}>
                        Click "Import Softech Sample" to load real workshop data or add a new technician manually.
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
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <h4 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: 'var(--color-text, #0f172a)' }}>
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
                                            <div style={{ marginTop: '4px' }}>
                                                <span style={{
                                                    display: 'inline-block',
                                                    fontSize: '12px',
                                                    fontWeight: 600,
                                                    padding: '2px 10px',
                                                    borderRadius: '12px',
                                                    background: `${deptColor}15`,
                                                    color: deptColor,
                                                    border: `1px solid ${deptColor}30`
                                                }}>
                                                    {tech.department_display}
                                                </span>
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', gap: '6px' }}>
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
                                        View September Payslip
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
                                {editingTech ? `Edit Technician: ${editingTech.employee_name}` : 'Register New Technician'}
                            </h3>
                            <button
                                onClick={() => setIsModalOpen(false)}
                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#64748b' }}
                            >
                                <i className="bx bx-x" />
                            </button>
                        </div>

                        <form onSubmit={handleFormSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {/* Personal Details */}
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
                                        style={{
                                            width: '100%',
                                            padding: '8px 12px',
                                            borderRadius: '8px',
                                            border: '1px solid var(--color-border, #cbd5e1)',
                                            outline: 'none'
                                        }}
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
                                        style={{
                                            width: '100%',
                                            padding: '8px 12px',
                                            borderRadius: '8px',
                                            border: '1px solid var(--color-border, #cbd5e1)',
                                            outline: 'none'
                                        }}
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
                                        placeholder="e.g. EMP001"
                                        style={{
                                            width: '100%',
                                            padding: '8px 12px',
                                            borderRadius: '8px',
                                            border: '1px solid var(--color-border, #cbd5e1)',
                                            outline: 'none'
                                        }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                                        Department Lab *
                                    </label>
                                    <select
                                        value={formData.department_type}
                                        onChange={e => setFormData({ ...formData, department_type: e.target.value as MobileDepartmentType })}
                                        style={{
                                            width: '100%',
                                            padding: '8px 12px',
                                            borderRadius: '8px',
                                            border: '1px solid var(--color-border, #cbd5e1)',
                                            outline: 'none'
                                        }}
                                    >
                                        <option value="HARDWARE">Hardware Lab</option>
                                        <option value="SOFTWARE">Software Lab</option>
                                        <option value="PANEL_GLASS">Panel / Glass</option>
                                        <option value="SALES">Sales / W.O</option>
                                        <option value="MANAGEMENT">Management</option>
                                    </select>
                                </div>
                            </div>

                            {/* Shift & Salary */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                                        Shift Start Time
                                    </label>
                                    <input
                                        type="time"
                                        value={formData.shift_time}
                                        onChange={e => setFormData({ ...formData, shift_time: e.target.value })}
                                        style={{
                                            width: '100%',
                                            padding: '8px 12px',
                                            borderRadius: '8px',
                                            border: '1px solid var(--color-border, #cbd5e1)',
                                            outline: 'none'
                                        }}
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
                                        style={{
                                            width: '100%',
                                            padding: '8px 12px',
                                            borderRadius: '8px',
                                            border: '1px solid var(--color-border, #cbd5e1)',
                                            outline: 'none'
                                        }}
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
                                        style={{
                                            width: '100%',
                                            padding: '8px 12px',
                                            borderRadius: '8px',
                                            border: '1px solid var(--color-border, #cbd5e1)',
                                            outline: 'none'
                                        }}
                                    />
                                </div>
                            </div>

                            {/* Assigned Hardware */}
                            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '14px' }}>
                                <div style={{ fontSize: '14px', fontWeight: 600, color: '#334155', marginBottom: '10px' }}>
                                    Assigned Testing Phones & IMEIs (Workshop Inventory)
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
                            </div>

                            {/* Modal Actions */}
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
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
                                    {saving ? 'Saving...' : editingTech ? 'Update Technician' : 'Add Technician'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
