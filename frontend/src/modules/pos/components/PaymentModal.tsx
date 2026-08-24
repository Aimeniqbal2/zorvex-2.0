import React, { useState, useEffect } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { usePosStore } from '../store/usePosStore';
import { checkoutSale } from '../api';
import { useToastStore } from '../../../stores/toastStore';
import type { CheckoutPayload, CheckoutResponse } from '../types';

interface PaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCheckoutSuccess: (sale: CheckoutResponse) => void;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({ isOpen, onClose, onCheckoutSuccess }) => {
    const {
        activeSession,
        cartItems,
        selectedCustomer,
        getTotalAmount,
        getCheckoutPayload,
        resetSale
    } = usePosStore();

    const { success, error: showError } = useToastStore();

    const [paymentMethod, setPaymentMethod] = useState<CheckoutPayload['payment_method']>('cash');
    const [receivedAmount, setReceivedAmount] = useState<string>('');
    const [splitCash, setSplitCash] = useState<string>('');
    const [splitCard, setSplitCard] = useState<string>('');
    
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [validationError, setValidationError] = useState<string | null>(null);

    const totalAmount = getTotalAmount();

    // Reset local state when modal opens
    useEffect(() => {
        if (isOpen) {
            setPaymentMethod('cash');
            setReceivedAmount(totalAmount > 0 ? totalAmount.toString() : '');
            setSplitCash('');
            setSplitCard('');
            setValidationError(null);
            setIsSubmitting(false);
        }
    }, [isOpen, totalAmount]);

    const handleReceivedAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setReceivedAmount(e.target.value);
        setValidationError(null);
    };

    const handleSplitCashChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSplitCash(e.target.value);
        setValidationError(null);
    };

    const handleSplitCardChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSplitCard(e.target.value);
        setValidationError(null);
    };

    const validatePayment = (): boolean => {
        if (!activeSession) {
            setValidationError("No active POS Session. Please open a session before transacting.");
            return false;
        }
        if (cartItems.length === 0) {
            setValidationError("Cart is empty.");
            return false;
        }

        if (paymentMethod === 'cash') {
            const received = parseFloat(receivedAmount) || 0;
            if (received < totalAmount) {
                setValidationError(`Insufficient payment. Received: PKR ${received.toFixed(2)}, Total: PKR ${totalAmount.toFixed(2)}`);
                return false;
            }
        } else if (paymentMethod === 'credit') {
            if (!selectedCustomer) {
                setValidationError("A customer is required for credit sales.");
                return false;
            }
        } else if (paymentMethod === 'split') {
            const cash = parseFloat(splitCash) || 0;
            const card = parseFloat(splitCard) || 0;
            if (cash < 0 || card < 0) {
                setValidationError("Split amounts cannot be negative.");
                return false;
            }
            if (Math.abs(cash + card - totalAmount) > 0.01) {
                setValidationError(`Split total (PKR ${(cash + card).toFixed(2)}) must equal Order Total (PKR ${totalAmount.toFixed(2)}).`);
                return false;
            }
        }

        return true;
    };

    const handleCheckout = async () => {
        if (isSubmitting) return; // double submission protection
        
        setValidationError(null);
        if (!validatePayment()) return;

        setIsSubmitting(true);

        try {
            const received = paymentMethod === 'cash' 
                ? (parseFloat(receivedAmount) || 0)
                : paymentMethod === 'split' 
                    ? totalAmount // for split, the received is equal to total conceptually
                    : totalAmount; // card/credit receives exact total implicitly

            const sCash = paymentMethod === 'split' ? (parseFloat(splitCash) || 0) : 0;
            const sCard = paymentMethod === 'split' ? (parseFloat(splitCard) || 0) : 0;

            const payload = getCheckoutPayload(paymentMethod, received, sCash, sCard);
            
            const response = await checkoutSale(payload);
            
            success("Sale completed successfully!");
            resetSale();
            onClose();
            onCheckoutSuccess(response);
        } catch (err: any) {
            console.error("Checkout failed:", err);
            
            // Try to extract readable error from DRF response
            let errMsg = "Unable to complete sale. Please try again.";
            if (err.response?.data) {
                const data = err.response.data;
                if (typeof data === 'string') {
                    errMsg = data;
                } else if (data.detail) {
                    errMsg = data.detail;
                } else if (data.error) {
                    errMsg = data.error;
                } else if (Array.isArray(data) && data.length > 0) {
                    errMsg = data.join(' ');
                } else if (data.non_field_errors) {
                    errMsg = Array.isArray(data.non_field_errors) ? data.non_field_errors.join(' ') : data.non_field_errors;
                } else {
                    // DRF ValidationError often comes as {"field": ["error"]} or just a string array
                    const firstKey = Object.keys(data)[0];
                    if (firstKey) {
                        const val = data[firstKey];
                        errMsg = Array.isArray(val) ? val.join(' ') : String(val);
                    }
                }
            } else if (err.message) {
                errMsg = err.message;
            }
            
            setValidationError(errMsg);
            showError("Checkout failed.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const renderMethodSpecificFields = () => {
        switch (paymentMethod) {
            case 'cash':
                const received = parseFloat(receivedAmount) || 0;
                const change = received >= totalAmount ? received - totalAmount : 0;
                return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}>
                        <Input 
                            label="Received Amount (PKR)" 
                            type="number" 
                            min="0"
                            step="0.01"
                            value={receivedAmount} 
                            onChange={handleReceivedAmountChange}
                            placeholder="Enter received amount"
                            disabled={isSubmitting}
                            autoFocus
                        />
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--spacing-3)', backgroundColor: 'var(--color-surface-elevated)', borderRadius: 'var(--border-radius-md)' }}>
                            <span style={{ fontWeight: 500 }}>Change to Return:</span>
                            <span style={{ fontWeight: 700, color: change > 0 ? 'var(--color-success)' : 'inherit' }}>
                                PKR {change.toFixed(2)}
                            </span>
                        </div>
                    </div>
                );
            case 'card':
                return (
                    <div style={{ padding: 'var(--spacing-4)', textAlign: 'center', backgroundColor: 'var(--color-surface-elevated)', borderRadius: 'var(--border-radius-md)' }}>
                        <i className='bx bx-credit-card' style={{ fontSize: '32px', color: 'var(--color-primary)', marginBottom: '8px' }}></i>
                        <p style={{ margin: 0, fontWeight: 500 }}>Swipe or insert card on the terminal.</p>
                        <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--color-text-muted)' }}>Exact amount will be charged.</p>
                    </div>
                );
            case 'credit':
                return (
                    <div style={{ padding: 'var(--spacing-4)', textAlign: 'center', backgroundColor: 'var(--color-surface-elevated)', borderRadius: 'var(--border-radius-md)' }}>
                        {selectedCustomer ? (
                            <>
                                <i className='bx bx-user-check' style={{ fontSize: '32px', color: 'var(--color-success)', marginBottom: '8px' }}></i>
                                <p style={{ margin: 0, fontWeight: 500 }}>Charge to Account: {selectedCustomer.name}</p>
                                <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--color-text-muted)' }}>Balance will be updated automatically.</p>
                            </>
                        ) : (
                            <>
                                <i className='bx bx-user-x' style={{ fontSize: '32px', color: 'var(--color-danger)', marginBottom: '8px' }}></i>
                                <p style={{ margin: 0, fontWeight: 500, color: 'var(--color-danger)' }}>A customer is required for credit sales.</p>
                                <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--color-text-muted)' }}>Please close this modal and assign a customer.</p>
                            </>
                        )}
                    </div>
                );
            case 'split':
                return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}>
                        <Input 
                            label="Cash Amount (PKR)" 
                            type="number" 
                            min="0"
                            step="0.01"
                            value={splitCash} 
                            onChange={handleSplitCashChange}
                            placeholder="0.00"
                            disabled={isSubmitting}
                        />
                        <Input 
                            label="Card Amount (PKR)" 
                            type="number" 
                            min="0"
                            step="0.01"
                            value={splitCard} 
                            onChange={handleSplitCardChange}
                            placeholder="0.00"
                            disabled={isSubmitting}
                        />
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--spacing-3)', backgroundColor: 'var(--color-surface-elevated)', borderRadius: 'var(--border-radius-md)' }}>
                            <span style={{ fontWeight: 500 }}>Split Total:</span>
                            <span style={{ fontWeight: 700 }}>
                                PKR {((parseFloat(splitCash) || 0) + (parseFloat(splitCard) || 0)).toFixed(2)}
                            </span>
                        </div>
                    </div>
                );
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={isSubmitting ? () => {} : onClose} title="Payment">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)' }}>
                {/* Order Total Header */}
                <div style={{ 
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
                    padding: 'var(--spacing-4)', backgroundColor: 'var(--color-primary)', 
                    color: 'white', borderRadius: 'var(--border-radius-md)' 
                }}>
                    <span style={{ fontSize: '16px', fontWeight: 500 }}>Order Total</span>
                    <span style={{ fontSize: '24px', fontWeight: 700 }}>PKR {totalAmount.toLocaleString()}</span>
                </div>

                {/* Payment Methods */}
                <div>
                    <label style={{ display: 'block', marginBottom: 'var(--spacing-2)', fontWeight: 600, fontSize: '13px' }}>
                        Payment Method
                    </label>
                    <div style={{ display: 'flex', gap: 'var(--spacing-2)' }}>
                        {(['cash', 'card', 'credit', 'split'] as const).map(method => (
                            <Button
                                key={method}
                                variant={paymentMethod === method ? 'primary' : 'secondary'}
                                onClick={() => {
                                    setPaymentMethod(method);
                                    setValidationError(null);
                                }}
                                disabled={isSubmitting}
                                style={{ flex: 1, textTransform: 'capitalize' }}
                            >
                                {method}
                            </Button>
                        ))}
                    </div>
                </div>

                {/* Dynamic Fields */}
                <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 'var(--spacing-4)' }}>
                    {renderMethodSpecificFields()}
                </div>

                {/* Error Area */}
                {validationError && (
                    <div style={{ padding: 'var(--spacing-3)', backgroundColor: 'rgba(var(--color-danger-rgb), 0.1)', color: 'var(--color-danger)', borderRadius: 'var(--border-radius-md)', fontSize: '13px' }}>
                        <i className='bx bx-error-circle' style={{ marginRight: '4px', verticalAlign: 'middle' }}></i>
                        {validationError}
                    </div>
                )}

                {/* Footer */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--spacing-2)', marginTop: 'var(--spacing-2)' }}>
                    <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
                        Cancel
                    </Button>
                    <Button 
                        variant="primary" 
                        onClick={handleCheckout} 
                        disabled={isSubmitting || (paymentMethod === 'credit' && !selectedCustomer)}
                        style={{ minWidth: '150px' }}
                    >
                        {isSubmitting ? (
                            <>
                                <i className="bx bx-loader-alt bx-spin" style={{ marginRight: '8px' }}></i>
                                Processing...
                            </>
                        ) : 'Complete Sale'}
                    </Button>
                </div>
            </div>
        </Modal>
    );
};
