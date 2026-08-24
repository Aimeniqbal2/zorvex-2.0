import React, { useState, useEffect } from 'react';
import { purchasingApi } from '../../api';
import { Button } from '../../../../components/ui/Button';
import type { ProcurementDocument } from '../../types';

interface Props {
    poId: number;
    onClose: () => void;
    onSuccess: () => void;
    warehouses: any[];
}

export const GoodsReceiptEditor: React.FC<Props> = ({ poId, onClose, onSuccess, warehouses }) => {
    const [documentDate, setDocumentDate] = useState(new Date().toISOString().split('T')[0]);
    const [warehouse, setWarehouse] = useState('');
    const [referenceNumber, setReferenceNumber] = useState('');
    const [notes, setNotes] = useState('');
    const [lines, setLines] = useState<any[]>([]);
    const [errorMsg, setErrorMsg] = useState('');
    const [loading, setLoading] = useState(false);
    const [po, setPo] = useState<ProcurementDocument | null>(null);

    useEffect(() => {
        const fetchPo = async () => {
            try {
                const doc = await purchasingApi.getDocument(poId);
                setPo(doc);
                if (doc.warehouse) setWarehouse(doc.warehouse.toString());
                if (doc.lines) {
                    setLines(doc.lines.map((l: any) => ({
                        po_line_id: l.id,
                        item: l.item,
                        item_name: l.item_name || l.item_sku,
                        ordered: parseFloat(l.quantity),
                        received: parseFloat(l.received_quantity || 0),
                        receiving_now: 0,
                        serial_numbers: ''
                    })));
                }
            } catch (err) {
                setErrorMsg("Failed to load PO.");
            }
        };
        fetchPo();
    }, [poId]);

    const updateLine = (id: number, field: string, value: any) => {
        setLines(lines.map(l => l.po_line_id === id ? { ...l, [field]: value } : l));
    };

    const handleCreateReceipt = async (postImmediately = false) => {
        setErrorMsg('');
        if (!warehouse) { setErrorMsg("Warehouse is required."); return; }
        
        const payloadLines = lines.filter(l => l.receiving_now > 0).map(l => ({
            po_line_id: l.po_line_id,
            quantity: l.receiving_now,
            serial_numbers: l.serial_numbers ? l.serial_numbers.split(',').map((s: string) => s.trim()).filter(Boolean) : []
        }));

        if (payloadLines.length === 0) {
            setErrorMsg("At least one line must have a receiving quantity > 0.");
            return;
        }

        setLoading(true);
        try {
            const payload = {
                warehouse: warehouse,
                document_date: documentDate,
                reference_number: referenceNumber,
                notes: notes,
                lines: payloadLines
            };
            
            // This is the new action added in R-3
            const grn = await purchasingApi.postAction(poId, 'receive_goods', payload);
            
            if (postImmediately) {
                await purchasingApi.postAction(grn.id, 'post_grn');
                alert(`Goods Receipt posted and inventory updated!`);
            } else {
                alert(`Goods Receipt saved as draft.`);
            }
            onSuccess();
        } catch (err: any) {
            setErrorMsg(err.response?.data?.detail || JSON.stringify(err.response?.data) || 'Failed to receive goods.');
        } finally {
            setLoading(false);
        }
    };

    if (!po) return <div>Loading...</div>;

    return (
        <div style={{ backgroundColor: 'var(--color-surface)', padding: '24px', borderRadius: '8px', width: '900px', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ marginTop: 0, marginBottom: '24px', borderBottom: '1px solid var(--color-border)', paddingBottom: '12px' }}>Receive Goods for {po.number}</h2>
            {errorMsg && <div style={{ backgroundColor: '#fee2e2', color: '#b91c1c', padding: '12px', borderRadius: '4px', marginBottom: '16px' }}>{errorMsg}</div>}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 600 }}>Receipt Date *</label>
                    <input type="date" required value={documentDate} onChange={e => setDocumentDate(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid var(--color-border)', borderRadius: '4px' }} />
                </div>
                <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 600 }}>Warehouse *</label>
                    <select value={warehouse} required onChange={e => setWarehouse(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid var(--color-border)', borderRadius: '4px' }}>
                        <option value="">-- Select Warehouse --</option>
                        {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                </div>
                <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 600 }}>Delivery / Challan Ref</label>
                    <input type="text" value={referenceNumber} onChange={e => setReferenceNumber(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid var(--color-border)', borderRadius: '4px' }} />
                </div>
                <div style={{ gridColumn: 'span 3' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 600 }}>Notes</label>
                    <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid var(--color-border)', borderRadius: '4px' }} />
                </div>
            </div>

            <div>
                <h4 style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '8px', marginBottom: '16px' }}>Lines to Receive</h4>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', marginBottom: '16px' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                            <th style={{ padding: '8px' }}>Item</th>
                            <th style={{ padding: '8px' }}>Ordered</th>
                            <th style={{ padding: '8px' }}>Received</th>
                            <th style={{ padding: '8px' }}>Remaining</th>
                            <th style={{ padding: '8px', width: '120px' }}>Receiving Now</th>
                        </tr>
                    </thead>
                    <tbody>
                        {lines.map((line) => {
                            const remaining = line.ordered - line.received;
                            return (
                                <tr key={line.po_line_id} style={{ borderBottom: '1px solid #eee' }}>
                                    <td style={{ padding: '8px' }}>
                                        {line.item_name}
                                        <div style={{ marginTop: '8px' }}>
                                            <input 
                                                type="text" 
                                                placeholder="Serial Numbers (comma separated) if required" 
                                                value={line.serial_numbers}
                                                onChange={e => updateLine(line.po_line_id, 'serial_numbers', e.target.value)}
                                                style={{ width: '100%', padding: '4px', fontSize: '0.8rem', border: '1px solid var(--color-border)', borderRadius: '4px' }}
                                                disabled={remaining <= 0}
                                            />
                                        </div>
                                    </td>
                                    <td style={{ padding: '8px' }}>{line.ordered}</td>
                                    <td style={{ padding: '8px' }}>{line.received}</td>
                                    <td style={{ padding: '8px', color: remaining > 0 ? 'inherit' : 'gray' }}>{remaining}</td>
                                    <td style={{ padding: '8px' }}>
                                        <input 
                                            type="number" 
                                            min="0" 
                                            max={remaining}
                                            step="0.01" 
                                            value={line.receiving_now} 
                                            onChange={e => updateLine(line.po_line_id, 'receiving_now', parseFloat(e.target.value) || 0)} 
                                            style={{ width: '100%', padding: '6px', border: '1px solid var(--color-border)', borderRadius: '4px' }} 
                                            disabled={remaining <= 0}
                                        />
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px', borderTop: '1px solid var(--color-border)', paddingTop: '16px' }}>
                <Button variant="ghost" onClick={onClose} disabled={loading}>Cancel</Button>
                <Button variant="secondary" onClick={() => handleCreateReceipt(false)} disabled={loading}>Save Draft GRN</Button>
                <Button variant="primary" onClick={() => handleCreateReceipt(true)} disabled={loading}>Post GRN & Update Inventory</Button>
            </div>
        </div>
    );
};
