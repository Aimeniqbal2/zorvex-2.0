import React, { useState } from 'react';
import type { SecurityProposal } from '../api';
import { putProposalOnHold } from '../api';
import { useToastStore } from '../../../../stores/toastStore';

interface Props {
    proposal: SecurityProposal;
    onClose: () => void;
    onSuccess: (updated: SecurityProposal) => void;
}

export const PutOnHoldModal: React.FC<Props> = ({
    proposal,
    onClose,
    onSuccess
}) => {
    const [reason, setReason] = useState<string>('Client Budget Review in Progress');
    const [customReason, setCustomReason] = useState<string>('');
    const [notes, setNotes] = useState<string>('');
    const [onHoldDate, setOnHoldDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [loading, setLoading] = useState(false);

    const commonReasons = [
        'Client Budget Review in Progress',
        'Board / Management Approval Pending',
        'Site Mobilization Deferred',
        'Client Reorganization / Restructuring',
        'Contract Negotiation Delayed',
        'Other'
    ];

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        const finalReason = reason === 'Other' ? (customReason || 'Other Reason') : reason;
        try {
            const updated = await putProposalOnHold(proposal.id, {
                on_hold_reason: finalReason,
                on_hold_notes: notes,
                on_hold_date: onHoldDate
            });
            useToastStore.getState().success(`Proposal ${proposal.proposal_number} put on hold.`);
            onSuccess(updated);
            onClose();
        } catch (err: any) {
            console.error('Put on hold failed', err);
            const msg = err.response?.data?.error || err.message || 'Failed to put proposal on hold';
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
        borderRadius: 20,
        width: '100%', maxWidth: 460,
        boxShadow: '0 24px 60px rgba(0,0,0,0.3)',
        padding: 28,
        color: 'var(--color-text)'
    };
    const headerStyle: React.CSSProperties = {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        paddingBottom: 20, marginBottom: 20,
        borderBottom: '1px solid var(--color-border)'
    };
    const iconBgStyle: React.CSSProperties = {
        width: 44, height: 44, borderRadius: 12,
        background: 'rgba(245,158,11,0.15)', color: '#f59e0b',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 20, flexShrink: 0
    };
    const closeBtnStyle: React.CSSProperties = {
        background: 'none', border: 'none', cursor: 'pointer',
        color: 'var(--color-text-muted)', fontSize: 22, lineHeight: 1,
        padding: 4, borderRadius: 6
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
        outline: 'none', boxSizing: 'border-box'
    };

    return (
        <div style={overlayStyle}>
            <div style={panelStyle}>
                {/* Header */}
                <div style={headerStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div style={iconBgStyle}>
                            <i className="bx bx-pause-circle" />
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Put Proposal On Hold</h3>
                            <p style={{ margin: '3px 0 0', fontSize: 12.5, color: 'var(--color-text-muted)' }}>
                                Pause proposal workflow with follow-up tracking
                            </p>
                        </div>
                    </div>
                    <button style={closeBtnStyle} onClick={onClose}>
                        <i className="bx bx-x" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* On-Hold Reason */}
                    <div>
                        <label style={labelStyle}>On-Hold Reason</label>
                        <select
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            style={inputStyle}
                        >
                            {commonReasons.map(r => (
                                <option key={r} value={r}>{r}</option>
                            ))}
                        </select>
                    </div>

                    {reason === 'Other' && (
                        <div>
                            <label style={labelStyle}>Specify Reason</label>
                            <input
                                type="text"
                                value={customReason}
                                onChange={(e) => setCustomReason(e.target.value)}
                                placeholder="State specific reason..."
                                style={inputStyle}
                                required
                            />
                        </div>
                    )}

                    {/* Effective Date */}
                    <div>
                        <label style={labelStyle}>Effective Date</label>
                        <input
                            type="date"
                            value={onHoldDate}
                            onChange={(e) => setOnHoldDate(e.target.value)}
                            style={inputStyle}
                            required
                        />
                    </div>

                    {/* Notes */}
                    <div>
                        <label style={labelStyle}>Follow-Up Notes & Next Steps</label>
                        <textarea
                            rows={3}
                            placeholder="Add notes regarding follow-up timing, contact points, or revisit trigger..."
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            style={{ ...inputStyle, resize: 'vertical' }}
                        />
                    </div>

                    {/* Footer */}
                    <div style={{
                        display: 'flex', justifyContent: 'flex-end', gap: 12,
                        paddingTop: 16, borderTop: '1px solid var(--color-border)'
                    }}>
                        <button
                            type="button"
                            onClick={onClose}
                            style={{
                                padding: '9px 18px',
                                background: 'var(--color-surface-secondary)',
                                border: '1px solid var(--color-border)',
                                borderRadius: 10, fontSize: 13.5, fontWeight: 600,
                                color: 'var(--color-text-muted)', cursor: 'pointer'
                            }}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            style={{
                                padding: '9px 20px',
                                background: loading ? '#6b7280' : 'linear-gradient(135deg, #d97706 0%, #f59e0b 100%)',
                                border: 'none', borderRadius: 10,
                                fontSize: 13.5, fontWeight: 700, color: '#fff',
                                cursor: loading ? 'not-allowed' : 'pointer',
                                display: 'flex', alignItems: 'center', gap: 8,
                                boxShadow: loading ? 'none' : '0 4px 14px rgba(245,158,11,0.35)'
                            }}
                        >
                            {loading
                                ? <><i className="bx bx-loader-alt" style={{ animation: 'spin 1s linear infinite' }} /> Processing...</>
                                : <><i className="bx bx-pause" /> Put On Hold</>
                            }
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
