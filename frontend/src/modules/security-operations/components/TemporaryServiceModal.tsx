import React, { useState, useEffect, useMemo } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { useToastStore } from '../../../stores/toastStore';
import { apiClient } from '../api';
import type { 
    TemporaryServiceRequest, 
    TemporaryServiceLine, 
    TemporaryServiceAssignment,
    TemporaryServiceLineType,
    TemporaryServiceStatus 
} from '../types';
import { createTemporaryService, updateTemporaryService } from '../api';

interface TemporaryServiceModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSaved: () => void;
    service?: TemporaryServiceRequest | null;
}

type ModalTab = 'event' | 'manpower' | 'guards' | 'equipment' | 'summary';

const EQUIPMENT_PRESETS = [
    { type: 'EQUIPMENT' as TemporaryServiceLineType, name: 'Walkthrough Metal Detector Gate', category: 'Security Electronics', rate: 12000, tax: 13 },
    { type: 'EQUIPMENT' as TemporaryServiceLineType, name: 'Handheld Metal Detector (Garrett)', category: 'Security Electronics', rate: 1500, tax: 13 },
    { type: 'EQUIPMENT' as TemporaryServiceLineType, name: 'Under-Vehicle Inspection Mirror (UVIM)', category: 'Screening Gear', rate: 1800, tax: 13 },
    { type: 'EQUIPMENT' as TemporaryServiceLineType, name: 'VHF Wireless Base & Walkie-Talkies (6-Pack)', category: 'Communications', rate: 9500, tax: 13 },
    { type: 'EQUIPMENT' as TemporaryServiceLineType, name: 'Explosive Trace Detector (ETD)', category: 'Advanced Screening', rate: 45000, tax: 13 },
    { type: 'VEHICLE' as TemporaryServiceLineType, name: 'Hilux Revo / Vigo Protocol Escort Vehicle', category: 'Escort Fleet', rate: 25000, tax: 13 },
    { type: 'VEHICLE' as TemporaryServiceLineType, name: 'Armored Toyota Fortuner (B6 Level)', category: 'Armored Fleet', rate: 95000, tax: 13 },
    { type: 'VEHICLE' as TemporaryServiceLineType, name: 'Armored Land Cruiser / Prado (B6 Level)', category: 'Armored Fleet', rate: 125000, tax: 13 },
    { type: 'VEHICLE' as TemporaryServiceLineType, name: 'Toyota HiAce Grand Cabin (14-Seater)', category: 'Crew Transport', rate: 22000, tax: 13 },
    { type: 'PROTOCOL' as TemporaryServiceLineType, name: 'Airport VIP Protocol & Clearances', category: 'Executive Protocol', rate: 30000, tax: 13 },
    { type: 'PROTOCOL' as TemporaryServiceLineType, name: 'VIP Entry Lane Barriers & Stanchions', category: 'Crowd Control', rate: 15000, tax: 13 },
];

export const TemporaryServiceModal: React.FC<TemporaryServiceModalProps> = ({ 
    isOpen, 
    onClose, 
    onSaved, 
    service 
}) => {
    const [activeTab, setActiveTab] = useState<ModalTab>('event');
    const [isSubmitting, setIsSubmitting] = useState(false);

    
    // Dependencies
    const [entities, setEntities] = useState<any[]>([]);
    const [sites, setSites] = useState<any[]>([]);
    const [designations, setDesignations] = useState<any[]>([]);
    const [employees, setEmployees] = useState<any[]>([]);

    // Scenario 3: Quick create client
    const [isNewClientMode, setIsNewClientMode] = useState(false);
    const [newClientName, setNewClientName] = useState('');
    const [isCreatingClient, setIsCreatingClient] = useState(false);

    // Form data
    const [crmEntity, setCrmEntity] = useState('');
    const [title, setTitle] = useState('');
    const [referenceNumber, setReferenceNumber] = useState('');
    const [isTemporarySite, setIsTemporarySite] = useState(false);
    const [operationalSite, setOperationalSite] = useState('');
    const [siteName, setSiteName] = useState('');
    const [billingType, setBillingType] = useState<'MONTHLY_CONSOLIDATED' | 'STANDALONE'>('STANDALONE');
    const [startDatetime, setStartDatetime] = useState('');
    const [endDatetime, setEndDatetime] = useState('');
    const [status, setStatus] = useState<TemporaryServiceStatus>('DRAFT');
    const [notes, setNotes] = useState('');

    // Lines & Guards
    const [lines, setLines] = useState<Partial<TemporaryServiceLine>[]>([]);
    const [assignedGuards, setAssignedGuards] = useState<Partial<TemporaryServiceAssignment>[]>([]);

    // Fetch dependencies
    useEffect(() => {
        if (!isOpen) return;

        const loadDependencies = async () => {
            try {
                const [entitiesRes, sitesRes, desigRes, empRes] = await Promise.all([
                    apiClient.get('/api/crm/entities/?active=true&limit=200'),
                    apiClient.get('/api/operations/sites/?is_active=true&limit=200'),
                    apiClient.get('/api/hrm/designations/?is_active=true&page_size=200').catch(() => ({ data: [] })),
                    apiClient.get('/api/hrm/employees/?status=ACTIVE&page_size=500').catch(() => ({ data: [] }))
                ]);
                setEntities(entitiesRes.data.results || entitiesRes.data || []);
                setSites(sitesRes.data.results || sitesRes.data || []);
                setDesignations(desigRes.data.results || desigRes.data || []);
                setEmployees(empRes.data.results || empRes.data || []);
            } catch (err) {
                console.error('Failed to load dependencies', err);
            }
        };

        loadDependencies();
    }, [isOpen]);

    // Populate on open / change
    useEffect(() => {
        if (!isOpen) return;
        setActiveTab('event');
        setIsNewClientMode(false);
        setNewClientName('');

        if (service) {
            setCrmEntity(service.crm_entity || '');
            setTitle(service.title || '');
            setReferenceNumber(service.reference_number || '');
            setIsTemporarySite(!!service.is_temporary_site);
            setOperationalSite(service.operational_site || '');
            setSiteName(service.site_name || '');
            setBillingType(service.billing_type || 'STANDALONE');
            setStartDatetime(service.start_datetime ? service.start_datetime.slice(0, 16) : '');
            setEndDatetime(service.end_datetime ? service.end_datetime.slice(0, 16) : '');
            setStatus(service.status || 'DRAFT');
            setNotes(service.notes || '');

            if (service.lines && service.lines.length > 0) {
                setLines(service.lines.map(l => ({
                    ...l,
                    designation: l.designation_id || l.designation
                })));
            } else {
                setLines([]);
            }

            if (service.assigned_guards && service.assigned_guards.length > 0) {
                setAssignedGuards(service.assigned_guards.map(g => ({
                    ...g,
                    designation_id: g.designation_id || (g.designation as any)?.id
                })));
            } else {
                setAssignedGuards([]);
            }
        } else {
            // New default
            const now = new Date();
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 2);

            const formatDt = (d: Date) => {
                const pad = (n: number) => n.toString().padStart(2, '0');
                return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T09:00`;
            };

            setCrmEntity('');
            setTitle('');
            setReferenceNumber(`TSR-${Math.floor(1000 + Math.random() * 9000)}`);
            setIsTemporarySite(false);
            setOperationalSite('');
            setSiteName('');
            setBillingType('STANDALONE');
            setStartDatetime(formatDt(now));
            setEndDatetime(formatDt(tomorrow));
            setStatus('DRAFT');
            setNotes('');
            setLines([
                {
                    line_type: 'MANPOWER',
                    required_headcount: 2,
                    billing_rate: 3500,
                    pay_rate: 2000,
                    days_count: 3,
                    shift_start: '08:00',
                    shift_end: '20:00',
                    notes: 'Event Security Guards'
                }
            ]);
            setAssignedGuards([]);
        }
    }, [isOpen, service]);

    // Computed days duration
    const daysSpan = useMemo(() => {
        if (!startDatetime || !endDatetime) return 1;
        const d1 = new Date(startDatetime);
        const d2 = new Date(endDatetime);
        const diffTime = d2.getTime() - d1.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays > 0 ? diffDays : 1;
    }, [startDatetime, endDatetime]);

    // Available sites filtered for selected CRM entity
    const clientSites = useMemo(() => {
        if (!crmEntity) return sites;
        return sites.filter(s => String(s.crm_entity) === String(crmEntity) || String(s.customer) === String(crmEntity));
    }, [sites, crmEntity]);

    // Quick client creation for Scenario 3
    const handleCreateNewClient = async () => {
        if (!newClientName.trim()) {
            useToastStore.getState().error('Please enter a client name.');
            return;
        }
        setIsCreatingClient(true);
        try {
            const res = await apiClient.post('/api/crm/entities/', {
                name: newClientName.trim(),
                is_active: true,
                status: 'ACTIVE',
                notes: 'Created via Temporary Security Service request'
            });
            const created = res.data;
            setEntities(prev => [created, ...prev]);
            setCrmEntity(String(created.id));
            setIsNewClientMode(false);
            setNewClientName('');
            useToastStore.getState().success(`Client "${created.name}" created successfully!`);
        } catch (err: any) {
            useToastStore.getState().error(`Failed to create client: ${err.response?.data?.detail || err.message}`);
        } finally {
            setIsCreatingClient(false);
        }
    };

    // Calculate totals
    const financialSummary = useMemo(() => {
        let manpowerBilled = 0;
        let manpowerGuardPayLiability = 0;
        let equipmentBilledSubtotal = 0;
        let taxSubtotal = 0;

        lines.forEach(l => {
            const qty = Number(l.required_headcount) || 1;
            const days = Number(l.days_count) || daysSpan;
            if (l.line_type === 'MANPOWER') {
                const bRate = Number(l.billing_rate) || 0;
                const pRate = Number(l.pay_rate) || 0;
                manpowerBilled += qty * days * bRate;
                manpowerGuardPayLiability += qty * days * pRate;
            } else {
                const dRate = Number(l.daily_rate) || 0;
                const taxPct = Number(l.tax_percent) || 0;
                const base = qty * days * dRate;
                const tax = base * (taxPct / 100);
                equipmentBilledSubtotal += base;
                taxSubtotal += tax;
            }
        });

        const grandTotal = manpowerBilled + equipmentBilledSubtotal + taxSubtotal;
        const estimatedMargin = grandTotal - taxSubtotal - manpowerGuardPayLiability;
        const marginPct = (grandTotal - taxSubtotal) > 0 ? (estimatedMargin / (grandTotal - taxSubtotal)) * 100 : 0;

        return {
            manpowerBilled,
            manpowerGuardPayLiability,
            equipmentBilledSubtotal,
            taxSubtotal,
            grandTotal,
            estimatedMargin,
            marginPct
        };
    }, [lines, daysSpan]);

    // Add manpower line
    const addManpowerLine = () => {
        setLines(prev => [
            ...prev,
            {
                line_type: 'MANPOWER',
                designation: designations[0]?.id || '',
                required_headcount: 1,
                days_count: daysSpan,
                billing_rate: 3500,
                pay_rate: 2000,
                shift_start: '08:00',
                shift_end: '20:00',
                notes: ''
            }
        ]);
    };

    // Add equipment line
    const addEquipmentLine = (preset?: typeof EQUIPMENT_PRESETS[0]) => {
        setLines(prev => [
            ...prev,
            {
                line_type: preset?.type || 'EQUIPMENT',
                item_name: preset?.name || '',
                category: preset?.category || 'Security Equipment',
                required_headcount: 1,
                days_count: daysSpan,
                daily_rate: preset?.rate || 5000,
                tax_percent: preset?.tax || 13,
                notes: ''
            }
        ]);
    };

    // Remove line
    const removeLine = (index: number) => {
        setLines(prev => prev.filter((_, i) => i !== index));
    };

    // Update line
    const updateLine = (index: number, field: string, value: any) => {
        setLines(prev => {
            const next = [...prev];
            next[index] = { ...next[index], [field]: value };
            return next;
        });
    };

    // Add Guard Assignment
    const addGuardAssignment = () => {
        const availableEmp = employees.find(e => !assignedGuards.some(g => String(g.employee_id) === String(e.id)));
        setAssignedGuards(prev => [
            ...prev,
            {
                employee_id: availableEmp?.id || '',
                designation_id: availableEmp?.designation_id || designations[0]?.id || '',
                daily_pay_rate: 2000,
                daily_billing_rate: 3500,
                notes: ''
            }
        ]);
    };

    // Remove Guard Assignment
    const removeGuardAssignment = (index: number) => {
        setAssignedGuards(prev => prev.filter((_, i) => i !== index));
    };

    // Update Guard Assignment
    const updateGuardAssignment = (index: number, field: string, value: any) => {
        setAssignedGuards(prev => {
            const next = [...prev];
            const updated = { ...next[index], [field]: value };
            if (field === 'employee_id') {
                const emp = employees.find(e => String(e.id) === String(value));
                if (emp && emp.designation_id) {
                    updated.designation_id = emp.designation_id;
                }
            }
            next[index] = updated;
            return next;
        });
    };

    // Form submit
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        if (!crmEntity) {
            useToastStore.getState().error('Please select or create a client/entity.');
            setActiveTab('event');
            setIsSubmitting(false);
            return;
        }

        if (!isTemporarySite && !operationalSite) {
            useToastStore.getState().error('Please select an operational site or enable "Temporary Event Venue".');
            setActiveTab('event');
            setIsSubmitting(false);
            return;
        }

        if (isTemporarySite && !siteName.trim()) {
            useToastStore.getState().error('Please enter the temporary venue/site name.');
            setActiveTab('event');
            setIsSubmitting(false);
            return;
        }

        const payload: any = {
            crm_entity: crmEntity,
            title: title || (isTemporarySite ? `Event: ${siteName}` : `Temporary Service`),
            reference_number: referenceNumber,
            is_temporary_site: isTemporarySite,
            operational_site: isTemporarySite ? null : (operationalSite || null),
            site_name: siteName.trim() || undefined,
            billing_type: billingType,
            start_datetime: startDatetime,
            end_datetime: endDatetime,
            status,
            notes,
            lines: lines.map(l => ({
                line_type: l.line_type || 'MANPOWER',
                designation: l.line_type === 'MANPOWER' ? (l.designation || null) : null,
                required_headcount: Number(l.required_headcount) || 1,
                days_count: Number(l.days_count) || daysSpan,
                billing_rate: Number(l.billing_rate) || 0,
                pay_rate: Number(l.pay_rate) || 0,
                shift_start: l.shift_start || null,
                shift_end: l.shift_end || null,
                item_name: l.item_name || '',
                category: l.category || '',
                daily_rate: Number(l.daily_rate) || 0,
                tax_percent: Number(l.tax_percent) || 0,
                notes: l.notes || ''
            })),
            assigned_guards: assignedGuards.filter(g => g.employee_id).map(g => ({
                employee_id: g.employee_id,
                designation_id: g.designation_id || null,
                daily_pay_rate: Number(g.daily_pay_rate) || 0,
                daily_billing_rate: Number(g.daily_billing_rate) || 0,
                notes: g.notes || ''
            }))
        };

        try {
            if (service) {
                await updateTemporaryService(service.id, payload);
                useToastStore.getState().success(`Temporary Service ${referenceNumber} updated successfully!`);
            } else {
                await createTemporaryService(payload);
                useToastStore.getState().success(`Temporary Service ${referenceNumber} created successfully!`);
            }
            onSaved();
            onClose();
        } catch (error: any) {
            console.error('Failed saving temporary service', error);
            if (error.response?.data) {
                const msg = typeof error.response.data === 'string' 
                    ? error.response.data 
                    : error.response.data.error || 'Please review validation errors in the form.';
                useToastStore.getState().error(msg);
            } else {
                useToastStore.getState().error('An unexpected error occurred while saving.');
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal 
            isOpen={isOpen} 
            onClose={onClose} 
            title={
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <i className="bx bx-shield-quarter" style={{ color: 'var(--color-primary, #2563eb)', fontSize: '22px' }} />
                    <span style={{ fontWeight: 600 }}>
                        {service ? `Edit Temporary Service (${service.reference_number})` : 'New Temporary Security Service Request'}
                    </span>
                    <Badge variant={status === 'CONFIRMED' || status === 'COMPLETED' ? 'success' : 'default'}>
                        {status}
                    </Badge>
                </div>
            }
            width="960px"
        >
            {/* Modal Tab Navigator */}
            <div style={{
                display: 'flex',
                gap: '8px',
                borderBottom: '1px solid var(--color-border, #e2e8f0)',
                paddingBottom: '8px',
                marginBottom: '16px'
            }}>
                <button
                    type="button"
                    onClick={() => setActiveTab('event')}
                    style={{
                        padding: '6px 14px',
                        borderRadius: '6px',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '13px',
                        fontWeight: 600,
                        backgroundColor: activeTab === 'event' ? 'var(--color-primary, #2563eb)' : 'transparent',
                        color: activeTab === 'event' ? '#ffffff' : 'var(--color-text, #1e293b)'
                    }}
                >
                    <i className="bx bx-map-pin" style={{ marginRight: '6px' }} />
                    1. Event & Location
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab('manpower')}
                    style={{
                        padding: '6px 14px',
                        borderRadius: '6px',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '13px',
                        fontWeight: 600,
                        backgroundColor: activeTab === 'manpower' ? 'var(--color-primary, #2563eb)' : 'transparent',
                        color: activeTab === 'manpower' ? '#ffffff' : 'var(--color-text, #1e293b)'
                    }}
                >
                    <i className="bx bx-group" style={{ marginRight: '6px' }} />
                    2. Manpower ({lines.filter(l => l.line_type === 'MANPOWER').length})
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab('guards')}
                    style={{
                        padding: '6px 14px',
                        borderRadius: '6px',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '13px',
                        fontWeight: 600,
                        backgroundColor: activeTab === 'guards' ? 'var(--color-primary, #2563eb)' : 'transparent',
                        color: activeTab === 'guards' ? '#ffffff' : 'var(--color-text, #1e293b)'
                    }}
                >
                    <i className="bx bx-user-check" style={{ marginRight: '6px' }} />
                    3. Guard Assignment ({assignedGuards.length})
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab('equipment')}
                    style={{
                        padding: '6px 14px',
                        borderRadius: '6px',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '13px',
                        fontWeight: 600,
                        backgroundColor: activeTab === 'equipment' ? 'var(--color-primary, #2563eb)' : 'transparent',
                        color: activeTab === 'equipment' ? '#ffffff' : 'var(--color-text, #1e293b)'
                    }}
                >
                    <i className="bx bx-car" style={{ marginRight: '6px' }} />
                    4. Equipment & Protocol ({lines.filter(l => l.line_type !== 'MANPOWER').length})
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab('summary')}
                    style={{
                        padding: '6px 14px',
                        borderRadius: '6px',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '13px',
                        fontWeight: 600,
                        backgroundColor: activeTab === 'summary' ? 'var(--color-primary, #2563eb)' : 'transparent',
                        color: activeTab === 'summary' ? '#ffffff' : 'var(--color-text, #1e293b)'
                    }}
                >
                    <i className="bx bx-receipt" style={{ marginRight: '6px' }} />
                    5. Commercial Summary
                </button>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                
                {/* ----------------- TAB 1: EVENT & LOCATION ----------------- */}
                {activeTab === 'event' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {/* Scenario Selector info box */}
                        <div style={{
                            padding: '12px 16px',
                            borderRadius: '8px',
                            backgroundColor: 'rgba(37, 99, 235, 0.05)',
                            border: '1px solid rgba(37, 99, 235, 0.2)',
                            fontSize: '13px',
                            lineHeight: '1.5'
                        }}>
                            <strong>Temporary Service Scenarios:</strong>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginTop: '6px' }}>
                                <div style={{
                                    padding: '6px 10px',
                                    borderRadius: '6px',
                                    backgroundColor: !isTemporarySite && !isNewClientMode ? 'rgba(37,99,235,0.15)' : 'var(--color-surface, #ffffff)',
                                    border: '1px solid var(--color-border, #e2e8f0)'
                                }}>
                                    <span style={{ fontWeight: 600 }}>Scenario 1</span>: Existing Client + Existing Site
                                </div>
                                <div style={{
                                    padding: '6px 10px',
                                    borderRadius: '6px',
                                    backgroundColor: isTemporarySite && !isNewClientMode ? 'rgba(37,99,235,0.15)' : 'var(--color-surface, #ffffff)',
                                    border: '1px solid var(--color-border, #e2e8f0)'
                                }}>
                                    <span style={{ fontWeight: 600 }}>Scenario 2</span>: Existing Client + Temporary Venue
                                </div>
                                <div style={{
                                    padding: '6px 10px',
                                    borderRadius: '6px',
                                    backgroundColor: isNewClientMode ? 'rgba(37,99,235,0.15)' : 'var(--color-surface, #ffffff)',
                                    border: '1px solid var(--color-border, #e2e8f0)'
                                }}>
                                    <span style={{ fontWeight: 600 }}>Scenario 3</span>: New Client + Temporary Venue
                                </div>
                            </div>
                        </div>

                        {/* Title and Reference */}
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
                            <div className="form-field">
                                <label className="form-label" style={{ fontWeight: 600 }}>
                                    Service / Event Title <span style={{ color: '#ef4444' }}>*</span>
                                </label>
                                <input
                                    className="input-base"
                                    placeholder="e.g. 3-Day Karachi Expo Tech Summit Security"
                                    value={title}
                                    onChange={e => setTitle(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="form-field">
                                <label className="form-label" style={{ fontWeight: 600 }}>Reference #</label>
                                <input
                                    className="input-base"
                                    value={referenceNumber}
                                    onChange={e => setReferenceNumber(e.target.value)}
                                    required
                                />
                            </div>
                        </div>

                        {/* Client Selector (Scenario 1 & 2 vs 3) */}
                        <div style={{
                            padding: '12px',
                            borderRadius: '8px',
                            border: '1px solid var(--color-border, #e2e8f0)',
                            backgroundColor: 'var(--color-surface-subtle, #f8fafc)'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <label className="form-label" style={{ fontWeight: 600, margin: 0 }}>
                                    Client / Entity <span style={{ color: '#ef4444' }}>*</span>
                                </label>
                                <button
                                    type="button"
                                    onClick={() => setIsNewClientMode(!isNewClientMode)}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        color: 'var(--color-primary, #2563eb)',
                                        fontSize: '12px',
                                        fontWeight: 600,
                                        cursor: 'pointer'
                                    }}
                                >
                                    {isNewClientMode ? '← Pick from existing clients' : '+ New Client / One-time Event Client (Scenario 3)'}
                                </button>
                            </div>

                            {isNewClientMode ? (
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <input
                                        className="input-base"
                                        placeholder="Enter new company / organizer name (e.g. Cybernet Events Ltd)"
                                        value={newClientName}
                                        onChange={e => setNewClientName(e.target.value)}
                                        style={{ flex: 1 }}
                                    />
                                    <Button
                                        type="button"
                                        variant="primary"
                                        onClick={handleCreateNewClient}
                                        disabled={isCreatingClient || !newClientName.trim()}
                                    >
                                        {isCreatingClient ? 'Creating...' : 'Create & Select Client'}
                                    </Button>
                                </div>
                            ) : (
                                <select
                                    className="input-base"
                                    value={crmEntity}
                                    onChange={e => {
                                        setCrmEntity(e.target.value);
                                        setOperationalSite('');
                                    }}
                                    required
                                >
                                    <option value="">Select Existing Client...</option>
                                    {entities.map(ent => (
                                        <option key={ent.id} value={ent.id}>{ent.name}</option>
                                    ))}
                                </select>
                            )}
                        </div>

                        {/* Location Selector: Existing site vs Temporary site */}
                        <div style={{
                            padding: '12px',
                            borderRadius: '8px',
                            border: '1px solid var(--color-border, #e2e8f0)',
                            backgroundColor: 'var(--color-surface-subtle, #f8fafc)'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
                                    <input
                                        type="checkbox"
                                        checked={isTemporarySite}
                                        onChange={e => {
                                            setIsTemporarySite(e.target.checked);
                                            if (e.target.checked) setOperationalSite('');
                                        }}
                                    />
                                    Temporary Event Venue / Off-Site Location (Scenario 2 & 3)
                                </label>
                            </div>

                            {isTemporarySite ? (
                                <div className="form-field">
                                    <label className="form-label" style={{ fontWeight: 600 }}>
                                        Temporary Venue Name & Address <span style={{ color: '#ef4444' }}>*</span>
                                    </label>
                                    <input
                                        className="input-base"
                                        placeholder="e.g. Karachi Expo Center, Hall #4, University Road"
                                        value={siteName}
                                        onChange={e => setSiteName(e.target.value)}
                                        required
                                    />
                                    <span style={{ fontSize: '11px', color: 'var(--color-text-muted, #64748b)', marginTop: '4px' }}>
                                        ✓ An operational site record will automatically be provisioned and linked to this client.
                                    </span>
                                </div>
                            ) : (
                                <div className="form-field">
                                    <label className="form-label" style={{ fontWeight: 600 }}>
                                        Select Existing Operational Site <span style={{ color: '#ef4444' }}>*</span>
                                    </label>
                                    <select
                                        className="input-base"
                                        value={operationalSite}
                                        onChange={e => setOperationalSite(e.target.value)}
                                        required={!isTemporarySite}
                                    >
                                        <option value="">Select Site...</option>
                                        {clientSites.map(s => (
                                            <option key={s.id} value={s.id}>{s.name} ({s.code || s.address || 'Operational'})</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </div>

                        {/* Dates & Billing Type */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                            <div className="form-field">
                                <label className="form-label" style={{ fontWeight: 600 }}>
                                    Start Date & Time <span style={{ color: '#ef4444' }}>*</span>
                                </label>
                                <input
                                    type="datetime-local"
                                    className="input-base"
                                    value={startDatetime}
                                    onChange={e => setStartDatetime(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="form-field">
                                <label className="form-label" style={{ fontWeight: 600 }}>
                                    End Date & Time <span style={{ color: '#ef4444' }}>*</span>
                                </label>
                                <input
                                    type="datetime-local"
                                    className="input-base"
                                    value={endDatetime}
                                    onChange={e => setEndDatetime(e.target.value)}
                                    required
                                />
                                <span style={{ fontSize: '11px', color: 'var(--color-primary, #2563eb)', marginTop: '4px', display: 'block' }}>
                                    Duration: <strong>{daysSpan} {daysSpan === 1 ? 'Day' : 'Days'}</strong>
                                </span>
                            </div>
                            <div className="form-field">
                                <label className="form-label" style={{ fontWeight: 600 }}>
                                    Billing Mode <span style={{ color: '#ef4444' }}>*</span>
                                </label>
                                <select
                                    className="input-base"
                                    value={billingType}
                                    onChange={e => setBillingType(e.target.value as any)}
                                    required
                                >
                                    <option value="STANDALONE">Standalone Event Invoice</option>
                                    <option value="MONTHLY_CONSOLIDATED">Monthly Consolidated Invoice</option>
                                </select>
                            </div>
                        </div>

                        {/* Status & Notes */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px' }}>
                            <div className="form-field">
                                <label className="form-label" style={{ fontWeight: 600 }}>Status</label>
                                <select
                                    className="input-base"
                                    value={status}
                                    onChange={e => setStatus(e.target.value as any)}
                                >
                                    <option value="DRAFT">Draft</option>
                                    <option value="REQUESTED">Requested</option>
                                    <option value="APPROVED">Approved</option>
                                    <option value="CONFIRMED">Confirmed</option>
                                    <option value="IN_PROGRESS">In Progress</option>
                                    <option value="COMPLETED">Completed</option>
                                    <option value="CANCELLED">Cancelled</option>
                                </select>
                            </div>
                            <div className="form-field">
                                <label className="form-label" style={{ fontWeight: 600 }}>Notes / Instructions</label>
                                <input
                                    className="input-base"
                                    placeholder="e.g. VIP entry protocols, gate setup by 07:00 AM"
                                    value={notes}
                                    onChange={e => setNotes(e.target.value)}
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* ----------------- TAB 2: WING A - MANPOWER REQUIREMENTS ----------------- */}
                {activeTab === 'manpower' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>
                                    Wing A: Manpower Requirements (Security Personnel)
                                </h4>
                                <span style={{ fontSize: '12px', color: 'var(--color-text-muted, #64748b)' }}>
                                    Personnel require operational muster attendance, have daily client billing rates & daily guard pay rates.
                                </span>
                            </div>
                            <Button type="button" variant="secondary" onClick={addManpowerLine}>
                                <i className="bx bx-plus" style={{ marginRight: '4px' }} />
                                Add Manpower Role
                            </Button>
                        </div>

                        {lines.filter(l => l.line_type === 'MANPOWER').length === 0 ? (
                            <div style={{
                                padding: '24px',
                                textAlign: 'center',
                                borderRadius: '8px',
                                border: '1px dashed var(--color-border, #e2e8f0)',
                                color: 'var(--color-text-muted, #64748b)'
                            }}>
                                No manpower roles added yet. Click &quot;Add Manpower Role&quot; above.
                            </div>
                        ) : (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                    <thead>
                                        <tr style={{ backgroundColor: 'var(--color-surface-subtle, #f8fafc)', borderBottom: '1px solid var(--color-border, #e2e8f0)' }}>
                                            <th style={{ padding: '8px', textAlign: 'left' }}>Designation / Role</th>
                                            <th style={{ padding: '8px', textAlign: 'center', width: '70px' }}>Guards</th>
                                            <th style={{ padding: '8px', textAlign: 'center', width: '70px' }}>Days</th>
                                            <th style={{ padding: '8px', textAlign: 'center', width: '130px' }}>Shift Hours</th>
                                            <th style={{ padding: '8px', textAlign: 'right', width: '110px' }}>Daily Bill (₨)</th>
                                            <th style={{ padding: '8px', textAlign: 'right', width: '110px' }}>Guard Pay (₨)</th>
                                            <th style={{ padding: '8px', textAlign: 'right', width: '120px' }}>Line Bill (₨)</th>
                                            <th style={{ padding: '8px', textAlign: 'center', width: '50px' }}></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {lines.map((line, idx) => {
                                            if (line.line_type !== 'MANPOWER') return null;
                                            const qty = Number(line.required_headcount) || 1;
                                            const days = Number(line.days_count) || daysSpan;
                                            const bRate = Number(line.billing_rate) || 0;
                                            const lineTotal = qty * days * bRate;

                                            return (
                                                <tr key={idx} style={{ borderBottom: '1px solid var(--color-border, #e2e8f0)' }}>
                                                    <td style={{ padding: '8px' }}>
                                                        <select
                                                            className="input-base"
                                                            style={{ padding: '4px 8px', fontSize: '12px' }}
                                                            value={line.designation || ''}
                                                            onChange={e => updateLine(idx, 'designation', e.target.value)}
                                                        >
                                                            <option value="">Select Role...</option>
                                                            {designations.map(d => (
                                                                <option key={d.id} value={d.id}>{d.name}</option>
                                                            ))}
                                                        </select>
                                                    </td>
                                                    <td style={{ padding: '8px', textAlign: 'center' }}>
                                                        <input
                                                            type="number"
                                                            min="1"
                                                            className="input-base"
                                                            style={{ padding: '4px', textAlign: 'center', fontSize: '12px' }}
                                                            value={line.required_headcount || 1}
                                                            onChange={e => updateLine(idx, 'required_headcount', parseInt(e.target.value) || 1)}
                                                        />
                                                    </td>
                                                    <td style={{ padding: '8px', textAlign: 'center' }}>
                                                        <input
                                                            type="number"
                                                            min="1"
                                                            className="input-base"
                                                            style={{ padding: '4px', textAlign: 'center', fontSize: '12px' }}
                                                            value={line.days_count || daysSpan}
                                                            onChange={e => updateLine(idx, 'days_count', parseInt(e.target.value) || 1)}
                                                        />
                                                    </td>
                                                    <td style={{ padding: '8px' }}>
                                                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                                            <input
                                                                type="time"
                                                                className="input-base"
                                                                style={{ padding: '2px 4px', fontSize: '11px' }}
                                                                value={line.shift_start || '08:00'}
                                                                onChange={e => updateLine(idx, 'shift_start', e.target.value)}
                                                            />
                                                            <span>-</span>
                                                            <input
                                                                type="time"
                                                                className="input-base"
                                                                style={{ padding: '2px 4px', fontSize: '11px' }}
                                                                value={line.shift_end || '20:00'}
                                                                onChange={e => updateLine(idx, 'shift_end', e.target.value)}
                                                            />
                                                        </div>
                                                    </td>
                                                    <td style={{ padding: '8px', textAlign: 'right' }}>
                                                        <input
                                                            type="number"
                                                            className="input-base"
                                                            style={{ padding: '4px', textAlign: 'right', fontSize: '12px' }}
                                                            value={line.billing_rate || 0}
                                                            onChange={e => updateLine(idx, 'billing_rate', parseFloat(e.target.value) || 0)}
                                                        />
                                                    </td>
                                                    <td style={{ padding: '8px', textAlign: 'right' }}>
                                                        <input
                                                            type="number"
                                                            className="input-base"
                                                            style={{ padding: '4px', textAlign: 'right', fontSize: '12px' }}
                                                            value={line.pay_rate || 0}
                                                            onChange={e => updateLine(idx, 'pay_rate', parseFloat(e.target.value) || 0)}
                                                        />
                                                    </td>
                                                    <td style={{ padding: '8px', textAlign: 'right', fontWeight: 600 }}>
                                                        ₨ {lineTotal.toLocaleString()}
                                                    </td>
                                                    <td style={{ padding: '8px', textAlign: 'center' }}>
                                                        <button
                                                            type="button"
                                                            onClick={() => removeLine(idx)}
                                                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '16px' }}
                                                        >
                                                            <i className="bx bx-trash" />
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                    <tfoot>
                                        <tr style={{ backgroundColor: 'var(--color-surface-subtle, #f8fafc)', fontWeight: 600 }}>
                                            <td colSpan={6} style={{ padding: '8px', textAlign: 'right' }}>Total Manpower Billed:</td>
                                            <td style={{ padding: '8px', textAlign: 'right', color: 'var(--color-primary, #2563eb)' }}>
                                                ₨ {financialSummary.manpowerBilled.toLocaleString()}
                                            </td>
                                            <td></td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {/* ----------------- TAB 3: GUARD ASSIGNMENT ----------------- */}
                {activeTab === 'guards' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>
                                    Guard Assignment (Workforce Deployment)
                                </h4>
                                <span style={{ fontSize: '12px', color: 'var(--color-text-muted, #64748b)' }}>
                                    Assign specific active security personnel to this temporary duty. These guards will appear in the Temporary Muster sheet.
                                </span>
                            </div>
                            <Button type="button" variant="secondary" onClick={addGuardAssignment}>
                                <i className="bx bx-user-plus" style={{ marginRight: '4px' }} />
                                Assign Guard
                            </Button>
                        </div>

                        {assignedGuards.length === 0 ? (
                            <div style={{
                                padding: '24px',
                                textAlign: 'center',
                                borderRadius: '8px',
                                border: '1px dashed var(--color-border, #e2e8f0)',
                                color: 'var(--color-text-muted, #64748b)'
                            }}>
                                No guards assigned yet. Click &quot;Assign Guard&quot; to pick guards for this event.
                            </div>
                        ) : (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                    <thead>
                                        <tr style={{ backgroundColor: 'var(--color-surface-subtle, #f8fafc)', borderBottom: '1px solid var(--color-border, #e2e8f0)' }}>
                                            <th style={{ padding: '8px', textAlign: 'left' }}>Security Guard</th>
                                            <th style={{ padding: '8px', textAlign: 'left', width: '160px' }}>Designation</th>
                                            <th style={{ padding: '8px', textAlign: 'right', width: '120px' }}>Daily Pay Rate (₨)</th>
                                            <th style={{ padding: '8px', textAlign: 'right', width: '130px' }}>Daily Bill Rate (₨)</th>
                                            <th style={{ padding: '8px', textAlign: 'left', width: '150px' }}>Duty Remarks</th>
                                            <th style={{ padding: '8px', textAlign: 'center', width: '50px' }}></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {assignedGuards.map((asgn, idx) => (
                                            <tr key={idx} style={{ borderBottom: '1px solid var(--color-border, #e2e8f0)' }}>
                                                <td style={{ padding: '8px' }}>
                                                    <select
                                                        className="input-base"
                                                        style={{ padding: '4px 8px', fontSize: '12px' }}
                                                        value={asgn.employee_id || ''}
                                                        onChange={e => updateGuardAssignment(idx, 'employee_id', e.target.value)}
                                                    >
                                                        <option value="">Select Employee...</option>
                                                        {employees.map(emp => (
                                                            <option key={emp.id} value={emp.id}>
                                                                {emp.display_code || emp.employee_code} - {emp.first_name} {emp.last_name || ''} ({emp.designation_name || 'Guard'})
                                                            </option>
                                                        ))}
                                                    </select>
                                                </td>
                                                <td style={{ padding: '8px' }}>
                                                    <select
                                                        className="input-base"
                                                        style={{ padding: '4px 8px', fontSize: '12px' }}
                                                        value={asgn.designation_id || ''}
                                                        onChange={e => updateGuardAssignment(idx, 'designation_id', e.target.value)}
                                                    >
                                                        <option value="">Default Designation</option>
                                                        {designations.map(d => (
                                                            <option key={d.id} value={d.id}>{d.name}</option>
                                                        ))}
                                                    </select>
                                                </td>
                                                <td style={{ padding: '8px', textAlign: 'right' }}>
                                                    <input
                                                        type="number"
                                                        className="input-base"
                                                        style={{ padding: '4px', textAlign: 'right', fontSize: '12px' }}
                                                        value={asgn.daily_pay_rate || 0}
                                                        onChange={e => updateGuardAssignment(idx, 'daily_pay_rate', parseFloat(e.target.value) || 0)}
                                                    />
                                                </td>
                                                <td style={{ padding: '8px', textAlign: 'right' }}>
                                                    <input
                                                        type="number"
                                                        className="input-base"
                                                        style={{ padding: '4px', textAlign: 'right', fontSize: '12px' }}
                                                        value={asgn.daily_billing_rate || 0}
                                                        onChange={e => updateGuardAssignment(idx, 'daily_billing_rate', parseFloat(e.target.value) || 0)}
                                                    />
                                                </td>
                                                <td style={{ padding: '8px' }}>
                                                    <input
                                                        type="text"
                                                        placeholder="e.g. VIP Gate 1"
                                                        className="input-base"
                                                        style={{ padding: '4px', fontSize: '12px' }}
                                                        value={asgn.notes || ''}
                                                        onChange={e => updateGuardAssignment(idx, 'notes', e.target.value)}
                                                    />
                                                </td>
                                                <td style={{ padding: '8px', textAlign: 'center' }}>
                                                    <button
                                                        type="button"
                                                        onClick={() => removeGuardAssignment(idx)}
                                                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '16px' }}
                                                    >
                                                        <i className="bx bx-trash" />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {/* ----------------- TAB 4: WING B - EQUIPMENT, VEHICLES & PROTOCOL ----------------- */}
                {activeTab === 'equipment' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        {/* Notice banner */}
                        <div style={{
                            padding: '10px 14px',
                            borderRadius: '8px',
                            backgroundColor: 'rgba(16, 185, 129, 0.08)',
                            border: '1px solid rgba(16, 185, 129, 0.2)',
                            fontSize: '12px',
                            lineHeight: '1.4'
                        }}>
                            <span style={{ fontWeight: 600, color: '#047857' }}>Wing B Decoupling Notice:</span>
                            <span style={{ marginLeft: '6px' }}>
                                Equipment, vehicles, and protocol items do <strong>NOT</strong> require muster attendance or guard payroll. They are commercial billing items that roll directly into the client invoice.
                            </span>
                        </div>

                        {/* Quick Presets */}
                        <div>
                            <span style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
                                Quick Add Standard Assets:
                            </span>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                {EQUIPMENT_PRESETS.map((p, pIdx) => (
                                    <button
                                        key={pIdx}
                                        type="button"
                                        onClick={() => addEquipmentLine(p)}
                                        style={{
                                            padding: '4px 10px',
                                            borderRadius: '6px',
                                            fontSize: '11px',
                                            border: '1px solid var(--color-border, #e2e8f0)',
                                            backgroundColor: 'var(--color-surface, #ffffff)',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px'
                                        }}
                                    >
                                        <i className={p.type === 'VEHICLE' ? 'bx bx-car' : p.type === 'PROTOCOL' ? 'bx bx-badge-check' : 'bx bx-wrench'} />
                                        <span>+ {p.name} (₨ {p.rate.toLocaleString()}/day)</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Equipment Table */}
                        {lines.filter(l => l.line_type !== 'MANPOWER').length === 0 ? (
                            <div style={{
                                padding: '24px',
                                textAlign: 'center',
                                borderRadius: '8px',
                                border: '1px dashed var(--color-border, #e2e8f0)',
                                color: 'var(--color-text-muted, #64748b)'
                            }}>
                                No equipment, vehicles, or protocol lines added yet. Click one of the quick presets above to add items.
                            </div>
                        ) : (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                    <thead>
                                        <tr style={{ backgroundColor: 'var(--color-surface-subtle, #f8fafc)', borderBottom: '1px solid var(--color-border, #e2e8f0)' }}>
                                            <th style={{ padding: '8px', textAlign: 'left', width: '110px' }}>Category</th>
                                            <th style={{ padding: '8px', textAlign: 'left' }}>Item / Description</th>
                                            <th style={{ padding: '8px', textAlign: 'center', width: '60px' }}>Qty</th>
                                            <th style={{ padding: '8px', textAlign: 'center', width: '60px' }}>Days</th>
                                            <th style={{ padding: '8px', textAlign: 'right', width: '110px' }}>Daily Rate (₨)</th>
                                            <th style={{ padding: '8px', textAlign: 'right', width: '75px' }}>Tax %</th>
                                            <th style={{ padding: '8px', textAlign: 'right', width: '120px' }}>Total (₨)</th>
                                            <th style={{ padding: '8px', textAlign: 'center', width: '50px' }}></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {lines.map((line, idx) => {
                                            if (line.line_type === 'MANPOWER') return null;
                                            const qty = Number(line.required_headcount) || 1;
                                            const days = Number(line.days_count) || daysSpan;
                                            const rate = Number(line.daily_rate) || 0;
                                            const taxPct = Number(line.tax_percent) || 0;
                                            const base = qty * days * rate;
                                            const tax = base * (taxPct / 100);
                                            const total = base + tax;

                                            return (
                                                <tr key={idx} style={{ borderBottom: '1px solid var(--color-border, #e2e8f0)' }}>
                                                    <td style={{ padding: '8px' }}>
                                                        <select
                                                            className="input-base"
                                                            style={{ padding: '4px', fontSize: '11px' }}
                                                            value={line.line_type}
                                                            onChange={e => updateLine(idx, 'line_type', e.target.value)}
                                                        >
                                                            <option value="EQUIPMENT">Equipment</option>
                                                            <option value="VEHICLE">Vehicle</option>
                                                            <option value="PROTOCOL">Protocol</option>
                                                        </select>
                                                    </td>
                                                    <td style={{ padding: '8px' }}>
                                                        <input
                                                            type="text"
                                                            className="input-base"
                                                            style={{ padding: '4px', fontSize: '12px' }}
                                                            value={line.item_name || ''}
                                                            onChange={e => updateLine(idx, 'item_name', e.target.value)}
                                                            placeholder="Asset / Service name"
                                                        />
                                                    </td>
                                                    <td style={{ padding: '8px', textAlign: 'center' }}>
                                                        <input
                                                            type="number"
                                                            min="1"
                                                            className="input-base"
                                                            style={{ padding: '4px', textAlign: 'center', fontSize: '12px' }}
                                                            value={line.required_headcount || 1}
                                                            onChange={e => updateLine(idx, 'required_headcount', parseInt(e.target.value) || 1)}
                                                        />
                                                    </td>
                                                    <td style={{ padding: '8px', textAlign: 'center' }}>
                                                        <input
                                                            type="number"
                                                            min="1"
                                                            className="input-base"
                                                            style={{ padding: '4px', textAlign: 'center', fontSize: '12px' }}
                                                            value={line.days_count || daysSpan}
                                                            onChange={e => updateLine(idx, 'days_count', parseInt(e.target.value) || 1)}
                                                        />
                                                    </td>
                                                    <td style={{ padding: '8px', textAlign: 'right' }}>
                                                        <input
                                                            type="number"
                                                            className="input-base"
                                                            style={{ padding: '4px', textAlign: 'right', fontSize: '12px' }}
                                                            value={line.daily_rate || 0}
                                                            onChange={e => updateLine(idx, 'daily_rate', parseFloat(e.target.value) || 0)}
                                                        />
                                                    </td>
                                                    <td style={{ padding: '8px', textAlign: 'right' }}>
                                                        <input
                                                            type="number"
                                                            className="input-base"
                                                            style={{ padding: '4px', textAlign: 'right', fontSize: '12px' }}
                                                            value={line.tax_percent ?? 13}
                                                            onChange={e => updateLine(idx, 'tax_percent', parseFloat(e.target.value) || 0)}
                                                        />
                                                    </td>
                                                    <td style={{ padding: '8px', textAlign: 'right', fontWeight: 600 }}>
                                                        ₨ {total.toLocaleString()}
                                                    </td>
                                                    <td style={{ padding: '8px', textAlign: 'center' }}>
                                                        <button
                                                            type="button"
                                                            onClick={() => removeLine(idx)}
                                                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '16px' }}
                                                        >
                                                            <i className="bx bx-trash" />
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                    <tfoot>
                                        <tr style={{ backgroundColor: 'var(--color-surface-subtle, #f8fafc)', fontWeight: 600 }}>
                                            <td colSpan={6} style={{ padding: '8px', textAlign: 'right' }}>Total Equipment Billed (incl. Tax):</td>
                                            <td style={{ padding: '8px', textAlign: 'right', color: 'var(--color-primary, #2563eb)' }}>
                                                ₨ {(financialSummary.equipmentBilledSubtotal + financialSummary.taxSubtotal).toLocaleString()}
                                            </td>
                                            <td></td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {/* ----------------- TAB 5: COMMERCIAL SUMMARY ----------------- */}
                {activeTab === 'summary' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(4, 1fr)',
                            gap: '12px'
                        }}>
                            <div style={{
                                padding: '16px',
                                borderRadius: '8px',
                                backgroundColor: 'var(--color-surface-subtle, #f8fafc)',
                                border: '1px solid var(--color-border, #e2e8f0)'
                            }}>
                                <span style={{ fontSize: '12px', color: 'var(--color-text-muted, #64748b)' }}>Wing A: Manpower Bill</span>
                                <h3 style={{ margin: '4px 0 0 0', fontSize: '18px', fontWeight: 700, color: 'var(--color-text, #1e293b)' }}>
                                    ₨ {financialSummary.manpowerBilled.toLocaleString()}
                                </h3>
                                <span style={{ fontSize: '11px', color: 'var(--color-text-muted, #64748b)' }}>
                                    {lines.filter(l => l.line_type === 'MANPOWER').length} Roles / {daysSpan} Days
                                </span>
                            </div>

                            <div style={{
                                padding: '16px',
                                borderRadius: '8px',
                                backgroundColor: 'var(--color-surface-subtle, #f8fafc)',
                                border: '1px solid var(--color-border, #e2e8f0)'
                            }}>
                                <span style={{ fontSize: '12px', color: 'var(--color-text-muted, #64748b)' }}>Wing B: Assets & Protocol</span>
                                <h3 style={{ margin: '4px 0 0 0', fontSize: '18px', fontWeight: 700, color: 'var(--color-text, #1e293b)' }}>
                                    ₨ {financialSummary.equipmentBilledSubtotal.toLocaleString()}
                                </h3>
                                <span style={{ fontSize: '11px', color: 'var(--color-text-muted, #64748b)' }}>
                                    {lines.filter(l => l.line_type !== 'MANPOWER').length} Asset Lines
                                </span>
                            </div>

                            <div style={{
                                padding: '16px',
                                borderRadius: '8px',
                                backgroundColor: 'var(--color-surface-subtle, #f8fafc)',
                                border: '1px solid var(--color-border, #e2e8f0)'
                            }}>
                                <span style={{ fontSize: '12px', color: 'var(--color-text-muted, #64748b)' }}>Applicable Taxes</span>
                                <h3 style={{ margin: '4px 0 0 0', fontSize: '18px', fontWeight: 700, color: 'var(--color-text, #1e293b)' }}>
                                    ₨ {financialSummary.taxSubtotal.toLocaleString()}
                                </h3>
                                <span style={{ fontSize: '11px', color: 'var(--color-text-muted, #64748b)' }}>
                                    SRB / PRA / FBR
                                </span>
                            </div>

                            <div style={{
                                padding: '16px',
                                borderRadius: '8px',
                                backgroundColor: 'rgba(37, 99, 235, 0.08)',
                                border: '1px solid rgba(37, 99, 235, 0.3)'
                            }}>
                                <span style={{ fontSize: '12px', color: 'var(--color-primary, #2563eb)', fontWeight: 600 }}>Commercial Grand Total</span>
                                <h3 style={{ margin: '4px 0 0 0', fontSize: '20px', fontWeight: 800, color: 'var(--color-primary, #2563eb)' }}>
                                    ₨ {financialSummary.grandTotal.toLocaleString()}
                                </h3>
                                <span style={{ fontSize: '11px', color: 'var(--color-primary, #2563eb)' }}>
                                    Mode: {billingType === 'STANDALONE' ? 'Standalone' : 'Consolidated'}
                                </span>
                            </div>
                        </div>

                        {/* Internal Profitability Breakdown */}
                        <div style={{
                            padding: '16px',
                            borderRadius: '8px',
                            border: '1px solid var(--color-border, #e2e8f0)',
                            backgroundColor: 'var(--color-surface, #ffffff)'
                        }}>
                            <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600 }}>
                                Operational Cost & Margin Analysis:
                            </h4>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', fontSize: '13px' }}>
                                <div>
                                    <span style={{ color: 'var(--color-text-muted, #64748b)' }}>Guard Payroll Liability:</span>
                                    <div style={{ fontWeight: 600, marginTop: '2px', color: '#dc2626' }}>
                                        ₨ {financialSummary.manpowerGuardPayLiability.toLocaleString()}
                                    </div>
                                    <span style={{ fontSize: '11px', color: 'var(--color-text-muted, #64748b)' }}>
                                        (Paid to deployed guards)
                                    </span>
                                </div>
                                <div>
                                    <span style={{ color: 'var(--color-text-muted, #64748b)' }}>Net Service Revenue:</span>
                                    <div style={{ fontWeight: 600, marginTop: '2px' }}>
                                        ₨ {(financialSummary.grandTotal - financialSummary.taxSubtotal).toLocaleString()}
                                    </div>
                                    <span style={{ fontSize: '11px', color: 'var(--color-text-muted, #64748b)' }}>
                                        (Excluding government taxes)
                                    </span>
                                </div>
                                <div>
                                    <span style={{ color: 'var(--color-text-muted, #64748b)' }}>Projected Gross Margin:</span>
                                    <div style={{ fontWeight: 700, marginTop: '2px', color: '#16a34a' }}>
                                        ₨ {financialSummary.estimatedMargin.toLocaleString()} ({financialSummary.marginPct.toFixed(1)}%)
                                    </div>
                                    <span style={{ fontSize: '11px', color: '#16a34a' }}>
                                        ✓ High commercial return
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Form Footer */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingTop: '16px',
                    borderTop: '1px solid var(--color-border, #e2e8f0)'
                }}>
                    <div style={{ fontSize: '13px', fontWeight: 600 }}>
                        Grand Total: <span style={{ color: 'var(--color-primary, #2563eb)' }}>₨ {financialSummary.grandTotal.toLocaleString()}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>
                            Cancel
                        </Button>
                        <Button type="submit" variant="primary" disabled={isSubmitting}>
                            {isSubmitting ? 'Saving...' : (service ? 'Update Service' : 'Create Temporary Service')}
                        </Button>
                    </div>
                </div>
            </form>
        </Modal>
    );
};
