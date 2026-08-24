import React from 'react';
import { Button } from '../../../components/ui/Button';
import type { CheckoutResponse } from '../types';

interface ReceiptProps {
    sale: CheckoutResponse;
    onClose: () => void;
}

export const Receipt: React.FC<ReceiptProps> = ({ sale, onClose }) => {
    
    const handlePrint = () => {
        window.print();
    };

    const paymentMethodUpper = sale.payment_method ? sale.payment_method.toUpperCase() : 'UNKNOWN';

    // Format helpers
    const formatMoney = (val: string | number) => {
        const num = typeof val === 'string' ? parseFloat(val) : val;
        return isNaN(num) ? '0.00' : num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const formatDate = (isoString: string) => {
        try {
            const date = new Date(isoString);
            return date.toLocaleString();
        } catch {
            return isoString;
        }
    };

    return (
        <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundColor: 'var(--color-background)',
            zIndex: 100, // above POSWorkspace
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: 'var(--spacing-6)',
            overflowY: 'auto'
        }}>
            {/* Action Bar (Not printed) */}
            <div className="no-print" style={{ display: 'flex', gap: 'var(--spacing-4)', marginBottom: 'var(--spacing-6)' }}>
                <Button variant="secondary" onClick={onClose}>
                    <i className='bx bx-arrow-back' style={{ marginRight: '8px' }}></i>
                    New Sale
                </Button>
                <Button variant="primary" onClick={handlePrint}>
                    <i className='bx bx-printer' style={{ marginRight: '8px' }}></i>
                    Print Receipt
                </Button>
            </div>

            {/* Receipt Container */}
            <div className="receipt-print-wrapper" style={{
                backgroundColor: '#ffffff',
                color: '#000000',
                width: '300px', // Standard 80mm thermal receipt approx
                padding: 'var(--spacing-4)',
                fontFamily: 'monospace',
                fontSize: '12px',
                boxShadow: 'var(--shadow-md)',
                margin: '0 auto',
            }}>
                {/* Header */}
                <div style={{ textAlign: 'center', marginBottom: 'var(--spacing-4)' }}>
                    <h2 style={{ margin: '0 0 4px 0', fontSize: '18px', fontWeight: 'bold' }}>ZORVEX</h2>
                    <div style={{ fontSize: '14px', fontWeight: 'bold' }}>ENTERPRISE</div>
                </div>

                <div style={{ marginBottom: 'var(--spacing-4)', borderBottom: '1px dashed #000', paddingBottom: 'var(--spacing-2)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Receipt #:</span>
                        <span>{sale.id.substring(0, 8).toUpperCase()}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Date:</span>
                        <span>{formatDate(sale.created_at)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Cashier:</span>
                        <span>{sale.cashier || 'System'}</span>
                    </div>
                    {sale.customer_info && (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>Customer:</span>
                            <span>{sale.customer_info.name}</span>
                        </div>
                    )}
                </div>

                {/* Items */}
                <div style={{ marginBottom: 'var(--spacing-2)' }}>
                    <div style={{ display: 'flex', borderBottom: '1px solid #000', paddingBottom: '4px', marginBottom: '4px', fontWeight: 'bold' }}>
                        <span style={{ flex: 1 }}>ITEM</span>
                        <span style={{ width: '30px', textAlign: 'center' }}>QTY</span>
                        <span style={{ width: '60px', textAlign: 'right' }}>TOTAL</span>
                    </div>
                    {sale.items?.map(item => (
                        <div key={item.id} style={{ display: 'flex', marginBottom: '4px', alignItems: 'flex-start' }}>
                            <span style={{ flex: 1, paddingRight: '4px' }}>{item.product_name}</span>
                            <span style={{ width: '30px', textAlign: 'center' }}>{parseFloat(item.quantity)}</span>
                            <span style={{ width: '60px', textAlign: 'right' }}>{formatMoney(item.line_total)}</span>
                        </div>
                    ))}
                </div>

                {/* Totals */}
                <div style={{ borderTop: '1px dashed #000', paddingTop: 'var(--spacing-2)', marginBottom: 'var(--spacing-4)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                        <span>Subtotal</span>
                        <span>{formatMoney(sale.subtotal)}</span>
                    </div>
                    {parseFloat(sale.discount_amount) > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                            <span>Discount</span>
                            <span>-{formatMoney(sale.discount_amount)}</span>
                        </div>
                    )}
                    {parseFloat(sale.tax_amount) > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                            <span>Tax</span>
                            <span>{formatMoney(sale.tax_amount)}</span>
                        </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', paddingTop: '4px', borderTop: '1px solid #000', fontWeight: 'bold', fontSize: '14px' }}>
                        <span>TOTAL</span>
                        <span>{formatMoney(sale.total_amount)}</span>
                    </div>
                </div>

                {/* Payment Info */}
                <div style={{ borderTop: '1px dashed #000', paddingTop: 'var(--spacing-2)', marginBottom: 'var(--spacing-4)' }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Payment: {paymentMethodUpper}</div>
                    
                    {sale.payment_method === 'cash' && (
                        <>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>Received</span>
                                <span>{formatMoney(sale.received_amount)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>Change</span>
                                <span>{formatMoney(Math.max(0, parseFloat(sale.received_amount) - parseFloat(sale.total_amount)))}</span>
                            </div>
                        </>
                    )}

                    {sale.payment_method === 'card' && (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>Total Paid</span>
                            <span>{formatMoney(sale.total_amount)}</span>
                        </div>
                    )}

                    {sale.payment_method === 'credit' && (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>Charged to Account</span>
                            <span>{formatMoney(sale.total_amount)}</span>
                        </div>
                    )}

                    {sale.payment_method === 'split' && (
                        <>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>Cash Paid</span>
                                <span>{formatMoney(sale.split_cash || 0)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>Card Paid</span>
                                <span>{formatMoney(sale.split_card || 0)}</span>
                            </div>
                        </>
                    )}
                </div>

                {/* Footer */}
                <div style={{ textAlign: 'center', borderTop: '1px dashed #000', paddingTop: 'var(--spacing-4)' }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Thank you!</div>
                    <div style={{ fontSize: '10px' }}>Powered by ZORVEX</div>
                </div>
            </div>

            {/* Inject print styles locally to ensure component isolation */}
            <style dangerouslySetInnerHTML={{__html: `
                @media print {
                    @page { margin: 0; }
                    body { margin: 0; padding: 0; background: #fff; }
                    body * { visibility: hidden; }
                    .receipt-print-wrapper, .receipt-print-wrapper * {
                        visibility: visible;
                    }
                    .receipt-print-wrapper {
                        position: absolute;
                        left: 0;
                        top: 0;
                        width: 80mm !important; /* Force width for thermal */
                        margin: 0;
                        padding: 10px;
                        box-shadow: none !important;
                    }
                    .no-print {
                        display: none !important;
                    }
                }
            `}} />
        </div>
    );
};
