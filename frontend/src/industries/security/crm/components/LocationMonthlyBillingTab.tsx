import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '../../../../components/ui/Button';
import { Badge } from '../../../../components/ui/Badge';
import { useToastStore } from '../../../../stores/toastStore';
import { apiClient } from '../../../../api/client';
import { generateTemporaryInvoice } from '../../../../modules/security-operations/api';
import type { ClientLocation, SecurityProposal } from '../api';

interface LocationMonthlyBillingTabProps {
    customerId: string;
    customerName: string;
    locations: ClientLocation[];
    proposals: SecurityProposal[];
}

export const LocationMonthlyBillingTab: React.FC<LocationMonthlyBillingTabProps> = ({
    customerId,
    customerName,
    locations,
    proposals
}) => {
    const { addToast } = useToastStore();

    const now = new Date();
    const [year, setYear] = useState<number>(now.getFullYear());
    const [month, setMonth] = useState<number>(now.getMonth() + 1);
    const [selectedLocationId, setSelectedLocationId] = useState<string>('ALL');

    const [tempServices, setTempServices] = useState<any[]>([]);
    const [existingInvoices, setExistingInvoices] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isGenerating, setIsGenerating] = useState<string | null>(null);

    const loadBillingData = useCallback(async () => {
        try {
            setIsLoading(true);
            const [tempRes, invRes] = await Promise.all([
                apiClient.get(`/api/operations/temporary-services/?crm_entity=${customerId}&year=${year}&month=${month}`).catch(() => ({ data: [] })),
                apiClient.get(`/api/billing/service-invoices/?crm_entity=${customerId}`).catch(() => ({ data: [] }))
            ]);

            let loadedTemp = tempRes.data.results || tempRes.data || [];
            if (loadedTemp.length === 0) {
                const allTempRes = await apiClient.get(`/api/operations/temporary-services/?crm_entity=${customerId}`).catch(() => ({ data: [] }));
                const allTemp = allTempRes.data.results || allTempRes.data || [];
                loadedTemp = allTemp.filter((t: any) => {
                    if (!t.start_datetime) return true;
                    const d = new Date(t.start_datetime);
                    return d.getFullYear() === year && (d.getMonth() + 1) === month;
                });
            }
            setTempServices(loadedTemp);
            setExistingInvoices(invRes.data.results || invRes.data || []);
        } catch (err: any) {
            console.error('Failed to load monthly billing data', err);
            addToast('error', 'Failed loading monthly billing information.');
        } finally {
            setIsLoading(false);
        }
    }, [customerId, year, month, addToast]);

    useEffect(() => {
        loadBillingData();
    }, [loadBillingData]);

    const monthsList = [
        { num: 1, name: 'January' }, { num: 2, name: 'February' }, { num: 3, name: 'March' },
        { num: 4, name: 'April' }, { num: 5, name: 'May' }, { num: 6, name: 'June' },
        { num: 7, name: 'July' }, { num: 8, name: 'August' }, { num: 9, name: 'September' },
        { num: 10, name: 'October' }, { num: 11, name: 'November' }, { num: 12, name: 'December' }
    ];

    // Compute location-by-location billing rows
    const locationBillingBlocks = useMemo(() => {
        // Collect all locations including temporary venues
        const map = new Map<string, {
            locationId: string;
            locationName: string;
            address: string;
            isTemporaryVenue: boolean;
            permanentProposals: SecurityProposal[];
            temporaryEvents: any[];
            permanentMonthlyTotal: number;
            temporaryMonthlyTotal: number;
            grandTotal: number;
            permanentGuardBreakdown: string;
        }>();

        // 1. Seed registered locations
        locations.forEach(loc => {
            const locProps = proposals.filter(p => {
                const pLocStr = String(p.location || '').toLowerCase();
                const locIdStr = String(loc.id || '').toLowerCase();
                const pLocName = (p.location_name || '').trim().toLowerCase();
                const locName = (loc.name || '').trim().toLowerCase();
                const hasRate = p.location_rates && Object.keys(p.location_rates).some(k => k.toLowerCase() === locIdStr);
                return pLocStr === locIdStr || (pLocName && pLocName === locName) || hasRate;
            });
            let permTotal = 0;
            const breakdowns: string[] = [];

            locProps.forEach(p => {
                let val = 0;
                if (p.location_rates) {
                    const matchedKey = Object.keys(p.location_rates).find(k => k.toLowerCase() === String(loc.id).toLowerCase());
                    if (matchedKey && typeof p.location_rates[matchedKey] === 'number') {
                        val = p.location_rates[matchedKey];
                    }
                }
                if (!val) {
                    val = Number(p.total_monthly_amount || p.monthly_rate || (p as any).estimated_monthly_value || 0);
                }
                permTotal += val;
                if (p.guard_breakdown) {
                    breakdowns.push(p.guard_breakdown);
                } else if (p.guard_headcount) {
                    breakdowns.push(`${p.guard_headcount} Guards`);
                }
            });

            map.set(loc.id, {
                locationId: loc.id,
                locationName: loc.name,
                address: loc.address || 'Registered Site',
                isTemporaryVenue: false,
                permanentProposals: locProps,
                temporaryEvents: [],
                permanentMonthlyTotal: permTotal,
                temporaryMonthlyTotal: 0,
                grandTotal: permTotal,
                permanentGuardBreakdown: breakdowns.join(' | ') || (permTotal > 0 ? 'Contracted Guards Active' : '')
            });
        });

        // 2. Attach temporary services to corresponding location or new venues
        tempServices.forEach(ts => {
            if (ts.status === 'CANCELLED') return;
            const siteId = String(ts.operational_site || ts.operational_site_id || `temp_${ts.id}`);
            const sName = (ts.site_name || ts.operational_site_name || '').trim();
            const tsTotal = Number(ts.grand_total || 0);

            // Match by registered location ID OR by location name (case-insensitive)
            let matchedLocId: string | null = null;
            for (const [lId, b] of map.entries()) {
                if (lId.toLowerCase() === siteId.toLowerCase() || (sName && b.locationName.trim().toLowerCase() === sName.toLowerCase())) {
                    matchedLocId = lId;
                    break;
                }
            }

            if (matchedLocId && map.has(matchedLocId)) {
                const entry = map.get(matchedLocId)!;
                entry.temporaryEvents.push(ts);
                entry.temporaryMonthlyTotal += tsTotal;
                entry.grandTotal += tsTotal;
            } else {
                // Temporary venue not in registered permanent locations
                map.set(siteId, {
                    locationId: siteId,
                    locationName: sName || 'Temporary Event Venue',
                    address: ts.site_name || 'Temporary Event Venue',
                    isTemporaryVenue: true,
                    permanentProposals: [],
                    temporaryEvents: [ts],
                    permanentMonthlyTotal: 0,
                    temporaryMonthlyTotal: tsTotal,
                    grandTotal: tsTotal,
                    permanentGuardBreakdown: ''
                });
            }
        });

        const list = Array.from(map.values());
        if (selectedLocationId !== 'ALL') {
            return list.filter(b => b.locationId === selectedLocationId);
        }
        return list;
    }, [locations, proposals, tempServices, selectedLocationId]);

    // Overall Month Grand Rollup
    const monthRollup = useMemo(() => {
        let perm = 0;
        let temp = 0;
        locationBillingBlocks.forEach(b => {
            perm += b.permanentMonthlyTotal;
            temp += b.temporaryMonthlyTotal;
        });
        return {
            permanentTotal: perm,
            temporaryTotal: temp,
            grandTotal: perm + temp
        };
    }, [locationBillingBlocks]);

    const handleGenerateInvoice = async (serviceId: string) => {
        try {
            setIsGenerating(serviceId);
            const res = await generateTemporaryInvoice(serviceId);
            addToast('success', `Invoice #${res.invoice_number} created successfully! Total: ₨ ${Number(res.total_amount || 0).toLocaleString()}`);
            await loadBillingData();
        } catch (err: any) {
            addToast('error', err?.response?.data?.error || 'Failed to generate invoice.');
        } finally {
            setIsGenerating(null);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* Top Toolbar: Month, Year & Location selectors */}
            <div style={{
                background: 'var(--color-surface, #ffffff)',
                padding: '16px 20px',
                borderRadius: '12px',
                border: '1px solid var(--color-border, #e2e8f0)',
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '14px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Month:</label>
                        <select
                            value={month}
                            onChange={(e) => setMonth(Number(e.target.value))}
                            style={{
                                padding: '8px 12px',
                                borderRadius: '6px',
                                border: '1px solid var(--color-border, #cbd5e1)',
                                fontSize: '13px',
                                background: 'var(--color-background, #ffffff)',
                                fontWeight: 600
                            }}
                        >
                            {monthsList.map(m => (
                                <option key={m.num} value={m.num}>{m.name}</option>
                            ))}
                        </select>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Year:</label>
                        <select
                            value={year}
                            onChange={(e) => setYear(Number(e.target.value))}
                            style={{
                                padding: '8px 12px',
                                borderRadius: '6px',
                                border: '1px solid var(--color-border, #cbd5e1)',
                                fontSize: '13px',
                                background: 'var(--color-background, #ffffff)',
                                fontWeight: 600
                            }}
                        >
                            {[2024, 2025, 2026, 2027].map(y => (
                                <option key={y} value={y}>{y}</option>
                            ))}
                        </select>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Filter Location:</label>
                        <select
                            value={selectedLocationId}
                            onChange={(e) => setSelectedLocationId(e.target.value)}
                            style={{
                                padding: '8px 12px',
                                borderRadius: '6px',
                                border: '1px solid var(--color-border, #cbd5e1)',
                                fontSize: '13px',
                                background: 'var(--color-background, #ffffff)'
                            }}
                        >
                            <option value="ALL">All Deployment Locations ({locations.length})</option>
                            {locations.map(loc => (
                                <option key={loc.id} value={loc.id}>{loc.name}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Button variant="ghost" size="sm" onClick={loadBillingData}>
                        <i className="bx bx-refresh"></i> Refresh
                    </Button>
                </div>
            </div>

            {/* 3 KPI Summary Cards for the selected month */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
                <div style={{
                    background: 'var(--color-surface, #ffffff)',
                    padding: '16px 20px',
                    borderRadius: '10px',
                    border: '1px solid var(--color-border, #e2e8f0)',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                }}>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Permanent Monthly Billing</div>
                    <div style={{ fontSize: '20px', fontWeight: 800, marginTop: '4px', color: '#3b82f6' }}>
                        ₨ {monthRollup.permanentTotal.toLocaleString()}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '4px' }}>Contracted permanent guard staffing</div>
                </div>

                <div style={{
                    background: 'var(--color-surface, #ffffff)',
                    padding: '16px 20px',
                    borderRadius: '10px',
                    border: '1px solid var(--color-border, #e2e8f0)',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                }}>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Temporary Services in {monthsList[month - 1].name}</div>
                    <div style={{ fontSize: '20px', fontWeight: 800, marginTop: '4px', color: '#f59e0b' }}>
                        ₨ {monthRollup.temporaryTotal.toLocaleString()}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '4px' }}>{tempServices.length} Temporary events & equipment rentals</div>
                </div>

                <div style={{
                    background: 'var(--color-surface, #ffffff)',
                    padding: '16px 20px',
                    borderRadius: '10px',
                    border: '1px solid var(--color-border, #e2e8f0)',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                }}>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Consolidated Monthly Total</div>
                    <div style={{ fontSize: '22px', fontWeight: 800, marginTop: '4px', color: '#10b981' }}>
                        ₨ {monthRollup.grandTotal.toLocaleString()}
                    </div>
                    <div style={{ fontSize: '11px', color: '#10b981', marginTop: '4px' }}>Complete invoiceable billing for {customerName}</div>
                </div>
            </div>

            {/* Location-by-Location Consolidated Invoicing Blocks */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700 }}>
                        Location Invoicing Breakdown — {monthsList[month - 1].name} {year}
                    </h3>
                    <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                        Shows permanent contracted monthly rates alongside temporary events per location.
                    </span>
                </div>

                {isLoading ? (
                    <div style={{ padding: '40px', textAlign: 'center', background: 'var(--color-surface)', borderRadius: '12px' }}>
                        <i className="bx bx-loader-alt bx-spin" style={{ fontSize: '28px', color: 'var(--color-primary)' }} />
                        <p style={{ marginTop: '8px', fontSize: '13px' }}>Loading monthly location billing...</p>
                    </div>
                ) : locationBillingBlocks.length === 0 ? (
                    <div style={{ padding: '40px', textAlign: 'center', background: 'var(--color-surface)', borderRadius: '12px', color: 'var(--color-text-muted)' }}>
                        <i className="bx bx-receipt" style={{ fontSize: '40px', color: '#cbd5e1' }} />
                        <h4 style={{ margin: '8px 0 4px 0', fontWeight: 600 }}>No Locations or Services Found</h4>
                        <p style={{ fontSize: '12.5px' }}>There are no active deployments or temporary services recorded for this month.</p>
                    </div>
                ) : (
                    locationBillingBlocks.map((locBlock, bIdx) => {
                        return (
                            <div 
                                key={locBlock.locationId || bIdx}
                                style={{
                                    background: 'var(--color-surface, #ffffff)',
                                    borderRadius: '12px',
                                    border: '1px solid var(--color-border, #e2e8f0)',
                                    overflow: 'hidden',
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                                }}
                            >
                                {/* Location Header Bar */}
                                <div style={{
                                    padding: '14px 20px',
                                    background: 'var(--color-surface-subtle, #f8fafc)',
                                    borderBottom: '1px solid var(--color-border, #e2e8f0)',
                                    display: 'flex',
                                    flexWrap: 'wrap',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: '12px'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <i className="bx bx-map-pin" style={{ fontSize: '18px', color: locBlock.isTemporaryVenue ? '#d97706' : 'var(--color-primary)' }} />
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <strong style={{ fontSize: '14px' }}>{locBlock.locationName}</strong>
                                                {locBlock.isTemporaryVenue && (
                                                    <Badge variant="warning">Temporary Event Venue</Badge>
                                                )}
                                            </div>
                                            <div style={{ fontSize: '11.5px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                                                {locBlock.address}
                                            </div>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 600 }}>Location Total ({monthsList[month - 1].name})</div>
                                            <div style={{ fontSize: '17px', fontWeight: 800, color: '#10b981' }}>
                                                ₨ {locBlock.grandTotal.toLocaleString()}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Body: Permanent vs Temporary Breakdown */}
                                <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                    
                                    {/* 1. Permanent Services row */}
                                    <div style={{
                                        padding: '12px 14px',
                                        borderRadius: '8px',
                                        backgroundColor: '#f0fdf4',
                                        border: '1px solid #bbf7d0',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between'
                                    }}>
                                        <div>
                                            <span style={{ fontWeight: 700, fontSize: '13px', color: '#166534', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <i className="bx bx-shield-quarter" /> Permanent Guarding Services
                                            </span>
                                            <span style={{ fontSize: '11.5px', color: '#15803d' }}>
                                                {locBlock.permanentGuardBreakdown ? locBlock.permanentGuardBreakdown : (locBlock.permanentProposals.length > 0 ? `${locBlock.permanentProposals.length} active requirement agreement(s)` : 'No permanent contract for this venue')}
                                            </span>
                                        </div>
                                        <div style={{ fontWeight: 800, fontSize: '14px', color: '#166534' }}>
                                            ₨ {locBlock.permanentMonthlyTotal.toLocaleString()} / month
                                        </div>
                                    </div>

                                    {/* 2. Temporary Services list */}
                                    <div>
                                        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>
                                            Temporary Services in {monthsList[month - 1].name} ({locBlock.temporaryEvents.length} Events)
                                        </div>

                                        {locBlock.temporaryEvents.length === 0 ? (
                                            <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontStyle: 'italic', padding: '6px 0' }}>
                                                No temporary security services active at this location during {monthsList[month - 1].name}.
                                            </div>
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                {locBlock.temporaryEvents.map((ts) => {
                                                    const sDate = ts.start_datetime ? new Date(ts.start_datetime).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
                                                    const eDate = ts.end_datetime ? new Date(ts.end_datetime).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
                                                    return (
                                                        <div 
                                                            key={ts.id}
                                                            style={{
                                                                padding: '10px 14px',
                                                                borderRadius: '8px',
                                                                backgroundColor: '#fffbeb',
                                                                border: '1px solid #fde68a',
                                                                display: 'flex',
                                                                flexWrap: 'wrap',
                                                                alignItems: 'center',
                                                                justifyContent: 'space-between',
                                                                gap: '10px'
                                                            }}
                                                        >
                                                            <div>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                    <strong style={{ color: '#b45309', fontSize: '13px' }}>{ts.reference_number}</strong>
                                                                    <span style={{ fontWeight: 600, fontSize: '13px' }}>{ts.title || 'Event Security'}</span>
                                                                    <Badge variant="default">{ts.status}</Badge>
                                                                    <span style={{ fontSize: '11px', color: '#92400e', background: '#fef3c7', padding: '1px 6px', borderRadius: '4px' }}>
                                                                        {sDate} – {eDate}
                                                                    </span>
                                                                </div>
                                                                <div style={{ fontSize: '11.5px', color: '#92400e', marginTop: '4px' }}>
                                                                    Manpower: ₨ {Number(ts.total_manpower_cost || 0).toLocaleString()} | Assets/Vehicles: ₨ {Number(ts.total_equipment_cost || 0).toLocaleString()}
                                                                </div>
                                                            </div>

                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                                <strong style={{ fontSize: '14px', color: '#92400e' }}>
                                                                    ₨ {Number(ts.grand_total || 0).toLocaleString()}
                                                                </strong>

                                                                <Button
                                                                    variant="secondary"
                                                                    size="sm"
                                                                    onClick={() => handleGenerateInvoice(ts.id)}
                                                                    disabled={isGenerating === ts.id}
                                                                    style={{ fontSize: '11.5px', padding: '4px 10px' }}
                                                                >
                                                                    <i className="bx bx-receipt" style={{ marginRight: '4px' }} />
                                                                    {isGenerating === ts.id ? 'Generating...' : 'Generate Invoice'}
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Invoices Generated History Table */}
            <div style={{
                background: 'var(--color-surface, #ffffff)',
                borderRadius: '12px',
                border: '1px solid var(--color-border, #e2e8f0)',
                overflow: 'hidden',
                marginTop: '10px'
            }}>
                <div style={{
                    padding: '14px 20px',
                    borderBottom: '1px solid var(--color-border, #e2e8f0)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                }}>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '14.5px', fontWeight: 700 }}>
                            Client Invoices History ({customerName})
                        </h3>
                        <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                            Generated service invoices (Permanent & Temporary services).
                        </p>
                    </div>
                    <Badge variant="primary">{existingInvoices.length} Invoices</Badge>
                </div>

                {existingInvoices.length === 0 ? (
                    <div style={{ padding: '30px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '13px' }}>
                        No invoices generated for this client yet. Click "Generate Invoice" on any service above to create an official bill.
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                            <thead>
                                <tr style={{ background: 'var(--color-surface-subtle, #f8fafc)', borderBottom: '1px solid var(--color-border, #e2e8f0)', textAlign: 'left' }}>
                                    <th style={{ padding: '10px 14px', fontWeight: 700 }}>Invoice #</th>
                                    <th style={{ padding: '10px 14px', fontWeight: 700 }}>Billing Period</th>
                                    <th style={{ padding: '10px 14px', fontWeight: 700, textAlign: 'right' }}>Subtotal (₨)</th>
                                    <th style={{ padding: '10px 14px', fontWeight: 700, textAlign: 'right' }}>Tax (₨)</th>
                                    <th style={{ padding: '10px 14px', fontWeight: 700, textAlign: 'right' }}>Total Amount (₨)</th>
                                    <th style={{ padding: '10px 14px', fontWeight: 700 }}>Status</th>
                                    <th style={{ padding: '10px 14px', fontWeight: 700 }}>Notes / Description</th>
                                </tr>
                            </thead>
                            <tbody>
                                {existingInvoices.map((inv, iIdx) => (
                                    <tr key={inv.id || iIdx} style={{ borderBottom: '1px solid var(--color-border, #e2e8f0)' }}>
                                        <td style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--color-primary)' }}>
                                            {inv.invoice_number || `INV-${inv.id.slice(0, 8)}`}
                                        </td>
                                        <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                                            {inv.period_start} – {inv.period_end}
                                        </td>
                                        <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                                            ₨ {Number(inv.subtotal || 0).toLocaleString()}
                                        </td>
                                        <td style={{ padding: '10px 14px', textAlign: 'right', color: '#b45309' }}>
                                            ₨ {Number(inv.tax_amount || 0).toLocaleString()}
                                        </td>
                                        <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, color: '#16a34a' }}>
                                            ₨ {Number(inv.total_amount || 0).toLocaleString()}
                                        </td>
                                        <td style={{ padding: '10px 14px' }}>
                                            <Badge variant={inv.status === 'POSTED' ? 'success' : 'default'}>{inv.status || 'DRAFT'}</Badge>
                                        </td>
                                        <td style={{ padding: '10px 14px', color: 'var(--color-text-muted)', fontSize: '11.5px', maxWidth: '300px' }}>
                                            {inv.notes || 'Service Invoice'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

