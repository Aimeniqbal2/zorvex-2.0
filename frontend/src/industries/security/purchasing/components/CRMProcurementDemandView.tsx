import React, { useState, useEffect } from 'react';
import { Card } from '../../../../components/ui/Card';
import { getCRMProcurementDemand, type CRMProcurementDemand } from '../api';

export const CRMProcurementDemandView: React.FC = () => {
    const [demandData, setDemandData] = useState<CRMProcurementDemand | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState<string>('');

    const fetchDemand = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await getCRMProcurementDemand();
            setDemandData(data);
        } catch (err: any) {
            console.error('Failed to load CRM procurement demand:', err);
            setError(err.response?.data?.detail || 'Failed to load Security CRM equipment demand.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDemand();
    }, []);

    const formatCurrency = (val?: string | number) => {
        const num = Number(val || 0);
        return `PKR ${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const filteredItems = (demandData?.procurement_demand || []).filter(item => {
        if (!searchTerm) return true;
        const q = searchTerm.toLowerCase();
        return (
            item.item_name.toLowerCase().includes(q) ||
            item.proposal_number.toLowerCase().includes(q) ||
            item.client_name.toLowerCase().includes(q) ||
            item.location_name.toLowerCase().includes(q)
        );
    });

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Header Banner */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '16px',
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: '12px',
                padding: '16px 20px'
            }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <i className='bx bx-git-pull-request' style={{ color: '#f59e0b' }}></i>
                        Security CRM Procurement Demand Sourcing
                    </h2>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                        Cross-module handoff snapshot from Phase S-2H signed contracts & approved proposals. (Read-only demand ingestion)
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <div style={{ position: 'relative' }}>
                        <i className='bx bx-search' style={{ position: 'absolute', left: '10px', top: '9px', color: 'var(--color-text-muted)' }}></i>
                        <input
                            type="text"
                            placeholder="Search item, client, site..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{
                                padding: '7px 12px 7px 30px',
                                borderRadius: '6px',
                                border: '1px solid var(--color-border)',
                                background: 'var(--color-surface)',
                                color: 'var(--color-text)',
                                fontSize: '12px',
                                width: '220px'
                            }}
                        />
                    </div>
                    <button
                        onClick={fetchDemand}
                        style={{
                            padding: '7px 12px',
                            borderRadius: '6px',
                            border: '1px solid var(--color-border)',
                            background: 'var(--color-surface)',
                            color: 'var(--color-text)',
                            fontSize: '12px',
                            cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '4px'
                        }}
                    >
                        <i className='bx bx-refresh'></i> Refresh
                    </button>
                </div>
            </div>

            {/* Note regarding Cross-Module Invariant */}
            <div style={{
                padding: '12px 16px',
                borderRadius: '8px',
                border: '1px solid rgba(99, 102, 241, 0.2)',
                background: 'rgba(99, 102, 241, 0.05)',
                fontSize: '12px',
                color: 'var(--color-text)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
            }}>
                <i className='bx bx-info-circle' style={{ color: 'var(--color-primary)', fontSize: '18px' }}></i>
                <span>
                    <strong>Cross-Module Invariant:</strong> Equipment demand is retrieved directly from certified S-2H Security CRM proposal snapshots without database table duplication. Sourcing teams use this queue to plan manual POs and supplier quotes.
                </span>
            </div>

            {error && (
                <div style={{ padding: '12px 16px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', fontSize: '13px' }}>
                    <i className='bx bx-error-circle'></i> {error}
                </div>
            )}

            {/* Demand Items Table */}
            <Card style={{ padding: '0px', overflow: 'hidden', background: 'var(--color-surface)' }}>
                {loading ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                        <i className='bx bx-loader-alt bx-spin' style={{ fontSize: '28px', color: 'var(--color-primary)' }}></i>
                        <div style={{ marginTop: '8px', fontSize: '13px', fontWeight: 600 }}>Loading CRM equipment demand...</div>
                    </div>
                ) : filteredItems.length === 0 ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                        <i className='bx bx-clipboard' style={{ fontSize: '36px', color: 'var(--color-border)' }}></i>
                        <div style={{ marginTop: '8px', fontSize: '14px', fontWeight: 600 }}>No equipment procurement demand currently registered from signed proposals.</div>
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                            <thead>
                                <tr style={{ background: 'var(--color-surface-hover)', borderBottom: '1px solid var(--color-border)', textAlign: 'left', color: 'var(--color-text-muted)' }}>
                                    <th style={{ padding: '12px 14px' }}>Proposal / Contract</th>
                                    <th style={{ padding: '12px 14px' }}>Client</th>
                                    <th style={{ padding: '12px 14px' }}>Equipment Item</th>
                                    <th style={{ padding: '12px 14px' }}>Required Qty</th>
                                    <th style={{ padding: '12px 14px' }}>Deployment Site</th>
                                    <th style={{ padding: '12px 14px' }}>Required By Date</th>
                                    <th style={{ padding: '12px 14px' }}>Est. Unit Cost</th>
                                    <th style={{ padding: '12px 14px' }}>Est. Total Cost</th>
                                    <th style={{ padding: '12px 14px' }}>Charge Type</th>
                                    <th style={{ padding: '12px 14px' }}>Readiness</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredItems.map((item, idx) => (
                                    <tr key={idx} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                        <td style={{ padding: '12px 14px', fontWeight: 600, color: 'var(--color-primary)' }}>
                                            {item.proposal_number}
                                            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 400 }}>
                                                {item.contract_code}
                                            </div>
                                        </td>
                                        <td style={{ padding: '12px 14px', fontWeight: 600 }}>
                                            {item.client_name}
                                        </td>
                                        <td style={{ padding: '12px 14px', fontWeight: 700, color: 'var(--color-text)' }}>
                                            {item.item_name}
                                        </td>
                                        <td style={{ padding: '12px 14px', fontWeight: 800, fontSize: '13px' }}>
                                            {item.required_quantity}
                                        </td>
                                        <td style={{ padding: '12px 14px' }}>
                                            <i className='bx bx-map-pin' style={{ color: 'var(--color-text-muted)', marginRight: '4px' }}></i>
                                            {item.location_name}
                                        </td>
                                        <td style={{ padding: '12px 14px' }}>
                                            {item.required_by_date}
                                        </td>
                                        <td style={{ padding: '12px 14px' }}>
                                            {formatCurrency(item.estimated_unit_cost)}
                                        </td>
                                        <td style={{ padding: '12px 14px', fontWeight: 700, color: '#10b981' }}>
                                            {formatCurrency(item.estimated_total_cost)}
                                        </td>
                                        <td style={{ padding: '12px 14px' }}>
                                            <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '12px', background: 'var(--color-surface-hover)', fontWeight: 600 }}>
                                                {item.charge_type}
                                            </span>
                                        </td>
                                        <td style={{ padding: '12px 14px' }}>
                                            <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', fontWeight: 700 }}>
                                                {item.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <div style={{ padding: '10px 16px', background: 'var(--color-surface)', borderTop: '1px solid var(--color-border)', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                            Showing {filteredItems.length} demand requirements across {demandData?.proposals_count || 0} active client proposals.
                        </div>
                    </div>
                )}
            </Card>
        </div>
    );
};
