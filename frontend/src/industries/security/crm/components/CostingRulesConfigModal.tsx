import React, { useState, useEffect } from 'react';
import { Modal } from '../../../../components/ui/Modal';
import { Button } from '../../../../components/ui/Button';
import { ToggleSwitch } from './ToggleSwitch';
import { useToastStore } from '../../../../stores/toastStore';
import { fetchCostingSettings, updateCostingSettings } from '../api';
import type { CostingSettings } from '../api';

interface CostingRulesConfigModalProps {
    isOpen: boolean;
    onClose: () => void;
    onApplied: (settings: CostingSettings, applyToGrid: boolean, applyToggles: boolean) => void;
}

export const CostingRulesConfigModal: React.FC<CostingRulesConfigModalProps> = ({
    isOpen,
    onClose,
    onApplied
}) => {
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Form state
    const [eobiRate, setEobiRate] = useState<number | string>(1500);
    const [sessiMinimumWage, setSessiMinimumWage] = useState<number | string>(37000);
    const [sessiPercentage, setSessiPercentage] = useState<number | string>(6.0);
    const [adminChargesPercentage, setAdminChargesPercentage] = useState<number | string>(5.0);
    const [insurancePercentage, setInsurancePercentage] = useState<number | string>(2.0);

    const [eobiDefaultEnabled, setEobiDefaultEnabled] = useState(false);
    const [sessiDefaultEnabled, setSessiDefaultEnabled] = useState(false);
    const [adminChargesDefaultEnabled, setAdminChargesDefaultEnabled] = useState(false);
    const [insuranceDefaultEnabled, setInsuranceDefaultEnabled] = useState(false);

    const [applyTogglesToGrid, setApplyTogglesToGrid] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        const load = async () => {
            setIsLoading(true);
            try {
                const data = await fetchCostingSettings();
                if (data) {
                    setEobiRate(data.eobi_rate ?? 1500);
                    setSessiMinimumWage(data.sessi_minimum_wage ?? 37000);
                    setSessiPercentage(data.sessi_percentage ?? 6.0);
                    setAdminChargesPercentage(data.admin_charges_percentage ?? 5.0);
                    setInsurancePercentage(data.insurance_percentage ?? 2.0);
                    setEobiDefaultEnabled(!!data.eobi_default_enabled);
                    setSessiDefaultEnabled(!!data.sessi_default_enabled);
                    setAdminChargesDefaultEnabled(!!data.admin_charges_default_enabled);
                    setInsuranceDefaultEnabled(!!data.insurance_default_enabled);
                }
            } catch (err) {
                console.warn('Could not load costing settings, using default values', err);
            } finally {
                setIsLoading(false);
            }
        };
        load();
    }, [isOpen]);

    const numEobiRate = Number(eobiRate) || 0;
    const numMinWage = Number(sessiMinimumWage) || 0;
    const numSessiPct = Number(sessiPercentage) || 0;
    const numAdminPct = Number(adminChargesPercentage) || 0;
    const numInsPct = Number(insurancePercentage) || 0;

    const sessiPerGuard = Math.round(numMinWage * (numSessiPct / 100));

    const handleSave = async (applyToAll: boolean) => {
        setIsSaving(true);
        try {
            const payload = {
                eobi_rate: numEobiRate,
                sessi_minimum_wage: numMinWage,
                sessi_percentage: numSessiPct,
                admin_charges_percentage: numAdminPct,
                insurance_percentage: numInsPct,
                eobi_default_enabled: eobiDefaultEnabled,
                sessi_default_enabled: sessiDefaultEnabled,
                admin_charges_default_enabled: adminChargesDefaultEnabled,
                insurance_default_enabled: insuranceDefaultEnabled,
                apply_to_all_locations: applyToAll,
                apply_toggles: applyTogglesToGrid
            };

            const res = await updateCostingSettings(payload);
            useToastStore.getState().success(
                applyToAll
                    ? 'Costing rules saved and applied to all locations!'
                    : 'Default costing rules saved successfully!'
            );
            onApplied(res.settings || (payload as any), applyToAll, applyTogglesToGrid);
            onClose();
        } catch (err: any) {
            useToastStore.getState().error(err?.response?.data?.error || err?.message || 'Failed to save costing rules.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Configure Statutory & Costing Formulas">
            <div style={{ padding: '4px', maxWidth: '750px', color: 'var(--color-text)' }}>
                {isLoading ? (
                    <div style={{ textAlign: 'center', padding: '30px', color: 'var(--color-text-muted)' }}>
                        <i className="bx bx-loader-alt bx-spin" style={{ fontSize: '24px', marginBottom: '8px' }} />
                        <p>Loading current costing rules...</p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', lineHeight: '1.4' }}>
                            Configure the master parameters and mathematical formulas for <strong>EOBI</strong>, <strong>SESSI</strong>, <strong>Admin Charges</strong>, and <strong>Insurance</strong>. These rules govern the switchable toggles and uneditable amounts across the Fast Costing Grid and Final Requirements.
                        </div>

                        {/* Grid of 4 Cards */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '14px' }}>
                            
                            {/* Card 1: EOBI */}
                            <div style={{
                                padding: '14px',
                                borderRadius: '8px',
                                border: '1px solid var(--color-border)',
                                background: 'var(--color-surface)',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '10px'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: 'rgba(16, 185, 129, 0.12)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <i className="bx bx-shield-quarter" style={{ fontSize: '16px' }} />
                                        </div>
                                        <div>
                                            <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 700 }}>EOBI Configuration</h4>
                                            <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Manual rate × Location strength</span>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Default ON</span>
                                        <ToggleSwitch
                                            checked={eobiDefaultEnabled}
                                            onChange={setEobiDefaultEnabled}
                                            title="Toggle default EOBI state"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label style={{ fontSize: '11px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                                        EOBI Manual Rate (₨ / Guard) *
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        className="input-base"
                                        style={{ width: '100%', height: '34px', fontSize: '13px', fontWeight: 600, fontFamily: 'monospace' }}
                                        value={eobiRate}
                                        onChange={(e) => setEobiRate(e.target.value)}
                                        placeholder="1500"
                                    />
                                </div>

                                <div style={{ padding: '8px 10px', borderRadius: '6px', background: 'var(--color-surface-secondary)', fontSize: '11px', borderLeft: '3px solid #10b981' }}>
                                    <strong>Formula:</strong> ₨ {numEobiRate.toLocaleString()} × Location Strength
                                    <div style={{ color: 'var(--color-text-muted)', marginTop: '2px' }}>
                                        Example: 10 guards = <strong>₨ {(numEobiRate * 10).toLocaleString()}</strong>
                                    </div>
                                </div>
                            </div>

                            {/* Card 2: SESSI */}
                            <div style={{
                                padding: '14px',
                                borderRadius: '8px',
                                border: '1px solid var(--color-border)',
                                background: 'var(--color-surface)',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '10px'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: 'rgba(59, 130, 246, 0.12)', color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <i className="bx bx-plus-medical" style={{ fontSize: '16px' }} />
                                        </div>
                                        <div>
                                            <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 700 }}>SESSI Configuration</h4>
                                            <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Minimum wage × Percentage × Strength</span>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Default ON</span>
                                        <ToggleSwitch
                                            checked={sessiDefaultEnabled}
                                            onChange={setSessiDefaultEnabled}
                                            title="Toggle default SESSI state"
                                        />
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '8px' }}>
                                    <div>
                                        <label style={{ fontSize: '11px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                                            Min Wage (₨) *
                                        </label>
                                        <input
                                            type="number"
                                            min="0"
                                            className="input-base"
                                            style={{ width: '100%', height: '34px', fontSize: '13px', fontWeight: 600, fontFamily: 'monospace' }}
                                            value={sessiMinimumWage}
                                            onChange={(e) => setSessiMinimumWage(e.target.value)}
                                            placeholder="37000"
                                        />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '11px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                                            SESSI Rate (%) *
                                        </label>
                                        <input
                                            type="number"
                                            step="0.1"
                                            min="0"
                                            className="input-base"
                                            style={{ width: '100%', height: '34px', fontSize: '13px', fontWeight: 600, fontFamily: 'monospace' }}
                                            value={sessiPercentage}
                                            onChange={(e) => setSessiPercentage(e.target.value)}
                                            placeholder="6.0"
                                        />
                                    </div>
                                </div>

                                <div style={{ padding: '8px 10px', borderRadius: '6px', background: 'var(--color-surface-secondary)', fontSize: '11px', borderLeft: '3px solid #3b82f6' }}>
                                    <strong>Formula:</strong> ₨ {numMinWage.toLocaleString()} × {numSessiPct}% = <strong>₨ {sessiPerGuard.toLocaleString()}</strong> / guard
                                    <div style={{ color: 'var(--color-text-muted)', marginTop: '2px' }}>
                                        Example: 10 guards = <strong>₨ {(sessiPerGuard * 10).toLocaleString()}</strong>
                                    </div>
                                </div>
                            </div>

                            {/* Card 3: Admin Charges */}
                            <div style={{
                                padding: '14px',
                                borderRadius: '8px',
                                border: '1px solid var(--color-border)',
                                background: 'var(--color-surface)',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '10px'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: 'rgba(245, 158, 11, 0.12)', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <i className="bx bx-briefcase-alt-2" style={{ fontSize: '16px' }} />
                                        </div>
                                        <div>
                                            <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 700 }}>Admin Charges</h4>
                                            <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Location Monthly Sale × %</span>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Default ON</span>
                                        <ToggleSwitch
                                            checked={adminChargesDefaultEnabled}
                                            onChange={setAdminChargesDefaultEnabled}
                                            title="Toggle default Admin Charges state"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label style={{ fontSize: '11px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                                        Admin Charges Rate (%) *
                                    </label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        min="0"
                                        className="input-base"
                                        style={{ width: '100%', height: '34px', fontSize: '13px', fontWeight: 600, fontFamily: 'monospace' }}
                                        value={adminChargesPercentage}
                                        onChange={(e) => setAdminChargesPercentage(e.target.value)}
                                        placeholder="5.0"
                                    />
                                </div>

                                <div style={{ padding: '8px 10px', borderRadius: '6px', background: 'var(--color-surface-secondary)', fontSize: '11px', borderLeft: '3px solid #d97706' }}>
                                    <strong>Formula:</strong> Monthly Sale × {numAdminPct}%
                                    <div style={{ color: 'var(--color-text-muted)', marginTop: '2px' }}>
                                        Example: ₨ 500,000 billing = <strong>₨ {Math.round(500000 * (numAdminPct / 100)).toLocaleString()}</strong>
                                    </div>
                                </div>
                            </div>

                            {/* Card 4: Insurance */}
                            <div style={{
                                padding: '14px',
                                borderRadius: '8px',
                                border: '1px solid var(--color-border)',
                                background: 'var(--color-surface)',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '10px'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: 'rgba(139, 92, 246, 0.12)', color: '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <i className="bx bx-check-shield" style={{ fontSize: '16px' }} />
                                        </div>
                                        <div>
                                            <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 700 }}>Insurance</h4>
                                            <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Location Monthly Sale × %</span>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Default ON</span>
                                        <ToggleSwitch
                                            checked={insuranceDefaultEnabled}
                                            onChange={setInsuranceDefaultEnabled}
                                            title="Toggle default Insurance state"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label style={{ fontSize: '11px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                                        Insurance Rate (%) *
                                    </label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        min="0"
                                        className="input-base"
                                        style={{ width: '100%', height: '34px', fontSize: '13px', fontWeight: 600, fontFamily: 'monospace' }}
                                        value={insurancePercentage}
                                        onChange={(e) => setInsurancePercentage(e.target.value)}
                                        placeholder="2.0"
                                    />
                                </div>

                                <div style={{ padding: '8px 10px', borderRadius: '6px', background: 'var(--color-surface-secondary)', fontSize: '11px', borderLeft: '3px solid #8b5cf6' }}>
                                    <strong>Formula:</strong> Monthly Sale × {numInsPct}%
                                    <div style={{ color: 'var(--color-text-muted)', marginTop: '2px' }}>
                                        Example: ₨ 500,000 billing = <strong>₨ {Math.round(500000 * (numInsPct / 100)).toLocaleString()}</strong>
                                    </div>
                                </div>
                            </div>

                        </div>

                        {/* Apply Scope Option */}
                        <div style={{
                            padding: '12px 14px',
                            borderRadius: '6px',
                            background: 'var(--color-surface-secondary)',
                            border: '1px solid var(--color-border)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px'
                        }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>
                                <input
                                    type="checkbox"
                                    checked={applyTogglesToGrid}
                                    onChange={(e) => setApplyTogglesToGrid(e.target.checked)}
                                    style={{ accentColor: 'var(--color-primary)', width: '16px', height: '16px' }}
                                />
                                Also overwrite & apply ON/OFF switch toggles to all existing locations in grid
                            </label>
                            <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginLeft: '24px' }}>
                                If checked, all locations will take the Default ON/OFF switch states selected above. If unchecked, each location preserves its own individual active/disabled toggle switch.
                            </span>
                        </div>

                        {/* Modal Actions */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
                            <Button
                                variant="ghost"
                                onClick={onClose}
                                disabled={isSaving}
                            >
                                Cancel
                            </Button>
                            <Button
                                variant="secondary"
                                onClick={() => handleSave(false)}
                                disabled={isSaving}
                            >
                                Save Defaults Only
                            </Button>
                            <Button
                                variant="primary"
                                onClick={() => handleSave(true)}
                                disabled={isSaving}
                            >
                                {isSaving ? (
                                    <>
                                        <i className="bx bx-loader-alt bx-spin" style={{ marginRight: '6px' }} />
                                        Applying...
                                    </>
                                ) : (
                                    <>
                                        <i className="bx bx-check-double" style={{ marginRight: '6px' }} />
                                        Apply to All Locations
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
};

