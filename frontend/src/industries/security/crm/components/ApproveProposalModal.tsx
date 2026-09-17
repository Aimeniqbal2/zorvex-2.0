import React, { useState } from 'react';
import type { SecurityProposal, ProposalVersion, CRMContact } from '../api';
import { approveProposal } from '../api';
import { useToastStore } from '../../../../stores/toastStore';

interface Props {
    proposal: SecurityProposal;
    versions: ProposalVersion[];
    contacts?: CRMContact[];
    onClose: () => void;
    onSuccess: (updated: SecurityProposal) => void;
}

export const ApproveProposalModal: React.FC<Props> = ({
    proposal,
    versions,
    contacts = [],
    onClose,
    onSuccess
}) => {
    // Default to latest frozen or highest version
    const defaultVersion = versions.find(v => v.is_frozen) || versions[0];
    const [selectedVersionId, setSelectedVersionId] = useState<string>(defaultVersion?.id || '');
    const [approvedDate, setApprovedDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [approvedByName, setApprovedByName] = useState<string>(proposal.customer_name || '');
    const [approvedByContact, setApprovedByContact] = useState<string>('');
    const [approvalMethod, setApprovalMethod] = useState<'EMAIL' | 'WRITTEN' | 'VERBAL' | 'PORTAL' | 'OTHER'>('EMAIL');
    const [approvalNotes, setApprovalNotes] = useState<string>('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const updated = await approveProposal(proposal.id, {
                version_id: selectedVersionId,
                approved_date: approvedDate,
                approved_by_name: approvedByName,
                approved_by_contact: approvedByContact || undefined,
                approval_method: approvalMethod,
                approval_notes: approvalNotes
            });
            useToastStore.getState().success(`Proposal ${proposal.proposal_number} approved successfully!`);
            onSuccess(updated);
            onClose();
        } catch (err: any) {
            console.error('Approval failed', err);
            const msg = err.response?.data?.error || err.message || 'Failed to approve proposal';
            useToastStore.getState().error(msg);
        } finally {
            setLoading(false);
        }
    };

    const overlayStyle: React.CSSProperties = {
        position: 'fixed', inset: 0, zIndex: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)',
        padding: '16px', overflowY: 'auto'
    };
    const panelStyle: React.CSSProperties = {
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: '20px',
        width: '100%', maxWidth: '520px',
        boxShadow: '0 24px 60px rgba(0,0,0,0.3)',
        padding: '28px',
        color: 'var(--color-text)'
    };
    const headerStyle: React.CSSProperties = {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        paddingBottom: '20px', marginBottom: '20px',
        borderBottom: '1px solid var(--color-border)'
    };
    const iconBgStyle: React.CSSProperties = {
        width: 44, height: 44, borderRadius: 12,
        background: 'rgba(16,185,129,0.15)', color: '#10b981',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 20, flexShrink: 0
    };
    const closeBtnStyle: React.CSSProperties = {
        background: 'none', border: 'none', cursor: 'pointer',
        color: 'var(--color-text-muted)', fontSize: 22, lineHeight: 1,
        padding: '4px', borderRadius: 6, transition: 'color 0.2s'
    };
    const labelStyle: React.CSSProperties = {
        display: 'block', fontSize: 11, fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: '0.06em',
        color: 'var(--color-text-muted)', marginBottom: 6
    };
    const inputStyle: React.CSSProperties = {
        width: '100%', background: 'var(--color-surface-secondary)',
        border: '1px solid var(--color-border)', borderRadius: 10,
        padding: '9px 12px', fontSize: 13.5, color: 'var(--color-text)',
        outline: 'none', transition: 'border-color 0.2s', boxSizing: 'border-box'
    };
    const formStyle: React.CSSProperties = {
        display: 'flex', flexDirection: 'column', gap: 16, marginTop: 0
    };
    const footerStyle: React.CSSProperties = {
        display: 'flex', justifyContent: 'flex-end', gap: 12,
        paddingTop: 16, marginTop: 4, borderTop: '1px solid var(--color-border)'
    };

    return (
        <div style={overlayStyle}>
            <div style={panelStyle}>
                {/* Header */}
                <div style={headerStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div style={iconBgStyle}>
                            <i className="bx bx-check-double" />
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--color-text)' }}>
                                Client Proposal Approval
                            </h3>
                            <p style={{ margin: '3px 0 0', fontSize: 12.5, color: 'var(--color-text-muted)' }}>
                                Record formal client agreement before contract signing
                            </p>
                        </div>
                    </div>
                    <button style={closeBtnStyle} onClick={onClose}>
                        <i className="bx bx-x" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} style={formStyle}>
                    {/* Proposal Version */}
                    <div>
                        <label style={labelStyle}>Approved Proposal Version</label>
                        <select
                            value={selectedVersionId}
                            onChange={(e) => setSelectedVersionId(e.target.value)}
                            style={inputStyle}
                        >
                            {versions.map(v => (
                                <option key={v.id} value={v.id}>
                                    Version {v.version_number} — {v.version_type} {v.is_frozen ? '(Frozen / Sent)' : '(Draft)'} — PKR {Number(v.grand_total || 0).toLocaleString()}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Date and Method */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                        <div>
                            <label style={labelStyle}>Approved Date</label>
                            <input
                                type="date"
                                value={approvedDate}
                                onChange={(e) => setApprovedDate(e.target.value)}
                                style={inputStyle}
                                required
                            />
                        </div>
                        <div>
                            <label style={labelStyle}>Approval Method</label>
                            <select
                                value={approvalMethod}
                                onChange={(e) => setApprovalMethod(e.target.value as any)}
                                style={inputStyle}
                            >
                                <option value="EMAIL">Email Confirmation</option>
                                <option value="WRITTEN">Written / Letter of Intent</option>
                                <option value="VERBAL">Verbal / Phone Call</option>
                                <option value="PORTAL">Client Portal Approval</option>
                                <option value="OTHER">Other Method</option>
                            </select>
                        </div>
                    </div>

                    {/* Approver Name */}
                    <div>
                        <label style={labelStyle}>Approved By (Client Decision Maker)</label>
                        <input
                            type="text"
                            placeholder="e.g. John Doe, Head of Procurement"
                            value={approvedByName}
                            onChange={(e) => setApprovedByName(e.target.value)}
                            style={inputStyle}
                            required
                        />
                    </div>

                    {/* Contact linking if available */}
                    {contacts.length > 0 && (
                        <div>
                            <label style={labelStyle}>Link to Client Contact (Optional)</label>
                            <select
                                value={approvedByContact}
                                onChange={(e) => setApprovedByContact(e.target.value)}
                                style={inputStyle}
                            >
                                <option value="">-- Select Contact --</option>
                                {contacts.map(c => (
                                    <option key={c.id} value={c.id}>
                                        {c.first_name} {c.last_name} ({c.email || c.phone || 'No email'})
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Approval Notes */}
                    <div>
                        <label style={labelStyle}>Approval Notes & Observations</label>
                        <textarea
                            rows={3}
                            placeholder="Add reference to email confirmation, approval letter, or verbal discussion..."
                            value={approvalNotes}
                            onChange={(e) => setApprovalNotes(e.target.value)}
                            style={{ ...inputStyle, resize: 'vertical' }}
                        />
                    </div>

                    {/* Info Banner */}
                    <div style={{
                        padding: '12px 14px',
                        background: 'rgba(16,185,129,0.1)',
                        border: '1px solid rgba(16,185,129,0.25)',
                        borderRadius: 10, fontSize: 12.5,
                        color: '#10b981', lineHeight: 1.5
                    }}>
                        <i className="bx bx-info-circle" style={{ marginRight: 6 }} />
                        Approving will transition the proposal to <strong>APPROVED</strong> and prefill contract
                        signing details from the approved version. Contract signing occurs in the next stage.
                    </div>

                    {/* Footer Actions */}
                    <div style={footerStyle}>
                        <button
                            type="button"
                            onClick={onClose}
                            style={{
                                padding: '9px 18px', background: 'var(--color-surface-secondary)',
                                border: '1px solid var(--color-border)', borderRadius: 10,
                                fontSize: 13.5, fontWeight: 600, color: 'var(--color-text-muted)',
                                cursor: 'pointer', transition: 'all 0.2s'
                            }}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            style={{
                                padding: '9px 20px',
                                background: loading ? '#6b7280' : 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                                border: 'none', borderRadius: 10,
                                fontSize: 13.5, fontWeight: 700, color: '#fff',
                                cursor: loading ? 'not-allowed' : 'pointer',
                                display: 'flex', alignItems: 'center', gap: 8,
                                boxShadow: loading ? 'none' : '0 4px 14px rgba(16,185,129,0.35)',
                                transition: 'all 0.2s'
                            }}
                        >
                            {loading
                                ? <><i className="bx bx-loader-alt" style={{ animation: 'spin 1s linear infinite' }} /> Processing...</>
                                : <><i className="bx bx-check" /> Confirm Approval</>
                            }
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
