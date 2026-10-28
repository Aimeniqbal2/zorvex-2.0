import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Modal } from '../../../components/ui/Modal';
import { useToastStore } from '../../../stores/toastStore';
import { 
    getTemporaryMusterGrid, 
    saveTemporaryMusterAttendance, 
    generateTemporaryInvoice,
    assignTemporaryGuards,
    unassignTemporaryGuard,
    apiClient
} from '../api';
import type { 
    TemporaryMusterServiceBlock, 
    TemporaryMusterGuard, 
    TemporaryMusterGridResponse,
    TemporaryServiceRequest
} from '../types';
import { TemporaryServiceModal } from './TemporaryServiceModal';

interface TemporaryServicesMusterSectionProps {
    year: number;
    month: number;
    onBack?: () => void;
    onSwitchToRegular?: () => void;
}

export const TemporaryServicesMusterSection: React.FC<TemporaryServicesMusterSectionProps> = ({
    year,
    month,
    onBack,
    onSwitchToRegular
}) => {
    const { addToast } = useToastStore();

    const [loading, setLoading] = useState<boolean>(true);
    const [saving, setSaving] = useState<boolean>(false);
    const [gridData, setGridData] = useState<TemporaryMusterGridResponse | null>(null);

    // Dirty updates map: key = `${service_id}_${employee_id}_${day}` -> { service_id, employee_id, day, code }
    const [dirtyUpdates, setDirtyUpdates] = useState<Map<string, { service_id: string; employee_id: string; day: number; code: string }>>(new Map());

    // Modal state for editing temporary service
    const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
    const [selectedServiceForEdit, setSelectedServiceForEdit] = useState<TemporaryServiceRequest | null>(null);

    // Quick Assign Guard Modal state
    const [assignTargetService, setAssignTargetService] = useState<TemporaryMusterServiceBlock | null>(null);
    const [allEmployees, setAllEmployees] = useState<any[]>([]);
    const [allDesignations, setAllDesignations] = useState<any[]>([]);
    const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
    const [selectedDesignationId, setSelectedDesignationId] = useState<string>('');
    const [assignDailyPayRate, setAssignDailyPayRate] = useState<number>(2000);
    const [assignDailyBillRate, setAssignDailyBillRate] = useState<number>(3500);
    const [assignNotes, setAssignNotes] = useState<string>('');
    const [isAssigning, setIsAssigning] = useState<boolean>(false);

    // Invoice Generating state
    const [generatingInvoiceFor, setGeneratingInvoiceFor] = useState<string | null>(null);

    // Load Temporary Muster Grid data
    const loadData = useCallback(async () => {
        try {
            setLoading(true);
            const res = await getTemporaryMusterGrid(year, month);
            setGridData(res);
            setDirtyUpdates(new Map());
        } catch (err: any) {
            console.error('Failed to load temporary muster grid:', err);
            addToast('error', err?.response?.data?.detail || 'Failed to load Temporary Services Muster.');
        } finally {
            setLoading(false);
        }
    }, [year, month, addToast]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Load employees and designations for quick assign
    useEffect(() => {
        const loadStaffDependencies = async () => {
            try {
                const [empRes, desigRes] = await Promise.all([
                    apiClient.get('/api/hrm/employees/?status=ACTIVE&page_size=500').catch(() => ({ data: [] })),
                    apiClient.get('/api/hrm/designations/?is_active=true&page_size=200').catch(() => ({ data: [] }))
                ]);
                setAllEmployees(empRes.data.results || empRes.data || []);
                setAllDesignations(desigRes.data.results || desigRes.data || []);
            } catch (err) {
                console.error('Failed loading staff dependencies', err);
            }
        };
        loadStaffDependencies();
    }, []);

    // Handle single cell edit
    const handleCellChange = (serviceId: string, employeeId: string, day: number, newCode: string) => {
        const cleaned = newCode.trim().toUpperCase();

        // Update local gridData state immediately for snappy feel
        setGridData(prev => {
            if (!prev) return prev;
            const nextServices = prev.services.map(svc => {
                if (svc.id !== serviceId) return svc;

                const nextGuards = svc.guards.map(g => {
                    if (g.employee_id !== employeeId) return g;
                    const nextDays = { ...g.days, [String(day)]: cleaned };

                    // Recalculate guard counts
                    let pCount = 0;
                    let aCount = 0;
                    let lCount = 0;

                    svc.active_days.forEach(d => {
                        const code = (nextDays[String(d)] || '').trim().toUpperCase();
                        if (['P', 'PO', 'POD', 'WP', '1', 'O', 'OD'].includes(code)) {
                            pCount++;
                        } else if (['A', '0'].includes(code)) {
                            aCount++;
                        } else if (['L', 'PL', 'SL'].includes(code)) {
                            lCount++;
                        }
                    });

                    const attended = pCount > 0 ? pCount : (pCount + aCount + lCount > 0 ? 0 : svc.active_days.length);
                    const guardPay = attended * g.daily_pay_rate;
                    const clientBill = attended * g.daily_billing_rate;

                    return {
                        ...g,
                        days: nextDays,
                        total_present: pCount,
                        total_absent: aCount,
                        total_leave: lCount,
                        attended_days: attended,
                        total_guard_pay: guardPay,
                        total_client_bill: clientBill
                    };
                });

                // Recalculate totals
                const totalManpowerBilled = nextGuards.reduce((acc, g) => acc + g.total_client_bill, 0);
                const totalGuardPay = nextGuards.reduce((acc, g) => acc + g.total_guard_pay, 0);
                const equipBilled = svc.totals.equipment_billed;

                return {
                    ...svc,
                    guards: nextGuards,
                    totals: {
                        ...svc.totals,
                        manpower_billed: totalManpowerBilled,
                        manpower_guard_pay: totalGuardPay,
                        grand_total: totalManpowerBilled + equipBilled
                    }
                };
            });

            return {
                ...prev,
                services: nextServices
            };
        });

        // Record in dirty map
        const key = `${serviceId}_${employeeId}_${day}`;
        setDirtyUpdates(prev => {
            const next = new Map(prev);
            next.set(key, { service_id: serviceId, employee_id: employeeId, day, code: cleaned });
            return next;
        });
    };

    // Cycle attendance status on click
    const cycleAttendance = (serviceId: string, employeeId: string, day: number, currentCode: string) => {
        const order = ['', 'P', 'A', 'L', 'O', 'WP'];
        const idx = order.indexOf(currentCode);
        const nextCode = idx === -1 || idx === order.length - 1 ? order[1] : order[idx + 1];
        handleCellChange(serviceId, employeeId, day, nextCode);
    };

    // Save attendance updates to backend
    const handleSaveAttendance = async () => {
        if (dirtyUpdates.size === 0) return;
        setSaving(true);
        try {
            const updatesList = Array.from(dirtyUpdates.values());
            const res = await saveTemporaryMusterAttendance(year, month, updatesList);
            addToast('success', res.message || `Saved ${updatesList.length} attendance updates & synced duty pay.`);
            setDirtyUpdates(new Map());
            await loadData();
        } catch (err: any) {
            console.error('Failed saving temporary attendance:', err);
            addToast('error', err?.response?.data?.error || err?.response?.data?.detail || 'Failed to save temporary attendance.');
        } finally {
            setSaving(false);
        }
    };

    // Unassign guard
    const handleUnassignGuard = async (service: TemporaryMusterServiceBlock, guard: TemporaryMusterGuard) => {
        if (!window.confirm(`Unassign guard "${guard.name}" (${guard.employee_code}) from temporary service ${service.reference_number}?`)) {
            return;
        }
        try {
            await unassignTemporaryGuard(service.id, {
                assignment_id: guard.assignment_id,
                employee_id: guard.employee_id
            });
            addToast('success', `Unassigned ${guard.name} from ${service.reference_number}.`);
            loadData();
        } catch (err: any) {
            addToast('error', err?.response?.data?.error || 'Failed to unassign guard.');
        }
    };

    // Submit Quick Assign Guard
    const handleQuickAssignSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!assignTargetService || !selectedEmployeeId) {
            addToast('warning', 'Please select a guard to assign.');
            return;
        }

        setIsAssigning(true);
        try {
            await assignTemporaryGuards(assignTargetService.id, [
                {
                    employee_id: selectedEmployeeId,
                    designation_id: selectedDesignationId || undefined,
                    daily_pay_rate: Number(assignDailyPayRate) || 0,
                    daily_billing_rate: Number(assignDailyBillRate) || 0,
                    notes: assignNotes
                }
            ]);
            addToast('success', `Guard assigned to ${assignTargetService.reference_number}!`);
            setAssignTargetService(null);
            setSelectedEmployeeId('');
            setAssignNotes('');
            loadData();
        } catch (err: any) {
            addToast('error', err?.response?.data?.error || 'Failed to assign guard.');
        } finally {
            setIsAssigning(false);
        }
    };

    // Generate Invoice
    const handleGenerateInvoice = async (service: TemporaryMusterServiceBlock) => {
        setGeneratingInvoiceFor(service.id);
        try {
            const res = await generateTemporaryInvoice(service.id);
            addToast('success', `Invoice ${res.invoice_number} created successfully! Total: ₨ ${Number(res.total_amount || 0).toLocaleString()}`);
            loadData();
        } catch (err: any) {
            addToast('error', err?.response?.data?.error || 'Failed to generate invoice.');
        } finally {
            setGeneratingInvoiceFor(null);
        }
    };

    // Quick open edit modal for full configuration
    const handleOpenEditModal = async (serviceBlock: TemporaryMusterServiceBlock) => {
        try {
            const res = await apiClient.get(`/api/operations/temporary-services/${serviceBlock.id}/`);
            setSelectedServiceForEdit(res.data);
            setIsEditModalOpen(true);
        } catch (err: any) {
            addToast('error', 'Failed loading full service details for editing.');
        }
    };

    // Open create new temporary service modal
    const handleOpenNewModal = () => {
        setSelectedServiceForEdit(null);
        setIsEditModalOpen(true);
    };

    const daysInMonth = gridData?.days_in_month || 31;
    const services = gridData?.services || [];

    // Grand totals across all temporary services this month
    const grandMonthRollup = useMemo(() => {
        let totalManpowerBilled = 0;
        let totalGuardPay = 0;
        let totalEquipmentBilled = 0;
        let totalCommercialGrand = 0;

        services.forEach(s => {
            totalManpowerBilled += s.totals.manpower_billed || 0;
            totalGuardPay += s.totals.manpower_guard_pay || 0;
            totalEquipmentBilled += s.totals.equipment_billed || 0;
            totalCommercialGrand += s.totals.grand_total || 0;
        });

        return {
            totalManpowerBilled,
            totalGuardPay,
            totalEquipmentBilled,
            totalCommercialGrand,
            totalMargin: totalCommercialGrand - totalGuardPay
        };
    }, [services]);

    const getCellBadgeStyle = (code: string) => {
        switch (code) {
            case 'P':
            case '1':
                return { bg: '#dcfce7', color: '#15803d', border: '#86efac' };
            case 'A':
            case '0':
                return { bg: '#fee2e2', color: '#b91c1c', border: '#fca5a5' };
            case 'L':
            case 'PL':
            case 'SL':
                return { bg: '#fef3c7', color: '#b45309', border: '#fde68a' };
            case 'O':
            case 'OD':
                return { bg: '#f3e8ff', color: '#7e22ce', border: '#d8b4fe' };
            case 'WP':
                return { bg: '#dbeafe', color: '#1d4ed8', border: '#93c5fd' };
            default:
                return { bg: 'transparent', color: 'inherit', border: 'transparent' };
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* Top Toolbar / Mode Switcher */}
            <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '16px',
                background: 'var(--color-surface, #ffffff)',
                padding: '16px 20px',
                borderRadius: '12px',
                border: '1px solid var(--color-border, #e2e8f0)',
                boxShadow: '0 2px 4px rgba(0,0,0,0.04)'
            }}>
                {/* Left: Mode switcher & Title */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                    {onBack && (
                        <button
                            type="button"
                            onClick={onBack}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '6px 12px',
                                borderRadius: '6px',
                                background: 'var(--color-bg, #f1f5f9)',
                                color: 'var(--color-text, #0f172a)',
                                border: '1px solid var(--color-border, #cbd5e1)',
                                fontWeight: 700,
                                fontSize: '0.84rem',
                                cursor: 'pointer'
                            }}
                        >
                            <i className="bx bx-left-arrow-alt" style={{ fontSize: '1.1rem' }} />
                            Back
                        </button>
                    )}

                    {onSwitchToRegular && (
                        <div style={{ display: 'flex', backgroundColor: 'var(--color-bg, #f1f5f9)', padding: '4px', borderRadius: '8px', border: '1px solid var(--color-border, #cbd5e1)' }}>
                            <button
                                type="button"
                                onClick={onSwitchToRegular}
                                style={{
                                    padding: '6px 14px',
                                    borderRadius: '6px',
                                    border: 'none',
                                    fontWeight: 700,
                                    fontSize: '0.86rem',
                                    cursor: 'pointer',
                                    backgroundColor: 'transparent',
                                    color: 'var(--color-text-muted, #64748b)'
                                }}
                            >
                                <i className="bx bx-spreadsheet" style={{ marginRight: '6px' }} />
                                Regular Monthly Muster
                            </button>
                            <button
                                type="button"
                                style={{
                                    padding: '6px 14px',
                                    borderRadius: '6px',
                                    border: 'none',
                                    fontWeight: 800,
                                    fontSize: '0.86rem',
                                    cursor: 'default',
                                    backgroundColor: 'var(--color-primary, #2563eb)',
                                    color: '#ffffff',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                                }}
                            >
                                <i className="bx bx-bolt-circle" style={{ marginRight: '6px' }} />
                                Temporary Services Muster
                            </button>
                        </div>
                    )}

                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>
                                Temporary Security Services Muster
                            </h3>
                            <Badge variant="primary">
                                Active Date Locked
                            </Badge>
                        </div>
                        <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted, #64748b)' }}>
                            Guards have active-day editable attendance; equipment and vehicles are billed purely on commercial duration.
                        </span>
                    </div>
                </div>

                {/* Right: Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Button 
                        variant="secondary" 
                        onClick={handleOpenNewModal}
                    >
                        <i className="bx bx-plus" style={{ marginRight: '6px' }} />
                        Request Temporary Service
                    </Button>

                    <Button
                        variant="primary"
                        onClick={handleSaveAttendance}
                        disabled={saving || dirtyUpdates.size === 0}
                        style={{
                            position: 'relative',
                            backgroundColor: dirtyUpdates.size > 0 ? '#059669' : undefined
                        }}
                    >
                        <i className="bx bx-save" style={{ marginRight: '6px' }} />
                        {saving ? 'Saving Changes...' : `Save Attendance (${dirtyUpdates.size})`}
                    </Button>
                </div>
            </div>

            {/* Unsaved changes alert */}
            {dirtyUpdates.size > 0 && (
                <div style={{
                    padding: '12px 16px',
                    borderRadius: '8px',
                    backgroundColor: '#ecfdf5',
                    border: '1px solid #6ee7b7',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '13px',
                    color: '#065f46'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <i className="bx bx-info-circle" style={{ fontSize: '18px' }} />
                        <span>You have <strong>{dirtyUpdates.size}</strong> unsaved attendance updates in the temporary muster sheet.</span>
                    </div>
                    <Button 
                        variant="primary" 
                        onClick={handleSaveAttendance} 
                        disabled={saving}
                        style={{ backgroundColor: '#059669', borderColor: '#059669' }}
                    >
                        {saving ? 'Saving...' : 'Save Updates Now'}
                    </Button>
                </div>
            )}

            {/* Monthly Rollup Metric Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                <div style={{
                    padding: '14px',
                    borderRadius: '10px',
                    backgroundColor: 'var(--color-surface, #ffffff)',
                    border: '1px solid var(--color-border, #e2e8f0)',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                }}>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted, #64748b)' }}>Active Temporary Events</div>
                    <div style={{ fontSize: '20px', fontWeight: 800, marginTop: '4px', color: 'var(--color-primary, #2563eb)' }}>
                        {services.length} Events
                    </div>
                    <span style={{ fontSize: '11px', color: '#64748b' }}>Month of {month}/{year}</span>
                </div>

                <div style={{
                    padding: '14px',
                    borderRadius: '10px',
                    backgroundColor: 'var(--color-surface, #ffffff)',
                    border: '1px solid var(--color-border, #e2e8f0)',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                }}>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted, #64748b)' }}>Wing A: Guard Duty Pay (Owed)</div>
                    <div style={{ fontSize: '20px', fontWeight: 800, marginTop: '4px', color: '#dc2626' }}>
                        ₨ {grandMonthRollup.totalGuardPay.toLocaleString()}
                    </div>
                    <span style={{ fontSize: '11px', color: '#64748b' }}>Payroll compensation to guards</span>
                </div>

                <div style={{
                    padding: '14px',
                    borderRadius: '10px',
                    backgroundColor: 'var(--color-surface, #ffffff)',
                    border: '1px solid var(--color-border, #e2e8f0)',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                }}>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted, #64748b)' }}>Wing B: Assets & Protocol Billed</div>
                    <div style={{ fontSize: '20px', fontWeight: 800, marginTop: '4px' }}>
                        ₨ {grandMonthRollup.totalEquipmentBilled.toLocaleString()}
                    </div>
                    <span style={{ fontSize: '11px', color: '#64748b' }}>Commercial gear & vehicles</span>
                </div>

                <div style={{
                    padding: '14px',
                    borderRadius: '10px',
                    backgroundColor: 'var(--color-surface, #ffffff)',
                    border: '1px solid var(--color-border, #e2e8f0)',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                }}>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted, #64748b)' }}>Grand Commercial Billing</div>
                    <div style={{ fontSize: '20px', fontWeight: 800, marginTop: '4px', color: '#16a34a' }}>
                        ₨ {grandMonthRollup.totalCommercialGrand.toLocaleString()}
                    </div>
                    <span style={{ fontSize: '11px', color: '#16a34a' }}>Margin: ₨ {grandMonthRollup.totalMargin.toLocaleString()}</span>
                </div>
            </div>

            {/* Loading state */}
            {loading ? (
                <div style={{ padding: '48px', textAlign: 'center', background: 'var(--color-surface, #ffffff)', borderRadius: '12px' }}>
                    <i className="bx bx-loader-alt bx-spin" style={{ fontSize: '32px', color: 'var(--color-primary, #2563eb)' }} />
                    <p style={{ marginTop: '12px', fontWeight: 600 }}>Loading Temporary Services Muster Grid...</p>
                </div>
            ) : services.length === 0 ? (
                <div style={{
                    padding: '48px',
                    textAlign: 'center',
                    background: 'var(--color-surface, #ffffff)',
                    borderRadius: '12px',
                    border: '1px dashed var(--color-border, #cbd5e1)'
                }}>
                    <i className="bx bx-calendar-event" style={{ fontSize: '48px', color: '#94a3b8' }} />
                    <h3 style={{ margin: '12px 0 6px 0', fontWeight: 700 }}>No Temporary Security Services for {month}/{year}</h3>
                    <p style={{ color: 'var(--color-text-muted, #64748b)', maxWidth: '480px', margin: '0 auto 16px auto', fontSize: '13px' }}>
                        There are no temporary security events or extra guard requests recorded for this month. You can create a new service request anytime.
                    </p>
                    <Button variant="primary" onClick={handleOpenNewModal}>
                        <i className="bx bx-plus" style={{ marginRight: '6px' }} />
                        Request Temporary Service
                    </Button>
                </div>
            ) : (
                /* Service Blocks */
                services.map(svc => {
                    const sDateStr = new Date(svc.start_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
                    const eDateStr = new Date(svc.end_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

                    return (
                        <div 
                            key={svc.id}
                            style={{
                                background: 'var(--color-surface, #ffffff)',
                                borderRadius: '12px',
                                border: '1px solid var(--color-border, #e2e8f0)',
                                boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
                                overflow: 'hidden'
                            }}
                        >
                            {/* Service Block Header Bar */}
                            <div style={{
                                padding: '14px 20px',
                                background: 'linear-gradient(to right, rgba(37, 99, 235, 0.06), rgba(37, 99, 235, 0.01))',
                                borderBottom: '1px solid var(--color-border, #e2e8f0)',
                                display: 'flex',
                                flexWrap: 'wrap',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '12px'
                            }}>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                        <strong style={{ fontSize: '1.05rem', color: 'var(--color-primary, #2563eb)' }}>
                                            {svc.reference_number}
                                        </strong>
                                        <span style={{ fontWeight: 700, fontSize: '1rem' }}>
                                            {svc.title || 'Event Security'}
                                        </span>
                                        <Badge variant="default">{svc.status}</Badge>
                                        <span style={{
                                            fontSize: '11px',
                                            padding: '2px 8px',
                                            borderRadius: '4px',
                                            fontWeight: 700,
                                            backgroundColor: svc.billing_type === 'STANDALONE' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                                            color: svc.billing_type === 'STANDALONE' ? '#1d4ed8' : '#047857'
                                        }}>
                                            {svc.billing_type === 'STANDALONE' ? '⚡ Standalone Event Invoice' : '📑 Consolidated Monthly Invoice'}
                                        </span>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '6px', fontSize: '12px', color: 'var(--color-text-muted, #64748b)' }}>
                                        <span>
                                            <i className="bx bx-buildings" style={{ marginRight: '4px' }} />
                                            Client: <strong>{svc.crm_entity_name}</strong>
                                        </span>
                                        <span>
                                            <i className="bx bx-map-pin" style={{ marginRight: '4px' }} />
                                            Venue: <strong>{svc.site_name}</strong> {svc.is_temporary_site && '(Temporary Event Venue)'}
                                        </span>
                                        <span style={{
                                            backgroundColor: '#eff6ff',
                                            color: '#1d4ed8',
                                            padding: '1px 8px',
                                            borderRadius: '4px',
                                            fontWeight: 600
                                        }}>
                                            <i className="bx bx-calendar" style={{ marginRight: '4px' }} />
                                            Active Dates: {sDateStr} – {eDateStr} ({svc.active_days.length} Active {svc.active_days.length === 1 ? 'Day' : 'Days'})
                                        </span>
                                    </div>
                                </div>

                                {/* Header Action Buttons */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Button
                                        variant="secondary"
                                        onClick={() => {
                                            setAssignTargetService(svc);
                                            setSelectedEmployeeId('');
                                            setSelectedDesignationId('');
                                            setAssignDailyPayRate(2000);
                                            setAssignDailyBillRate(3500);
                                        }}
                                        style={{ padding: '6px 12px', fontSize: '12px' }}
                                    >
                                        <i className="bx bx-user-plus" style={{ marginRight: '4px' }} />
                                        Assign Guard
                                    </Button>

                                    <Button
                                        variant="secondary"
                                        onClick={() => handleGenerateInvoice(svc)}
                                        disabled={generatingInvoiceFor === svc.id}
                                        style={{ padding: '6px 12px', fontSize: '12px', color: '#b45309' }}
                                    >
                                        <i className="bx bx-receipt" style={{ marginRight: '4px' }} />
                                        {generatingInvoiceFor === svc.id ? 'Generating...' : 'Generate Invoice'}
                                    </Button>

                                    <Button
                                        variant="ghost"
                                        onClick={() => handleOpenEditModal(svc)}
                                        title="Edit Service Requirements, Lines & Guards"
                                        style={{ padding: '6px 10px', fontSize: '12px' }}
                                    >
                                        <i className="bx bx-edit" style={{ fontSize: '16px' }} />
                                    </Button>
                                </div>
                            </div>

                            {/* Wing A: Guards Muster Attendance Table */}
                            <div style={{ padding: '16px 20px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                    <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                        Wing A: Security Personnel Muster Attendance ({svc.guards.length} Guards)
                                    </h4>
                                    <span style={{ fontSize: '11px', color: 'var(--color-text-muted, #64748b)' }}>
                                        Tip: Only days inside the active date range are editable. Click cell to cycle: P → A → L → O → WP
                                    </span>
                                </div>

                                {svc.guards.length === 0 ? (
                                    <div style={{
                                        padding: '20px',
                                        textAlign: 'center',
                                        borderRadius: '8px',
                                        border: '1px dashed var(--color-border, #cbd5e1)',
                                        fontSize: '13px',
                                        color: 'var(--color-text-muted, #64748b)'
                                    }}>
                                        No security guards have been assigned to this event yet.
                                        <div style={{ marginTop: '8px' }}>
                                            <Button
                                                variant="secondary"
                                                onClick={() => {
                                                    setAssignTargetService(svc);
                                                    setSelectedEmployeeId('');
                                                    setSelectedDesignationId('');
                                                }}
                                            >
                                                <i className="bx bx-user-plus" style={{ marginRight: '4px' }} />
                                                Assign Security Guard Now
                                            </Button>
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ overflowX: 'auto', border: '1px solid var(--color-border, #e2e8f0)', borderRadius: '8px' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', minWidth: `${daysInMonth * 28 + 480}px` }}>
                                            <thead>
                                                <tr style={{ backgroundColor: 'var(--color-surface-subtle, #f8fafc)', borderBottom: '1px solid var(--color-border, #e2e8f0)' }}>
                                                    <th style={{ padding: '8px', textAlign: 'left', width: '70px', position: 'sticky', left: 0, backgroundColor: 'var(--color-surface-subtle, #f8fafc)', zIndex: 2 }}>Code</th>
                                                    <th style={{ padding: '8px', textAlign: 'left', width: '130px', position: 'sticky', left: '70px', backgroundColor: 'var(--color-surface-subtle, #f8fafc)', zIndex: 2 }}>Guard Name</th>
                                                    <th style={{ padding: '8px', textAlign: 'center', width: '60px' }}>Role</th>
                                                    <th style={{ padding: '8px', textAlign: 'right', width: '85px' }}>Daily Pay</th>
                                                    <th style={{ padding: '8px', textAlign: 'right', width: '85px' }}>Daily Bill</th>

                                                    {/* Day columns 1 to N */}
                                                    {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
                                                        const isActive = svc.active_days.includes(d);
                                                        return (
                                                            <th 
                                                                key={d}
                                                                style={{
                                                                    padding: '4px 2px',
                                                                    textAlign: 'center',
                                                                    width: '28px',
                                                                    minWidth: '28px',
                                                                    backgroundColor: isActive ? 'rgba(37, 99, 235, 0.12)' : 'transparent',
                                                                    color: isActive ? '#1d4ed8' : '#94a3b8',
                                                                    fontWeight: isActive ? 800 : 500,
                                                                    borderLeft: '1px solid var(--color-border, #e2e8f0)'
                                                                }}
                                                                title={isActive ? `Day ${d}: Active Event Date` : `Day ${d}: Inactive`}
                                                            >
                                                                {d}
                                                            </th>
                                                        );
                                                    })}

                                                    <th style={{ padding: '8px', textAlign: 'center', width: '50px', borderLeft: '2px solid var(--color-border, #cbd5e1)' }}>Att.</th>
                                                    <th style={{ padding: '8px', textAlign: 'right', width: '95px' }}>Guard Pay (₨)</th>
                                                    <th style={{ padding: '8px', textAlign: 'right', width: '95px' }}>Client Bill (₨)</th>
                                                    <th style={{ padding: '8px', textAlign: 'center', width: '36px' }}></th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {svc.guards.map((guard, gIdx) => {
                                                    return (
                                                        <tr key={guard.assignment_id || guard.employee_id} style={{ borderBottom: '1px solid var(--color-border, #e2e8f0)', backgroundColor: gIdx % 2 === 0 ? '#ffffff' : 'var(--color-surface-subtle, #f8fafc)' }}>
                                                            {/* Guard Code */}
                                                            <td style={{ padding: '6px 8px', fontWeight: 700, color: '#0284c7', position: 'sticky', left: 0, backgroundColor: gIdx % 2 === 0 ? '#ffffff' : 'var(--color-surface-subtle, #f8fafc)', zIndex: 1 }}>
                                                                {guard.employee_code}
                                                            </td>

                                                            {/* Guard Name */}
                                                            <td style={{ padding: '6px 8px', fontWeight: 600, position: 'sticky', left: '70px', backgroundColor: gIdx % 2 === 0 ? '#ffffff' : 'var(--color-surface-subtle, #f8fafc)', zIndex: 1 }}>
                                                                {guard.name}
                                                            </td>

                                                            {/* Role Badge */}
                                                            <td style={{ padding: '6px 4px', textAlign: 'center' }}>
                                                                <span style={{
                                                                    padding: '2px 6px',
                                                                    borderRadius: '4px',
                                                                    fontSize: '10px',
                                                                    fontWeight: 800,
                                                                    backgroundColor: '#f1f5f9',
                                                                    color: '#475569'
                                                                }}>
                                                                    {guard.designation || 'GD'}
                                                                </span>
                                                            </td>

                                                            {/* Daily Pay */}
                                                            <td style={{ padding: '6px 8px', textAlign: 'right', color: '#dc2626', fontWeight: 600 }}>
                                                                ₨ {guard.daily_pay_rate.toLocaleString()}
                                                            </td>

                                                            {/* Daily Bill */}
                                                            <td style={{ padding: '6px 8px', textAlign: 'right', color: '#059669', fontWeight: 600 }}>
                                                                ₨ {guard.daily_billing_rate.toLocaleString()}
                                                            </td>

                                                            {/* Day columns 1 to N */}
                                                            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
                                                                const isActive = svc.active_days.includes(d);
                                                                const cellVal = guard.days[String(d)] || '';
                                                                const isDirty = dirtyUpdates.has(`${svc.id}_${guard.employee_id}_${d}`);
                                                                const badge = getCellBadgeStyle(cellVal);

                                                                if (!isActive) {
                                                                    return (
                                                                        <td
                                                                            key={d}
                                                                            style={{
                                                                                padding: '2px',
                                                                                textAlign: 'center',
                                                                                backgroundColor: '#f1f5f9',
                                                                                color: '#cbd5e1',
                                                                                borderLeft: '1px solid #e2e8f0',
                                                                                cursor: 'not-allowed',
                                                                                userSelect: 'none'
                                                                            }}
                                                                            title={`Day ${d} is outside active event dates`}
                                                                        >
                                                                            –
                                                                        </td>
                                                                    );
                                                                }

                                                                return (
                                                                    <td
                                                                        key={d}
                                                                        onClick={() => cycleAttendance(svc.id, guard.employee_id, d, cellVal)}
                                                                        style={{
                                                                            padding: '2px',
                                                                            textAlign: 'center',
                                                                            backgroundColor: badge.bg !== 'transparent' ? badge.bg : (isDirty ? 'rgba(245, 158, 11, 0.1)' : 'transparent'),
                                                                            borderLeft: '1px solid #e2e8f0',
                                                                            cursor: 'pointer',
                                                                            fontWeight: 800,
                                                                            fontSize: '11px',
                                                                            position: 'relative'
                                                                        }}
                                                                        title={`Day ${d}: Click to cycle attendance (Currently: ${cellVal || 'Empty'})`}
                                                                    >
                                                                        <span style={{ color: badge.color }}>
                                                                            {cellVal || '·'}
                                                                        </span>
                                                                        {isDirty && (
                                                                            <span style={{
                                                                                position: 'absolute',
                                                                                top: '2px',
                                                                                right: '2px',
                                                                                width: '4px',
                                                                                height: '4px',
                                                                                borderRadius: '50%',
                                                                                backgroundColor: '#f59e0b'
                                                                            }} />
                                                                        )}
                                                                    </td>
                                                                );
                                                            })}

                                                            {/* Attended Days */}
                                                            <td style={{ padding: '6px 4px', textAlign: 'center', fontWeight: 800, borderLeft: '2px solid var(--color-border, #cbd5e1)' }}>
                                                                {guard.attended_days}
                                                            </td>

                                                            {/* Guard Pay Total */}
                                                            <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: '#dc2626' }}>
                                                                ₨ {guard.total_guard_pay.toLocaleString()}
                                                            </td>

                                                            {/* Client Bill Total */}
                                                            <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: '#059669' }}>
                                                                ₨ {guard.total_client_bill.toLocaleString()}
                                                            </td>

                                                            {/* Unassign action */}
                                                            <td style={{ padding: '4px', textAlign: 'center' }}>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleUnassignGuard(svc, guard)}
                                                                    title="Unassign guard from event"
                                                                    style={{
                                                                        background: 'none',
                                                                        border: 'none',
                                                                        color: '#94a3b8',
                                                                        cursor: 'pointer',
                                                                        fontSize: '14px'
                                                                    }}
                                                                    onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                                                                    onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}
                                                                >
                                                                    <i className="bx bx-x" />
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>

                            {/* Wing B: Equipment, Vehicles & Protocol Section */}
                            {svc.equipment_lines && svc.equipment_lines.length > 0 && (
                                <div style={{
                                    padding: '14px 20px',
                                    borderTop: '1px solid var(--color-border, #e2e8f0)',
                                    backgroundColor: 'var(--color-surface-subtle, #f8fafc)'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                                Wing B: Equipment, Vehicles & Protocol Assets ({svc.equipment_lines.length} Items)
                                            </h4>
                                            <span style={{ fontSize: '11px', color: '#059669', fontWeight: 600 }}>
                                                ✓ Pure Commercial Billing (No Attendance Required)
                                            </span>
                                        </div>
                                        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-primary, #2563eb)' }}>
                                            Assets Total: ₨ {svc.totals.equipment_billed.toLocaleString()}
                                        </div>
                                    </div>

                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', backgroundColor: '#ffffff', border: '1px solid var(--color-border, #e2e8f0)', borderRadius: '6px' }}>
                                        <thead>
                                            <tr style={{ backgroundColor: 'var(--color-surface-subtle, #f8fafc)', borderBottom: '1px solid var(--color-border, #e2e8f0)' }}>
                                                <th style={{ padding: '6px 10px', textAlign: 'left', width: '110px' }}>Type</th>
                                                <th style={{ padding: '6px 10px', textAlign: 'left' }}>Item / Service</th>
                                                <th style={{ padding: '6px 10px', textAlign: 'center', width: '70px' }}>Qty</th>
                                                <th style={{ padding: '6px 10px', textAlign: 'center', width: '70px' }}>Days</th>
                                                <th style={{ padding: '6px 10px', textAlign: 'right', width: '110px' }}>Daily Rate (₨)</th>
                                                <th style={{ padding: '6px 10px', textAlign: 'right', width: '80px' }}>Tax %</th>
                                                <th style={{ padding: '6px 10px', textAlign: 'right', width: '120px' }}>Line Total (₨)</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {svc.equipment_lines.map((eq, eqIdx) => (
                                                <tr key={eq.id || eqIdx} style={{ borderBottom: '1px solid var(--color-border, #e2e8f0)' }}>
                                                    <td style={{ padding: '6px 10px' }}>
                                                        <Badge variant={eq.line_type === 'VEHICLE' ? 'primary' : eq.line_type === 'PROTOCOL' ? 'success' : 'default'}>
                                                            {eq.line_type}
                                                        </Badge>
                                                    </td>
                                                    <td style={{ padding: '6px 10px', fontWeight: 600 }}>
                                                        {eq.item_name}
                                                    </td>
                                                    <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                                                        {eq.quantity}
                                                    </td>
                                                    <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                                                        {eq.days_count}
                                                    </td>
                                                    <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                                                        ₨ {eq.daily_rate.toLocaleString()}
                                                    </td>
                                                    <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                                                        {eq.tax_percent}%
                                                    </td>
                                                    <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700 }}>
                                                        ₨ {eq.total_amount.toLocaleString()}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* Service Block Commercial Rollup Footer */}
                            <div style={{
                                padding: '12px 20px',
                                borderTop: '1px solid var(--color-border, #e2e8f0)',
                                backgroundColor: 'var(--color-surface, #ffffff)',
                                display: 'flex',
                                flexWrap: 'wrap',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '16px',
                                fontSize: '13px'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
                                    <span>
                                        Manpower Bill: <strong style={{ color: '#059669' }}>₨ {svc.totals.manpower_billed.toLocaleString()}</strong>
                                    </span>
                                    <span>
                                        Assets & Protocol: <strong style={{ color: '#2563eb' }}>₨ {svc.totals.equipment_billed.toLocaleString()}</strong>
                                    </span>
                                    <span>
                                        Guard Payroll Owed: <strong style={{ color: '#dc2626' }}>₨ {svc.totals.manpower_guard_pay.toLocaleString()}</strong>
                                    </span>
                                    <span>
                                        Event Profit Margin: <strong style={{ color: '#16a34a' }}>
                                            ₨ {(svc.totals.grand_total - svc.totals.manpower_guard_pay).toLocaleString()}
                                        </strong>
                                    </span>
                                </div>

                                <div style={{ fontWeight: 800, fontSize: '15px' }}>
                                    Grand Total Billed: <span style={{ color: 'var(--color-primary, #2563eb)' }}>₨ {svc.totals.grand_total.toLocaleString()}</span>
                                </div>
                            </div>
                        </div>
                    );
                })
            )}

            {/* Quick Assign Guard Modal */}
            {assignTargetService && (
                <Modal
                    isOpen={!!assignTargetService}
                    onClose={() => setAssignTargetService(null)}
                    title={`Assign Guard to ${assignTargetService.reference_number}`}
                    width="550px"
                >
                    <form onSubmit={handleQuickAssignSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        <div className="form-field">
                            <label className="form-label" style={{ fontWeight: 600 }}>
                                Select Active Guard <span style={{ color: '#ef4444' }}>*</span>
                            </label>
                            <select
                                className="input-base"
                                value={selectedEmployeeId}
                                onChange={e => {
                                    setSelectedEmployeeId(e.target.value);
                                    const emp = allEmployees.find(emp => String(emp.id) === String(e.target.value));
                                    if (emp && emp.designation_id) {
                                        setSelectedDesignationId(emp.designation_id);
                                    }
                                }}
                                required
                            >
                                <option value="">Select Employee...</option>
                                {allEmployees.map(emp => (
                                    <option key={emp.id} value={emp.id}>
                                        {emp.display_code || emp.employee_code} - {emp.first_name} {emp.last_name || ''} ({emp.designation_name || 'Guard'})
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="form-field">
                            <label className="form-label" style={{ fontWeight: 600 }}>
                                Designation for Event
                            </label>
                            <select
                                className="input-base"
                                value={selectedDesignationId}
                                onChange={e => setSelectedDesignationId(e.target.value)}
                            >
                                <option value="">Default Designation</option>
                                {allDesignations.map(d => (
                                    <option key={d.id} value={d.id}>{d.name}</option>
                                ))}
                            </select>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                            <div className="form-field">
                                <label className="form-label" style={{ fontWeight: 600 }}>
                                    Daily Pay Rate to Guard (₨) <span style={{ color: '#ef4444' }}>*</span>
                                </label>
                                <input
                                    type="number"
                                    className="input-base"
                                    value={assignDailyPayRate}
                                    onChange={e => setAssignDailyPayRate(parseFloat(e.target.value) || 0)}
                                    required
                                />
                            </div>
                            <div className="form-field">
                                <label className="form-label" style={{ fontWeight: 600 }}>
                                    Daily Client Billing Rate (₨) <span style={{ color: '#ef4444' }}>*</span>
                                </label>
                                <input
                                    type="number"
                                    className="input-base"
                                    value={assignDailyBillRate}
                                    onChange={e => setAssignDailyBillRate(parseFloat(e.target.value) || 0)}
                                    required
                                />
                            </div>
                        </div>

                        <div className="form-field">
                            <label className="form-label" style={{ fontWeight: 600 }}>Assignment Remarks</label>
                            <input
                                type="text"
                                placeholder="e.g. VIP Lane 1 Entry Check"
                                className="input-base"
                                value={assignNotes}
                                onChange={e => setAssignNotes(e.target.value)}
                            />
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                            <Button type="button" variant="ghost" onClick={() => setAssignTargetService(null)}>
                                Cancel
                            </Button>
                            <Button type="submit" variant="primary" disabled={isAssigning || !selectedEmployeeId}>
                                {isAssigning ? 'Assigning...' : 'Assign Guard to Service'}
                            </Button>
                        </div>
                    </form>
                </Modal>
            )}

            {/* Edit / New Temporary Service Modal */}
            {isEditModalOpen && (
                <TemporaryServiceModal
                    isOpen={isEditModalOpen}
                    onClose={() => setIsEditModalOpen(false)}
                    onSaved={loadData}
                    service={selectedServiceForEdit}
                />
            )}
        </div>
    );
};
