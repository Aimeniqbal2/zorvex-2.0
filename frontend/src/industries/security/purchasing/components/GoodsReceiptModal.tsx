import React, { useState, useEffect } from 'react';
import {
    type Warehouse, type POReceivingSummary,
    getWarehouses, getPOReceivingSummary, receiveGoods
} from '../api';


interface GoodsReceiptModalProps {
    poId: string;
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

interface ReceivingLineState {
    po_line_id: string;
    item_id: string;
    item_name: string;
    item_code: string;
    unit_of_measure: string;
    ordered_quantity: number;
    previously_received: number;
    remaining_quantity: number;
    unit_price: number;
    track_serial_number: boolean;
    accepted_quantity: number;
    rejected_quantity: number;
    rejection_reason: string;
    serial_numbers_text: string;
    notes: string;
}

export const GoodsReceiptModal: React.FC<GoodsReceiptModalProps> = ({
    poId,
    isOpen,
    onClose,
    onSuccess
}) => {
    const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
    const [summary, setSummary] = useState<POReceivingSummary | null>(null);
    const [warehouseId, setWarehouseId] = useState<string>('');
    const [receiptDate, setReceiptDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [deliveryReference, setDeliveryReference] = useState<string>('');
    const [notes, setNotes] = useState<string>('');
    const [lines, setLines] = useState<ReceivingLineState[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [saving, setSaving] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen || !poId) return;

        const loadData = async () => {
            setLoading(true);
            setError(null);
            try {
                const [whList, sum] = await Promise.all([
                    getWarehouses(),
                    getPOReceivingSummary(poId)
                ]);
                setWarehouses(whList);
                setSummary(sum);

                if (whList.length > 0) {
                    setWarehouseId(whList[0].id);
                }

                // Initialize lines with default full remaining quantity
                const initialLines: ReceivingLineState[] = sum.lines
                    .filter(l => l.remaining_quantity > 0)
                    .map(l => ({
                        po_line_id: l.po_line_id,
                        item_id: l.item_id,
                        item_name: l.item_name,
                        item_code: l.item_code,
                        unit_of_measure: l.unit_of_measure,
                        ordered_quantity: l.ordered_quantity,
                        previously_received: l.previously_received,
                        remaining_quantity: l.remaining_quantity,
                        unit_price: l.unit_price,
                        track_serial_number: l.track_serial_number,
                        accepted_quantity: l.remaining_quantity,
                        rejected_quantity: 0,
                        rejection_reason: '',
                        serial_numbers_text: '',
                        notes: ''
                    }));
                setLines(initialLines);
            } catch (err: any) {
                console.error("Failed to load receiving summary", err);
                setError(err.response?.data?.detail || "Failed to load purchase order receiving details.");
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [isOpen, poId]);

    const handleLineChange = (index: number, field: keyof ReceivingLineState, value: any) => {
        setLines(prev => {
            const next = [...prev];
            next[index] = { ...next[index], [field]: value };
            return next;
        });
    };

    const handleSubmit = async (postNow: boolean) => {
        if (!warehouseId) {
            setError("Please select a destination warehouse.");
            return;
        }

        if (lines.length === 0) {
            setError("No receivable items found.");
            return;
        }

        // Validate quantities and serial numbers
        const payloadLines = [];
        for (let i = 0; i < lines.length; i++) {
            const l = lines[i];
            const accepted = Number(l.accepted_quantity) || 0;
            const rejected = Number(l.rejected_quantity) || 0;
            const total = accepted + rejected;

            if (total <= 0) continue; // Skip lines with 0 received

            if (total > l.remaining_quantity) {
                setError(`Line ${i + 1} (${l.item_name}): Total received (${total}) exceeds remaining quantity (${l.remaining_quantity}). Over-receipt is blocked.`);
                return;
            }

            if (rejected > 0 && !l.rejection_reason.trim()) {
                setError(`Line ${i + 1} (${l.item_name}): Please specify a reason for the ${rejected} rejected unit(s).`);
                return;
            }

            let serials: string[] = [];
            if (l.track_serial_number && accepted > 0) {
                serials = l.serial_numbers_text
                    .split(/[\n,]/)
                    .map(s => s.trim())
                    .filter(Boolean);

                if (serials.length !== accepted) {
                    setError(`Line ${i + 1} (${l.item_name}) requires serial tracking. Expected exactly ${accepted} serial number(s), but found ${serials.length}.`);
                    return;
                }

                const uniqueSerials = new Set(serials);
                if (uniqueSerials.size !== serials.length) {
                    setError(`Line ${i + 1} (${l.item_name}): Duplicate serial numbers detected in the input.`);
                    return;
                }
            }

            payloadLines.push({
                po_line_id: l.po_line_id,
                quantity: total,
                accepted_quantity: accepted,
                rejected_quantity: rejected,
                rejection_reason: l.rejection_reason,
                notes: l.notes,
                serial_numbers: serials
            });
        }

        if (payloadLines.length === 0) {
            setError("Please specify receiving quantity (> 0) for at least one item.");
            return;
        }

        setSaving(true);
        setError(null);

        try {
            await receiveGoods(poId, {
                warehouse: warehouseId,
                document_date: receiptDate,
                reference_number: deliveryReference,
                notes: notes,
                post_now: postNow,
                lines: payloadLines
            });

            onSuccess();
            onClose();
        } catch (err: any) {
            console.error("Failed to process goods receipt", err);
            setError(err.response?.data?.detail || "Failed to process goods receipt.");
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(10, 15, 29, 0.82)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1050,
            padding: '1.5rem'
        }}>
            <div style={{
                backgroundColor: 'var(--color-surface, #1e2238)',
                border: '1px solid var(--color-border, #2d325a)',
                borderRadius: '16px',
                width: '100%',
                maxWidth: '950px',
                maxHeight: '90vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 25px 60px rgba(0,0,0,0.6)',
                overflow: 'hidden'
            }}>
                {/* Header */}
                <div style={{
                    padding: '1.25rem 1.75rem',
                    borderBottom: '1px solid var(--color-border, #2d325a)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: 'rgba(255, 255, 255, 0.02)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{
                            width: '38px',
                            height: '38px',
                            borderRadius: '10px',
                            backgroundColor: 'rgba(16, 185, 129, 0.15)',
                            border: '1px solid rgba(16, 185, 129, 0.3)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#10b981',
                            fontSize: '1.2rem'
                        }}>
                            📥
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 600, color: 'var(--color-text, #ffffff)' }}>
                                Goods Receipt / Material Inward
                            </h3>
                            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary, #94a3b8)', marginTop: '2px' }}>
                                PO: <span style={{ color: '#38bdf8', fontWeight: 600 }}>{summary?.po_number || 'Loading...'}</span> &bull; Vendor: <span style={{ color: '#ffffff' }}>{summary?.vendor_name || 'Loading...'}</span>
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--color-text-secondary, #94a3b8)',
                            cursor: 'pointer',
                            fontSize: '1.25rem',
                            padding: '4px 8px',
                            borderRadius: '6px'
                        }}
                    >
                        &times;
                    </button>
                </div>

                {/* Body */}
                <div style={{ padding: '1.5rem 1.75rem', overflowY: 'auto', flex: 1 }}>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-secondary, #94a3b8)' }}>
                            <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>⏳</div>
                            Loading Purchase Order lines and receiving status...
                        </div>
                    ) : error && lines.length === 0 ? (
                        <div style={{
                            padding: '1rem 1.25rem',
                            backgroundColor: 'rgba(239, 68, 68, 0.1)',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            borderRadius: '8px',
                            color: '#f87171',
                            fontSize: '0.9rem'
                        }}>
                            {error}
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            {error && (
                                <div style={{
                                    padding: '0.85rem 1.25rem',
                                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                                    border: '1px solid rgba(239, 68, 68, 0.3)',
                                    borderRadius: '8px',
                                    color: '#f87171',
                                    fontSize: '0.85rem'
                                }}>
                                    ⚠️ {error}
                                </div>
                            )}

                            {/* Header Form Controls */}
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                                gap: '1rem',
                                padding: '1rem 1.25rem',
                                backgroundColor: 'rgba(255, 255, 255, 0.02)',
                                border: '1px solid var(--color-border, #2d325a)',
                                borderRadius: '10px'
                            }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-text-secondary, #94a3b8)', marginBottom: '4px' }}>
                                        Destination Warehouse *
                                    </label>
                                    <select
                                        value={warehouseId}
                                        onChange={(e) => setWarehouseId(e.target.value)}
                                        style={{
                                            width: '100%',
                                            padding: '8px 12px',
                                            backgroundColor: 'rgba(0, 0, 0, 0.25)',
                                            border: '1px solid var(--color-border, #2d325a)',
                                            borderRadius: '6px',
                                            color: '#ffffff',
                                            fontSize: '0.88rem'
                                        }}
                                    >
                                        {warehouses.map(wh => (
                                            <option key={wh.id} value={wh.id}>
                                                {wh.name} ({wh.code})
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-text-secondary, #94a3b8)', marginBottom: '4px' }}>
                                        Receipt Date *
                                    </label>
                                    <input
                                        type="date"
                                        value={receiptDate}
                                        onChange={(e) => setReceiptDate(e.target.value)}
                                        style={{
                                            width: '100%',
                                            padding: '8px 12px',
                                            backgroundColor: 'rgba(0, 0, 0, 0.25)',
                                            border: '1px solid var(--color-border, #2d325a)',
                                            borderRadius: '6px',
                                            color: '#ffffff',
                                            fontSize: '0.88rem'
                                        }}
                                    />
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-text-secondary, #94a3b8)', marginBottom: '4px' }}>
                                        Delivery Reference / Challan
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="e.g. DC-2026-9081"
                                        value={deliveryReference}
                                        onChange={(e) => setDeliveryReference(e.target.value)}
                                        style={{
                                            width: '100%',
                                            padding: '8px 12px',
                                            backgroundColor: 'rgba(0, 0, 0, 0.25)',
                                            border: '1px solid var(--color-border, #2d325a)',
                                            borderRadius: '6px',
                                            color: '#ffffff',
                                            fontSize: '0.88rem'
                                        }}
                                    />
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-text-secondary, #94a3b8)', marginBottom: '4px' }}>
                                        Receipt Notes
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="Optional inspection notes..."
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                        style={{
                                            width: '100%',
                                            padding: '8px 12px',
                                            backgroundColor: 'rgba(0, 0, 0, 0.25)',
                                            border: '1px solid var(--color-border, #2d325a)',
                                            borderRadius: '6px',
                                            color: '#ffffff',
                                            fontSize: '0.88rem'
                                        }}
                                    />
                                </div>
                            </div>

                            {/* Lines Table */}
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                    <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 600, color: '#ffffff' }}>
                                        Receivable Line Items
                                    </h4>
                                    <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                                        Only accepted quantities will enter usable warehouse stock.
                                    </span>
                                </div>

                                <div style={{
                                    border: '1px solid var(--color-border, #2d325a)',
                                    borderRadius: '10px',
                                    overflow: 'hidden'
                                }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                        <thead>
                                            <tr style={{ backgroundColor: 'rgba(0,0,0,0.3)', borderBottom: '1px solid var(--color-border, #2d325a)' }}>
                                                <th style={{ padding: '10px 14px', textAlign: 'left', color: '#94a3b8', fontWeight: 600 }}>Item & SKU</th>
                                                <th style={{ padding: '10px 14px', textAlign: 'right', color: '#94a3b8', fontWeight: 600 }}>Ordered</th>
                                                <th style={{ padding: '10px 14px', textAlign: 'right', color: '#94a3b8', fontWeight: 600 }}>Prev. Received</th>
                                                <th style={{ padding: '10px 14px', textAlign: 'right', color: '#94a3b8', fontWeight: 600 }}>Remaining</th>
                                                <th style={{ padding: '10px 14px', textAlign: 'center', color: '#10b981', fontWeight: 600, width: '110px' }}>Accepted Qty</th>
                                                <th style={{ padding: '10px 14px', textAlign: 'center', color: '#f87171', fontWeight: 600, width: '100px' }}>Rejected Qty</th>
                                                <th style={{ padding: '10px 14px', textAlign: 'left', color: '#94a3b8', fontWeight: 600 }}>Notes / Reason</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {lines.map((l, idx) => (
                                                <React.Fragment key={l.po_line_id}>
                                                    <tr style={{
                                                        borderBottom: l.track_serial_number ? 'none' : '1px solid rgba(255,255,255,0.05)',
                                                        backgroundColor: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)'
                                                    }}>
                                                        <td style={{ padding: '12px 14px', verticalAlign: 'middle' }}>
                                                            <div style={{ fontWeight: 600, color: '#ffffff' }}>{l.item_name}</div>
                                                            <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                                                                SKU: {l.item_code || 'N/A'} {l.track_serial_number && <span style={{ color: '#38bdf8', marginLeft: '6px', fontWeight: 600 }}>[SERIAL TRACKED]</span>}
                                                            </div>
                                                        </td>
                                                        <td style={{ padding: '12px 14px', textAlign: 'right', color: '#ffffff', fontWeight: 500 }}>
                                                            {l.ordered_quantity} {l.unit_of_measure}
                                                        </td>
                                                        <td style={{ padding: '12px 14px', textAlign: 'right', color: '#94a3b8' }}>
                                                            {l.previously_received}
                                                        </td>
                                                        <td style={{ padding: '12px 14px', textAlign: 'right', color: '#38bdf8', fontWeight: 600 }}>
                                                            {l.remaining_quantity}
                                                        </td>
                                                        <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                max={l.remaining_quantity}
                                                                step="1"
                                                                value={l.accepted_quantity}
                                                                onChange={(e) => handleLineChange(idx, 'accepted_quantity', Math.max(0, parseFloat(e.target.value) || 0))}
                                                                style={{
                                                                    width: '80px',
                                                                    padding: '6px 8px',
                                                                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                                                                    border: '1px solid rgba(16, 185, 129, 0.4)',
                                                                    borderRadius: '6px',
                                                                    color: '#10b981',
                                                                    fontWeight: 600,
                                                                    textAlign: 'center',
                                                                    fontSize: '0.9rem'
                                                                }}
                                                            />
                                                        </td>
                                                        <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                max={l.remaining_quantity - l.accepted_quantity}
                                                                step="1"
                                                                value={l.rejected_quantity}
                                                                onChange={(e) => handleLineChange(idx, 'rejected_quantity', Math.max(0, parseFloat(e.target.value) || 0))}
                                                                style={{
                                                                    width: '70px',
                                                                    padding: '6px 8px',
                                                                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                                                                    border: '1px solid rgba(239, 68, 68, 0.4)',
                                                                    borderRadius: '6px',
                                                                    color: '#f87171',
                                                                    fontWeight: 600,
                                                                    textAlign: 'center',
                                                                    fontSize: '0.9rem'
                                                                }}
                                                            />
                                                        </td>
                                                        <td style={{ padding: '12px 14px' }}>
                                                            <input
                                                                type="text"
                                                                placeholder={l.rejected_quantity > 0 ? "Reason for rejection (required)..." : "Notes..."}
                                                                value={l.rejected_quantity > 0 ? l.rejection_reason : l.notes}
                                                                onChange={(e) => handleLineChange(idx, l.rejected_quantity > 0 ? 'rejection_reason' : 'notes', e.target.value)}
                                                                style={{
                                                                    width: '100%',
                                                                    padding: '6px 10px',
                                                                    backgroundColor: l.rejected_quantity > 0 ? 'rgba(239, 68, 68, 0.08)' : 'rgba(0,0,0,0.2)',
                                                                    border: l.rejected_quantity > 0 ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid var(--color-border, #2d325a)',
                                                                    borderRadius: '6px',
                                                                    color: '#ffffff',
                                                                    fontSize: '0.82rem'
                                                                }}
                                                            />
                                                        </td>
                                                    </tr>

                                                    {/* Serial Number Row if Tracked */}
                                                    {l.track_serial_number && (
                                                        <tr style={{
                                                            borderBottom: '1px solid rgba(255,255,255,0.05)',
                                                            backgroundColor: 'rgba(56, 189, 248, 0.04)'
                                                        }}>
                                                            <td colSpan={7} style={{ padding: '8px 14px 12px 14px' }}>
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                                                                        <span style={{ color: '#38bdf8', fontWeight: 600 }}>
                                                                            Serial Numbers for {l.accepted_quantity} Accepted Unit(s) (comma or newline separated):
                                                                        </span>
                                                                        <span style={{ color: l.serial_numbers_text.split(/[\n,]/).filter(s => s.trim()).length === l.accepted_quantity ? '#10b981' : '#f59e0b' }}>
                                                                            {l.serial_numbers_text.split(/[\n,]/).filter(s => s.trim()).length} of {l.accepted_quantity} entered
                                                                        </span>
                                                                    </div>
                                                                    <textarea
                                                                        rows={2}
                                                                        placeholder="SN-10001, SN-10002, SN-10003..."
                                                                        value={l.serial_numbers_text}
                                                                        onChange={(e) => handleLineChange(idx, 'serial_numbers_text', e.target.value)}
                                                                        style={{
                                                                            width: '100%',
                                                                            padding: '6px 10px',
                                                                            backgroundColor: 'rgba(0,0,0,0.35)',
                                                                            border: '1px solid rgba(56, 189, 248, 0.3)',
                                                                            borderRadius: '6px',
                                                                            color: '#38bdf8',
                                                                            fontSize: '0.82rem',
                                                                            fontFamily: 'monospace'
                                                                        }}
                                                                    />
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    )}
                                                </React.Fragment>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Actions */}
                <div style={{
                    padding: '1.25rem 1.75rem',
                    borderTop: '1px solid var(--color-border, #2d325a)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: 'rgba(255, 255, 255, 0.02)'
                }}>
                    <button
                        onClick={onClose}
                        disabled={saving}
                        style={{
                            padding: '8px 16px',
                            backgroundColor: 'transparent',
                            border: '1px solid var(--color-border, #2d325a)',
                            borderRadius: '8px',
                            color: '#94a3b8',
                            cursor: 'pointer',
                            fontSize: '0.88rem'
                        }}
                    >
                        Cancel
                    </button>

                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                        <button
                            onClick={() => handleSubmit(false)}
                            disabled={saving || loading || lines.length === 0}
                            style={{
                                padding: '8px 18px',
                                backgroundColor: 'rgba(255, 255, 255, 0.06)',
                                border: '1px solid var(--color-border, #2d325a)',
                                borderRadius: '8px',
                                color: '#ffffff',
                                fontWeight: 500,
                                cursor: 'pointer',
                                fontSize: '0.88rem'
                            }}
                        >
                            Save as Draft GRN
                        </button>

                        <button
                            onClick={() => handleSubmit(true)}
                            disabled={saving || loading || lines.length === 0}
                            style={{
                                padding: '8px 20px',
                                backgroundColor: '#10b981',
                                border: 'none',
                                borderRadius: '8px',
                                color: '#ffffff',
                                fontWeight: 600,
                                cursor: 'pointer',
                                fontSize: '0.88rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)'
                            }}
                        >
                            {saving ? 'Processing Intake...' : '📥 Post & Receive to Stock IN'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
