import React, { useState, useEffect } from 'react';
import { Button } from '../../../../components/ui/Button';
import { Card } from '../../../../components/ui/Card';
import { useToastStore } from '../../../../stores/toastStore';
import {
    getVendors,
    getGoodsReceipts,
    getReturnableGrnLines,
    getWarehouses,
    createPurchaseReturn,
    type Vendor,
    type GoodsReceipt,
    type PurchaseReturnReason,
    type PurchaseReturn,
    type Warehouse
} from '../api';

interface ReturnLineDraft {
    grn_line_id: string;
    item_id: string;
    item_name: string;
    item_sku: string;
    unit_of_measure: string;
    track_serial_number: boolean;
    received_qty: number;
    previously_returned_qty: number;
    returnable_qty: number;
    return_quantity: number;
    unit_cost: number;
    line_total: number;
    reason: string;
    is_rejected_at_grn: boolean;
    available_serials: string[];
    selected_serials: string[];
    notes: string;
}

interface PurchaseReturnModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: (returnObj: PurchaseReturn) => void;
    initialVendorId?: string;
    initialGRNId?: string;
    initialPOId?: string;
    initialInvoiceId?: string;
}

export const PurchaseReturnModal: React.FC<PurchaseReturnModalProps> = ({
    isOpen,
    onClose,
    onSuccess,
    initialVendorId,
    initialGRNId,
    initialPOId,
    initialInvoiceId
}) => {
    const [vendors, setVendors] = useState<Vendor[]>([]);
    const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
    const [grns, setGrns] = useState<GoodsReceipt[]>([]);

    const [selectedVendorId, setSelectedVendorId] = useState<string>(initialVendorId || '');
    const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
    const [selectedGRNId, setSelectedGRNId] = useState<string>(initialGRNId || '');
    const [returnDate, setReturnDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [reason, setReason] = useState<PurchaseReturnReason>('DEFECTIVE');
    const [notes, setNotes] = useState<string>('');
    const [autoApprove, setAutoApprove] = useState<boolean>(false);

    const [lines, setLines] = useState<ReturnLineDraft[]>([]);
    const [loadingLines, setLoadingLines] = useState<boolean>(false);
    const [submitting, setSubmitting] = useState<boolean>(false);

    useEffect(() => {
        if (isOpen) {
            loadInitialData();
        }
    }, [isOpen]);

    useEffect(() => {
        if (selectedVendorId) {
            loadVendorGRNs(selectedVendorId);
        } else {
            setGrns([]);
        }
    }, [selectedVendorId]);

    useEffect(() => {
        if (selectedGRNId) {
            loadGRNLines(selectedGRNId);
        } else {
            setLines([]);
        }
    }, [selectedGRNId]);

    const loadInitialData = async () => {
        try {
            const [vendorsData, whData] = await Promise.all([
                getVendors(),
                getWarehouses()
            ]);
            setVendors(vendorsData);
            setWarehouses(whData);

            if (whData.length > 0 && !selectedWarehouseId) {
                setSelectedWarehouseId(whData[0].id);
            }
            if (initialVendorId) {
                setSelectedVendorId(initialVendorId);
            }
        } catch (err) {
            console.error('Failed to load initial return form data:', err);
            useToastStore.getState().error('Failed to initialize return form.');
        }
    };

    const loadVendorGRNs = async (vendorId: string) => {
        try {
            const grnData = await getGoodsReceipts({
                vendor: vendorId,
                status: 'POSTED'
            });
            setGrns(grnData);
            if (initialGRNId) {
                setSelectedGRNId(initialGRNId);
            }
        } catch (err) {
            console.error('Failed to load vendor GRNs:', err);
        }
    };

    const loadGRNLines = async (grnId: string) => {
        try {
            setLoadingLines(true);
            const returnableLines = await getReturnableGrnLines(grnId);
            const draftLines: ReturnLineDraft[] = returnableLines.map(rl => ({
                grn_line_id: rl.grn_line_id,
                item_id: rl.item_id,
                item_name: rl.item_name,
                item_sku: rl.item_sku,
                unit_of_measure: rl.unit_of_measure,
                track_serial_number: rl.track_serial_number,
                received_qty: rl.received_qty,
                previously_returned_qty: rl.already_returned_qty,
                returnable_qty: rl.returnable_qty,
                return_quantity: 0,
                unit_cost: rl.unit_cost,
                line_total: 0,
                reason: 'Defective / Damaged',
                is_rejected_at_grn: false,
                available_serials: rl.available_serials || [],
                selected_serials: [],
                notes: ''
            }));
            setLines(draftLines);

            // Auto-set warehouse if GRN matches
            const grn = grns.find(g => g.id === grnId);
            if (grn && grn.warehouse) {
                setSelectedWarehouseId(grn.warehouse);
            }
        } catch (err) {
            console.error('Failed to load returnable lines:', err);
            useToastStore.getState().error('Failed to load returnable items for this GRN.');
        } finally {
            setLoadingLines(false);
        }
    };

    const handleQuantityChange = (index: number, val: number) => {
        const updated = [...lines];
        const line = updated[index];
        const qty = Math.max(0, Math.min(val, line.returnable_qty));
        line.return_quantity = qty;
        line.line_total = Number((qty * line.unit_cost).toFixed(2));
        setLines(updated);
    };

    const handleSerialToggle = (index: number, serial: string) => {
        const updated = [...lines];
        const line = updated[index];
        if (line.selected_serials.includes(serial)) {
            line.selected_serials = line.selected_serials.filter(s => s !== serial);
        } else {
            line.selected_serials = [...line.selected_serials, serial];
        }
        line.return_quantity = line.selected_serials.length;
        line.line_total = Number((line.return_quantity * line.unit_cost).toFixed(2));
        setLines(updated);
    };

    const handleLineReasonChange = (index: number, val: string) => {
        const updated = [...lines];
        updated[index].reason = val;
        setLines(updated);
    };

    const handleRejectedAtGrnToggle = (index: number, checked: boolean) => {
        const updated = [...lines];
        updated[index].is_rejected_at_grn = checked;
        setLines(updated);
    };

    const totalReturnAmount = lines.reduce((acc, l) => acc + (l.return_quantity * l.unit_cost), 0);
    const activeLinesCount = lines.filter(l => l.return_quantity > 0).length;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedVendorId) {
            useToastStore.getState().error('Please select a vendor.');
            return;
        }
        if (!selectedWarehouseId) {
            useToastStore.getState().error('Please select a warehouse.');
            return;
        }
        const activeLines = lines.filter(l => l.return_quantity > 0);
        if (activeLines.length === 0) {
            useToastStore.getState().error('Please enter a return quantity for at least one item.');
            return;
        }

        // Validate serials for serialized items
        for (const line of activeLines) {
            if (line.track_serial_number) {
                if (line.selected_serials.length !== line.return_quantity) {
                    useToastStore.getState().error(
                        `Item ${line.item_name} is serial-tracked: please select exactly ${line.return_quantity} serial numbers (currently selected: ${line.selected_serials.length}).`
                    );
                    return;
                }
            }
        }

        try {
            setSubmitting(true);
            const payload = {
                vendor: selectedVendorId,
                warehouse: selectedWarehouseId,
                return_date: returnDate,
                reason,
                purchase_order: initialPOId || undefined,
                goods_receipt: selectedGRNId || undefined,
                vendor_invoice: initialInvoiceId || undefined,
                notes,
                auto_approve: autoApprove,
                lines: activeLines.map(l => ({
                    grn_line_id: l.grn_line_id,
                    item_id: l.item_id,
                    return_quantity: l.return_quantity,
                    unit_cost: l.unit_cost,
                    reason: l.reason,
                    serial_numbers: l.selected_serials,
                    is_rejected_at_grn: l.is_rejected_at_grn,
                    notes: l.notes
                }))
            };

            const ret = await createPurchaseReturn(payload);
            useToastStore.getState().success(`Purchase Return ${ret.return_number} created successfully.`);
            onSuccess(ret);
            onClose();
        } catch (err: any) {
            console.error('Failed to create purchase return:', err);
            const msg = err.response?.data?.detail || 'Failed to create purchase return.';
            useToastStore.getState().error(msg);
        } finally {
            setSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1.5rem'
        }}>
            <Card style={{
                width: '100%',
                maxWidth: '960px',
                maxHeight: '90vh',
                display: 'flex',
                flexDirection: 'column',
                backgroundColor: 'var(--color-surface, #1e293b)',
                border: '1px solid var(--color-border, rgba(255, 255, 255, 0.1))',
                borderRadius: '16px',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                overflow: 'hidden'
            }}>
                {/* Modal Header */}
                <div style={{
                    padding: '1.5rem',
                    borderBottom: '1px solid var(--color-border, rgba(255, 255, 255, 0.1))',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, rgba(220, 38, 38, 0.02) 100%)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
                        <div style={{
                            width: '42px',
                            height: '42px',
                            borderRadius: '10px',
                            background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#fff',
                            fontWeight: 'bold',
                            fontSize: '1.25rem',
                            boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)'
                        }}>
                            ↩
                        </div>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text, #f8fafc)' }}>
                                Initiate Purchase Return
                            </h2>
                            <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-text-muted, #94a3b8)' }}>
                                Return defective, damaged or excess goods & reverse inventory liability
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--color-text-muted, #94a3b8)',
                            fontSize: '1.5rem',
                            cursor: 'pointer',
                            padding: '0.25rem 0.5rem',
                            lineHeight: 1
                        }}
                    >
                        ×
                    </button>
                </div>

                {/* Modal Body */}
                <form onSubmit={handleSubmit} style={{ overflowY: 'auto', flex: 1, padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    {/* Header Details Grid */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                        gap: '1rem',
                        background: 'rgba(0,0,0,0.2)',
                        padding: '1.25rem',
                        borderRadius: '12px',
                        border: '1px solid rgba(255,255,255,0.05)'
                    }}>
                        {/* Vendor Selector */}
                        <div>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted, #94a3b8)', marginBottom: '0.375rem', textTransform: 'uppercase' }}>
                                Vendor *
                            </label>
                            <select
                                value={selectedVendorId}
                                onChange={(e) => setSelectedVendorId(e.target.value)}
                                required
                                disabled={Boolean(initialVendorId)}
                                style={{
                                    width: '100%',
                                    padding: '0.625rem 0.75rem',
                                    borderRadius: '8px',
                                    backgroundColor: 'var(--color-surface-hover, #0f172a)',
                                    border: '1px solid var(--color-border, rgba(255, 255, 255, 0.15))',
                                    color: 'var(--color-text, #f8fafc)',
                                    fontSize: '0.875rem'
                                }}
                            >
                                <option value="">Select Vendor...</option>
                                {vendors.map(v => (
                                    <option key={v.id} value={v.id}>{v.name} ({v.code})</option>
                                ))}
                            </select>
                        </div>

                        {/* GRN Reference */}
                        <div>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted, #94a3b8)', marginBottom: '0.375rem', textTransform: 'uppercase' }}>
                                Goods Receipt Note (GRN) *
                            </label>
                            <select
                                value={selectedGRNId}
                                onChange={(e) => setSelectedGRNId(e.target.value)}
                                required
                                disabled={Boolean(initialGRNId)}
                                style={{
                                    width: '100%',
                                    padding: '0.625rem 0.75rem',
                                    borderRadius: '8px',
                                    backgroundColor: 'var(--color-surface-hover, #0f172a)',
                                    border: '1px solid var(--color-border, rgba(255, 255, 255, 0.15))',
                                    color: 'var(--color-text, #f8fafc)',
                                    fontSize: '0.875rem'
                                }}
                            >
                                <option value="">Select GRN...</option>
                                {grns.map(g => (
                                    <option key={g.id} value={g.id}>
                                        {g.number} ({g.document_date}) - Ref: {g.reference_number || 'None'}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Warehouse */}
                        <div>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted, #94a3b8)', marginBottom: '0.375rem', textTransform: 'uppercase' }}>
                                Return From Warehouse *
                            </label>
                            <select
                                value={selectedWarehouseId}
                                onChange={(e) => setSelectedWarehouseId(e.target.value)}
                                required
                                style={{
                                    width: '100%',
                                    padding: '0.625rem 0.75rem',
                                    borderRadius: '8px',
                                    backgroundColor: 'var(--color-surface-hover, #0f172a)',
                                    border: '1px solid var(--color-border, rgba(255, 255, 255, 0.15))',
                                    color: 'var(--color-text, #f8fafc)',
                                    fontSize: '0.875rem'
                                }}
                            >
                                <option value="">Select Warehouse...</option>
                                {warehouses.map(w => (
                                    <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
                                ))}
                            </select>
                        </div>

                        {/* Return Date */}
                        <div>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted, #94a3b8)', marginBottom: '0.375rem', textTransform: 'uppercase' }}>
                                Return Date *
                            </label>
                            <input
                                type="date"
                                value={returnDate}
                                onChange={(e) => setReturnDate(e.target.value)}
                                required
                                style={{
                                    width: '100%',
                                    padding: '0.625rem 0.75rem',
                                    borderRadius: '8px',
                                    backgroundColor: 'var(--color-surface-hover, #0f172a)',
                                    border: '1px solid var(--color-border, rgba(255, 255, 255, 0.15))',
                                    color: 'var(--color-text, #f8fafc)',
                                    fontSize: '0.875rem'
                                }}
                            />
                        </div>

                        {/* Reason */}
                        <div>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted, #94a3b8)', marginBottom: '0.375rem', textTransform: 'uppercase' }}>
                                Return Reason *
                            </label>
                            <select
                                value={reason}
                                onChange={(e) => setReason(e.target.value as PurchaseReturnReason)}
                                required
                                style={{
                                    width: '100%',
                                    padding: '0.625rem 0.75rem',
                                    borderRadius: '8px',
                                    backgroundColor: 'var(--color-surface-hover, #0f172a)',
                                    border: '1px solid var(--color-border, rgba(255, 255, 255, 0.15))',
                                    color: 'var(--color-text, #f8fafc)',
                                    fontSize: '0.875rem'
                                }}
                            >
                                <option value="DEFECTIVE">Defective Goods</option>
                                <option value="DAMAGED">Damaged in Transit</option>
                                <option value="WRONG_ITEM">Wrong Item Shipped</option>
                                <option value="EXCESS_QUANTITY">Excess / Over-delivery</option>
                                <option value="QUALITY_REJECTED">Quality Inspection Failed</option>
                                <option value="WARRANTY_RETURN">Warranty Return</option>
                                <option value="OTHER">Other Reason</option>
                            </select>
                        </div>
                    </div>

                    {/* Return Line Items Section */}
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--color-text, #f8fafc)' }}>
                                Return Line Items {lines.length > 0 && `(${activeLinesCount} of ${lines.length} items to return)`}
                            </h3>
                            <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted, #94a3b8)' }}>
                                Enter return quantities up to available returnable balances
                            </span>
                        </div>

                        {loadingLines ? (
                            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted, #94a3b8)' }}>
                                Loading returnable items from GRN...
                            </div>
                        ) : lines.length === 0 ? (
                            <div style={{
                                padding: '2rem',
                                textAlign: 'center',
                                background: 'rgba(0,0,0,0.15)',
                                borderRadius: '10px',
                                border: '1px dashed rgba(255,255,255,0.1)',
                                color: 'var(--color-text-muted, #94a3b8)',
                                fontSize: '0.875rem'
                            }}>
                                {selectedGRNId ? 'No returnable stock found on this GRN.' : 'Select a Goods Receipt (GRN) above to load line items.'}
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {lines.map((line, idx) => (
                                    <div
                                        key={line.grn_line_id}
                                        style={{
                                            padding: '1rem',
                                            borderRadius: '10px',
                                            backgroundColor: line.return_quantity > 0 ? 'rgba(239, 68, 68, 0.05)' : 'rgba(0,0,0,0.2)',
                                            border: `1px solid ${line.return_quantity > 0 ? 'rgba(239, 68, 68, 0.3)' : 'rgba(255, 255, 255, 0.08)'}`,
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '0.75rem'
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                                            <div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    <span style={{ fontWeight: 600, color: 'var(--color-text, #f8fafc)', fontSize: '0.9375rem' }}>
                                                        {line.item_name}
                                                    </span>
                                                    <span style={{ fontSize: '0.75rem', padding: '0.125rem 0.375rem', borderRadius: '4px', background: 'rgba(255,255,255,0.1)', color: '#94a3b8' }}>
                                                        SKU: {line.item_sku}
                                                    </span>
                                                    {line.track_serial_number && (
                                                        <span style={{ fontSize: '0.6875rem', padding: '0.125rem 0.375rem', borderRadius: '4px', background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
                                                            SERIAL TRACKED
                                                        </span>
                                                    )}
                                                </div>
                                                <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted, #94a3b8)', marginTop: '0.25rem' }}>
                                                    Received: {line.received_qty} | Prev Returned: {line.previously_returned_qty} | <strong style={{ color: '#38bdf8' }}>Max Returnable: {line.returnable_qty} {line.unit_of_measure}</strong>
                                                </div>
                                            </div>

                                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                {/* Return Qty Input */}
                                                <div>
                                                    <label style={{ display: 'block', fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-text-muted, #94a3b8)', marginBottom: '0.25rem', textTransform: 'uppercase' }}>
                                                        Return Qty
                                                    </label>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        max={line.returnable_qty}
                                                        step="any"
                                                        value={line.return_quantity || ''}
                                                        onChange={(e) => handleQuantityChange(idx, parseFloat(e.target.value) || 0)}
                                                        disabled={line.track_serial_number}
                                                        placeholder="0"
                                                        style={{
                                                            width: '100px',
                                                            padding: '0.5rem 0.625rem',
                                                            borderRadius: '6px',
                                                            backgroundColor: 'var(--color-surface, #0f172a)',
                                                            border: '1px solid var(--color-border, rgba(255, 255, 255, 0.2))',
                                                            color: '#fff',
                                                            fontWeight: 600,
                                                            textAlign: 'right'
                                                        }}
                                                    />
                                                </div>

                                                {/* Unit Cost */}
                                                <div>
                                                    <label style={{ display: 'block', fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-text-muted, #94a3b8)', marginBottom: '0.25rem', textTransform: 'uppercase' }}>
                                                        Unit Cost
                                                    </label>
                                                    <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text, #f8fafc)', padding: '0.5rem 0' }}>
                                                        {Number(line.unit_cost).toLocaleString()}
                                                    </div>
                                                </div>

                                                {/* Line Total */}
                                                <div>
                                                    <label style={{ display: 'block', fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-text-muted, #94a3b8)', marginBottom: '0.25rem', textTransform: 'uppercase' }}>
                                                        Return Value
                                                    </label>
                                                    <div style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#f87171', padding: '0.5rem 0' }}>
                                                        {Number(line.line_total).toLocaleString()}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Line Reason & Rejected at GRN Flag */}
                                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap', paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                                            <div style={{ flex: 1, minWidth: '200px' }}>
                                                <input
                                                    type="text"
                                                    value={line.reason}
                                                    onChange={(e) => handleLineReasonChange(idx, e.target.value)}
                                                    placeholder="Defect or return reason notes..."
                                                    style={{
                                                        width: '100%',
                                                        padding: '0.4375rem 0.625rem',
                                                        borderRadius: '6px',
                                                        backgroundColor: 'var(--color-surface, #0f172a)',
                                                        border: '1px solid rgba(255,255,255,0.1)',
                                                        color: 'var(--color-text, #f8fafc)',
                                                        fontSize: '0.8125rem'
                                                    }}
                                                />
                                            </div>

                                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.75rem', color: '#94a3b8', cursor: 'pointer' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={line.is_rejected_at_grn}
                                                    onChange={(e) => handleRejectedAtGrnToggle(idx, e.target.checked)}
                                                />
                                                <span>Item was rejected at receipt (Non-stock credit note only)</span>
                                            </label>
                                        </div>

                                        {/* Serial Numbers Selection (if serial-tracked) */}
                                        {line.track_serial_number && line.available_serials.length > 0 && (
                                            <div style={{
                                                padding: '0.75rem',
                                                borderRadius: '6px',
                                                backgroundColor: 'rgba(59, 130, 246, 0.05)',
                                                border: '1px solid rgba(59, 130, 246, 0.15)'
                                            }}>
                                                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#93c5fd', marginBottom: '0.375rem' }}>
                                                    Select In-Stock Serials to Return ({line.selected_serials.length} selected):
                                                </div>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                                    {line.available_serials.map(sn => {
                                                        const isSelected = line.selected_serials.includes(sn);
                                                        return (
                                                            <button
                                                                key={sn}
                                                                type="button"
                                                                onClick={() => handleSerialToggle(idx, sn)}
                                                                style={{
                                                                    padding: '0.25rem 0.625rem',
                                                                    borderRadius: '4px',
                                                                    fontSize: '0.75rem',
                                                                    fontWeight: 600,
                                                                    border: `1px solid ${isSelected ? '#3b82f6' : 'rgba(255,255,255,0.15)'}`,
                                                                    background: isSelected ? 'rgba(59, 130, 246, 0.25)' : 'transparent',
                                                                    color: isSelected ? '#fff' : '#94a3b8',
                                                                    cursor: 'pointer'
                                                                }}
                                                            >
                                                                {isSelected ? '✓ ' : ''}{sn}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Return Notes & Summary */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '1.25rem', alignItems: 'start' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted, #94a3b8)', marginBottom: '0.375rem', textTransform: 'uppercase' }}>
                                Return Notes / Vendor Instructions
                            </label>
                            <textarea
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                rows={3}
                                placeholder="Describe why goods are being returned, courier details, or return authorization numbers..."
                                style={{
                                    width: '100%',
                                    padding: '0.625rem 0.75rem',
                                    borderRadius: '8px',
                                    backgroundColor: 'var(--color-surface-hover, #0f172a)',
                                    border: '1px solid var(--color-border, rgba(255, 255, 255, 0.15))',
                                    color: 'var(--color-text, #f8fafc)',
                                    fontSize: '0.875rem',
                                    resize: 'vertical'
                                }}
                            />
                        </div>

                        <div style={{
                            padding: '1.25rem',
                            borderRadius: '12px',
                            background: 'rgba(239, 68, 68, 0.08)',
                            border: '1px solid rgba(239, 68, 68, 0.2)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.5rem'
                        }}>
                            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted, #94a3b8)', textTransform: 'uppercase' }}>
                                Total Return Credit Value
                            </div>
                            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#f87171' }}>
                                {Number(totalReturnAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                                Will generate a Vendor Credit Note offsetting AP payable upon posting.
                            </div>
                        </div>
                    </div>

                    {/* Modal Footer */}
                    <div style={{
                        marginTop: '0.5rem',
                        paddingTop: '1rem',
                        borderTop: '1px solid var(--color-border, rgba(255, 255, 255, 0.1))',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                    }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', color: '#94a3b8', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={autoApprove}
                                onChange={(e) => setAutoApprove(e.target.checked)}
                            />
                            <span>Auto-approve return voucher on save</span>
                        </label>

                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                            <Button
                                type="button"
                                variant="secondary"
                                onClick={onClose}
                                disabled={submitting}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                variant="primary"
                                disabled={submitting || activeLinesCount === 0}
                                style={{
                                    background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                                    border: 'none',
                                    fontWeight: 600
                                }}
                            >
                                {submitting ? 'Creating Return...' : `Create Purchase Return (${activeLinesCount} items)`}
                            </Button>
                        </div>
                    </div>
                </form>
            </Card>
        </div>
    );
};
