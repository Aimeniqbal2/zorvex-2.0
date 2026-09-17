import React, { useState, useEffect } from 'react';
import type { 
    SecurityProposal, ProposalVersion, ProposalServiceLine, 
    ContractEquipmentRequirement, ProposalAdditionalCharge, 
    SecurityAssessment, ClientLocation, SecurityServiceType 
} from '../api';
import { 
    getProposalVersions, updateProposalVersion, importAssessmentRecommendations,
    createFinalProposalRevision, createProposalServiceLine, updateProposalServiceLine,
    deleteProposalServiceLine, createContractEquipment, updateContractEquipment,
    deleteContractEquipment, createProposalAdditionalCharge, updateProposalAdditionalCharge,
    deleteProposalAdditionalCharge, prepareFinalProposalEmail, sendFinalProposalEmail
} from '../api';
import { ImportRecommendationsModal } from './ImportRecommendationsModal';
import { AddServiceLineModal } from './AddServiceLineModal';
import { AddEquipmentRequirementModal } from './AddEquipmentRequirementModal';
import { AddAdditionalChargeModal } from './AddAdditionalChargeModal';
import EmailComposer from '../../../../components/communications/EmailComposer';
import { useToastStore } from '../../../../stores/toastStore';
import '../styles/FinalProposalTab.css';

interface FinalProposalTabProps {
    proposal: SecurityProposal;
    assessments: SecurityAssessment[];
    locations: ClientLocation[];
    serviceTypes: SecurityServiceType[];
    onRefresh: () => Promise<void>;
}

export const FinalProposalTab: React.FC<FinalProposalTabProps> = ({
    proposal,
    assessments,
    locations,
    serviceTypes,
    onRefresh
}) => {
    const [versions, setVersions] = useState<ProposalVersion[]>([]);
    const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);

    // Modals
    const [showImportModal, setShowImportModal] = useState(false);
    const [showServiceModal, setShowServiceModal] = useState(false);
    const [editingServiceLine, setEditingServiceLine] = useState<ProposalServiceLine | null>(null);
    const [showEquipmentModal, setShowEquipmentModal] = useState(false);
    const [editingEquipment, setEditingEquipment] = useState<ContractEquipmentRequirement | null>(null);
    const [showChargeModal, setShowChargeModal] = useState(false);
    const [editingCharge, setEditingCharge] = useState<ProposalAdditionalCharge | null>(null);

    // Email Composer
    const [showEmailComposer, setShowEmailComposer] = useState(false);
    const [emailPrefill, setEmailPrefill] = useState({ subject: '', body: '', to: '' });

    // Commercial Terms form state for active version
    const [termsState, setTermsState] = useState<{
        billing_cycle: 'MONTHLY' | 'BI_WEEKLY' | 'CUSTOM';
        payment_terms: 'DUE_ON_RECEIPT' | 'NET_15' | 'NET_30' | 'NET_60' | 'ADVANCE' | 'CUSTOM';
        proposal_validity_days: number;
        contract_duration_months: number;
        expected_start_date: string;
        security_deposit: number | string;
        discount_type: 'NONE' | 'FIXED' | 'PERCENTAGE';
        discount_value: number | string;
        tax_rate: number | string;
        commercial_notes: string;
        terms_and_conditions: string;
    }>({
        billing_cycle: 'MONTHLY',
        payment_terms: 'NET_30',
        proposal_validity_days: 30,
        contract_duration_months: 12,
        expected_start_date: '',
        security_deposit: 0,
        discount_type: 'NONE',
        discount_value: 0,
        tax_rate: 0,
        commercial_notes: '',
        terms_and_conditions: ''
    });

    const [savingTerms, setSavingTerms] = useState(false);

    const loadVersions = async () => {
        try {
            const data: ProposalVersion[] = await getProposalVersions(proposal.id);
            setVersions(data || []);
            if (data && data.length > 0) {
                const finalVer = data.find((v: ProposalVersion) => v.version_type?.toLowerCase().includes('final')) || data[0];
                setSelectedVersionId(prev => (prev && data.some((v: ProposalVersion) => v.id === prev) ? prev : finalVer.id));
            }
        } catch (err) {
            console.error('Failed to load proposal versions', err);
            useToastStore.getState().error('Failed to load proposal versions.');
        }
    };

    useEffect(() => {
        loadVersions();
    }, [proposal.id]);

    const activeVersion = versions.find(v => v.id === selectedVersionId) || versions[0];

    useEffect(() => {
        if (activeVersion) {
            setTermsState({
                billing_cycle: activeVersion.billing_cycle || 'MONTHLY',
                payment_terms: activeVersion.payment_terms || 'NET_30',
                proposal_validity_days: activeVersion.proposal_validity_days || 30,
                contract_duration_months: activeVersion.contract_duration_months || 12,
                expected_start_date: activeVersion.expected_start_date || '',
                security_deposit: activeVersion.security_deposit || 0,
                discount_type: activeVersion.discount_type || 'NONE',
                discount_value: activeVersion.discount_value || 0,
                tax_rate: activeVersion.tax_rate || 0,
                commercial_notes: activeVersion.commercial_notes || '',
                terms_and_conditions: activeVersion.terms_and_conditions || ''
            });
        }
    }, [activeVersion?.id]);

    const handleSaveTerms = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!activeVersion) return;
        if (activeVersion.is_frozen) {
            useToastStore.getState().error('Cannot modify terms of a frozen proposal version.');
            return;
        }

        setSavingTerms(true);
        try {
            await updateProposalVersion(activeVersion.id, {
                ...termsState,
                security_deposit: Number(termsState.security_deposit) || 0,
                discount_value: Number(termsState.discount_value) || 0,
                tax_rate: Number(termsState.tax_rate) || 0,
                proposal_validity_days: Number(termsState.proposal_validity_days) || 30,
                contract_duration_months: Number(termsState.contract_duration_months) || 12,
                expected_start_date: termsState.expected_start_date || null
            });
            useToastStore.getState().success('Commercial terms saved successfully.');
            await loadVersions();
        } catch (err: any) {
            useToastStore.getState().error(err?.response?.data?.detail || err?.message || 'Failed to save terms.');
        } finally {
            setSavingTerms(false);
        }
    };

    const handleImportRecommendations = async (selectedAssessmentIds?: string[]) => {
        if (!activeVersion) return;
        try {
            const res = await importAssessmentRecommendations(proposal.id, {
                version_id: activeVersion.id,
                assessment_ids: selectedAssessmentIds
            });
            useToastStore.getState().success(res.message || 'Assessment recommendations imported successfully.');
            setShowImportModal(false);
            await loadVersions();
            await onRefresh();
        } catch (err: any) {
            useToastStore.getState().error(err?.response?.data?.error || err?.message || 'Failed to import recommendations.');
        }
    };

    const handleCreateRevision = async () => {
        if (!activeVersion) return;
        try {
            const res = await createFinalProposalRevision(proposal.id, activeVersion.id);
            useToastStore.getState().success(res.message || 'New revision created.');
            await loadVersions();
            if (res.version?.id) {
                setSelectedVersionId(res.version.id);
            }
            await onRefresh();
        } catch (err: any) {
            useToastStore.getState().error(err?.response?.data?.error || err?.message || 'Failed to create revision.');
        }
    };

    // Service Line actions
    const handleSaveServiceLine = async (payload: Partial<ProposalServiceLine>) => {
        if (editingServiceLine) {
            await updateProposalServiceLine(editingServiceLine.id, payload);
            useToastStore.getState().success('Service requirement updated.');
        } else {
            await createProposalServiceLine(payload);
            useToastStore.getState().success('Service requirement added.');
        }
        await loadVersions();
    };

    const handleDeleteServiceLine = async (id: string) => {
        if (!window.confirm('Are you sure you want to remove this service line?')) return;
        try {
            await deleteProposalServiceLine(id);
            useToastStore.getState().success('Service line removed.');
            await loadVersions();
        } catch (err: any) {
            useToastStore.getState().error(err?.response?.data?.detail || err?.message || 'Failed to delete service line.');
        }
    };

    // Equipment actions
    const handleSaveEquipment = async (payload: Partial<ContractEquipmentRequirement>) => {
        if (editingEquipment) {
            await updateContractEquipment(editingEquipment.id, payload);
            useToastStore.getState().success('Equipment requirement updated.');
        } else {
            await createContractEquipment(payload);
            useToastStore.getState().success('Equipment requirement added.');
        }
        await loadVersions();
    };

    const handleDeleteEquipment = async (id: string) => {
        if (!window.confirm('Are you sure you want to remove this equipment requirement?')) return;
        try {
            await deleteContractEquipment(id);
            useToastStore.getState().success('Equipment requirement removed.');
            await loadVersions();
        } catch (err: any) {
            useToastStore.getState().error(err?.response?.data?.detail || err?.message || 'Failed to delete equipment.');
        }
    };

    // Additional Charge actions
    const handleSaveCharge = async (payload: Partial<ProposalAdditionalCharge>) => {
        if (editingCharge) {
            await updateProposalAdditionalCharge(editingCharge.id, payload);
            useToastStore.getState().success('Commercial charge updated.');
        } else {
            await createProposalAdditionalCharge(payload);
            useToastStore.getState().success('Commercial charge added.');
        }
        await loadVersions();
    };

    const handleDeleteCharge = async (id: string) => {
        if (!window.confirm('Are you sure you want to remove this charge?')) return;
        try {
            await deleteProposalAdditionalCharge(id);
            useToastStore.getState().success('Charge removed.');
            await loadVersions();
        } catch (err: any) {
            useToastStore.getState().error(err?.response?.data?.detail || err?.message || 'Failed to delete charge.');
        }
    };

    // Email workflow trigger
    const handleOpenEmailComposer = async () => {
        if (!activeVersion) return;
        try {
            const res = await prepareFinalProposalEmail(proposal.id, activeVersion.id);
            setEmailPrefill({
                subject: res.subject || '',
                body: res.body || '',
                to: res.to || ''
            });
            setShowEmailComposer(true);
        } catch (err: any) {
            useToastStore.getState().error(err?.response?.data?.error || 'Failed to prepare email context.');
        }
    };

    const handleEmailSent = async () => {
        useToastStore.getState().success('Final Proposal sent successfully! Proposal is now Awaiting Approval.');
        setShowEmailComposer(false);
        await loadVersions();
        await onRefresh();
    };

    const isFrozen = activeVersion?.is_frozen ?? false;
    const isFinalStage = proposal.status === 'FINAL_PROPOSAL' || proposal.status === 'AWAITING_APPROVAL';

    return (
        <div className="fp-container">
            {/* Email Composer Modal */}
            {showEmailComposer && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0, 0, 0, 0.65)', backdropFilter: 'blur(4px)', padding: '16px' }}>
                    <div style={{ width: '100%', maxWidth: '900px', maxHeight: '90vh', overflowY: 'auto' }}>
                        <EmailComposer
                            contextType="security_proposal"
                            contextId={proposal.id}
                            contextVersionId={activeVersion?.id}
                            prefillTo={emailPrefill.to}
                            prefillSubject={emailPrefill.subject}
                            prefillBodyHtml={emailPrefill.body}
                            onTriggerSend={async (emailId: string) => {
                                await sendFinalProposalEmail(proposal.id, {
                                    email_id: emailId,
                                    version_id: activeVersion?.id
                                });
                            }}
                            onSent={handleEmailSent}
                            onCancel={() => setShowEmailComposer(false)}
                        />
                    </div>
                </div>
            )}

            {/* 1. Hero / Version Switcher Bar */}
            <div className="fp-version-bar">
                <div className="fp-version-info">
                    <div className="fp-version-icon">
                        <i className='bx bx-file'></i>
                    </div>
                    <div className="fp-version-title-group">
                        <div className="fp-version-title-row">
                            <h2 className="fp-version-title">Final Proposal Commercial Offers</h2>
                            <span className="fp-version-count-badge">
                                {versions.length} Version{versions.length > 1 ? 's' : ''}
                            </span>
                        </div>
                        <p className="fp-version-desc">
                            Manage client pricing, overtime rates, equipment, and contract terms
                        </p>
                    </div>
                </div>

                <div className="fp-version-pills">
                    {versions.map(v => {
                        const isActive = v.id === activeVersion?.id;
                        return (
                            <button
                                key={v.id}
                                onClick={() => setSelectedVersionId(v.id)}
                                className={`fp-version-pill ${isActive ? 'active' : ''}`}
                            >
                                <span>v{v.version_number} - {v.version_type || 'Proposal'}</span>
                                {v.is_frozen ? (
                                    <span className="fp-pill-tag frozen">
                                        <i className='bx bx-lock-alt'></i> Frozen
                                    </span>
                                ) : (
                                    <span className="fp-pill-tag draft">
                                        <i className='bx bx-edit'></i> Draft
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* 2. Action Toolbar */}
            <div className="fp-action-bar">
                <div className="fp-action-left">
                    {!isFrozen && (
                        <>
                            <button
                                onClick={() => setShowImportModal(true)}
                                className="fp-btn-action btn-import"
                            >
                                <i className='bx bx-import'></i> Import Recommendations
                            </button>
                            <button
                                onClick={() => {
                                    setEditingServiceLine(null);
                                    setShowServiceModal(true);
                                }}
                                className="fp-btn-action btn-guard"
                            >
                                <i className='bx bx-user-plus'></i> + Add Guard Service
                            </button>
                            <button
                                onClick={() => {
                                    setEditingEquipment(null);
                                    setShowEquipmentModal(true);
                                }}
                                className="fp-btn-action btn-equipment"
                            >
                                <i className='bx bx-wrench'></i> + Add Equipment
                            </button>
                            <button
                                onClick={() => {
                                    setEditingCharge(null);
                                    setShowChargeModal(true);
                                }}
                                className="fp-btn-action btn-charge"
                            >
                                <i className='bx bx-briefcase-alt'></i> + Add Commercial Charge
                            </button>
                        </>
                    )}
                    <button
                        onClick={handleCreateRevision}
                        className="fp-btn-action"
                    >
                        <i className='bx bx-copy'></i> Create New Revision
                    </button>
                </div>

                <div>
                    {isFinalStage && !isFrozen && (
                        <button
                            onClick={handleOpenEmailComposer}
                            className="fp-btn-send-main"
                        >
                            <i className='bx bx-mail-send'></i> Send Final Proposal to Client
                        </button>
                    )}
                    {isFrozen && (
                        <div className="fp-frozen-banner">
                            <i className='bx bx-lock'></i> Version is formally frozen & immutable. Create a revision to modify.
                        </div>
                    )}
                </div>
            </div>

            {/* 3. Main Two-Column Layout */}
            <div className="fp-main-grid">
                {/* Left Side: Tables & Contract Terms */}
                <div className="fp-left-stack">
                    {/* Section 1: Personnel Requirements & Guard Services */}
                    <div className="fp-card">
                        <div className="fp-card-header">
                            <div className="fp-card-header-left">
                                <div className="fp-card-badge-icon guard">
                                    <i className='bx bx-shield-quarter'></i>
                                </div>
                                <div>
                                    <h3 className="fp-card-title">Personnel & Guard Requirements</h3>
                                    <p className="fp-card-subtitle">Operational security posts, client monthly rates, and OT billings</p>
                                </div>
                            </div>
                            <span className="fp-card-count">
                                {activeVersion?.service_lines?.length || 0} Line(s)
                            </span>
                        </div>

                        <div className="fp-table-wrapper">
                            <table className="fp-table">
                                <thead>
                                    <tr>
                                        <th>Location</th>
                                        <th>Service Type</th>
                                        <th style={{ textAlign: 'center' }}>Qty</th>
                                        <th>Billing Unit</th>
                                        <th style={{ textAlign: 'right' }}>Client Rate</th>
                                        <th style={{ textAlign: 'right' }}>OT Rates (1.5x / 2.0x)</th>
                                        <th style={{ textAlign: 'right' }}>Line Total</th>
                                        {!isFrozen && <th style={{ textAlign: 'center' }}>Actions</th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {(!activeVersion?.service_lines || activeVersion.service_lines.length === 0) ? (
                                        <tr>
                                            <td colSpan={isFrozen ? 7 : 8} className="fp-table-empty">
                                                No service lines added yet. Click [Import Recommendations] or [+ Add Guard Service].
                                            </td>
                                        </tr>
                                    ) : (
                                        activeVersion.service_lines.map(line => (
                                            <tr key={line.id}>
                                                <td style={{ fontWeight: 600 }}>
                                                    {line.location_name || 'All Locations'}
                                                </td>
                                                <td>
                                                    <div style={{ fontWeight: 600, color: '#38bdf8' }}>{line.service_type_name || 'Guard Service'}</div>
                                                    {line.notes && <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>{line.notes}</div>}
                                                </td>
                                                <td style={{ textAlign: 'center', fontWeight: 700 }}>
                                                    {line.quantity}
                                                </td>
                                                <td style={{ textTransform: 'capitalize', color: 'var(--color-text-muted)' }}>
                                                    {line.billing_unit?.toLowerCase() || 'monthly'}
                                                </td>
                                                <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 500 }}>
                                                    PKR {Number(line.client_rate || 0).toLocaleString()}
                                                </td>
                                                <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: '11.5px', color: 'var(--color-text-muted)' }}>
                                                    PKR {Number(line.single_ot_rate || 0).toLocaleString()} / {Number(line.double_ot_rate || 0).toLocaleString()}
                                                </td>
                                                <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>
                                                    PKR {(Number(line.quantity || 1) * Number(line.client_rate || 0)).toLocaleString()}
                                                </td>
                                                {!isFrozen && (
                                                    <td>
                                                        <div className="fp-table-actions">
                                                            <button
                                                                onClick={() => {
                                                                    setEditingServiceLine(line);
                                                                    setShowServiceModal(true);
                                                                }}
                                                                className="fp-btn-icon"
                                                                title="Edit Line"
                                                            >
                                                                <i className='bx bx-edit'></i>
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteServiceLine(line.id)}
                                                                className="fp-btn-icon delete"
                                                                title="Delete Line"
                                                            >
                                                                <i className='bx bx-trash'></i>
                                                            </button>
                                                        </div>
                                                    </td>
                                                )}
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Section 2: Security Equipment & Hardware Requirements */}
                    <div className="fp-card">
                        <div className="fp-card-header">
                            <div className="fp-card-header-left">
                                <div className="fp-card-badge-icon equip">
                                    <i className='bx bx-cctv'></i>
                                </div>
                                <div>
                                    <h3 className="fp-card-title">Security Hardware & Equipment Requirements</h3>
                                    <p className="fp-card-subtitle">CCTV, turnstiles, radios, metal detectors, and safety gear</p>
                                </div>
                            </div>
                            <span className="fp-card-count">
                                {activeVersion?.equipment_requirements?.length || 0} Item(s)
                            </span>
                        </div>

                        <div className="fp-table-wrapper">
                            <table className="fp-table">
                                <thead>
                                    <tr>
                                        <th>Location</th>
                                        <th>Equipment Description</th>
                                        <th style={{ textAlign: 'center' }}>Qty</th>
                                        <th>Schedule</th>
                                        <th style={{ textAlign: 'right' }}>Unit Rate</th>
                                        <th style={{ textAlign: 'right' }}>Line Total</th>
                                        {!isFrozen && <th style={{ textAlign: 'center' }}>Actions</th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {(!activeVersion?.equipment_requirements || activeVersion.equipment_requirements.length === 0) ? (
                                        <tr>
                                            <td colSpan={isFrozen ? 6 : 7} className="fp-table-empty">
                                                No equipment requirements added yet. Click [Import Recommendations] or [+ Add Equipment].
                                            </td>
                                        </tr>
                                    ) : (
                                        activeVersion.equipment_requirements.map(equip => (
                                            <tr key={equip.id}>
                                                <td style={{ fontWeight: 600 }}>
                                                    {equip.location_name || 'Location'}
                                                </td>
                                                <td>
                                                    <div style={{ fontWeight: 600, color: '#34d399' }}>{equip.item_name || equip.description}</div>
                                                    {equip.notes && <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>{equip.notes}</div>}
                                                </td>
                                                <td style={{ textAlign: 'center', fontWeight: 700 }}>
                                                    {equip.quantity}
                                                </td>
                                                <td>
                                                    <span className={`fp-tag ${equip.charge_type === 'MONTHLY' ? 'monthly' : 'onetime'}`}>
                                                        {equip.charge_type === 'MONTHLY' ? 'Monthly Rental' : 'One-Time'}
                                                    </span>
                                                </td>
                                                <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 500 }}>
                                                    PKR {Number(equip.unit_rate || 0).toLocaleString()}
                                                </td>
                                                <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>
                                                    PKR {(Number(equip.quantity || 1) * Number(equip.unit_rate || 0)).toLocaleString()}
                                                </td>
                                                {!isFrozen && (
                                                    <td>
                                                        <div className="fp-table-actions">
                                                            <button
                                                                onClick={() => {
                                                                    setEditingEquipment(equip);
                                                                    setShowEquipmentModal(true);
                                                                }}
                                                                className="fp-btn-icon"
                                                                title="Edit Equipment"
                                                            >
                                                                <i className='bx bx-edit'></i>
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteEquipment(equip.id)}
                                                                className="fp-btn-icon delete"
                                                                title="Delete Equipment"
                                                            >
                                                                <i className='bx bx-trash'></i>
                                                            </button>
                                                        </div>
                                                    </td>
                                                )}
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Section 3: Additional Commercial Charges */}
                    <div className="fp-card">
                        <div className="fp-card-header">
                            <div className="fp-card-header-left">
                                <div className="fp-card-badge-icon charge">
                                    <i className='bx bx-receipt'></i>
                                </div>
                                <div>
                                    <h3 className="fp-card-title">Additional Commercial Charges</h3>
                                    <p className="fp-card-subtitle">Mobilization, transport, installation, training, and operational fees</p>
                                </div>
                            </div>
                            <span className="fp-card-count">
                                {activeVersion?.additional_charges?.length || 0} Charge(s)
                            </span>
                        </div>

                        <div className="fp-table-wrapper">
                            <table className="fp-table">
                                <thead>
                                    <tr>
                                        <th>Charge Description</th>
                                        <th>Schedule</th>
                                        <th style={{ textAlign: 'center' }}>Qty</th>
                                        <th style={{ textAlign: 'right' }}>Amount</th>
                                        <th style={{ textAlign: 'right' }}>Line Total</th>
                                        {!isFrozen && <th style={{ textAlign: 'center' }}>Actions</th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {(!activeVersion?.additional_charges || activeVersion.additional_charges.length === 0) ? (
                                        <tr>
                                            <td colSpan={isFrozen ? 5 : 6} className="fp-table-empty">
                                                No additional charges configured. Click [+ Add Commercial Charge].
                                            </td>
                                        </tr>
                                    ) : (
                                        activeVersion.additional_charges.map(charge => (
                                            <tr key={charge.id}>
                                                <td>
                                                    <div style={{ fontWeight: 600, color: '#fbbf24' }}>{charge.charge_name}</div>
                                                    {charge.notes && <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>{charge.notes}</div>}
                                                </td>
                                                <td>
                                                    <span className={`fp-tag ${charge.charge_type === 'MONTHLY' ? 'monthly' : 'onetime'}`}>
                                                        {charge.charge_type === 'MONTHLY' ? 'Monthly' : 'One-Time'}
                                                    </span>
                                                </td>
                                                <td style={{ textAlign: 'center', fontWeight: 700 }}>
                                                    {charge.quantity}
                                                </td>
                                                <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 500 }}>
                                                    PKR {Number(charge.amount || 0).toLocaleString()}
                                                </td>
                                                <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>
                                                    PKR {(Number(charge.quantity || 1) * Number(charge.amount || 0)).toLocaleString()}
                                                </td>
                                                {!isFrozen && (
                                                    <td>
                                                        <div className="fp-table-actions">
                                                            <button
                                                                onClick={() => {
                                                                    setEditingCharge(charge);
                                                                    setShowChargeModal(true);
                                                                }}
                                                                className="fp-btn-icon"
                                                                title="Edit Charge"
                                                            >
                                                                <i className='bx bx-edit'></i>
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteCharge(charge.id)}
                                                                className="fp-btn-icon delete"
                                                                title="Delete Charge"
                                                            >
                                                                <i className='bx bx-trash'></i>
                                                            </button>
                                                        </div>
                                                    </td>
                                                )}
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Section 4: Commercial Contract & Payment Terms Form */}
                    <div className="fp-card">
                        <div className="fp-card-header">
                            <div className="fp-card-header-left">
                                <div className="fp-card-badge-icon terms">
                                    <i className='bx bx-notepad'></i>
                                </div>
                                <div>
                                    <h3 className="fp-card-title">Commercial Contract & Payment Terms</h3>
                                    <p className="fp-card-subtitle">Define contract tenure, billing cycles, payment terms, and legal clauses</p>
                                </div>
                            </div>
                            {!isFrozen && (
                                <button
                                    onClick={handleSaveTerms}
                                    disabled={savingTerms}
                                    className="fp-btn-send-main"
                                    style={{ padding: '6px 14px', fontSize: '12px' }}
                                >
                                    <i className='bx bx-save'></i> {savingTerms ? 'Saving...' : 'Save Terms'}
                                </button>
                            )}
                        </div>

                        <form onSubmit={handleSaveTerms} className="fp-terms-form">
                            <div className="fp-form-row-3">
                                <div className="fp-form-field">
                                    <label className="fp-field-label">Billing Cycle</label>
                                    <select
                                        disabled={isFrozen}
                                        value={termsState.billing_cycle}
                                        onChange={(e) => setTermsState({ ...termsState, billing_cycle: e.target.value as any })}
                                        className="fp-select"
                                    >
                                        <option value="MONTHLY">Monthly Billing</option>
                                        <option value="BI_WEEKLY">Bi-Weekly</option>
                                        <option value="CUSTOM">Custom Terms</option>
                                    </select>
                                </div>

                                <div className="fp-form-field">
                                    <label className="fp-field-label">Payment Terms</label>
                                    <select
                                        disabled={isFrozen}
                                        value={termsState.payment_terms}
                                        onChange={(e) => setTermsState({ ...termsState, payment_terms: e.target.value as any })}
                                        className="fp-select"
                                    >
                                        <option value="DUE_ON_RECEIPT">Due on Receipt</option>
                                        <option value="NET_15">Net 15 Days</option>
                                        <option value="NET_30">Net 30 Days</option>
                                        <option value="NET_60">Net 60 Days</option>
                                        <option value="ADVANCE">Advance Payment</option>
                                        <option value="CUSTOM">Custom Terms</option>
                                    </select>
                                </div>

                                <div className="fp-form-field">
                                    <label className="fp-field-label">Contract Duration (Months)</label>
                                    <input
                                        type="number"
                                        min="1"
                                        disabled={isFrozen}
                                        value={termsState.contract_duration_months}
                                        onChange={(e) => setTermsState({ ...termsState, contract_duration_months: parseInt(e.target.value) || 12 })}
                                        className="fp-input"
                                    />
                                </div>
                            </div>

                            <div className="fp-form-row-3">
                                <div className="fp-form-field">
                                    <label className="fp-field-label">Proposal Validity (Days)</label>
                                    <input
                                        type="number"
                                        min="1"
                                        disabled={isFrozen}
                                        value={termsState.proposal_validity_days}
                                        onChange={(e) => setTermsState({ ...termsState, proposal_validity_days: parseInt(e.target.value) || 30 })}
                                        className="fp-input"
                                    />
                                </div>

                                <div className="fp-form-field">
                                    <label className="fp-field-label">Expected Start Date</label>
                                    <input
                                        type="date"
                                        disabled={isFrozen}
                                        value={termsState.expected_start_date}
                                        onChange={(e) => setTermsState({ ...termsState, expected_start_date: e.target.value })}
                                        className="fp-input"
                                    />
                                </div>

                                <div className="fp-form-field">
                                    <label className="fp-field-label">Security Deposit (PKR)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        disabled={isFrozen}
                                        value={termsState.security_deposit}
                                        onChange={(e) => setTermsState({ ...termsState, security_deposit: e.target.value })}
                                        className="fp-input"
                                        style={{ fontFamily: 'monospace' }}
                                    />
                                </div>
                            </div>

                            <div className="fp-form-row-2">
                                <div className="fp-form-field">
                                    <label className="fp-field-label">Commercial Notes</label>
                                    <textarea
                                        disabled={isFrozen}
                                        value={termsState.commercial_notes}
                                        onChange={(e) => setTermsState({ ...termsState, commercial_notes: e.target.value })}
                                        rows={3}
                                        placeholder="Commercial pricing assumptions, fuel escalation clauses, etc."
                                        className="fp-textarea"
                                    />
                                </div>

                                <div className="fp-form-field">
                                    <label className="fp-field-label">Terms & Conditions</label>
                                    <textarea
                                        disabled={isFrozen}
                                        value={termsState.terms_and_conditions}
                                        onChange={(e) => setTermsState({ ...termsState, terms_and_conditions: e.target.value })}
                                        rows={3}
                                        placeholder="Termination notice, indemnity, equipment maintenance terms."
                                        className="fp-textarea"
                                    />
                                </div>
                            </div>
                        </form>
                    </div>
                </div>

                {/* Right Side: Commercial Summary Sticky Sidebar */}
                <div className="fp-right-sidebar">
                    <div className="fp-summary-card">
                        <div className="fp-summary-header">
                            <div className="fp-summary-title-group">
                                <i className='bx bx-calculator' style={{ fontSize: '20px', color: '#818cf8' }}></i>
                                <h3 className="fp-summary-title">Commercial Summary</h3>
                            </div>
                            <span className="fp-version-count-badge">
                                v{activeVersion?.version_number || 1}
                            </span>
                        </div>

                        {/* Monthly Recurring Schedule */}
                        <div className="fp-summary-section">
                            <div className="fp-summary-sec-header recurring">
                                <span>Monthly Recurring</span>
                                <span>Schedule</span>
                            </div>
                            <div className="fp-summary-line">
                                <span>Guard Services:</span>
                                <span style={{ fontFamily: 'monospace', color: 'var(--color-text)' }}>
                                    PKR {Number(activeVersion?.monthly_services_total || 0).toLocaleString()}
                                </span>
                            </div>
                            <div className="fp-summary-line">
                                <span>Recurring Equipment:</span>
                                <span style={{ fontFamily: 'monospace', color: 'var(--color-text)' }}>
                                    PKR {Number(activeVersion?.recurring_equipment_total || 0).toLocaleString()}
                                </span>
                            </div>
                            <div className="fp-summary-line">
                                <span>Recurring Charges:</span>
                                <span style={{ fontFamily: 'monospace', color: 'var(--color-text)' }}>
                                    PKR {Number(activeVersion?.recurring_charges_total || 0).toLocaleString()}
                                </span>
                            </div>
                            <div className="fp-summary-line total" style={{ color: '#818cf8' }}>
                                <span>Total Monthly Recurring:</span>
                                <span style={{ fontFamily: 'monospace' }}>
                                    PKR {Number(activeVersion?.total_monthly_recurring || 0).toLocaleString()}
                                </span>
                            </div>
                        </div>

                        {/* One-Time Schedule */}
                        <div className="fp-summary-section">
                            <div className="fp-summary-sec-header onetime">
                                <span>One-Time Charges</span>
                                <span>Schedule</span>
                            </div>
                            <div className="fp-summary-line">
                                <span>One-Time Services:</span>
                                <span style={{ fontFamily: 'monospace', color: 'var(--color-text)' }}>
                                    PKR {Number(activeVersion?.one_time_services_total || 0).toLocaleString()}
                                </span>
                            </div>
                            <div className="fp-summary-line">
                                <span>One-Time Equipment:</span>
                                <span style={{ fontFamily: 'monospace', color: 'var(--color-text)' }}>
                                    PKR {Number(activeVersion?.one_time_equipment_total || 0).toLocaleString()}
                                </span>
                            </div>
                            <div className="fp-summary-line">
                                <span>One-Time Charges:</span>
                                <span style={{ fontFamily: 'monospace', color: 'var(--color-text)' }}>
                                    PKR {Number(activeVersion?.one_time_charges_total || 0).toLocaleString()}
                                </span>
                            </div>
                            <div className="fp-summary-line total" style={{ color: '#34d399' }}>
                                <span>Total One-Time:</span>
                                <span style={{ fontFamily: 'monospace' }}>
                                    PKR {Number(activeVersion?.total_one_time || 0).toLocaleString()}
                                </span>
                            </div>
                        </div>

                        {/* Discount & Tax controls in Summary */}
                        {!isFrozen && (
                            <div className="fp-summary-discount-box">
                                <div className="fp-summary-discount-title">Discount & Taxes</div>
                                <div className="fp-discount-grid">
                                    <div className="fp-form-field">
                                        <label className="fp-field-label" style={{ fontSize: '10px' }}>Type</label>
                                        <select
                                            value={termsState.discount_type}
                                            onChange={(e) => setTermsState({ ...termsState, discount_type: e.target.value as any })}
                                            className="fp-select"
                                            style={{ padding: '6px 8px', fontSize: '12px' }}
                                        >
                                            <option value="NONE">None</option>
                                            <option value="FIXED">Fixed (PKR)</option>
                                            <option value="PERCENTAGE">Percentage (%)</option>
                                        </select>
                                    </div>
                                    <div className="fp-form-field">
                                        <label className="fp-field-label" style={{ fontSize: '10px' }}>Value</label>
                                        <input
                                            type="number"
                                            min="0"
                                            value={termsState.discount_value}
                                            onChange={(e) => setTermsState({ ...termsState, discount_value: e.target.value })}
                                            className="fp-input"
                                            style={{ padding: '6px 8px', fontSize: '12px', fontFamily: 'monospace' }}
                                        />
                                    </div>
                                </div>
                                <div className="fp-form-field">
                                    <label className="fp-field-label" style={{ fontSize: '10px' }}>Tax Rate (%)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.1"
                                        value={termsState.tax_rate}
                                        onChange={(e) => setTermsState({ ...termsState, tax_rate: e.target.value })}
                                        className="fp-input"
                                        style={{ padding: '6px 8px', fontSize: '12px', fontFamily: 'monospace' }}
                                    />
                                </div>
                            </div>
                        )}

                        {/* Totals Breakdown */}
                        <div className="fp-summary-totals-group">
                            <div className="fp-summary-line">
                                <span>Gross Subtotal:</span>
                                <span style={{ fontFamily: 'monospace', color: 'var(--color-text)' }}>
                                    PKR {Number(activeVersion?.subtotal || 0).toLocaleString()}
                                </span>
                            </div>
                            {Number(activeVersion?.discount_amount || 0) > 0 && (
                                <div className="fp-summary-line" style={{ color: '#ef4444' }}>
                                    <span>Discount Applied:</span>
                                    <span style={{ fontFamily: 'monospace' }}>
                                        - PKR {Number(activeVersion?.discount_amount || 0).toLocaleString()}
                                    </span>
                                </div>
                            )}
                            <div className="fp-summary-line">
                                <span>Taxable Amount:</span>
                                <span style={{ fontFamily: 'monospace', color: 'var(--color-text)' }}>
                                    PKR {Number(activeVersion?.taxable_amount || 0).toLocaleString()}
                                </span>
                            </div>
                            {Number(activeVersion?.tax_amount || 0) > 0 && (
                                <div className="fp-summary-line" style={{ color: '#f59e0b' }}>
                                    <span>Sales Tax / GST ({activeVersion?.tax_rate}%):</span>
                                    <span style={{ fontFamily: 'monospace' }}>
                                        + PKR {Number(activeVersion?.tax_amount || 0).toLocaleString()}
                                    </span>
                                </div>
                            )}

                            {/* Grand Total Highlight Box */}
                            <div className="fp-grand-total-box">
                                <div>
                                    <div className="fp-grand-total-label">Grand Total Offer</div>
                                    <div className="fp-grand-total-sub">Incl. taxes & discounts</div>
                                </div>
                                <div className="fp-grand-total-amount">
                                    PKR {Number(activeVersion?.grand_total || 0).toLocaleString()}
                                </div>
                            </div>
                        </div>

                        {/* Send Final Proposal Action Button */}
                        {isFinalStage && !isFrozen && (
                            <button
                                onClick={handleOpenEmailComposer}
                                className="fp-btn-send-main"
                                style={{ width: '100%', justifyContent: 'center', padding: '12px 18px', fontSize: '13.5px' }}
                            >
                                <i className='bx bx-mail-send'></i> Send Final Proposal Offer
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Modals */}
            <ImportRecommendationsModal
                isOpen={showImportModal}
                onClose={() => setShowImportModal(false)}
                assessments={assessments}
                onImport={handleImportRecommendations}
            />

            {activeVersion && (
                <>
                    <AddServiceLineModal
                        isOpen={showServiceModal}
                        onClose={() => {
                            setShowServiceModal(false);
                            setEditingServiceLine(null);
                        }}
                        proposalVersionId={activeVersion.id}
                        locations={locations}
                        serviceTypes={serviceTypes}
                        editingLine={editingServiceLine}
                        onSave={handleSaveServiceLine}
                    />

                    <AddEquipmentRequirementModal
                        isOpen={showEquipmentModal}
                        onClose={() => {
                            setShowEquipmentModal(false);
                            setEditingEquipment(null);
                        }}
                        proposalVersionId={activeVersion.id}
                        locations={locations}
                        editingEquipment={editingEquipment}
                        onSave={handleSaveEquipment}
                    />

                    <AddAdditionalChargeModal
                        isOpen={showChargeModal}
                        onClose={() => {
                            setShowChargeModal(false);
                            setEditingCharge(null);
                        }}
                        proposalVersionId={activeVersion.id}
                        editingCharge={editingCharge}
                        onSave={handleSaveCharge}
                    />
                </>
            )}
        </div>
    );
};
