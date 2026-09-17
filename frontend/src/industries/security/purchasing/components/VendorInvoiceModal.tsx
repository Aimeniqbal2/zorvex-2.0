import React, { useState, useEffect } from 'react';
import {
    createVendorInvoice,
    getPOBillingSummary,
    type PurchaseOrder,
    type POBillingSummary
} from '../api';

interface VendorInvoiceModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: (invoiceId?: string) => void;
    purchaseOrder: PurchaseOrder;
}

interface InvoiceLineState {
    po_line_id: string;
    item_id: string;
    item_name: string;
    item_code: string;
    ordered_quantity: number;
    accepted_quantity: number;
    billed_quantity: number;
    remaining_billable_quantity: number;
    unit_price: number;
    invoiced_quantity: number;
    invoiced_price: number;
    discount_amount: number;
    tax_amount: number;
    notes: string;
    selected: boolean;
}

export const VendorInvoiceModal: React.FC<VendorInvoiceModalProps> = ({
    isOpen,
    onClose,
    onSuccess,
    purchaseOrder
}) => {
    const [vendorInvoiceNumber, setVendorInvoiceNumber] = useState('');
    const [documentDate, setDocumentDate] = useState(new Date().toISOString().split('T')[0]);
    const [dueDate, setDueDate] = useState(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
    const [referenceNumber, setReferenceNumber] = useState('');
    const [freightAmount, setFreightAmount] = useState<number>(0);
    const [notes, setNotes] = useState('');
    const [lines, setLines] = useState<InvoiceLineState[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadingSummary, setLoadingSummary] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen && purchaseOrder) {
            fetchBillingSummary();
        }
    }, [isOpen, purchaseOrder]);

    const fetchBillingSummary = async () => {
        try {
            setLoadingSummary(true);
            setError(null);
            const summary: POBillingSummary = await getPOBillingSummary(purchaseOrder.id);
            
            const initLines: InvoiceLineState[] = summary.lines.map((l) => ({
                po_line_id: l.po_line_id,
                item_id: l.item_id,
                item_name: l.item_name,
                item_code: l.item_code,
                ordered_quantity: l.ordered_quantity,
                accepted_quantity: l.accepted_quantity,
                billed_quantity: l.billed_quantity,
                remaining_billable_quantity: l.remaining_billable_quantity,
                unit_price: l.unit_price,
                invoiced_quantity: l.remaining_billable_quantity > 0 ? l.remaining_billable_quantity : 0,
                invoiced_price: l.unit_price,
                discount_amount: 0,
                tax_amount: 0,
                notes: '',
                selected: l.remaining_billable_quantity > 0
            }));
            setLines(initLines);
        } catch (err: any) {
            console.error("Failed to load PO billing summary:", err);
            setError(err?.response?.data?.detail || "Could not retrieve PO billing status.");
        } finally {
            setLoadingSummary(false);
        }
    };

    if (!isOpen) return null;

    const handleLineChange = (index: number, field: keyof InvoiceLineState, value: any) => {
        setLines(prev => {
            const copy = [...prev];
            copy[index] = { ...copy[index], [field]: value };
            return copy;
        });
    };

    // Calculate totals on the fly for preview (backend recalculates authoritative numbers)
    const selectedLines = lines.filter(l => l.selected && l.invoiced_quantity > 0);
    const subtotal = selectedLines.reduce((acc, l) => acc + (l.invoiced_quantity * l.invoiced_price), 0);
    const totalDiscount = selectedLines.reduce((acc, l) => acc + (Number(l.discount_amount) || 0), 0);
    const totalTax = selectedLines.reduce((acc, l) => acc + (Number(l.tax_amount) || 0), 0);
    const grandTotal = subtotal - totalDiscount + totalTax + (Number(freightAmount) || 0);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!vendorInvoiceNumber.trim()) {
            setError("Vendor Invoice Number is required.");
            return;
        }

        if (selectedLines.length === 0) {
            setError("Please select at least one line item with invoiced quantity > 0.");
            return;
        }

        try {
            setLoading(true);
            const payload = {
                vendor_invoice_number: vendorInvoiceNumber.trim(),
                document_date: documentDate,
                due_date: dueDate || undefined,
                reference_number: referenceNumber.trim() || undefined,
                freight_amount: Number(freightAmount) || 0,
                notes: notes.trim() || undefined,
                lines: selectedLines.map(l => ({
                    po_line_id: l.po_line_id,
                    quantity: Number(l.invoiced_quantity),
                    unit_price: Number(l.invoiced_price),
                    discount_amount: Number(l.discount_amount) || 0,
                    tax_amount: Number(l.tax_amount) || 0,
                    notes: l.notes || undefined
                }))
            };

            const invoice = await createVendorInvoice(purchaseOrder.id, payload);
            onSuccess(invoice.id);
            onClose();
        } catch (err: any) {
            console.error("Error creating vendor invoice:", err);
            setError(err?.response?.data?.detail || "Failed to create vendor invoice. Please check the quantities and try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1050,
            padding: '16px'
        }}>
            <div style={{
                backgroundColor: 'var(--color-surface, #1e293b)',
                color: 'var(--color-text, #f8fafc)',
                borderRadius: '12px',
                border: '1px solid var(--color-border, #334155)',
                width: '100%',
                maxWidth: '960px',
                maxHeight: '92vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
            }}>
                {/* Header */}
                <div style={{
                    padding: '20px 24px',
                    borderBottom: '1px solid var(--color-border, #334155)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>Create Vendor Bill / Invoice</h2>
                            <span style={{
                                padding: '3px 8px',
                                borderRadius: '6px',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                backgroundColor: 'rgba(59, 130, 246, 0.15)',
                                color: '#60a5fa',
                                border: '1px solid rgba(59, 130, 246, 0.3)'
                            }}>
                                PO: {purchaseOrder.number}
                            </span>
                        </div>
                        <p style={{ margin: '4px 0 0 0', fontSize: '0.875rem', color: '#94a3b8' }}>
                            Vendor: <strong>{purchaseOrder.vendor_name || 'Direct Supplier'}</strong> • 3-Way Match will run automatically upon creation
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#94a3b8',
                            fontSize: '1.5rem',
                            cursor: 'pointer',
                            padding: '4px'
                        }}
                    >
                        ✕
                    </button>
                </div>

                {/* Body Form */}
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                    <div style={{ padding: '24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        {error && (
                            <div style={{
                                padding: '12px 16px',
                                borderRadius: '8px',
                                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                                border: '1px solid rgba(239, 68, 68, 0.3)',
                                color: '#f87171',
                                fontSize: '0.875rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                            }}>
                                <span>⚠️</span>
                                <span>{error}</span>
                            </div>
                        )}

                        {/* Top Info Grid */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                            gap: '16px',
                            backgroundColor: 'rgba(15, 23, 42, 0.4)',
                            padding: '16px',
                            borderRadius: '8px',
                            border: '1px solid var(--color-border, #334155)'
                        }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
                                    Vendor Invoice # <span style={{ color: '#ef4444' }}>*</span>
                                </label>
                                <input
                                    type="text"
                                    required
                                    placeholder="e.g. INV-2026-9901"
                                    value={vendorInvoiceNumber}
                                    onChange={(e) => setVendorInvoiceNumber(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '8px 12px',
                                        borderRadius: '6px',
                                        backgroundColor: 'var(--color-surface-elevated, #0f172a)',
                                        border: '1px solid var(--color-border, #334155)',
                                        color: '#f8fafc',
                                        fontSize: '0.875rem'
                                    }}
                                />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
                                    External Ref / Delivery Note #
                                </label>
                                <input
                                    type="text"
                                    placeholder="e.g. DN-5849"
                                    value={referenceNumber}
                                    onChange={(e) => setReferenceNumber(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '8px 12px',
                                        borderRadius: '6px',
                                        backgroundColor: 'var(--color-surface-elevated, #0f172a)',
                                        border: '1px solid var(--color-border, #334155)',
                                        color: '#f8fafc',
                                        fontSize: '0.875rem'
                                    }}
                                />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
                                    Invoice Date <span style={{ color: '#ef4444' }}>*</span>
                                </label>
                                <input
                                    type="date"
                                    required
                                    value={documentDate}
                                    onChange={(e) => setDocumentDate(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '8px 12px',
                                        borderRadius: '6px',
                                        backgroundColor: 'var(--color-surface-elevated, #0f172a)',
                                        border: '1px solid var(--color-border, #334155)',
                                        color: '#f8fafc',
                                        fontSize: '0.875rem'
                                    }}
                                />
                            </div>


                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
                                    Payment Due Date
                                </label>
                                <input
                                    type="date"
                                    value={dueDate}
                                    onChange={(e) => setDueDate(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '8px 12px',
                                        borderRadius: '6px',
                                        backgroundColor: 'var(--color-surface-elevated, #0f172a)',
                                        border: '1px solid var(--color-border, #334155)',
                                        color: '#f8fafc',
                                        fontSize: '0.875rem'
                                    }}
                                />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
                                    Freight / Other Charges ({purchaseOrder.currency || 'PKR'})
                                </label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={freightAmount}
                                    onChange={(e) => setFreightAmount(parseFloat(e.target.value) || 0)}
                                    style={{
                                        width: '100%',
                                        padding: '8px 12px',
                                        borderRadius: '6px',
                                        backgroundColor: 'var(--color-surface-elevated, #0f172a)',
                                        border: '1px solid var(--color-border, #334155)',
                                        color: '#f8fafc',
                                        fontSize: '0.875rem'
                                    }}
                                />
                            </div>
                        </div>

                        {/* Line Items Table */}
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>Invoice Line Items & Quantities</h3>
                                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                                    {selectedLines.length} item(s) selected for billing
                                </span>
                            </div>

                            {loadingSummary ? (
                                <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>
                                    Loading PO line fulfillment details...
                                </div>
                            ) : lines.length === 0 ? (
                                <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8', border: '1px dashed #334155', borderRadius: '8px' }}>
                                    No billable lines found for this Purchase Order.
                                </div>
                            ) : (
                                <div style={{ overflowX: 'auto', border: '1px solid var(--color-border, #334155)', borderRadius: '8px' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                        <thead>
                                            <tr style={{ backgroundColor: 'rgba(15, 23, 42, 0.6)', borderBottom: '1px solid var(--color-border, #334155)', color: '#94a3b8', textAlign: 'left' }}>
                                                <th style={{ padding: '10px 12px', width: '40px' }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={lines.length > 0 && lines.every(l => l.selected)}
                                                        onChange={(e) => {
                                                            const chk = e.target.checked;
                                                            setLines(prev => prev.map(l => ({ ...l, selected: chk })));
                                                        }}
                                                    />
                                                </th>
                                                <th style={{ padding: '10px 12px' }}>Item / Description</th>
                                                <th style={{ padding: '10px 12px', textAlign: 'center' }}>Ordered</th>
                                                <th style={{ padding: '10px 12px', textAlign: 'center' }}>Received (GRN)</th>
                                                <th style={{ padding: '10px 12px', textAlign: 'center' }}>Billed</th>
                                                <th style={{ padding: '10px 12px', textAlign: 'center' }}>Remaining</th>
                                                <th style={{ padding: '10px 12px', width: '110px' }}>Invoice Qty</th>
                                                <th style={{ padding: '10px 12px', width: '120px' }}>Unit Price</th>
                                                <th style={{ padding: '10px 12px', width: '90px' }}>Tax</th>
                                                <th style={{ padding: '10px 12px', width: '90px' }}>Discount</th>
                                                <th style={{ padding: '10px 12px', textAlign: 'right', width: '120px' }}>Line Total</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {lines.map((line, idx) => {
                                                const lineSubtotal = (line.invoiced_quantity * line.invoiced_price) - (Number(line.discount_amount) || 0) + (Number(line.tax_amount) || 0);
                                                const hasOverbillWarning = line.invoiced_quantity > line.remaining_billable_quantity;
                                                const hasPriceVariance = line.invoiced_price !== line.unit_price;

                                                return (
                                                    <tr
                                                        key={line.po_line_id || idx}
                                                        style={{
                                                            borderBottom: '1px solid rgba(51, 65, 85, 0.5)',
                                                            backgroundColor: line.selected ? 'rgba(59, 130, 246, 0.04)' : 'transparent',
                                                            opacity: line.selected ? 1 : 0.6
                                                        }}
                                                    >
                                                        <td style={{ padding: '10px 12px' }}>
                                                            <input
                                                                type="checkbox"
                                                                checked={line.selected}
                                                                onChange={(e) => handleLineChange(idx, 'selected', e.target.checked)}
                                                            />
                                                        </td>
                                                        <td style={{ padding: '10px 12px' }}>
                                                            <div style={{ fontWeight: 600, color: '#f1f5f9' }}>{line.item_name || 'Line Item'}</div>
                                                            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{line.item_code}</div>
                                                            {hasOverbillWarning && (
                                                                <span style={{ fontSize: '0.7rem', color: '#fbbf24', display: 'block', marginTop: '2px' }}>
                                                                    ⚠️ Exceeds received ({line.accepted_quantity - line.billed_quantity} available)
                                                                </span>
                                                            )}
                                                            {hasPriceVariance && (
                                                                <span style={{ fontSize: '0.7rem', color: '#60a5fa', display: 'block', marginTop: '2px' }}>
                                                                    ℹ️ Rate differs from PO ({line.unit_price})
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td style={{ padding: '10px 12px', textAlign: 'center', color: '#94a3b8' }}>
                                                            {line.ordered_quantity}
                                                        </td>
                                                        <td style={{ padding: '10px 12px', textAlign: 'center', color: '#10b981', fontWeight: 500 }}>
                                                            {line.accepted_quantity}
                                                        </td>
                                                        <td style={{ padding: '10px 12px', textAlign: 'center', color: '#94a3b8' }}>
                                                            {line.billed_quantity}
                                                        </td>
                                                        <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, color: line.remaining_billable_quantity > 0 ? '#38bdf8' : '#64748b' }}>
                                                            {line.remaining_billable_quantity}
                                                        </td>
                                                        <td style={{ padding: '6px 8px' }}>
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                step="1"
                                                                disabled={!line.selected}
                                                                value={line.invoiced_quantity}
                                                                onChange={(e) => handleLineChange(idx, 'invoiced_quantity', parseFloat(e.target.value) || 0)}
                                                                style={{
                                                                    width: '100%',
                                                                    padding: '6px 8px',
                                                                    borderRadius: '4px',
                                                                    backgroundColor: 'var(--color-surface-elevated, #0f172a)',
                                                                    border: hasOverbillWarning ? '1px solid #fbbf24' : '1px solid var(--color-border, #334155)',
                                                                    color: '#f8fafc',
                                                                    fontSize: '0.85rem'
                                                                }}
                                                            />
                                                        </td>
                                                        <td style={{ padding: '6px 8px' }}>
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                step="0.01"
                                                                disabled={!line.selected}
                                                                value={line.invoiced_price}
                                                                onChange={(e) => handleLineChange(idx, 'invoiced_price', parseFloat(e.target.value) || 0)}
                                                                style={{
                                                                    width: '100%',
                                                                    padding: '6px 8px',
                                                                    borderRadius: '4px',
                                                                    backgroundColor: 'var(--color-surface-elevated, #0f172a)',
                                                                    border: hasPriceVariance ? '1px solid #60a5fa' : '1px solid var(--color-border, #334155)',
                                                                    color: '#f8fafc',
                                                                    fontSize: '0.85rem'
                                                                }}
                                                            />
                                                        </td>
                                                        <td style={{ padding: '6px 8px' }}>
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                step="0.01"
                                                                disabled={!line.selected}
                                                                value={line.tax_amount}
                                                                onChange={(e) => handleLineChange(idx, 'tax_amount', parseFloat(e.target.value) || 0)}
                                                                style={{
                                                                    width: '100%',
                                                                    padding: '6px 8px',
                                                                    borderRadius: '4px',
                                                                    backgroundColor: 'var(--color-surface-elevated, #0f172a)',
                                                                    border: '1px solid var(--color-border, #334155)',
                                                                    color: '#f8fafc',
                                                                    fontSize: '0.85rem'
                                                                }}
                                                            />
                                                        </td>
                                                        <td style={{ padding: '6px 8px' }}>
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                step="0.01"
                                                                disabled={!line.selected}
                                                                value={line.discount_amount}
                                                                onChange={(e) => handleLineChange(idx, 'discount_amount', parseFloat(e.target.value) || 0)}
                                                                style={{
                                                                    width: '100%',
                                                                    padding: '6px 8px',
                                                                    borderRadius: '4px',
                                                                    backgroundColor: 'var(--color-surface-elevated, #0f172a)',
                                                                    border: '1px solid var(--color-border, #334155)',
                                                                    color: '#f8fafc',
                                                                    fontSize: '0.85rem'
                                                                }}
                                                            />
                                                        </td>
                                                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: '#f8fafc' }}>
                                                            {purchaseOrder.currency || 'PKR'} {lineSubtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        {/* Summary & Notes Section */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '20px', alignItems: 'flex-start' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
                                    Bill Notes & Internal Remarks
                                </label>
                                <textarea
                                    rows={3}
                                    placeholder="Optional notes regarding payment terms, tax exemptions, or delivery references..."
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '8px 12px',
                                        borderRadius: '6px',
                                        backgroundColor: 'var(--color-surface-elevated, #0f172a)',
                                        border: '1px solid var(--color-border, #334155)',
                                        color: '#f8fafc',
                                        fontSize: '0.875rem',
                                        resize: 'vertical'
                                    }}
                                />
                            </div>

                            <div style={{
                                backgroundColor: 'rgba(15, 23, 42, 0.6)',
                                padding: '16px',
                                borderRadius: '8px',
                                border: '1px solid var(--color-border, #334155)',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '8px'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#94a3b8' }}>
                                    <span>Subtotal:</span>
                                    <span>{purchaseOrder.currency || 'PKR'} {subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#94a3b8' }}>
                                    <span>Discount:</span>
                                    <span style={{ color: '#10b981' }}>- {purchaseOrder.currency || 'PKR'} {totalDiscount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#94a3b8' }}>
                                    <span>Tax:</span>
                                    <span>+ {purchaseOrder.currency || 'PKR'} {totalTax.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#94a3b8' }}>
                                    <span>Freight:</span>
                                    <span>+ {purchaseOrder.currency || 'PKR'} {(Number(freightAmount) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                </div>
                                <div style={{
                                    borderTop: '1px solid var(--color-border, #334155)',
                                    paddingTop: '8px',
                                    marginTop: '4px',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    fontSize: '1.05rem',
                                    fontWeight: 700,
                                    color: '#38bdf8'
                                }}>
                                    <span>Grand Total:</span>
                                    <span>{purchaseOrder.currency || 'PKR'} {grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Footer Actions */}
                    <div style={{
                        padding: '16px 24px',
                        borderTop: '1px solid var(--color-border, #334155)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-end',
                        gap: '12px',
                        backgroundColor: 'rgba(15, 23, 42, 0.4)'
                    }}>
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={loading}
                            style={{
                                padding: '8px 16px',
                                borderRadius: '6px',
                                border: '1px solid var(--color-border, #334155)',
                                backgroundColor: 'transparent',
                                color: '#94a3b8',
                                fontSize: '0.875rem',
                                fontWeight: 500,
                                cursor: 'pointer'
                            }}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading || selectedLines.length === 0}
                            style={{
                                padding: '8px 20px',
                                borderRadius: '6px',
                                border: 'none',
                                backgroundColor: 'var(--color-primary, #3b82f6)',
                                color: '#ffffff',
                                fontSize: '0.875rem',
                                fontWeight: 600,
                                cursor: loading || selectedLines.length === 0 ? 'not-allowed' : 'pointer',
                                opacity: loading || selectedLines.length === 0 ? 0.6 : 1,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                            }}
                        >
                            {loading ? (
                                <>
                                    <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⏳</span>
                                    <span>Generating Bill & 3-Way Matching...</span>
                                </>
                            ) : (
                                <>
                                    <span>⚡</span>
                                    <span>Create Bill & Run 3-Way Match</span>
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
