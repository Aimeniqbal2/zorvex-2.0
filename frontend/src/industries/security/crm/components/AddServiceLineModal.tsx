import React, { useState, useEffect } from 'react';
import type { SecurityServiceType, ClientLocation, ProposalServiceLine } from '../api';
import { Button } from '../../../../components/ui/Button';

interface AddServiceLineModalProps {
    isOpen: boolean;
    onClose: () => void;
    proposalVersionId: string;
    locations: ClientLocation[];
    serviceTypes: SecurityServiceType[];
    editingLine?: ProposalServiceLine | null;
    onSave: (payload: Partial<ProposalServiceLine>) => Promise<void>;
}

export const AddServiceLineModal: React.FC<AddServiceLineModalProps> = ({
    isOpen,
    onClose,
    proposalVersionId,
    locations,
    serviceTypes,
    editingLine,
    onSave
}) => {
    const [location, setLocation] = useState<string>('');
    const [serviceType, setServiceType] = useState<string>('');
    const [quantity, setQuantity] = useState<number>(1);
    const [billingUnit] = useState<string>('MONTHLY');
    const [clientRate, setClientRate] = useState<number | string>(0);
    const [guardSalary, setGuardSalary] = useState<number | string>(0);
    const [weaponType, setWeaponType] = useState<string>('UNARMED');
    const [shiftHours, setShiftHours] = useState<string>('12_HOURS');
    const [singleOtRate, setSingleOtRate] = useState<number | string>(0);
    const [doubleOtRate, setDoubleOtRate] = useState<number | string>(0);
    const [notes, setNotes] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Synchronize form state whenever editingLine changes or modal opens
    useEffect(() => {
        if (!isOpen) return;

        if (editingLine) {
            const locId = (editingLine.location as any)?.id || editingLine.location || (locations[0]?.id || '');
            const stId = (editingLine.service_type as any)?.id || editingLine.service_type || (serviceTypes[0]?.id || '');
            setLocation(locId);
            setServiceType(stId);
            setQuantity(Number(editingLine.quantity) || 1);
            setClientRate(editingLine.client_rate ?? 0);
            setGuardSalary(editingLine.guard_salary ?? 0);
            setWeaponType(editingLine.weapon_type || 'UNARMED');
            setShiftHours(editingLine.shift_hours || '12_HOURS');
            setSingleOtRate(editingLine.single_ot_rate ?? (editingLine as any).single_ot_billing_rate ?? 0);
            setDoubleOtRate(editingLine.double_ot_rate ?? (editingLine as any).double_ot_billing_rate ?? 0);
            setNotes(editingLine.notes || '');
        } else {
            setLocation(locations[0]?.id || '');
            setServiceType(serviceTypes[0]?.id || '');
            setQuantity(1);
            setClientRate(0);
            setGuardSalary(0);
            setWeaponType('UNARMED');
            setShiftHours('12_HOURS');
            setSingleOtRate(0);
            setDoubleOtRate(0);
            setNotes('');
        }
        setError(null);
    }, [editingLine, isOpen, locations, serviceTypes]);

    if (!isOpen) return null;

    const qty = Math.max(1, Number(quantity) || 1);
    const saleRate = Number(clientRate) || 0;
    const salRate = Number(guardSalary) || 0;
    const totalSale = qty * saleRate;
    const totalSalary = qty * salRate;
    const grossMargin = totalSale - totalSalary;
    const marginPerHead = saleRate - salRate;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            await onSave({
                proposal_version: proposalVersionId,
                location: location || undefined,
                service_type: serviceType,
                quantity: qty,
                billing_unit: billingUnit,
                client_rate: saleRate,
                guard_salary: salRate,
                weapon_type: weaponType,
                shift_hours: shiftHours,
                single_ot_rate: Number(singleOtRate) || 0,
                double_ot_rate: Number(doubleOtRate) || 0,
                notes
            });
            onClose();
        } catch (err: any) {
            setError(err?.response?.data?.error || err?.response?.data?.detail || err?.message || 'Failed to save service line.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div 
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 999,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '16px',
                background: 'rgba(15, 23, 42, 0.65)',
                backdropFilter: 'blur(5px)'
            }}
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div 
                style={{
                    width: '100%',
                    maxWidth: '880px',
                    maxHeight: '92vh',
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '16px',
                    boxShadow: '0 24px 48px -12px rgba(0, 0, 0, 0.25)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    animation: 'modalSlideIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
                }}
            >
                {/* Modal Header */}
                <div 
                    style={{ 
                        padding: '18px 24px', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'space-between',
                        borderBottom: '1px solid var(--color-border)',
                        background: 'var(--color-surface)'
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <div 
                            style={{ 
                                width: '42px', 
                                height: '42px', 
                                borderRadius: '12px', 
                                background: 'rgba(59, 130, 246, 0.12)', 
                                color: 'var(--color-primary)',
                                border: '1px solid rgba(59, 130, 246, 0.25)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '20px',
                                flexShrink: 0
                            }}
                        >
                            <i className='bx bx-shield-quarter'></i>
                        </div>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: 'var(--color-text)' }}>
                                    {editingLine ? 'Edit Guard Requirement & Costing' : 'Add Guard Requirement & Costing'}
                                </h3>
                                {editingLine && (
                                    <span style={{
                                        fontSize: '11px',
                                        fontWeight: 600,
                                        padding: '2px 8px',
                                        borderRadius: '12px',
                                        background: 'rgba(59, 130, 246, 0.15)',
                                        color: 'var(--color-primary)'
                                    }}>
                                        Editing
                                    </span>
                                )}
                            </div>
                            <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                                One Security Costing: Site deployment, client invoiced rate & guard location salary
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'transparent',
                            border: '1px solid var(--color-border)',
                            color: 'var(--color-text-muted)',
                            cursor: 'pointer',
                            fontSize: '18px',
                            transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = 'var(--color-surface-secondary)';
                            e.currentTarget.style.color = 'var(--color-text)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent';
                            e.currentTarget.style.color = 'var(--color-text-muted)';
                        }}
                        title="Close"
                    >
                        <i className='bx bx-x'></i>
                    </button>
                </div>

                {/* Form Content */}
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                    <div style={{ padding: '22px 24px', overflowY: 'auto', flex: 1 }}>
                        {error && (
                            <div style={{
                                padding: '12px 16px',
                                background: 'rgba(239, 68, 68, 0.08)',
                                border: '1px solid rgba(239, 68, 68, 0.25)',
                                borderRadius: '10px',
                                color: '#ef4444',
                                fontSize: '13px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                marginBottom: '18px'
                            }}>
                                <i className='bx bx-error-circle' style={{ fontSize: '18px' }}></i>
                                <span>{error}</span>
                            </div>
                        )}

                        {/* 2-Column Balanced Grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '22px' }}>
                            
                            {/* Left Column: Deployment & Role Specs */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                <div style={{
                                    fontSize: '12px',
                                    fontWeight: 700,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.04em',
                                    color: 'var(--color-primary)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    paddingBottom: '8px',
                                    borderBottom: '1px solid var(--color-border)'
                                }}>
                                    <i className='bx bx-map-pin' style={{ fontSize: '15px' }}></i> Deployment & Role Details
                                </div>

                                {/* Client Location */}
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--color-text)', marginBottom: '6px' }}>
                                        Client Location / Site *
                                    </label>
                                    <select
                                        value={location}
                                        onChange={(e) => setLocation(e.target.value)}
                                        required
                                        style={{
                                            width: '100%',
                                            height: '40px',
                                            padding: '0 12px',
                                            borderRadius: '8px',
                                            fontSize: '13px',
                                            background: 'var(--color-surface)',
                                            border: '1px solid var(--color-border)',
                                            color: 'var(--color-text)',
                                            outline: 'none',
                                            transition: 'border-color 0.15s ease'
                                        }}
                                        onFocus={(e) => e.target.style.borderColor = 'var(--color-primary)'}
                                        onBlur={(e) => e.target.style.borderColor = 'var(--color-border)'}
                                    >
                                        <option value="">Select Location</option>
                                        {locations.map(loc => (
                                            <option key={loc.id} value={loc.id}>{loc.name}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Security Role */}
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--color-text)', marginBottom: '6px' }}>
                                        Security Role / Designation *
                                    </label>
                                    <select
                                        value={serviceType}
                                        onChange={(e) => setServiceType(e.target.value)}
                                        required
                                        style={{
                                            width: '100%',
                                            height: '40px',
                                            padding: '0 12px',
                                            borderRadius: '8px',
                                            fontSize: '13px',
                                            background: 'var(--color-surface)',
                                            border: '1px solid var(--color-border)',
                                            color: 'var(--color-text)',
                                            outline: 'none',
                                            transition: 'border-color 0.15s ease'
                                        }}
                                        onFocus={(e) => e.target.style.borderColor = 'var(--color-primary)'}
                                        onBlur={(e) => e.target.style.borderColor = 'var(--color-border)'}
                                    >
                                        <option value="">Select Role</option>
                                        {serviceTypes.map(st => (
                                            <option key={st.id} value={st.id}>{st.name} ({st.code})</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Quantity & Shift Coverage */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--color-text)', marginBottom: '6px' }}>
                                            Quantity (Guards) *
                                        </label>
                                        <input
                                            type="number"
                                            min="1"
                                            value={quantity}
                                            onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                                            required
                                            style={{
                                                width: '100%',
                                                height: '40px',
                                                padding: '0 12px',
                                                borderRadius: '8px',
                                                fontSize: '14px',
                                                fontWeight: 700,
                                                fontFamily: 'monospace',
                                                background: 'var(--color-surface)',
                                                border: '1px solid var(--color-border)',
                                                color: 'var(--color-text)',
                                                outline: 'none',
                                                transition: 'border-color 0.15s ease'
                                            }}
                                            onFocus={(e) => e.target.style.borderColor = 'var(--color-primary)'}
                                            onBlur={(e) => e.target.style.borderColor = 'var(--color-border)'}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--color-text)', marginBottom: '6px' }}>
                                            Shift Coverage
                                        </label>
                                        <select
                                            value={shiftHours}
                                            onChange={(e) => setShiftHours(e.target.value)}
                                            style={{
                                                width: '100%',
                                                height: '40px',
                                                padding: '0 12px',
                                                borderRadius: '8px',
                                                fontSize: '13px',
                                                background: 'var(--color-surface)',
                                                border: '1px solid var(--color-border)',
                                                color: 'var(--color-text)',
                                                outline: 'none',
                                                transition: 'border-color 0.15s ease'
                                            }}
                                            onFocus={(e) => e.target.style.borderColor = 'var(--color-primary)'}
                                            onBlur={(e) => e.target.style.borderColor = 'var(--color-border)'}
                                        >
                                            <option value="12_HOURS">12 Hours Shift</option>
                                            <option value="24_HOURS">24 Hours (Round the clock)</option>
                                            <option value="8_HOURS">8 Hours Shift</option>
                                            <option value="DAY_SHIFT">Day Shift (12h)</option>
                                            <option value="NIGHT_SHIFT">Night Shift (12h)</option>
                                        </select>
                                    </div>
                                </div>

                                {/* Weapon / Gear Spec */}
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--color-text)', marginBottom: '6px' }}>
                                        Weapon / Gear Specification
                                    </label>
                                    <select
                                        value={weaponType}
                                        onChange={(e) => setWeaponType(e.target.value)}
                                        style={{
                                            width: '100%',
                                            height: '40px',
                                            padding: '0 12px',
                                            borderRadius: '8px',
                                            fontSize: '13px',
                                            background: 'var(--color-surface)',
                                            border: '1px solid var(--color-border)',
                                            color: 'var(--color-text)',
                                            outline: 'none',
                                            transition: 'border-color 0.15s ease'
                                        }}
                                        onFocus={(e) => e.target.style.borderColor = 'var(--color-primary)'}
                                        onBlur={(e) => e.target.style.borderColor = 'var(--color-border)'}
                                    >
                                        <option value="UNARMED">Unarmed Guard</option>
                                        <option value="PISTOL">Pistol (30 Bore / 9mm)</option>
                                        <option value="REPEATER_12B">12 Bore Repeater</option>
                                        <option value="RIFLE_7_62">7.62 Rifle</option>
                                        <option value="MP5">MP5 Sub-Machine Gun</option>
                                        <option value="CCTV_OPERATOR">CCTV / Control Operator</option>
                                        <option value="LADY_SEARCHER">Lady Searcher</option>
                                    </select>
                                </div>

                                {/* Post Instructions / Notes */}
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--color-text)', marginBottom: '6px' }}>
                                        Post Instructions / Notes
                                    </label>
                                    <textarea
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                        rows={2}
                                        placeholder="e.g. 24/7 Gate security, 1 guard per shift"
                                        style={{
                                            width: '100%',
                                            padding: '10px 12px',
                                            borderRadius: '8px',
                                            fontSize: '13px',
                                            background: 'var(--color-surface)',
                                            border: '1px solid var(--color-border)',
                                            color: 'var(--color-text)',
                                            outline: 'none',
                                            resize: 'none',
                                            transition: 'border-color 0.15s ease'
                                        }}
                                        onFocus={(e) => e.target.style.borderColor = 'var(--color-primary)'}
                                        onBlur={(e) => e.target.style.borderColor = 'var(--color-border)'}
                                    />
                                </div>
                            </div>

                            {/* Right Column: Rates, Salary & Live Costing Margin Engine */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                <div style={{
                                    fontSize: '12px',
                                    fontWeight: 700,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.04em',
                                    color: '#10b981',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    paddingBottom: '8px',
                                    borderBottom: '1px solid var(--color-border)'
                                }}>
                                    <i className='bx bx-calculator' style={{ fontSize: '15px' }}></i> Pricing, Salary & Margins
                                </div>

                                {/* Rates & Salary Box */}
                                <div style={{
                                    padding: '14px 16px',
                                    borderRadius: '12px',
                                    background: 'var(--color-surface-secondary)',
                                    border: '1px solid var(--color-border)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '12px'
                                }}>
                                    {/* Client Sale Rate */}
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                                            <label style={{ fontSize: '12px', fontWeight: 700, color: '#10b981', textTransform: 'uppercase' }}>
                                                Client Sale Rate / Head (PKR) *
                                            </label>
                                            <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Invoiced to Client</span>
                                        </div>
                                        <input
                                            type="number"
                                            min="0"
                                            step="any"
                                            value={clientRate}
                                            onChange={(e) => setClientRate(e.target.value)}
                                            placeholder="e.g. 48960"
                                            required
                                            style={{
                                                width: '100%',
                                                height: '42px',
                                                padding: '0 14px',
                                                borderRadius: '8px',
                                                fontSize: '15px',
                                                fontFamily: 'monospace',
                                                fontWeight: 700,
                                                background: 'var(--color-surface)',
                                                border: '1.5px solid #10b981',
                                                color: 'var(--color-text)',
                                                outline: 'none'
                                            }}
                                        />
                                    </div>

                                    {/* Location Guard Salary */}
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                                            <label style={{ fontSize: '12px', fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase' }}>
                                                Location Guard Salary (PKR) *
                                            </label>
                                            <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Paid to Guard at Site</span>
                                        </div>
                                        <input
                                            type="number"
                                            min="0"
                                            step="any"
                                            value={guardSalary}
                                            onChange={(e) => setGuardSalary(e.target.value)}
                                            placeholder="e.g. 39000"
                                            required
                                            style={{
                                                width: '100%',
                                                height: '42px',
                                                padding: '0 14px',
                                                borderRadius: '8px',
                                                fontSize: '15px',
                                                fontFamily: 'monospace',
                                                fontWeight: 700,
                                                background: 'var(--color-surface)',
                                                border: '1.5px solid #f59e0b',
                                                color: 'var(--color-text)',
                                                outline: 'none'
                                            }}
                                        />
                                    </div>
                                </div>

                                {/* Overtime Billing Rates */}
                                <div style={{
                                    padding: '12px 14px',
                                    borderRadius: '10px',
                                    background: 'var(--color-surface)',
                                    border: '1px solid var(--color-border)'
                                }}>
                                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '8px', textTransform: 'uppercase' }}>
                                        Client Overtime Billing Rates (Optional)
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>
                                                Single OT / Hr (PKR)
                                            </label>
                                            <input
                                                type="number"
                                                min="0"
                                                step="any"
                                                value={singleOtRate}
                                                onChange={(e) => setSingleOtRate(e.target.value)}
                                                placeholder="0.00"
                                                style={{
                                                    width: '100%',
                                                    height: '34px',
                                                    padding: '0 10px',
                                                    borderRadius: '6px',
                                                    fontSize: '13px',
                                                    fontFamily: 'monospace',
                                                    background: 'var(--color-surface)',
                                                    border: '1px solid var(--color-border)',
                                                    color: 'var(--color-text)',
                                                    outline: 'none'
                                                }}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>
                                                Double OT / Hr (PKR)
                                            </label>
                                            <input
                                                type="number"
                                                min="0"
                                                step="any"
                                                value={doubleOtRate}
                                                onChange={(e) => setDoubleOtRate(e.target.value)}
                                                placeholder="0.00"
                                                style={{
                                                    width: '100%',
                                                    height: '34px',
                                                    padding: '0 10px',
                                                    borderRadius: '6px',
                                                    fontSize: '13px',
                                                    fontFamily: 'monospace',
                                                    background: 'var(--color-surface)',
                                                    border: '1px solid var(--color-border)',
                                                    color: 'var(--color-text)',
                                                    outline: 'none'
                                                }}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Live Costing Breakdown Preview Card */}
                                <div style={{
                                    padding: '12px 14px',
                                    borderRadius: '10px',
                                    background: 'rgba(59, 130, 246, 0.05)',
                                    border: '1px solid rgba(59, 130, 246, 0.2)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '8px'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px' }}>
                                        <span style={{ fontWeight: 600, color: 'var(--color-text)' }}>
                                            Costing Engine Preview ({qty} Guard{qty > 1 ? 's' : ''}):
                                        </span>
                                        <span style={{
                                            fontSize: '11px',
                                            fontWeight: 700,
                                            fontFamily: 'monospace',
                                            padding: '2px 8px',
                                            borderRadius: '6px',
                                            background: marginPerHead >= 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                            color: marginPerHead >= 0 ? '#10b981' : '#ef4444'
                                        }}>
                                            Diff/Head: PKR {Math.round(marginPerHead).toLocaleString()}
                                        </span>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', textAlign: 'center' }}>
                                        <div style={{ padding: '8px 6px', borderRadius: '8px', background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                                            <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Monthly Sale</div>
                                            <div style={{ fontSize: '13px', fontWeight: 700, color: '#3b82f6', marginTop: '2px', fontFamily: 'monospace' }}>
                                                PKR {Math.round(totalSale).toLocaleString()}
                                            </div>
                                        </div>
                                        <div style={{ padding: '8px 6px', borderRadius: '8px', background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                                            <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Direct Salary</div>
                                            <div style={{ fontSize: '13px', fontWeight: 700, color: '#f59e0b', marginTop: '2px', fontFamily: 'monospace' }}>
                                                PKR {Math.round(totalSalary).toLocaleString()}
                                            </div>
                                        </div>
                                        <div style={{ padding: '8px 6px', borderRadius: '8px', background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                                            <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Gross Margin</div>
                                            <div style={{ fontSize: '13px', fontWeight: 700, color: grossMargin >= 0 ? '#10b981' : '#ef4444', marginTop: '2px', fontFamily: 'monospace' }}>
                                                PKR {Math.round(grossMargin).toLocaleString()}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Modal Footer */}
                    <div 
                        style={{ 
                            padding: '14px 24px', 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'flex-end', 
                            gap: '12px',
                            borderTop: '1px solid var(--color-border)',
                            background: 'var(--color-surface-secondary)'
                        }}
                    >
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={onClose}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            variant="primary"
                            disabled={loading || !serviceType || !location}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                        >
                            {loading ? (
                                <>
                                    <i className='bx bx-loader-alt bx-spin'></i> Saving...
                                </>
                            ) : (
                                <>
                                    <i className='bx bx-check'></i> {editingLine ? 'Update Requirement' : 'Add Guard Requirement'}
                                </>
                            )}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
};
