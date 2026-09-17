import React, { useState, useEffect } from 'react';
import { Button } from '../../../../components/ui/Button';
import { useToastStore } from '../../../../stores/toastStore';
import {
    getVendors,
    getAccountsPayableList,
    createVendorPayment,
    type Vendor
} from '../api';

interface VendorPaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    onPaymentCreated: () => void;
    defaultVendorId?: string;
    defaultInvoiceId?: string;
}

interface AllocationRow {
    invoice_id: string;
    invoice_number: string;
    vendor_invoice_number: string;
    parent_document_number: string;
    due_date: string | null;
    currency: string;
    total_amount: number;
    paid_amount: number;
    outstanding_amount: number;
    allocated_amount: number;
    notes: string;
}

export const VendorPaymentModal: React.FC<VendorPaymentModalProps> = ({
    isOpen,
    onClose,
    onPaymentCreated,
    defaultVendorId,
    defaultInvoiceId
}) => {
    const [vendors, setVendors] = useState<Vendor[]>([]);
    const [selectedVendorId, setSelectedVendorId] = useState<string>(defaultVendorId || '');
    const [payableInvoices, setPayableInvoices] = useState<AllocationRow[]>([]);
    const [loadingInvoices, setLoadingInvoices] = useState(false);

    // Form fields
    const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [paymentMethod, setPaymentMethod] = useState<'BANK_TRANSFER' | 'CASH' | 'CHEQUE' | 'ONLINE_TRANSFER' | 'OTHER'>('BANK_TRANSFER');
    const [bankCashAccount, setBankCashAccount] = useState<string>('HBL Corporate Operations Account');
    const [referenceNumber, setReferenceNumber] = useState<string>('');
    const [chequeNumber, setChequeNumber] = useState<string>('');
    const [chequeDate, setChequeDate] = useState<string>('');
    const [totalAmount, setTotalAmount] = useState<string>('');
    const [notes, setNotes] = useState<string>('');
    const [autoPost, setAutoPost] = useState<boolean>(true);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (isOpen) {
            loadVendors();
            if (defaultVendorId) {
                setSelectedVendorId(defaultVendorId);
            }
        }
    }, [isOpen, defaultVendorId]);

    useEffect(() => {
        if (selectedVendorId) {
            loadVendorPayables(selectedVendorId);
        } else {
            setPayableInvoices([]);
        }
    }, [selectedVendorId]);

    const loadVendors = async () => {
        try {
            const data = await getVendors({ status: 'ACTIVE' });
            setVendors(data);
        } catch (err) {
            console.error('Failed to load vendors:', err);
        }
    };

    const loadVendorPayables = async (vendorId: string) => {
        try {
            setLoadingInvoices(true);
            const payables = await getAccountsPayableList({ vendor: vendorId });
            
            // Only keep unpaid or partially paid bills
            const rows: AllocationRow[] = payables
                .filter(p => Number(p.outstanding_amount) > 0)
                .map(p => {
                    const isDefault = defaultInvoiceId === p.invoice_id;
                    const outstanding = Number(p.outstanding_amount);
                    return {
                        invoice_id: p.invoice_id,
                        invoice_number: p.invoice_number,
                        vendor_invoice_number: p.vendor_invoice_number,
                        parent_document_number: p.parent_document_number || 'N/A',
                        due_date: p.due_date,
                        currency: p.currency || 'PKR',
                        total_amount: Number(p.total_amount),
                        paid_amount: Number(p.paid_amount),
                        outstanding_amount: outstanding,
                        allocated_amount: isDefault ? outstanding : 0,
                        notes: ''
                    };
                });

            setPayableInvoices(rows);

            // If default invoice was specified, prefill total amount
            if (defaultInvoiceId) {
                const defaultItem = rows.find(r => r.invoice_id === defaultInvoiceId);
                if (defaultItem) {
                    setTotalAmount(defaultItem.outstanding_amount.toFixed(2));
                }
            }
        } catch (err) {
            console.error('Failed to load vendor payables:', err);
            useToastStore.getState().error('Failed to load unpaid vendor invoices.');
        } finally {
            setLoadingInvoices(false);
        }
    };

    const handleAllocationChange = (invoiceId: string, value: string) => {
        const numVal = parseFloat(value) || 0;
        setPayableInvoices(prev => prev.map(inv => {
            if (inv.invoice_id === invoiceId) {
                return { ...inv, allocated_amount: Math.max(0, numVal) };
            }
            return inv;
        }));
    };

    const handleAllocateFull = (invoiceId: string) => {
        setPayableInvoices(prev => prev.map(inv => {
            if (inv.invoice_id === invoiceId) {
                return { ...inv, allocated_amount: inv.outstanding_amount };
            }
            return inv;
        }));
    };

    const handleClearAllocation = (invoiceId: string) => {
        setPayableInvoices(prev => prev.map(inv => {
            if (inv.invoice_id === invoiceId) {
                return { ...inv, allocated_amount: 0 };
            }
            return inv;
        }));
    };

    const handleSyncTotalWithAllocations = () => {
        const sum = payableInvoices.reduce((acc, row) => acc + (row.allocated_amount || 0), 0);
        setTotalAmount(sum.toFixed(2));
    };

    const totalAllocated = payableInvoices.reduce((acc, row) => acc + (row.allocated_amount || 0), 0);
    const parsedTotalAmount = parseFloat(totalAmount) || 0;
    const unallocatedAmount = Math.max(0, parsedTotalAmount - totalAllocated);

    // Validation checks
    const hasOverAllocation = payableInvoices.some(inv => inv.allocated_amount > inv.outstanding_amount + 0.001);
    const exceedsPaymentAmount = totalAllocated > parsedTotalAmount + 0.001;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!selectedVendorId) {
            useToastStore.getState().error('Please select a vendor.');
            return;
        }

        if (parsedTotalAmount <= 0) {
            useToastStore.getState().error('Payment amount must be greater than 0.');
            return;
        }

        if (hasOverAllocation) {
            useToastStore.getState().error('One or more allocations exceed the invoice outstanding balance.');
            return;
        }

        if (exceedsPaymentAmount) {
            useToastStore.getState().error('Total allocations exceed the overall payment amount.');
            return;
        }

        try {
            setSubmitting(true);

            const allocationsPayload = payableInvoices
                .filter(inv => inv.allocated_amount > 0)
                .map(inv => ({
                    invoice_id: inv.invoice_id,
                    amount: inv.allocated_amount,
                    notes: inv.notes
                }));

            await createVendorPayment({
                vendor: selectedVendorId,
                payment_date: paymentDate,
                amount: parsedTotalAmount,
                payment_method: paymentMethod,
                bank_cash_account: bankCashAccount,
                reference_number: referenceNumber,
                cheque_number: paymentMethod === 'CHEQUE' ? chequeNumber : undefined,
                cheque_date: paymentMethod === 'CHEQUE' && chequeDate ? chequeDate : undefined,
                notes,
                allocations: allocationsPayload,
                auto_post: autoPost
            });

            useToastStore.getState().success(
                autoPost
                    ? 'Payment voucher created and posted to Accounts Payable.'
                    : 'Payment voucher created as DRAFT.'
            );
            onPaymentCreated();
            onClose();
        } catch (err: any) {
            console.error('Failed to create payment:', err);
            const msg = err.response?.data?.detail || err.response?.data?.message || 'Failed to record payment.';
            useToastStore.getState().error(msg);
        } finally {
            setSubmitting(false);
        }
    };

    if (!isOpen) return null;

    const selectedVendor = vendors.find(v => v.id === selectedVendorId);

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
                border: '1px solid var(--color-border, #334155)',
                borderRadius: '14px',
                width: '100%',
                maxWidth: '920px',
                maxHeight: '92vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                overflow: 'hidden'
            }}>
                {/* Modal Header */}
                <div style={{
                    padding: '18px 24px',
                    borderBottom: '1px solid var(--color-border, #334155)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: 'var(--color-surface-secondary, #0f172a)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                            width: '38px',
                            height: '38px',
                            borderRadius: '10px',
                            background: 'rgba(16, 185, 129, 0.15)',
                            border: '1px solid rgba(16, 185, 129, 0.3)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#10b981',
                            fontSize: '20px'
                        }}>
                            <i className='bx bx-credit-card'></i>
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--color-text, #f8fafc)' }}>
                                Record Vendor Payment Voucher
                            </h3>
                            <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'var(--color-text-muted, #94a3b8)' }}>
                                Settle posted vendor bills with multi-invoice allocation and automated AP balance reconciliation.
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--color-text-muted, #94a3b8)',
                            fontSize: '22px',
                            cursor: 'pointer',
                            padding: '4px'
                        }}
                    >
                        <i className='bx bx-x'></i>
                    </button>
                </div>

                {/* Modal Body */}
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1 }}>
                    <div style={{ padding: '20px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px', flex: 1 }}>
                        
                        {/* Section 1: Vendor & Core Details */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
                            {/* Vendor Selector */}
                            <div>
                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '6px' }}>
                                    Vendor / Supplier <span style={{ color: '#ef4444' }}>*</span>
                                </label>
                                {defaultVendorId ? (
                                    <div style={{
                                        padding: '9px 12px',
                                        borderRadius: '8px',
                                        background: 'var(--color-surface-secondary, #0f172a)',
                                        border: '1px solid var(--color-border, #334155)',
                                        fontWeight: 600,
                                        fontSize: '13px',
                                        color: '#38bdf8',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px'
                                    }}>
                                        <i className='bx bx-building'></i>
                                        <span>{selectedVendor?.name || 'Selected Vendor'}</span>
                                        {selectedVendor?.code && (
                                            <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>({selectedVendor.code})</span>
                                        )}
                                    </div>
                                ) : (
                                    <select
                                        value={selectedVendorId}
                                        onChange={(e) => setSelectedVendorId(e.target.value)}
                                        required
                                        style={{
                                            width: '100%',
                                            padding: '9px 12px',
                                            borderRadius: '8px',
                                            background: 'var(--color-surface-secondary, #0f172a)',
                                            border: '1px solid var(--color-border, #334155)',
                                            color: '#f8fafc',
                                            fontSize: '13px'
                                        }}
                                    >
                                        <option value="">-- Select Vendor --</option>
                                        {vendors.map(v => (
                                            <option key={v.id} value={v.id}>
                                                {v.name} ({v.code})
                                            </option>
                                        ))}
                                    </select>
                                )}
                            </div>

                            {/* Payment Date */}
                            <div>
                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '6px' }}>
                                    Disbursement Date <span style={{ color: '#ef4444' }}>*</span>
                                </label>
                                <input
                                    type="date"
                                    value={paymentDate}
                                    onChange={(e) => setPaymentDate(e.target.value)}
                                    required
                                    style={{
                                        width: '100%',
                                        padding: '8px 12px',
                                        borderRadius: '8px',
                                        background: 'var(--color-surface-secondary, #0f172a)',
                                        border: '1px solid var(--color-border, #334155)',
                                        color: '#f8fafc',
                                        fontSize: '13px'
                                    }}
                                />
                            </div>

                            {/* Payment Method */}
                            <div>
                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '6px' }}>
                                    Payment Method <span style={{ color: '#ef4444' }}>*</span>
                                </label>
                                <select
                                    value={paymentMethod}
                                    onChange={(e) => setPaymentMethod(e.target.value as any)}
                                    style={{
                                        width: '100%',
                                        padding: '9px 12px',
                                        borderRadius: '8px',
                                        background: 'var(--color-surface-secondary, #0f172a)',
                                        border: '1px solid var(--color-border, #334155)',
                                        color: '#f8fafc',
                                        fontSize: '13px'
                                    }}
                                >
                                    <option value="BANK_TRANSFER">Bank Transfer (Wire / RTGS)</option>
                                    <option value="ONLINE_TRANSFER">Online Transfer</option>
                                    <option value="CHEQUE">Cheque / Demand Draft</option>
                                    <option value="CASH">Cash Disbursement</option>
                                    <option value="OTHER">Other Settlement</option>
                                </select>
                            </div>

                            {/* Payment Amount */}
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                    <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)' }}>
                                        Total Amount (PKR) <span style={{ color: '#ef4444' }}>*</span>
                                    </label>
                                    {totalAllocated > 0 && totalAllocated !== parsedTotalAmount && (
                                        <button
                                            type="button"
                                            onClick={handleSyncTotalWithAllocations}
                                            style={{
                                                background: 'transparent',
                                                border: 'none',
                                                color: '#38bdf8',
                                                fontSize: '11px',
                                                cursor: 'pointer',
                                                padding: 0,
                                                textDecoration: 'underline'
                                            }}
                                        >
                                            Match Allocations ({totalAllocated.toLocaleString()})
                                        </button>
                                    )}
                                </div>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0.01"
                                    placeholder="0.00"
                                    value={totalAmount}
                                    onChange={(e) => setTotalAmount(e.target.value)}
                                    required
                                    style={{
                                        width: '100%',
                                        padding: '8px 12px',
                                        borderRadius: '8px',
                                        background: 'var(--color-surface-secondary, #0f172a)',
                                        border: `1px solid ${exceedsPaymentAmount ? '#ef4444' : 'var(--color-border, #334155)'}`,
                                        color: '#34d399',
                                        fontSize: '15px',
                                        fontWeight: 700
                                    }}
                                />
                            </div>
                        </div>

                        {/* Section 2: Account & Banking References */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '6px' }}>
                                    Bank / Cash Account
                                </label>
                                <input
                                    type="text"
                                    placeholder="e.g. HBL Corporate Operations"
                                    value={bankCashAccount}
                                    onChange={(e) => setBankCashAccount(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '8px 12px',
                                        borderRadius: '8px',
                                        background: 'var(--color-surface-secondary, #0f172a)',
                                        border: '1px solid var(--color-border, #334155)',
                                        color: '#f8fafc',
                                        fontSize: '13px'
                                    }}
                                />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '6px' }}>
                                    Reference / Txn #
                                </label>
                                <input
                                    type="text"
                                    placeholder="e.g. FT-9081245 / Bank Ref"
                                    value={referenceNumber}
                                    onChange={(e) => setReferenceNumber(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '8px 12px',
                                        borderRadius: '8px',
                                        background: 'var(--color-surface-secondary, #0f172a)',
                                        border: '1px solid var(--color-border, #334155)',
                                        color: '#f8fafc',
                                        fontSize: '13px'
                                    }}
                                />
                            </div>

                            {paymentMethod === 'CHEQUE' && (
                                <>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '6px' }}>
                                            Cheque Number <span style={{ color: '#ef4444' }}>*</span>
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="e.g. CHQ-445890"
                                            value={chequeNumber}
                                            onChange={(e) => setChequeNumber(e.target.value)}
                                            required
                                            style={{
                                                width: '100%',
                                                padding: '8px 12px',
                                                borderRadius: '8px',
                                                background: 'var(--color-surface-secondary, #0f172a)',
                                                border: '1px solid var(--color-border, #334155)',
                                                color: '#f8fafc',
                                                fontSize: '13px'
                                            }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '6px' }}>
                                            Cheque Date
                                        </label>
                                        <input
                                            type="date"
                                            value={chequeDate}
                                            onChange={(e) => setChequeDate(e.target.value)}
                                            style={{
                                                width: '100%',
                                                padding: '8px 12px',
                                                borderRadius: '8px',
                                                background: 'var(--color-surface-secondary, #0f172a)',
                                                border: '1px solid var(--color-border, #334155)',
                                                color: '#f8fafc',
                                                fontSize: '13px'
                                            }}
                                        />
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Section 3: Invoice Allocations Table */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text, #f8fafc)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <i className='bx bx-receipt' style={{ color: 'var(--color-primary)' }}></i>
                                    Invoice Settlements & Allocations
                                </label>
                                <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                                    {payableInvoices.length} posted bill{payableInvoices.length !== 1 ? 's' : ''} available
                                </span>
                            </div>

                            {loadingInvoices ? (
                                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                                    <i className='bx bx-loader-alt bx-spin' style={{ fontSize: '24px', marginBottom: '6px' }}></i>
                                    <div style={{ fontSize: '12px' }}>Loading unpaid invoices...</div>
                                </div>
                            ) : payableInvoices.length === 0 ? (
                                <div style={{
                                    padding: '20px',
                                    borderRadius: '8px',
                                    background: 'rgba(148, 163, 184, 0.05)',
                                    border: '1px dashed var(--color-border, #334155)',
                                    textAlign: 'center',
                                    color: 'var(--color-text-muted)'
                                }}>
                                    <i className='bx bx-check-shield' style={{ fontSize: '28px', color: '#10b981', marginBottom: '6px' }}></i>
                                    <div style={{ fontSize: '13px', fontWeight: 600 }}>No outstanding unpaid invoices for this vendor.</div>
                                    <div style={{ fontSize: '11px', marginTop: '2px' }}>You can still record an unallocated advance payment voucher.</div>
                                </div>
                            ) : (
                                <div style={{
                                    border: '1px solid var(--color-border, #334155)',
                                    borderRadius: '10px',
                                    overflowX: 'auto',
                                    background: 'var(--color-surface-secondary, #0f172a)'
                                }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                                        <thead>
                                            <tr style={{ background: 'rgba(30, 41, 59, 0.6)', borderBottom: '1px solid var(--color-border, #334155)', color: 'var(--color-text-muted)' }}>
                                                <th style={{ padding: '10px 12px' }}>Bill #</th>
                                                <th style={{ padding: '10px 12px' }}>Vendor Inv #</th>
                                                <th style={{ padding: '10px 12px' }}>PO #</th>
                                                <th style={{ padding: '10px 12px' }}>Due Date</th>
                                                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Bill Total</th>
                                                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Already Paid</th>
                                                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Outstanding</th>
                                                <th style={{ padding: '10px 12px', width: '150px' }}>Allocate Now</th>
                                                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Remaining After</th>
                                                <th style={{ padding: '10px 12px', textAlign: 'center' }}>Action</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {payableInvoices.map((inv) => {
                                                const isOverAllocated = inv.allocated_amount > inv.outstanding_amount + 0.001;
                                                const remainingAfter = Math.max(0, inv.outstanding_amount - inv.allocated_amount);
                                                const isSelected = inv.allocated_amount > 0;

                                                return (
                                                    <tr
                                                        key={inv.invoice_id}
                                                        style={{
                                                            borderBottom: '1px solid var(--color-border, #334155)',
                                                            background: isSelected ? 'rgba(56, 189, 248, 0.04)' : 'transparent',
                                                            transition: 'background 0.15s'
                                                        }}
                                                    >
                                                        <td style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--color-primary, #6366f1)' }}>
                                                            {inv.invoice_number}
                                                        </td>
                                                        <td style={{ padding: '10px 12px', color: '#f8fafc' }}>
                                                            {inv.vendor_invoice_number}
                                                        </td>
                                                        <td style={{ padding: '10px 12px', color: 'var(--color-text-muted)' }}>
                                                            {inv.parent_document_number}
                                                        </td>
                                                        <td style={{ padding: '10px 12px', color: 'var(--color-text-muted)' }}>
                                                            {inv.due_date ? new Date(inv.due_date).toLocaleDateString() : 'N/A'}
                                                        </td>
                                                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                                                            {inv.currency} {inv.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                        </td>
                                                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#94a3b8' }}>
                                                            {inv.currency} {inv.paid_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                        </td>
                                                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#f59e0b' }}>
                                                            {inv.currency} {inv.outstanding_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                        </td>
                                                        <td style={{ padding: '6px 12px' }}>
                                                            <input
                                                                type="number"
                                                                step="0.01"
                                                                min="0"
                                                                max={inv.outstanding_amount}
                                                                value={inv.allocated_amount || ''}
                                                                placeholder="0.00"
                                                                onChange={(e) => handleAllocationChange(inv.invoice_id, e.target.value)}
                                                                style={{
                                                                    width: '100%',
                                                                    padding: '6px 8px',
                                                                    borderRadius: '6px',
                                                                    background: 'var(--color-surface, #1e293b)',
                                                                    border: `1px solid ${isOverAllocated ? '#ef4444' : isSelected ? 'var(--color-primary)' : 'var(--color-border, #334155)'}`,
                                                                    color: isOverAllocated ? '#ef4444' : '#38bdf8',
                                                                    fontSize: '13px',
                                                                    fontWeight: 600,
                                                                    textAlign: 'right'
                                                                }}
                                                            />
                                                        </td>
                                                        <td style={{ padding: '10px 12px', textAlign: 'right', color: remainingAfter === 0 ? '#10b981' : 'var(--color-text-muted)', fontWeight: remainingAfter === 0 ? 700 : 400 }}>
                                                            {remainingAfter === 0 ? 'Settled (0.00)' : `${inv.currency} ${remainingAfter.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                                                        </td>
                                                        <td style={{ padding: '6px 12px', textAlign: 'center' }}>
                                                            {inv.allocated_amount > 0 ? (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleClearAllocation(inv.invoice_id)}
                                                                    style={{
                                                                        padding: '4px 8px',
                                                                        borderRadius: '4px',
                                                                        background: 'rgba(239, 68, 68, 0.1)',
                                                                        border: '1px solid rgba(239, 68, 68, 0.2)',
                                                                        color: '#ef4444',
                                                                        fontSize: '11px',
                                                                        cursor: 'pointer'
                                                                    }}
                                                                >
                                                                    Clear
                                                                </button>
                                                            ) : (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleAllocateFull(inv.invoice_id)}
                                                                    style={{
                                                                        padding: '4px 8px',
                                                                        borderRadius: '4px',
                                                                        background: 'rgba(16, 185, 129, 0.1)',
                                                                        border: '1px solid rgba(16, 185, 129, 0.2)',
                                                                        color: '#10b981',
                                                                        fontSize: '11px',
                                                                        cursor: 'pointer',
                                                                        fontWeight: 600
                                                                    }}
                                                                >
                                                                    Pay Full
                                                                </button>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* Allocation Summary Card */}
                            {payableInvoices.length > 0 && (
                                <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    padding: '12px 16px',
                                    borderRadius: '8px',
                                    background: 'var(--color-surface-secondary, #0f172a)',
                                    border: '1px solid var(--color-border, #334155)',
                                    fontSize: '12px',
                                    flexWrap: 'wrap',
                                    gap: '12px'
                                }}>
                                    <div style={{ display: 'flex', gap: '20px' }}>
                                        <div>
                                            <span style={{ color: 'var(--color-text-muted)' }}>Payment Amount: </span>
                                            <strong style={{ color: '#34d399' }}>PKR {parsedTotalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
                                        </div>
                                        <div>
                                            <span style={{ color: 'var(--color-text-muted)' }}>Total Allocated: </span>
                                            <strong style={{ color: '#38bdf8' }}>PKR {totalAllocated.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
                                        </div>
                                        <div>
                                            <span style={{ color: 'var(--color-text-muted)' }}>Unallocated Advance: </span>
                                            <strong style={{ color: unallocatedAmount > 0 ? '#f59e0b' : '#94a3b8' }}>
                                                PKR {unallocatedAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </strong>
                                        </div>
                                    </div>

                                    {hasOverAllocation && (
                                        <div style={{ color: '#ef4444', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <i className='bx bx-error-circle'></i> Allocation exceeds outstanding balance!
                                        </div>
                                    )}

                                    {exceedsPaymentAmount && (
                                        <div style={{ color: '#ef4444', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <i className='bx bx-error-circle'></i> Total allocations exceed Payment Amount!
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Section 4: Notes & Auto-Post Toggle */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '16px', alignItems: 'center' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '6px' }}>
                                    Internal Payment Notes
                                </label>
                                <input
                                    type="text"
                                    placeholder="e.g. Cleared against invoice batch #4 / Approved by Finance VP"
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '8px 12px',
                                        borderRadius: '8px',
                                        background: 'var(--color-surface-secondary, #0f172a)',
                                        border: '1px solid var(--color-border, #334155)',
                                        color: '#f8fafc',
                                        fontSize: '13px'
                                    }}
                                />
                            </div>

                            <div style={{ paddingTop: '18px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: '#f8fafc' }}>
                                    <input
                                        type="checkbox"
                                        checked={autoPost}
                                        onChange={(e) => setAutoPost(e.target.checked)}
                                        style={{ width: '16px', height: '16px', accentColor: 'var(--color-primary, #6366f1)' }}
                                    />
                                    <span>Post immediately to Accounts Payable</span>
                                </label>
                            </div>
                        </div>
                    </div>

                    {/* Modal Footer */}
                    <div style={{
                        padding: '16px 24px',
                        borderTop: '1px solid var(--color-border, #334155)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        background: 'var(--color-surface-secondary, #0f172a)'
                    }}>
                        <Button variant="secondary" type="button" onClick={onClose} disabled={submitting}>
                            Cancel
                        </Button>

                        <div style={{ display: 'flex', gap: '10px' }}>
                            <Button
                                variant="primary"
                                type="submit"
                                disabled={submitting || hasOverAllocation || exceedsPaymentAmount || parsedTotalAmount <= 0}
                            >
                                {submitting ? (
                                    <>
                                        <i className='bx bx-loader-alt bx-spin'></i> Processing...
                                    </>
                                ) : autoPost ? (
                                    <>
                                        <i className='bx bx-check-double'></i> Create & Post Payment
                                    </>
                                ) : (
                                    <>
                                        <i className='bx bx-save'></i> Save as Draft Voucher
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
};
