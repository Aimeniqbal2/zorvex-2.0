import React, { useState, useEffect, useCallback } from 'react';
import type { SecurityProposal, CrossModuleHandoffSummary } from '../api';
import { getHandoffSummary, prepareCrossModuleHandoff } from '../api';
import { Button } from '../../../../components/ui/Button';
import { useToastStore } from '../../../../stores/toastStore';

interface Props {
    proposal: SecurityProposal;
    onRefresh: () => void;
}

export const CrossModuleHandoffTab: React.FC<Props> = ({ proposal, onRefresh }) => {
    const [summary, setSummary] = useState<CrossModuleHandoffSummary | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isPreparing, setIsPreparing] = useState(false);
    const [activeSection, setActiveSection] = useState<'operations' | 'hrm' | 'inventory' | 'purchasing' | 'finance' | 'documents' | 'json'>('operations');
    const [handoffNotes, setHandoffNotes] = useState(proposal.handoff_notes || '');

    const loadSummary = useCallback(async () => {
        setIsLoading(true);
        try {
            const data = await getHandoffSummary(proposal.id);
            setSummary(data);
            if (data.handoff_notes) {
                setHandoffNotes(data.handoff_notes);
            }
        } catch (err: any) {
            console.error("Failed to load cross-module handoff summary", err);
            useToastStore.getState().error('Failed to load cross-module handoff snapshot');
        } finally {
            setIsLoading(false);
        }
    }, [proposal.id]);

    useEffect(() => {
        loadSummary();
    }, [loadSummary]);

    const handlePrepareHandoff = async () => {
        setIsPreparing(true);
        try {
            const res = await prepareCrossModuleHandoff(proposal.id, handoffNotes);
            useToastStore.getState().success(res.message || 'Cross-module handoff prepared and certified successfully!');
            setSummary(res.handoff_summary);
            onRefresh();
        } catch (err: any) {
            const msg = err.response?.data?.error || err.message || 'Failed to prepare handoff';
            useToastStore.getState().error(msg);
        } finally {
            setIsPreparing(false);
        }
    };

    if (isLoading) {
        return (
            <div style={{ padding: '48px', textAlign: 'center', color: '#64748b' }}>
                <div className="spinner" style={{ margin: '0 auto 16px auto' }} />
                <p>Loading cross-module handoff architecture & contract snapshot...</p>
            </div>
        );
    }

    if (!summary) {
        return (
            <div style={{ padding: '32px', textAlign: 'center', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <p style={{ color: '#64748b' }}>Cross-module handoff data is not available yet.</p>
                <Button variant="primary" style={{ marginTop: '12px' }} onClick={loadSummary}>Retry</Button>
            </div>
        );
    }

    const { readiness_checklist: checklist } = summary;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Top Certification & Readiness Banner */}
            <div style={{
                background: summary.is_handoff_ready ? 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)' : '#ffffff',
                color: summary.is_handoff_ready ? '#ffffff' : '#0f172a',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '24px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                            <span style={{
                                padding: '4px 10px',
                                borderRadius: '9999px',
                                fontSize: '11px',
                                fontWeight: 700,
                                textTransform: 'uppercase',
                                background: summary.is_handoff_ready ? '#10b981' : '#f59e0b',
                                color: '#ffffff'
                            }}>
                                {summary.is_handoff_ready ? '✓ Certified Handoff Ready' : 'Handoff Preparation Pending'}
                            </span>
                            <span style={{ fontSize: '14px', opacity: 0.8 }}>
                                Proposal #{summary.proposal_number} • Contract #{summary.service_contract.contract_code}
                            </span>
                        </div>
                        <h2 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 6px 0' }}>
                            Cross-Module Contract Handoff Vault
                        </h2>
                        <p style={{ margin: 0, fontSize: '13px', opacity: summary.is_handoff_ready ? 0.8 : 0.6, maxWidth: '680px' }}>
                            Authoritative contract snapshot structured for downstream consumption by Security Operations, HRM, Inventory, Purchasing, and Finance.
                        </p>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                        <Button
                            variant="primary"
                            onClick={handlePrepareHandoff}
                            disabled={isPreparing || proposal.status !== 'ACTIVE'}
                            style={{
                                background: summary.is_handoff_ready ? '#059669' : '#2563eb',
                                borderColor: summary.is_handoff_ready ? '#059669' : '#2563eb',
                                padding: '10px 20px',
                                fontWeight: 600
                            }}
                        >
                            {isPreparing ? 'Certifying Handoff...' : summary.is_handoff_ready ? '✓ Re-Certify & Sync Handoff' : 'Prepare & Certify Handoff (S-2H)'}
                        </Button>
                        {summary.handoff_prepared_at && (
                            <span style={{ fontSize: '12px', opacity: 0.75 }}>
                                Prepared on {new Date(summary.handoff_prepared_at).toLocaleString()} {summary.handoff_prepared_by_name ? `by ${summary.handoff_prepared_by_name}` : ''}
                            </span>
                        )}
                    </div>
                </div>

                {/* Readiness Indicators Strip */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: '12px',
                    marginTop: '20px',
                    paddingTop: '20px',
                    borderTop: summary.is_handoff_ready ? '1px solid rgba(255, 255, 255, 0.15)' : '1px solid #e2e8f0'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
                        <span style={{ color: checklist.crm_lifecycle_completed ? '#10b981' : '#ef4444', fontWeight: 'bold' }}>
                            {checklist.crm_lifecycle_completed ? '●' : '○'}
                        </span>
                        <span>CRM Lifecycle (ACTIVE)</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
                        <span style={{ color: checklist.service_contract_linked ? '#10b981' : '#ef4444', fontWeight: 'bold' }}>
                            {checklist.service_contract_linked ? '●' : '○'}
                        </span>
                        <span>ServiceContract Linked</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
                        <span style={{ color: checklist.operational_sites_linked ? '#10b981' : '#ef4444', fontWeight: 'bold' }}>
                            {checklist.operational_sites_linked ? '●' : '○'}
                        </span>
                        <span>OperationalSites ({summary.operational_sites.length})</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
                        <span style={{ color: checklist.approved_version_locked ? '#10b981' : '#ef4444', fontWeight: 'bold' }}>
                            {checklist.approved_version_locked ? '●' : '○'}
                        </span>
                        <span>Commercials Frozen (v{summary.approved_version.version_number})</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
                        <span style={{ color: checklist.signed_documents_present ? '#10b981' : '#ef4444', fontWeight: 'bold' }}>
                            {checklist.signed_documents_present ? '●' : '○'}
                        </span>
                        <span>Signed Vault ({summary.signed_documents.length} Docs)</span>
                    </div>
                </div>
            </div>

            {/* Submodule Navigation Bar */}
            <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px', flexWrap: 'wrap' }}>
                <button
                    onClick={() => setActiveSection('operations')}
                    style={{
                        padding: '8px 16px',
                        borderRadius: '6px',
                        border: 'none',
                        background: activeSection === 'operations' ? '#2563eb' : '#f1f5f9',
                        color: activeSection === 'operations' ? '#ffffff' : '#475569',
                        fontWeight: 600,
                        fontSize: '13px',
                        cursor: 'pointer'
                    }}
                >
                    1. Operations Handoff
                </button>
                <button
                    onClick={() => setActiveSection('hrm')}
                    style={{
                        padding: '8px 16px',
                        borderRadius: '6px',
                        border: 'none',
                        background: activeSection === 'hrm' ? '#2563eb' : '#f1f5f9',
                        color: activeSection === 'hrm' ? '#ffffff' : '#475569',
                        fontWeight: 600,
                        fontSize: '13px',
                        cursor: 'pointer'
                    }}
                >
                    2. HRM Staffing Demand
                </button>
                <button
                    onClick={() => setActiveSection('inventory')}
                    style={{
                        padding: '8px 16px',
                        borderRadius: '6px',
                        border: 'none',
                        background: activeSection === 'inventory' ? '#2563eb' : '#f1f5f9',
                        color: activeSection === 'inventory' ? '#ffffff' : '#475569',
                        fontWeight: 600,
                        fontSize: '13px',
                        cursor: 'pointer'
                    }}
                >
                    3. Inventory Demand
                </button>
                <button
                    onClick={() => setActiveSection('purchasing')}
                    style={{
                        padding: '8px 16px',
                        borderRadius: '6px',
                        border: 'none',
                        background: activeSection === 'purchasing' ? '#2563eb' : '#f1f5f9',
                        color: activeSection === 'purchasing' ? '#ffffff' : '#475569',
                        fontWeight: 600,
                        fontSize: '13px',
                        cursor: 'pointer'
                    }}
                >
                    4. Purchasing Demand
                </button>
                <button
                    onClick={() => setActiveSection('finance')}
                    style={{
                        padding: '8px 16px',
                        borderRadius: '6px',
                        border: 'none',
                        background: activeSection === 'finance' ? '#2563eb' : '#f1f5f9',
                        color: activeSection === 'finance' ? '#ffffff' : '#475569',
                        fontWeight: 600,
                        fontSize: '13px',
                        cursor: 'pointer'
                    }}
                >
                    5. Finance Commercial Data
                </button>
                <button
                    onClick={() => setActiveSection('documents')}
                    style={{
                        padding: '8px 16px',
                        borderRadius: '6px',
                        border: 'none',
                        background: activeSection === 'documents' ? '#2563eb' : '#f1f5f9',
                        color: activeSection === 'documents' ? '#ffffff' : '#475569',
                        fontWeight: 600,
                        fontSize: '13px',
                        cursor: 'pointer'
                    }}
                >
                    Signed Documents ({summary.signed_documents.length})
                </button>
                <button
                    onClick={() => setActiveSection('json')}
                    style={{
                        padding: '8px 16px',
                        borderRadius: '6px',
                        border: 'none',
                        background: activeSection === 'json' ? '#475569' : '#f8fafc',
                        color: activeSection === 'json' ? '#ffffff' : '#64748b',
                        fontWeight: 600,
                        fontSize: '13px',
                        cursor: 'pointer'
                    }}
                >
                    JSON Payload
                </button>
            </div>

            {/* SECTION 1: OPERATIONS HANDOFF */}
            {activeSection === 'operations' && (
                <div style={{ background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', padding: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <div>
                            <h3 style={{ margin: '0 0 4px 0', fontSize: '16px', fontWeight: 600 }}>
                                Security Operations & Dispatch Handoff
                            </h3>
                            <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
                                Contracted guard posts, operational sites, and coverage requirements ready for operational deployment.
                            </p>
                        </div>
                        <span style={{
                            padding: '4px 10px',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: 600,
                            background: '#dbeafe',
                            color: '#1d4ed8'
                        }}>
                            {summary.operations_handoff.readiness_status}
                        </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '20px', background: '#f8fafc', padding: '16px', borderRadius: '8px' }}>
                        <div>
                            <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase' }}>ServiceContract Code</span>
                            <div style={{ fontWeight: 600, fontSize: '14px' }}>{summary.operations_handoff.contract_code}</div>
                        </div>
                        <div>
                            <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase' }}>Mobilization Date</span>
                            <div style={{ fontWeight: 600, fontSize: '14px' }}>{summary.operations_handoff.expected_mobilization_date}</div>
                        </div>
                        <div>
                            <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase' }}>Total Operational Sites</span>
                            <div style={{ fontWeight: 600, fontSize: '14px' }}>{summary.operations_handoff.total_operational_sites} Linked Sites</div>
                        </div>
                        <div>
                            <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase' }}>Total Contracted Posts</span>
                            <div style={{ fontWeight: 600, fontSize: '14px' }}>{summary.operations_handoff.total_guard_posts} Security Personnel</div>
                        </div>
                    </div>

                    <h4 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 12px 0' }}>Contracted Service Lines & Posts</h4>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid #e2e8f0', background: '#f8fafc' }}>
                                    <th style={{ padding: '10px' }}>Site / Location</th>
                                    <th style={{ padding: '10px' }}>Security Role / Service Type</th>
                                    <th style={{ padding: '10px' }}>Qty</th>
                                    <th style={{ padding: '10px' }}>Billing Unit</th>
                                    <th style={{ padding: '10px' }}>Shift & Coverage Notes</th>
                                    <th style={{ padding: '10px' }}>Post Area</th>
                                </tr>
                            </thead>
                            <tbody>
                                {summary.operations_handoff.service_requirements.map((req, i) => (
                                    <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <td style={{ padding: '10px', fontWeight: 500 }}>{req.location_name}</td>
                                        <td style={{ padding: '10px' }}>{req.service_type_name} ({req.service_type_code})</td>
                                        <td style={{ padding: '10px', fontWeight: 600 }}>{req.quantity}</td>
                                        <td style={{ padding: '10px' }}>{req.billing_unit}</td>
                                        <td style={{ padding: '10px', color: '#64748b' }}>{req.shift_coverage_notes || '—'}</td>
                                        <td style={{ padding: '10px', color: '#64748b' }}>{req.post_area || '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div style={{ marginTop: '20px', padding: '12px', background: '#eff6ff', borderRadius: '6px', fontSize: '12px', color: '#1e40af', border: '1px solid #bfdbfe' }}>
                        💡 <strong>Boundary Notice:</strong> CRM establishes contracted service types, headcount, and site locations. Guard rostering, employee deployment, shift schedules, and operational incident logs will be executed inside <strong>Security Operations</strong>.
                    </div>
                </div>
            )}

            {/* SECTION 2: HRM STAFFING DEMAND */}
            {activeSection === 'hrm' && (
                <div style={{ background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', padding: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <div>
                            <h3 style={{ margin: '0 0 4px 0', fontSize: '16px', fontWeight: 600 }}>
                                Security HRM & Workforce Staffing Demand
                            </h3>
                            <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
                                Registered staffing headcount demand by role and location to initiate workforce allocation and recruitment.
                            </p>
                        </div>
                        <span style={{
                            padding: '4px 10px',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: 600,
                            background: '#dcfce7',
                            color: '#15803d'
                        }}>
                            {summary.hrm_handoff.readiness_status}
                        </span>
                    </div>

                    <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
                        <div style={{ flex: 1, background: '#f8fafc', padding: '16px', borderRadius: '8px' }}>
                            <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase' }}>Total Demanded Headcount</span>
                            <div style={{ fontSize: '24px', fontWeight: 700, color: '#0f172a' }}>{summary.hrm_handoff.total_required_headcount} Guards / Personnel</div>
                        </div>
                        <div style={{ flex: 1, background: '#f8fafc', padding: '16px', borderRadius: '8px' }}>
                            <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase' }}>Deployment Start Date</span>
                            <div style={{ fontSize: '24px', fontWeight: 700, color: '#0f172a' }}>{summary.hrm_handoff.expected_deployment_date}</div>
                        </div>
                    </div>

                    <h4 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 12px 0' }}>Staffing Demand Registry</h4>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid #e2e8f0', background: '#f8fafc' }}>
                                    <th style={{ padding: '10px' }}>Demand ID</th>
                                    <th style={{ padding: '10px' }}>Location</th>
                                    <th style={{ padding: '10px' }}>Service Designation</th>
                                    <th style={{ padding: '10px' }}>Headcount</th>
                                    <th style={{ padding: '10px' }}>Expected Start</th>
                                    <th style={{ padding: '10px' }}>Post / Area</th>
                                    <th style={{ padding: '10px' }}>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {summary.hrm_handoff.staffing_demand.map((d, i) => (
                                    <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <td style={{ padding: '10px', fontFamily: 'monospace', fontSize: '11px' }}>{d.demand_id.substring(0, 18)}...</td>
                                        <td style={{ padding: '10px', fontWeight: 500 }}>{d.location_name}</td>
                                        <td style={{ padding: '10px' }}>{d.service_type_name}</td>
                                        <td style={{ padding: '10px', fontWeight: 700 }}>{d.required_headcount}</td>
                                        <td style={{ padding: '10px' }}>{d.expected_start_date}</td>
                                        <td style={{ padding: '10px', color: '#64748b' }}>{d.post_area || '—'}</td>
                                        <td style={{ padding: '10px' }}>
                                            <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11px', background: '#f1f5f9', fontWeight: 600 }}>
                                                {d.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div style={{ marginTop: '20px', padding: '12px', background: '#f0fdf4', borderRadius: '6px', fontSize: '12px', color: '#166534', border: '1px solid #bbf7d0' }}>
                        💡 <strong>Boundary Notice:</strong> CRM defines client staffing demand. Employee hiring, credential verification, salary structures, attendance logging, and payroll will be executed inside <strong>Security HRM & Payroll</strong>.
                    </div>
                </div>
            )}

            {/* SECTION 3: INVENTORY HANDOFF */}
            {activeSection === 'inventory' && (
                <div style={{ background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', padding: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <div>
                            <h3 style={{ margin: '0 0 4px 0', fontSize: '16px', fontWeight: 600 }}>
                                Security Inventory & Armory Demand
                            </h3>
                            <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
                                Contracted equipment, tactical hardware, weapons, and uniforms required for client site deployment.
                            </p>
                        </div>
                        <span style={{
                            padding: '4px 10px',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: 600,
                            background: '#fef3c7',
                            color: '#92400e'
                        }}>
                            {summary.inventory_handoff.readiness_status}
                        </span>
                    </div>

                    {summary.inventory_handoff.equipment_demand.length === 0 ? (
                        <div style={{ padding: '32px', textAlign: 'center', color: '#64748b', background: '#f8fafc', borderRadius: '8px' }}>
                            No contracted equipment requirements found for this proposal version.
                        </div>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                                <thead>
                                    <tr style={{ borderBottom: '2px solid #e2e8f0', background: '#f8fafc' }}>
                                        <th style={{ padding: '10px' }}>Equipment Item</th>
                                        <th style={{ padding: '10px' }}>Location</th>
                                        <th style={{ padding: '10px' }}>Quantity</th>
                                        <th style={{ padding: '10px' }}>Charge Type</th>
                                        <th style={{ padding: '10px' }}>Required By</th>
                                        <th style={{ padding: '10px' }}>Unit Rate</th>
                                        <th style={{ padding: '10px' }}>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {summary.inventory_handoff.equipment_demand.map((eq, i) => (
                                        <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: '10px', fontWeight: 500 }}>{eq.item_name}</td>
                                            <td style={{ padding: '10px' }}>{eq.location_name}</td>
                                            <td style={{ padding: '10px', fontWeight: 700 }}>{eq.quantity}</td>
                                            <td style={{ padding: '10px' }}>{eq.charge_type}</td>
                                            <td style={{ padding: '10px' }}>{eq.required_date}</td>
                                            <td style={{ padding: '10px' }}>PKR {Number(eq.unit_rate).toLocaleString()}</td>
                                            <td style={{ padding: '10px' }}>
                                                <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11px', background: '#fef3c7', fontWeight: 600, color: '#92400e' }}>
                                                    {eq.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    <div style={{ marginTop: '20px', padding: '12px', background: '#fffbeb', borderRadius: '6px', fontSize: '12px', color: '#92400e', border: '1px solid #fde68a' }}>
                        💡 <strong>Boundary Notice:</strong> CRM defines contracted equipment commitments. Actual physical stock checks, serial tracking, armory issuance, and stock transfers will occur in <strong>Security Inventory</strong>.
                    </div>
                </div>
            )}

            {/* SECTION 4: PURCHASING HANDOFF */}
            {activeSection === 'purchasing' && (
                <div style={{ background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', padding: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <div>
                            <h3 style={{ margin: '0 0 4px 0', fontSize: '16px', fontWeight: 600 }}>
                                Purchasing & Procurement Demand
                            </h3>
                            <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
                                Equipment demand channeled for vendor procurement and external acquisition.
                            </p>
                        </div>
                        <span style={{
                            padding: '4px 10px',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: 600,
                            background: '#e0e7ff',
                            color: '#3730a3'
                        }}>
                            {summary.purchasing_handoff.readiness_status}
                        </span>
                    </div>

                    {summary.purchasing_handoff.procurement_demand.length === 0 ? (
                        <div style={{ padding: '32px', textAlign: 'center', color: '#64748b', background: '#f8fafc', borderRadius: '8px' }}>
                            No external procurement demand generated.
                        </div>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                                <thead>
                                    <tr style={{ borderBottom: '2px solid #e2e8f0', background: '#f8fafc' }}>
                                        <th style={{ padding: '10px' }}>Item Required</th>
                                        <th style={{ padding: '10px' }}>Quantity</th>
                                        <th style={{ padding: '10px' }}>Destination Site</th>
                                        <th style={{ padding: '10px' }}>Required By</th>
                                        <th style={{ padding: '10px' }}>Estimated Budget</th>
                                        <th style={{ padding: '10px' }}>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {summary.purchasing_handoff.procurement_demand.map((p, i) => (
                                        <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: '10px', fontWeight: 500 }}>{p.item_name}</td>
                                            <td style={{ padding: '10px', fontWeight: 700 }}>{p.required_quantity}</td>
                                            <td style={{ padding: '10px' }}>{p.location_name}</td>
                                            <td style={{ padding: '10px' }}>{p.required_by_date}</td>
                                            <td style={{ padding: '10px' }}>PKR {Number(p.estimated_total_cost).toLocaleString()}</td>
                                            <td style={{ padding: '10px' }}>
                                                <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11px', background: '#e0e7ff', fontWeight: 600, color: '#3730a3' }}>
                                                    {p.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    <div style={{ marginTop: '20px', padding: '12px', background: '#eef2ff', borderRadius: '6px', fontSize: '12px', color: '#3730a3', border: '1px solid #c7d2fe' }}>
                        💡 <strong>Boundary Notice:</strong> CRM registers required items. Vendor quotes, RFQs, Purchase Orders, and supplier goods receipt are managed inside <strong>Purchasing & Procurement</strong>.
                    </div>
                </div>
            )}

            {/* SECTION 5: FINANCE COMMERCIAL DATA */}
            {activeSection === 'finance' && (
                <div style={{ background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', padding: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <div>
                            <h3 style={{ margin: '0 0 4px 0', fontSize: '16px', fontWeight: 600 }}>
                                Security Finance & Invoicing Commercial Data
                            </h3>
                            <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
                                Approved client billing schedule, standard & overtime billing rates, recurring charges, and tax schedules.
                            </p>
                        </div>
                        <span style={{
                            padding: '4px 10px',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: 600,
                            background: '#f1f5f9',
                            color: '#334155'
                        }}>
                            {summary.finance_handoff.readiness_status}
                        </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '20px', background: '#f8fafc', padding: '16px', borderRadius: '8px' }}>
                        <div>
                            <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase' }}>Billing Cycle</span>
                            <div style={{ fontWeight: 600, fontSize: '14px' }}>{summary.finance_handoff.billing_cycle}</div>
                        </div>
                        <div>
                            <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase' }}>Payment Terms</span>
                            <div style={{ fontWeight: 600, fontSize: '14px' }}>{summary.finance_handoff.payment_terms}</div>
                        </div>
                        <div>
                            <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase' }}>Monthly Recurring Subtotal</span>
                            <div style={{ fontWeight: 600, fontSize: '14px' }}>PKR {Number(summary.finance_handoff.subtotal_monthly_recurring).toLocaleString()}</div>
                        </div>
                        <div>
                            <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase' }}>One-Time Total</span>
                            <div style={{ fontWeight: 600, fontSize: '14px' }}>PKR {Number(summary.finance_handoff.total_one_time).toLocaleString()}</div>
                        </div>
                        <div>
                            <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase' }}>Grand Total</span>
                            <div style={{ fontWeight: 700, fontSize: '15px', color: '#0f172a' }}>PKR {Number(summary.finance_handoff.grand_total).toLocaleString()}</div>
                        </div>
                    </div>

                    <h4 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 12px 0' }}>Client Billing Rate Schedule</h4>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid #e2e8f0', background: '#f8fafc' }}>
                                    <th style={{ padding: '10px' }}>Service Type</th>
                                    <th style={{ padding: '10px' }}>Site</th>
                                    <th style={{ padding: '10px' }}>Qty</th>
                                    <th style={{ padding: '10px' }}>Client Rate</th>
                                    <th style={{ padding: '10px' }}>Single OT Rate</th>
                                    <th style={{ padding: '10px' }}>Double OT Rate</th>
                                    <th style={{ padding: '10px' }}>Line Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {summary.finance_handoff.service_billing_rates.map((r, i) => (
                                    <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <td style={{ padding: '10px', fontWeight: 500 }}>{r.service_type}</td>
                                        <td style={{ padding: '10px' }}>{r.location}</td>
                                        <td style={{ padding: '10px', fontWeight: 600 }}>{r.quantity}</td>
                                        <td style={{ padding: '10px' }}>PKR {Number(r.client_rate).toLocaleString()}</td>
                                        <td style={{ padding: '10px', color: '#64748b' }}>PKR {Number(r.single_ot_rate).toLocaleString()}</td>
                                        <td style={{ padding: '10px', color: '#64748b' }}>PKR {Number(r.double_ot_rate).toLocaleString()}</td>
                                        <td style={{ padding: '10px', fontWeight: 600 }}>PKR {Number(r.line_total).toLocaleString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div style={{ marginTop: '20px', padding: '12px', background: '#f8fafc', borderRadius: '6px', fontSize: '12px', color: '#334155', border: '1px solid #e2e8f0' }}>
                        💡 <strong>Boundary Notice:</strong> CRM freezes approved commercial billing terms. Generating monthly tax invoices, tracking receivables, and recording journal entries will be executed in <strong>Security Finance & Accounting</strong>.
                    </div>
                </div>
            )}

            {/* SECTION 6: SIGNED DOCUMENTS VAULT */}
            {activeSection === 'documents' && (
                <div style={{ background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', padding: '24px' }}>
                    <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 600 }}>
                        Executed Signed Contract & Documents Vault
                    </h3>

                    {summary.signed_documents.length === 0 ? (
                        <div style={{ padding: '32px', textAlign: 'center', color: '#64748b', background: '#f8fafc', borderRadius: '8px' }}>
                            No signed documents uploaded yet.
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                            {summary.signed_documents.map((doc, i) => (
                                <div key={i} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', background: '#f8fafc' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                        <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', background: '#dbeafe', color: '#1d4ed8' }}>
                                            {doc.document_type_display || doc.document_type}
                                        </span>
                                    </div>
                                    <h4 style={{ margin: '0 0 6px 0', fontSize: '14px', fontWeight: 600 }}>{doc.title}</h4>
                                    {doc.notes && <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 10px 0' }}>{doc.notes}</p>}
                                    {doc.file_url ? (
                                        <a
                                            href={doc.file_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            style={{
                                                display: 'inline-block',
                                                fontSize: '12px',
                                                color: '#2563eb',
                                                textDecoration: 'none',
                                                fontWeight: 600
                                            }}
                                        >
                                            📄 View / Download Executed File
                                        </a>
                                    ) : (
                                        <span style={{ fontSize: '12px', color: '#94a3b8' }}>No attached file</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* SECTION 7: JSON PAYLOAD VIEWER */}
            {activeSection === 'json' && (
                <div style={{ background: '#0f172a', borderRadius: '8px', padding: '20px', color: '#f8fafc' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <h4 style={{ margin: 0, fontSize: '14px', color: '#38bdf8' }}>
                            Canonical Cross-Module Handoff Snapshot (JSON)
                        </h4>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                navigator.clipboard.writeText(JSON.stringify(summary, null, 2));
                                useToastStore.getState().success('JSON snapshot copied to clipboard');
                            }}
                            style={{ color: '#ffffff', borderColor: '#334155' }}
                        >
                            📋 Copy JSON
                        </Button>
                    </div>
                    <pre style={{
                        margin: 0,
                        padding: '16px',
                        background: '#1e293b',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontFamily: 'monospace',
                        overflowX: 'auto',
                        maxHeight: '480px'
                    }}>
                        {JSON.stringify(summary, null, 2)}
                    </pre>
                </div>
            )}
        </div>
    );
};
