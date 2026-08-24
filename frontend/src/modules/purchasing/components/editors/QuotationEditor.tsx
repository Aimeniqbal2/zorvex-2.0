import React, { useState } from 'react';
import { purchasingApi } from '../../api';
import { Button } from '../../../../components/ui/Button';
import type { ProcurementDocument } from '../../types';

interface Props {
    onClose: () => void;
    onSuccess: () => void;
    items: any[];
    suppliers: any[];
    documents: ProcurementDocument[];
}

export const QuotationEditor: React.FC<Props> = ({ onClose, onSuccess, items, suppliers, documents }) => {
    const [documentDate, setDocumentDate] = useState(new Date().toISOString().split('T')[0]);
    const [expectedDate, setExpectedDate] = useState('');
    const [parentDocument, setParentDocument] = useState('');
    const [supplier, setSupplier] = useState('');
    const [notes, setNotes] = useState('');
    const [currency, setCurrency] = useState('USD');
    const [lines, setLines] = useState<any[]>([{ id: Date.now().toString(), item: '', quantity: 1, unit_price: 0 }]);
    const [errorMsg, setErrorMsg] = useState('');
    const [loading, setLoading] = useState(false);

    const sourceDocs = documents.filter(d => d.document_type === 'RFQ');

    const handleParentChange = async (docId: string) => {
        setParentDocument(docId);
        if (!docId) return;
        try {
            const doc = await purchasingApi.getDocument(parseInt(docId));
            if (doc.lines) {
                setLines(doc.lines.map((l: any) => ({
                    id: Math.random().toString(),
                    item: l.item,
                    quantity: l.quantity,
                    unit_price: 0
                })));
            }
        } catch (e) {
            console.error("Failed to fetch RFQ lines", e);
        }
    };

    const handleAddLine = () => setLines([...lines, { id: Date.now().toString(), item: '', quantity: 1, unit_price: 0 }]);
    const handleRemoveLine = (id: string) => setLines(lines.filter(l => l.id !== id));
    const updateLine = (id: string, field: string, value: any) => setLines(lines.map(l => l.id === id ? { ...l, [field]: value } : l));

    const subtotal = lines.reduce((sum, l) => sum + ((parseFloat(l.quantity) || 0) * (parseFloat(l.unit_price) || 0)), 0);

    const handleSubmit = async (submitApproval = false) => {
        setErrorMsg('');
        if (!supplier) { setErrorMsg("Supplier is required for a quotation."); return; }
        if (lines.length === 0) { setErrorMsg("At least one item is required."); return; }
        for (const l of lines) { if (!l.item) { setErrorMsg("Item is required for all lines."); return; } }
        
        setLoading(true);
        try {
            const payload: any = {
                document_type: 'QUOTATION',
                document_date: documentDate,
                expected_delivery_date: expectedDate || null,
                parent_document: parentDocument || null,
                crm_entity: supplier,
                notes: notes,
                currency: currency || 'USD',
                lines: lines.map(l => ({
                    item: l.item,
                    quantity: l.quantity,
                    unit_price: l.unit_price,
                    total_amount: (l.quantity * l.unit_price)
                }))
            };
            
            const doc = await purchasingApi.createDocument(payload);
            
            if (submitApproval) {
                await purchasingApi.postAction(doc.id, 'submit');
                alert(`Quotation submitted/approved!`);
            } else {
                alert(`Quotation logged as draft.`);
            }
            onSuccess();
        } catch (err: any) {
            setErrorMsg(err.response?.data?.detail || JSON.stringify(err.response?.data) || 'Failed to record quotation.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ backgroundColor: 'var(--color-surface)', padding: '24px', borderRadius: '8px', width: '1000px', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ marginTop: 0, marginBottom: '24px', borderBottom: '1px solid var(--color-border)', paddingBottom: '12px' }}>Record Vendor Quotation</h2>
            {errorMsg && <div style={{ backgroundColor: '#fee2e2', color: '#b91c1c', padding: '12px', borderRadius: '4px', marginBottom: '16px' }}>{errorMsg}</div>}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 600 }}>Supplier *</label>
                    <select value={supplier} required onChange={e => setSupplier(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid var(--color-border)', borderRadius: '4px' }}>
                        <option value="">-- Select Supplier --</option>
                        {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                </div>
                <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 600 }}>Source RFQ</label>
                    <select value={parentDocument} onChange={e => handleParentChange(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid var(--color-border)', borderRadius: '4px' }}>
                        <option value="">-- No Source --</option>
                        {sourceDocs.map(d => <option key={d.id} value={d.id}>{d.number}</option>)}
                    </select>
                </div>
                <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 600 }}>Currency</label>
                    <input type="text" value={currency} onChange={e => setCurrency(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid var(--color-border)', borderRadius: '4px' }} />
                </div>
                <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 600 }}>Quote Date *</label>
                    <input type="date" required value={documentDate} onChange={e => setDocumentDate(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid var(--color-border)', borderRadius: '4px' }} />
                </div>
                <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 600 }}>Valid Until</label>
                    <input type="date" value={expectedDate} onChange={e => setExpectedDate(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid var(--color-border)', borderRadius: '4px' }} />
                </div>
                <div style={{ gridColumn: 'span 3' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 600 }}>Notes / Terms / Lead Time</label>
                    <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid var(--color-border)', borderRadius: '4px' }} />
                </div>
            </div>

            <div>
                <h4 style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '8px', marginBottom: '16px' }}>Quoted Items</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 1fr 1fr 40px', gap: '8px', fontWeight: 600, fontSize: '0.85rem', marginBottom: '8px' }}>
                    <div>Item</div><div>Qty</div><div>Unit Price</div><div>Total</div><div></div>
                </div>
                {lines.map((line) => (
                    <div key={line.id} style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 1fr 1fr 40px', gap: '8px', marginBottom: '8px' }}>
                        <select value={line.item} onChange={e => updateLine(line.id, 'item', e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid var(--color-border)', borderRadius: '4px' }} required>
                            <option value="">Select Item</option>
                            {items.map(item => <option key={item.id} value={item.id}>{item.sku} - {item.name}</option>)}
                        </select>
                        <input type="number" min="0.01" step="0.01" value={line.quantity} onChange={e => updateLine(line.id, 'quantity', e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid var(--color-border)', borderRadius: '4px' }} />
                        <input type="number" min="0" step="0.01" value={line.unit_price} onChange={e => updateLine(line.id, 'unit_price', e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid var(--color-border)', borderRadius: '4px' }} />
                        <div style={{ padding: '6px', backgroundColor: 'var(--color-background)', borderRadius: '4px', textAlign: 'right' }}>
                            {((parseFloat(line.quantity) || 0) * (parseFloat(line.unit_price) || 0)).toFixed(2)}
                        </div>
                        <Button variant="danger" type="button" onClick={() => handleRemoveLine(line.id)} disabled={lines.length <= 1}>✕</Button>
                    </div>
                ))}
                <div style={{ marginTop: '16px' }}>
                    <Button variant="ghost" type="button" onClick={handleAddLine}>+ Add Line</Button>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '16px', backgroundColor: 'var(--color-background)', borderRadius: '4px', marginTop: '16px' }}>
                    <div style={{ fontWeight: 600, fontSize: '1.1rem' }}>Quote Total: {subtotal.toFixed(2)}</div>
                </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px', borderTop: '1px solid var(--color-border)', paddingTop: '16px' }}>
                <Button variant="ghost" onClick={onClose} disabled={loading}>Cancel</Button>
                <Button variant="secondary" onClick={() => handleSubmit(false)} disabled={loading}>Save Draft</Button>
                <Button variant="primary" onClick={() => handleSubmit(true)} disabled={loading}>Submit / Accept</Button>
            </div>
        </div>
    );
};
