import React, { useState } from 'react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { usePosStore } from '../store/usePosStore';
import { ProductSearchPanel } from './ProductSearchPanel';
import { DiscountModal } from './DiscountModal';
import { TaxModal } from './TaxModal';
import { CustomerModal } from './CustomerModal';
import { PaymentModal } from './PaymentModal';
import { Receipt } from './Receipt';
import { useToastStore } from '../../../stores/toastStore';
import type { CheckoutResponse } from '../types';

export const POSWorkspace: React.FC = () => {
    const {
        activeSession,
        cartItems,
        selectedCustomer,
        discount,
        taxRate,
        updateQuantity,
        removeFromCart,
        getSubtotal,
        getDiscountAmount,
        getTaxAmount,
        getTotalAmount,
    } = usePosStore();

    const { } = useToastStore();

    const [isDiscountOpen, setDiscountOpen] = useState(false);
    const [isTaxOpen, setTaxOpen] = useState(false);
    const [isCustomerOpen, setCustomerOpen] = useState(false);
    const [isPaymentOpen, setPaymentOpen] = useState(false);
    const [completedSale, setCompletedSale] = useState<CheckoutResponse | null>(null);

    const handlePaymentClick = () => {
        setPaymentOpen(true);
    };

    return (
        <div style={{ display: 'flex', height: '100%', gap: 'var(--spacing-3)', padding: 'var(--spacing-3)', overflow: 'hidden' }}>

            {/* ── LEFT: Product Search ── */}
            <div style={{ flex: '1 1 65%', display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
                <ProductSearchPanel />
            </div>

            {/* ── RIGHT: Cart ── */}
            <div style={{ flex: '0 0 360px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <Card style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0 }}>

                    {/* Cart Header */}
                    <div style={{
                        padding: 'var(--spacing-3) var(--spacing-4)',
                        borderBottom: '1px solid var(--color-border)',
                        backgroundColor: 'var(--color-surface-elevated)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexShrink: 0,
                    }}>
                        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'var(--color-text)' }}>
                            Current Order
                        </h3>
                        {cartItems.length > 0 && (
                            <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                                {cartItems.reduce((sum, i) => sum + i.quantity, 0)} item(s)
                            </span>
                        )}
                    </div>

                    {/* Cart Items */}
                    <div style={{ flex: 1, overflowY: 'auto', backgroundColor: 'var(--color-background)' }}>
                        {cartItems.length === 0 ? (
                            <div style={{
                                height: '100%', display: 'flex', flexDirection: 'column',
                                justifyContent: 'center', alignItems: 'center',
                                color: 'var(--color-text-muted)', fontSize: '13px', textAlign: 'center',
                                gap: 'var(--spacing-2)', padding: 'var(--spacing-6)'
                            }}>
                                <i className="bx bx-cart" style={{ fontSize: '36px', opacity: 0.4 }} />
                                <span>Cart is empty.<br />Click a product to add it.</span>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                {cartItems.map((item) => (
                                    <div key={item.id} style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: 'var(--spacing-1)',
                                        padding: 'var(--spacing-3) var(--spacing-3)',
                                        borderBottom: '1px solid var(--color-border)',
                                    }}>
                                        {/* Product name + remove */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontWeight: 600, color: 'var(--color-text)', fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {item.item.name}
                                                </div>
                                                {(item.item.brand || item.item.category_name) && (
                                                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                                                        {[item.item.brand, item.item.category_name].filter(Boolean).join(' · ')}
                                                    </div>
                                                )}
                                            </div>
                                            <button
                                                onClick={() => removeFromCart(item.item.id)}
                                                style={{
                                                    background: 'none', border: 'none', cursor: 'pointer',
                                                    color: 'var(--color-text-muted)', padding: '2px 4px',
                                                    fontSize: '16px', lineHeight: 1, flexShrink: 0
                                                }}
                                                title="Remove from cart"
                                            >
                                                <i className="bx bx-x" />
                                            </button>
                                        </div>

                                        {/* Qty controls + line total */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            {/* Qty stepper */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-1)' }}>
                                                <button
                                                    onClick={() => updateQuantity(item.item.id, item.quantity - 1)}
                                                    style={{
                                                        width: '26px', height: '26px', borderRadius: '4px',
                                                        border: '1px solid var(--color-border)',
                                                        background: 'var(--color-surface)', cursor: 'pointer',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        color: 'var(--color-text)', fontSize: '14px'
                                                    }}
                                                >−</button>
                                                <span style={{ minWidth: '28px', textAlign: 'center', fontSize: '13px', fontWeight: 600, color: 'var(--color-text)' }}>
                                                    {item.quantity}
                                                </span>
                                                <button
                                                    onClick={() => updateQuantity(item.item.id, item.quantity + 1)}
                                                    disabled={item.item.track_inventory && item.quantity >= parseFloat(item.item.current_stock || '0')}
                                                    style={{
                                                        width: '26px', height: '26px', borderRadius: '4px',
                                                        border: '1px solid var(--color-border)',
                                                        background: 'var(--color-surface)', cursor: (item.item.track_inventory && item.quantity >= parseFloat(item.item.current_stock || '0')) ? 'not-allowed' : 'pointer',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        color: (item.item.track_inventory && item.quantity >= parseFloat(item.item.current_stock || '0')) ? 'var(--color-text-muted)' : 'var(--color-text)',
                                                        fontSize: '14px', opacity: (item.item.track_inventory && item.quantity >= parseFloat(item.item.current_stock || '0')) ? 0.4 : 1
                                                    }}
                                                >+</button>
                                                <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginLeft: '4px' }}>
                                                    @ {item.unitPrice.toLocaleString()}
                                                </span>
                                            </div>

                                            {/* Line total */}
                                            <span style={{ fontWeight: 700, color: 'var(--color-text)', fontSize: '13px' }}>
                                                PKR {(item.quantity * item.unitPrice).toLocaleString()}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Cart Totals + Actions */}
                    <div style={{
                        padding: 'var(--spacing-3) var(--spacing-4)',
                        borderTop: '1px solid var(--color-border)',
                        backgroundColor: 'var(--color-surface)',
                        flexShrink: 0,
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--spacing-1)', fontSize: '13px', color: 'var(--color-text)' }}>
                            <span>Subtotal</span>
                            <span>PKR {getSubtotal().toLocaleString()}</span>
                        </div>
                        <div 
                            style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--spacing-1)', fontSize: '13px', color: 'var(--color-text)', cursor: 'pointer', padding: '4px 0', borderBottom: '1px dashed transparent' }}
                            onClick={() => setDiscountOpen(true)}
                            onMouseEnter={e => (e.currentTarget.style.borderBottom = '1px dashed var(--color-border)')}
                            onMouseLeave={e => (e.currentTarget.style.borderBottom = '1px dashed transparent')}
                            title="Click to add/edit discount"
                        >
                            <span>Discount {discount?.type === 'percentage' ? `(${discount.value}%)` : ''}</span>
                            <span style={{ color: 'var(--color-primary)' }}>− PKR {getDiscountAmount().toLocaleString()}</span>
                        </div>
                        <div 
                            style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--spacing-3)', fontSize: '13px', color: 'var(--color-text)', cursor: 'pointer', padding: '4px 0', borderBottom: '1px dashed transparent' }}
                            onClick={() => setTaxOpen(true)}
                            onMouseEnter={e => (e.currentTarget.style.borderBottom = '1px dashed var(--color-border)')}
                            onMouseLeave={e => (e.currentTarget.style.borderBottom = '1px dashed transparent')}
                            title="Click to add/edit tax"
                        >
                            <span>Tax {taxRate > 0 ? `(${(taxRate * 100).toFixed(1)}%)` : ''}</span>
                            <span>PKR {getTaxAmount().toLocaleString()}</span>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--spacing-3)', fontSize: '18px', fontWeight: 700, color: 'var(--color-text)', borderTop: '1px solid var(--color-border)', paddingTop: 'var(--spacing-3)' }}>
                            <span>Total</span>
                            <span>PKR {getTotalAmount().toLocaleString()}</span>
                        </div>

                        {/* Customer Display / Assigment */}
                        <div style={{ marginBottom: 'var(--spacing-2)' }}>
                            <Button variant="secondary" style={{ width: '100%', justifyContent: 'flex-start', padding: 'var(--spacing-2) var(--spacing-3)', height: 'auto' }} onClick={() => setCustomerOpen(true)}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)', width: '100%', textAlign: 'left' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'var(--color-surface-elevated)', color: 'var(--color-primary)' }}>
                                        <i className={selectedCustomer ? 'bx bx-user-check' : 'bx bx-user'} style={{ fontSize: '18px' }} />
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {selectedCustomer ? selectedCustomer.name : 'Walk-in Customer'}
                                        </div>
                                        <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                                            {selectedCustomer ? (selectedCustomer.phone || 'No phone') : 'Click to assign customer'}
                                        </div>
                                    </div>
                                </div>
                            </Button>
                        </div>

                        {/* Continue to Payment — Phase 8H-7-6 placeholder */}
                        <Button
                            variant="primary"
                            style={{ width: '100%', fontSize: '15px' }}
                            disabled={!activeSession || cartItems.length === 0 || getTotalAmount() < 0}
                            onClick={handlePaymentClick}
                        >
                            Continue to Payment
                        </Button>
                    </div>

                </Card>
            </div>

            {/* ── Modals ── */}
            <DiscountModal isOpen={isDiscountOpen} onClose={() => setDiscountOpen(false)} />
            <TaxModal isOpen={isTaxOpen} onClose={() => setTaxOpen(false)} />
            <CustomerModal isOpen={isCustomerOpen} onClose={() => setCustomerOpen(false)} />
            <PaymentModal 
                isOpen={isPaymentOpen} 
                onClose={() => setPaymentOpen(false)} 
                onCheckoutSuccess={(sale) => setCompletedSale(sale)}
            />

            {completedSale && (
                <Receipt 
                    sale={completedSale} 
                    onClose={() => setCompletedSale(null)} 
                />
            )}

        </div>
    );
};
