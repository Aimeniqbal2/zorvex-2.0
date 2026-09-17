import React, { useState } from 'react';
import { Button } from '../../../../components/ui/Button';
import { useToastStore } from '../../../../stores/toastStore';
import { reverseVendorPayment, type VendorPayment } from '../api';

interface ReversePaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    onPaymentReversed: () => void;
    payment: VendorPayment | null;
}

export const ReversePaymentModal: React.FC<ReversePaymentModalProps> = ({
    isOpen,
    onClose,
    onPaymentReversed,
    payment
}) => {
    const [reason, setReason] = useState('');
    const [submitting, setSubmitting] = useState(false);

    if (!isOpen || !payment) return null;

    const handleReverse = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!reason.trim()) {
            useToastStore.getState().error('Please provide a reason for reversing this payment.');
            return;
        }

        try {
            setSubmitting(true);
            await reverseVendorPayment(payment.id, reason.trim());
            useToastStore.getState().success(`Payment ${payment.payment_number} reversed. Invoice balances restored.`);
            onPaymentReversed();
            onClose();
        } catch (err: any) {
            console.error('Failed to reverse payment:', err);
            const msg = err.response?.data?.detail || err.response?.data?.message || 'Failed to reverse payment.';
            useToastStore.getState().error(msg);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            backdropFilter: 'blur(4px)',
            padding: '16px'
        }}>
            <div style={{
                background: 'var(--color-surface, #1e293b)',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                borderRadius: '14px',
                width: '100%',
                maxWidth: '520px',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                overflow: 'hidden'
            }}>
                {/* Header */}
                <div style={{
                    padding: '18px 24px',
                    borderBottom: '1px solid var(--color-border, #334155)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: 'rgba(239, 68, 68, 0.08)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '8px',
                            background: 'rgba(239, 68, 68, 0.2)',
                            color: '#ef4444',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '20px'
                        }}>
                            <i className='bx bx-undo'></i>
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#f87171' }}>
                                Reverse Payment Voucher
                            </h3>
                            <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                                {payment.payment_number} ({payment.vendor_name})
                            </span>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--color-text-muted)',
                            fontSize: '20px',
                            cursor: 'pointer'
                        }}
                    >
                        <i className='bx bx-x'></i>
                    </button>
                </div>

                {/* Body */}
                <form onSubmit={handleReverse} style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{
                        padding: '14px',
                        borderRadius: '8px',
                        background: 'rgba(239, 68, 68, 0.05)',
                        border: '1px solid rgba(239, 68, 68, 0.2)',
                        fontSize: '13px',
                        color: '#f8fafc',
                        lineHeight: 1.5
                    }}>
                        <div style={{ fontWeight: 700, color: '#f87171', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <i className='bx bx-alarm-exclamation'></i> Irreversible Accounting Action
                        </div>
                        This action will mark payment voucher <strong>{payment.payment_number}</strong> as <strong style={{ color: '#ef4444' }}>REVERSED</strong> and automatically roll back <strong>PKR {Number(payment.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>, restoring the outstanding balance on all {payment.allocations?.length || 0} allocated bill(s).
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '6px' }}>
                            Reason for Reversal <span style={{ color: '#ef4444' }}>*</span>
                        </label>
                        <textarea
                            rows={3}
                            placeholder="e.g. Bank transaction declined / Wrong cheque amount / Transferred to incorrect account..."
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            required
                            style={{
                                width: '100%',
                                padding: '10px 12px',
                                borderRadius: '8px',
                                background: 'var(--color-surface-secondary, #0f172a)',
                                border: '1px solid var(--color-border, #334155)',
                                color: '#f8fafc',
                                fontSize: '13px',
                                resize: 'vertical'
                            }}
                        />
                    </div>

                    {/* Footer */}
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginTop: '8px'
                    }}>
                        <Button variant="secondary" type="button" onClick={onClose} disabled={submitting}>
                            Cancel
                        </Button>
                        <Button
                            variant="danger"
                            type="submit"
                            disabled={submitting || !reason.trim()}
                        >
                            {submitting ? (
                                <>
                                    <i className='bx bx-loader-alt bx-spin'></i> Reversing...
                                </>
                            ) : (
                                <>
                                    <i className='bx bx-undo'></i> Confirm Reversal
                                </>
                            )}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
};
