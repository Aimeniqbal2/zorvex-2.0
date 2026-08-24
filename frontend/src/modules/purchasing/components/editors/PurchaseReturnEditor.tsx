import React, { useState, useEffect } from 'react';
import { purchasingApi } from '../../api';
import { Button } from '../../../../components/ui/Button';
import type { ProcurementDocument } from '../../types';

interface Props {
    grnOrPoId: number;
    onClose: () => void;
    onSuccess: () => void;
    warehouses: any[];
}

export const PurchaseReturnEditor: React.FC<Props> = ({ grnOrPoId, onClose, onSuccess, warehouses }) => {
    const [documentDate, setDocumentDate] = useState(new Date().toISOString().split('T')[0]);
    const [warehouse, setWarehouse] = useState('');
    const [referenceNumber, setReferenceNumber] = useState('');
    const [notes, setNotes] = useState('');
    const [lines, setLines] = useState<any[]>([]);
    const [errorMsg, setErrorMsg] = useState('');
    const [loading, setLoading] = useState(false);
    const [sourceDoc, setSourceDoc] = useState<ProcurementDocument | null>(null);

    useEffect(() => {
        const fetchDoc = async () => {
            try {
                const doc = await purchasingApi.getDocument(grnOrPoId);
                setSourceDoc(doc);
                if (doc.warehouse) setWarehouse(doc.warehouse.toString());
                if (doc.lines) {
                    setLines(doc.lines.map((l: any) => ({
                        po_line_id: l.id,
                        item: l.item,
                        item_name: l.item_name || l.item_sku,
                        received: parseFloat(l.received_quantity || l.quantity), // fallback to quantity if GRN
                        returned: parseFloat(l.returned_quantity || 0),
                        returning_now: 0,
                        serial_numbers: ''
                    })));
                }
            } catch (err) {
                setErrorMsg("Failed to load source document.");
            }
        };
        fetchDoc();
    }, [grnOrPoId]);

    const updateLine = (id: number, field: string, value: any) => {
        setLines(lines.map(l => l.po_line_id === id ? { ...l, [field]: value } : l));
    };

    const handleSubmit = async () => {
        setErrorMsg('');
        if (!warehouse) { setErrorMsg("Warehouse is required."); return; }
        
        const payloadLines = lines.filter(l => l.returning_now > 0).map(l => ({
            po_line_id: l.po_line_id,
            quantity: l.returning_now,
            serial_numbers: l.serial_numbers ? l.serial_numbers.split(',').map((s: string) => s.trim()).filter(Boolean) : []
        }));

        if (payloadLines.length === 0) {
            setErrorMsg("At least one line must have a returning quantity > 0.");
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
            
            // Depends if we attach return to PO or GRN. R-3 says `purchase_return` runs on PO.
            let targetId = grnOrPoId;
            if (sourceDoc?.document_type === 'GOODS_RECEIPT' && sourceDoc.parent_document) {
                targetId = sourceDoc.parent_document; // Redirect to PO
            }
            
            await purchasingApi.postAction(targetId, 'purchase_return', payload);
            
            alert(`Purchase Return posted successfully! Inventory updated.`);
            onSuccess();
        } catch (err: any) {
            setErrorMsg(err.response?.data?.detail || JSON.stringify(err.response?.data) || 'Failed to process return.');
        } finally {
            setLoading(false);
        }
    };

    if (!sourceDoc) return <div>Loading...</div>;

    return (
        <div style={{ backgroundColor: 'var(--color-surface)', padding: '24px', borderRadius: '8px', width: '900px', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ marginTop: 0, marginBottom: '24px', borderBottom: '1px solid var(--color-border)', paddingBottom: '12px' }}>Purchase Return against {sourceDoc.number}</h2>
            {errorMsg && <div style={{ backgroundColor: '#fee2e2', color: '#b91c1c', padding: '12px', borderRadius: '4px', marginBottom: '16px' }}>{errorMsg}</div>}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 600 }}>Return Date *</label>
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
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 600 }}>RMA / Reference</label>
                    <input type="text" value={referenceNumber} onChange={e => setReferenceNumber(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid var(--color-border)', borderRadius: '4px' }} />
                </div>
                <div style={{ gridColumn: 'span 3' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 600 }}>Reason / Notes</label>
                    <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid var(--color-border)', borderRadius: '4px' }} />
                </div>
            </div>

            <div>
                <h4 style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '8px', marginBottom: '16px' }}>Lines to Return</h4>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', marginBottom: '16px' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                            <th style={{ padding: '8px' }}>Item</th>
                            <th style={{ padding: '8px' }}>Received Total</th>
                            <th style={{ padding: '8px' }}>Already Returned</th>
                            <th style={{ padding: '8px' }}>Available Return</th>
                            <th style={{ padding: '8px', width: '120px' }}>Returning Now</th>
                        </tr>
                    </thead>
                    <tbody>
                        {lines.map((line) => {
                            const available = line.received - line.returned;
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
                                                disabled={available <= 0}
                                            />
                                        </div>
                                    </td>
                                    <td style={{ padding: '8px' }}>{line.received}</td>
                                    <td style={{ padding: '8px' }}>{line.returned}</td>
                                    <td style={{ padding: '8px', color: available > 0 ? 'inherit' : 'gray' }}>{available}</td>
                                    <td style={{ padding: '8px' }}>
                                        <input 
                                            type="number" 
                                            min="0" 
                                            max={available}
                                            step="0.01" 
                                            value={line.returning_now} 
                                            onChange={e => updateLine(line.po_line_id, 'returning_now', parseFloat(e.target.value) || 0)} 
                                            style={{ width: '100%', padding: '6px', border: '1px solid var(--color-border)', borderRadius: '4px' }} 
                                            disabled={available <= 0}
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
                <Button variant="danger" onClick={handleSubmit} disabled={loading}>Post Purchase Return</Button>
            </div>
        </div>
    );
};
