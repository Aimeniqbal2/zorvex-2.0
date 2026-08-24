import React, { useState } from 'react';
import { purchasingApi } from '../../api';
import { Button } from '../../../../components/ui/Button';

interface Props {
    onClose: () => void;
    onSuccess: () => void;
    items: any[];
    warehouses: any[];
}

export const PurchaseRequestEditor: React.FC<Props> = ({ onClose, onSuccess, items, warehouses }) => {
    const [documentDate, setDocumentDate] = useState(new Date().toISOString().split('T')[0]);
    const [expectedDate, setExpectedDate] = useState('');
    const [warehouse, setWarehouse] = useState('');
    const [notes, setNotes] = useState('');
    const [lines, setLines] = useState<any[]>([{ id: Date.now().toString(), item: '', quantity: 1 }]);
    const [errorMsg, setErrorMsg] = useState('');
    const [loading, setLoading] = useState(false);

    const handleAddLine = () => setLines([...lines, { id: Date.now().toString(), item: '', quantity: 1 }]);
    const handleRemoveLine = (id: string) => setLines(lines.filter(l => l.id !== id));
    const updateLine = (id: string, field: string, value: any) => setLines(lines.map(l => l.id === id ? { ...l, [field]: value } : l));

    const handleSubmit = async (submitApproval = false) => {
        setErrorMsg('');
        if (lines.length === 0) {
            setErrorMsg("At least one item is required.");
            return;
        }
        for (const l of lines) {
            if (!l.item) {
                setErrorMsg("Item is required for all lines.");
                return;
            }
        }
        
        setLoading(true);
        try {
            const payload: any = {
                document_type: 'PURCHASE_REQUEST',
                document_date: documentDate,
                expected_delivery_date: expectedDate || null,
                warehouse: warehouse || null,
                notes: notes,
                currency: 'USD',
                lines: lines.map(l => ({
                    item: l.item,
                    quantity: l.quantity,
                    unit_price: 0,
                    total_amount: 0
                }))
            };
            
            const doc = await purchasingApi.createDocument(payload);
            
            if (submitApproval) {
                await purchasingApi.postAction(doc.id, 'submit');
                alert(`Purchase Request submitted for approval!`);
            } else {
                alert(`Purchase Request saved as draft.`);
            }
            onSuccess();
        } catch (err: any) {
            setErrorMsg(err.response?.data?.detail || JSON.stringify(err.response?.data) || 'Failed to create PR.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ backgroundColor: 'var(--color-surface)', padding: '24px', borderRadius: '8px', width: '900px', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ marginTop: 0, marginBottom: '24px', borderBottom: '1px solid var(--color-border)', paddingBottom: '12px' }}>Create Purchase Request</h2>
            
            {errorMsg && <div style={{ backgroundColor: '#fee2e2', color: '#b91c1c', padding: '12px', borderRadius: '4px', marginBottom: '16px' }}>{errorMsg}</div>}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 600 }}>Request Date *</label>
                    <input type="date" required value={documentDate} onChange={e => setDocumentDate(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid var(--color-border)', borderRadius: '4px' }} />
                </div>
                <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 600 }}>Required Date</label>
                    <input type="date" value={expectedDate} onChange={e => setExpectedDate(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid var(--color-border)', borderRadius: '4px' }} />
                </div>
                <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 600 }}>Requested Warehouse</label>
                    <select value={warehouse} onChange={e => setWarehouse(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid var(--color-border)', borderRadius: '4px' }}>
                        <option value="">-- Select Warehouse --</option>
                        {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                </div>
                <div style={{ gridColumn: 'span 3' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 600 }}>Notes / Justification</label>
                    <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid var(--color-border)', borderRadius: '4px' }} />
                </div>
            </div>

            <div>
                <h4 style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '8px', marginBottom: '16px' }}>Requested Items</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 40px', gap: '8px', fontWeight: 600, fontSize: '0.85rem', marginBottom: '8px' }}>
                    <div>Item</div><div>Quantity</div><div></div>
                </div>
                {lines.map((line) => (
                    <div key={line.id} style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 40px', gap: '8px', marginBottom: '8px' }}>
                        <select value={line.item} onChange={e => updateLine(line.id, 'item', e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid var(--color-border)', borderRadius: '4px' }} required>
                            <option value="">Select Item</option>
                            {items.map(item => <option key={item.id} value={item.id}>{item.sku} - {item.name}</option>)}
                        </select>
                        <input type="number" min="0.01" step="0.01" value={line.quantity} onChange={e => updateLine(line.id, 'quantity', e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid var(--color-border)', borderRadius: '4px' }} />
                        <Button variant="danger" type="button" onClick={() => handleRemoveLine(line.id)} disabled={lines.length <= 1}>✕</Button>
                    </div>
                ))}
                <div style={{ marginTop: '16px' }}>
                    <Button variant="ghost" type="button" onClick={handleAddLine}>+ Add Item</Button>
                </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px', borderTop: '1px solid var(--color-border)', paddingTop: '16px' }}>
                <Button variant="ghost" onClick={onClose} disabled={loading}>Cancel</Button>
                <Button variant="secondary" onClick={() => handleSubmit(false)} disabled={loading}>Save Draft</Button>
                <Button variant="primary" onClick={() => handleSubmit(true)} disabled={loading}>Submit for Approval</Button>
            </div>
        </div>
    );
};
