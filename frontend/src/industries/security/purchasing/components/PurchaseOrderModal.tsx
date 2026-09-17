import React, { useState, useEffect } from 'react';
import { Modal } from '../../../../components/ui/Modal';
import { Button } from '../../../../components/ui/Button';
import { Input } from '../../../../components/ui/Input';
import { useToastStore } from '../../../../stores/toastStore';
import { 
    createPurchaseOrder, updatePurchaseOrder, getVendors, getWarehouses, 
    getUniversalInventoryItems, getVendorItems,
    type PurchaseOrder, type PurchaseOrderLine, type Vendor, type Warehouse, type UniversalItem, type VendorItem 
} from '../api';

interface PurchaseOrderModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSaved: (po: PurchaseOrder) => void;
    po?: PurchaseOrder | null;
    defaultVendorId?: string;
}

export const PurchaseOrderModal: React.FC<PurchaseOrderModalProps> = ({
    isOpen,
    onClose,
    onSaved,
    po,
    defaultVendorId
}) => {
    const [vendors, setVendors] = useState<Vendor[]>([]);
    const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
    const [inventoryItems, setInventoryItems] = useState<UniversalItem[]>([]);
    const [vendorCatalogue, setVendorCatalogue] = useState<VendorItem[]>([]);

    // PO Header State
    const [vendorId, setVendorId] = useState('');
    const [warehouseId, setWarehouseId] = useState('');
    const [documentDate, setDocumentDate] = useState(new Date().toISOString().split('T')[0]);
    const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('');
    const [paymentTerms, setPaymentTerms] = useState('Net 30');
    const [currency, setCurrency] = useState('PKR');
    const [notes, setNotes] = useState('');

    // Lines State
    const [lines, setLines] = useState<PurchaseOrderLine[]>([]);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (isOpen) {
            loadLookups();
            if (po) {
                setVendorId(po.vendor || '');
                setWarehouseId(po.warehouse || '');
                setDocumentDate(po.document_date || new Date().toISOString().split('T')[0]);
                setExpectedDeliveryDate(po.expected_delivery_date || '');
                setPaymentTerms(po.payment_terms || 'Net 30');
                setCurrency(po.currency || 'PKR');
                setNotes(po.notes || '');
                setLines(po.lines ? po.lines.map(l => ({ ...l })) : []);
            } else {
                const initVendor = defaultVendorId || '';
                setVendorId(initVendor);
                setWarehouseId('');
                setDocumentDate(new Date().toISOString().split('T')[0]);
                setExpectedDeliveryDate('');
                setPaymentTerms('Net 30');
                setCurrency('PKR');
                setNotes('');
                setLines([
                    {
                        item: '',
                        quantity: 1,
                        unit_price: 0,
                        discount_amount: 0,
                        tax_amount: 0,
                        total_amount: 0,
                        description: '',
                        vendor_sku: ''
                    }
                ]);
            }
        }
    }, [isOpen, po, defaultVendorId]);

    useEffect(() => {
        if (vendorId) {
            loadVendorCatalogue(vendorId);
            const v = vendors.find(vend => vend.id === vendorId);
            if (v && v.payment_terms && !po) {
                setPaymentTerms(v.payment_terms);
            }
        } else {
            setVendorCatalogue([]);
        }
    }, [vendorId, vendors]);

    const loadLookups = async () => {
        try {
            const [vData, wData, iData] = await Promise.all([
                getVendors(),
                getWarehouses(),
                getUniversalInventoryItems()
            ]);
            setVendors(vData || []);
            setWarehouses(wData || []);
            setInventoryItems(iData || []);
            if (wData && wData.length > 0 && !warehouseId && !po) {
                setWarehouseId(wData[0].id);
            }
        } catch {
            // fallback
        }
    };

    const loadVendorCatalogue = async (vId: string) => {
        try {
            const items = await getVendorItems(vId);
            setVendorCatalogue(items || []);
        } catch {
            setVendorCatalogue([]);
        }
    };

    const handleItemSelect = (lineIndex: number, itemId: string) => {
        const itemObj = inventoryItems.find(i => i.id === itemId);
        const mappedVendorItem = vendorCatalogue.find(vi => vi.item === itemId);

        const updated = [...lines];
        const current = updated[lineIndex];

        current.item = itemId;
        current.item_name = itemObj?.name || '';
        current.item_sku = itemObj?.sku || '';
        current.unit_of_measure = itemObj?.unit_of_measure || 'pcs';

        if (mappedVendorItem) {
            current.vendor_item = mappedVendorItem.id;
            current.vendor_sku = mappedVendorItem.vendor_sku || itemObj?.sku || '';
            current.unit_price = Number(mappedVendorItem.vendor_price);
            if (mappedVendorItem.minimum_order_quantity) {
                current.quantity = Math.max(Number(current.quantity) || 1, Number(mappedVendorItem.minimum_order_quantity));
            }
        } else {
            current.vendor_item = null;
            current.vendor_sku = itemObj?.sku || '';
            if (itemObj?.cost_price) {
                current.unit_price = Number(itemObj.cost_price);
            }
        }

        recalculateLine(current);
        setLines(updated);
    };

    const recalculateLine = (line: PurchaseOrderLine) => {
        const qty = parseFloat(String(line.quantity || 0)) || 0;
        const price = parseFloat(String(line.unit_price || 0)) || 0;
        const disc = parseFloat(String(line.discount_amount || 0)) || 0;
        const tax = parseFloat(String(line.tax_amount || 0)) || 0;
        const sub = qty * price;
        line.total_amount = Math.max(0, sub - disc + tax);
    };

    const handleLineChange = (index: number, field: keyof PurchaseOrderLine, value: any) => {
        const updated = [...lines];
        (updated[index] as any)[field] = value;
        recalculateLine(updated[index]);
        setLines(updated);
    };

    const addLine = () => {
        setLines([
            ...lines,
            {
                item: '',
                quantity: 1,
                unit_price: 0,
                discount_amount: 0,
                tax_amount: 0,
                total_amount: 0,
                description: '',
                vendor_sku: ''
            }
        ]);
    };

    const removeLine = (index: number) => {
        if (lines.length <= 1) {
            useToastStore.getState().error('A Purchase Order must contain at least 1 line.');
            return;
        }
        const updated = lines.filter((_, i) => i !== index);
        setLines(updated);
    };

    // Live Totals
    const subtotal = lines.reduce((acc, l) => acc + (parseFloat(String(l.quantity || 0)) * parseFloat(String(l.unit_price || 0))), 0);
    const totalDiscount = lines.reduce((acc, l) => acc + (parseFloat(String(l.discount_amount || 0)) || 0), 0);
    const totalTax = lines.reduce((acc, l) => acc + (parseFloat(String(l.tax_amount || 0)) || 0), 0);
    const grandTotal = Math.max(0, subtotal - totalDiscount + totalTax);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!vendorId) {
            useToastStore.getState().error('Please select a Supplier/Vendor.');
            return;
        }
        if (lines.length === 0 || !lines.some(l => l.item && Number(l.quantity) > 0)) {
            useToastStore.getState().error('Please select inventory items with positive quantities for all lines.');
            return;
        }

        // Check each line has an item
        for (let i = 0; i < lines.length; i++) {
            if (!lines[i].item) {
                useToastStore.getState().error(`Line #${i + 1} has no item selected.`);
                return;
            }
            if (Number(lines[i].quantity) <= 0) {
                useToastStore.getState().error(`Line #${i + 1} must have quantity greater than 0.`);
                return;
            }
        }

        setIsSaving(true);
        try {
            const payload: Partial<PurchaseOrder> = {
                vendor: vendorId,
                warehouse: warehouseId || null,
                document_date: documentDate,
                expected_delivery_date: expectedDeliveryDate || null,
                payment_terms: paymentTerms,
                currency,
                notes: notes.trim(),
                lines: lines.map((l, idx) => ({
                    item: l.item,
                    vendor_item: l.vendor_item || null,
                    vendor_sku: l.vendor_sku || '',
                    description: l.description || '',
                    quantity: parseFloat(String(l.quantity)),
                    unit_price: parseFloat(String(l.unit_price)),
                    discount_amount: parseFloat(String(l.discount_amount || 0)),
                    tax_amount: parseFloat(String(l.tax_amount || 0)),
                    line_number: idx + 1
                }))
            };

            let res: PurchaseOrder;
            if (po) {
                res = await updatePurchaseOrder(po.id, payload);
                useToastStore.getState().success(`Purchase Order ${res.number} updated.`);
            } else {
                res = await createPurchaseOrder(payload);
                useToastStore.getState().success(`Purchase Order ${res.number} created (Draft).`);
            }
            onSaved(res);
            onClose();
        } catch (err: any) {
            useToastStore.getState().error(err?.response?.data?.detail || err?.response?.data?.non_field_errors?.[0] || 'Failed to save Purchase Order.');
        } finally {
            setIsSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <Modal 
            isOpen={isOpen} 
            onClose={onClose} 
            title={po ? `Edit Purchase Order — ${po.number}` : "Create Purchase Order"} 
            size="large"
        >
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '76vh', overflowY: 'auto', paddingRight: '4px' }}>
                
                {/* 1. Header Information */}
                <div style={{ background: 'var(--color-surface-secondary)', padding: '14px 16px', borderRadius: '10px', border: '1px solid var(--color-border)' }}>
                    <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 700, marginBottom: '10px' }}>
                        Supplier & Delivery Details
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: '4px' }}>
                                Vendor / Supplier *
                            </label>
                            <select
                                value={vendorId}
                                onChange={(e) => setVendorId(e.target.value)}
                                disabled={!!po && po.status !== 'DRAFT'}
                                style={{
                                    width: '100%',
                                    padding: '9px 12px',
                                    borderRadius: '8px',
                                    border: '1px solid var(--color-border)',
                                    background: 'var(--color-surface)',
                                    color: 'var(--color-text)',
                                    fontSize: '13px'
                                }}
                                required
                            >
                                <option value="">-- Select Vendor --</option>
                                {vendors.map(v => (
                                    <option key={v.id} value={v.id}>{v.name} ({v.code})</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: '4px' }}>
                                Destination Armory / Warehouse
                            </label>
                            <select
                                value={warehouseId}
                                onChange={(e) => setWarehouseId(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '9px 12px',
                                    borderRadius: '8px',
                                    border: '1px solid var(--color-border)',
                                    background: 'var(--color-surface)',
                                    color: 'var(--color-text)',
                                    fontSize: '13px'
                                }}
                            >
                                <option value="">-- Select Armory / Warehouse --</option>
                                {warehouses.map(w => (
                                    <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
                                ))}
                            </select>
                        </div>

                        <Input
                            label="PO Order Date *"
                            type="date"
                            value={documentDate}
                            onChange={(e) => setDocumentDate(e.target.value)}
                            required
                        />

                        <Input
                            label="Expected Delivery Date"
                            type="date"
                            value={expectedDeliveryDate}
                            onChange={(e) => setExpectedDeliveryDate(e.target.value)}
                        />

                        <div>
                            <label style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: '4px' }}>
                                Payment Terms
                            </label>
                            <select
                                value={paymentTerms}
                                onChange={(e) => setPaymentTerms(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '9px 12px',
                                    borderRadius: '8px',
                                    border: '1px solid var(--color-border)',
                                    background: 'var(--color-surface)',
                                    color: 'var(--color-text)',
                                    fontSize: '13px'
                                }}
                            >
                                <option value="Immediate">Immediate / Advance</option>
                                <option value="Net 15">Net 15 Days</option>
                                <option value="Net 30">Net 30 Days</option>
                                <option value="Net 45">Net 45 Days</option>
                                <option value="Net 60">Net 60 Days</option>
                                <option value="Custom">Custom Terms</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* 2. PO Line Items */}
                <div style={{ background: 'var(--color-surface-secondary)', padding: '14px 16px', borderRadius: '10px', border: '1px solid var(--color-border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 700 }}>
                            Purchase Order Line Items ({lines.length})
                        </div>
                        <Button type="button" variant="secondary" size="sm" onClick={addLine}>
                            <i className='bx bx-plus'></i> Add Line
                        </Button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {lines.map((line, idx) => (
                            <div 
                                key={idx}
                                style={{
                                    padding: '12px',
                                    borderRadius: '8px',
                                    border: '1px solid var(--color-border)',
                                    background: 'var(--color-surface)',
                                    display: 'grid',
                                    gridTemplateColumns: 'minmax(220px, 2fr) 110px 80px 110px 90px 90px 100px 32px',
                                    gap: '8px',
                                    alignItems: 'center'
                                }}
                            >
                                {/* Item Selector */}
                                <div>
                                    <label style={{ fontSize: '10px', color: 'var(--color-text-muted)', display: 'block', marginBottom: '2px' }}>
                                        Item #{idx + 1} *
                                    </label>
                                    <select
                                        value={line.item}
                                        onChange={(e) => handleItemSelect(idx, e.target.value)}
                                        style={{
                                            width: '100%',
                                            padding: '7px 8px',
                                            borderRadius: '6px',
                                            border: '1px solid var(--color-border)',
                                            background: 'var(--color-surface-secondary)',
                                            color: 'var(--color-text)',
                                            fontSize: '12.5px'
                                        }}
                                        required
                                    >
                                        <option value="">-- Select Item --</option>
                                        {inventoryItems.map(item => {
                                            const isSupplied = vendorCatalogue.some(vi => vi.item === item.id);
                                            return (
                                                <option key={item.id} value={item.id}>
                                                    {isSupplied ? '★ ' : ''}{item.name} {item.sku ? `(${item.sku})` : ''}
                                                </option>
                                            );
                                        })}
                                    </select>
                                </div>

                                {/* Vendor SKU */}
                                <div>
                                    <label style={{ fontSize: '10px', color: 'var(--color-text-muted)', display: 'block', marginBottom: '2px' }}>
                                        Vendor SKU
                                    </label>
                                    <input
                                        type="text"
                                        value={line.vendor_sku || ''}
                                        onChange={(e) => handleLineChange(idx, 'vendor_sku', e.target.value)}
                                        placeholder="SKU"
                                        style={{
                                            width: '100%',
                                            padding: '7px 8px',
                                            borderRadius: '6px',
                                            border: '1px solid var(--color-border)',
                                            background: 'var(--color-surface-secondary)',
                                            color: 'var(--color-text)',
                                            fontSize: '12px',
                                            fontFamily: 'monospace'
                                        }}
                                    />
                                </div>

                                {/* Quantity */}
                                <div>
                                    <label style={{ fontSize: '10px', color: 'var(--color-text-muted)', display: 'block', marginBottom: '2px' }}>
                                        Qty *
                                    </label>
                                    <input
                                        type="number"
                                        min="0.01"
                                        step="any"
                                        value={line.quantity}
                                        onChange={(e) => handleLineChange(idx, 'quantity', e.target.value)}
                                        style={{
                                            width: '100%',
                                            padding: '7px 6px',
                                            borderRadius: '6px',
                                            border: '1px solid var(--color-border)',
                                            background: 'var(--color-surface-secondary)',
                                            color: 'var(--color-text)',
                                            fontSize: '12.5px',
                                            textAlign: 'right'
                                        }}
                                        required
                                    />
                                </div>

                                {/* Unit Price */}
                                <div>
                                    <label style={{ fontSize: '10px', color: 'var(--color-text-muted)', display: 'block', marginBottom: '2px' }}>
                                        Rate (PKR) *
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={line.unit_price}
                                        onChange={(e) => handleLineChange(idx, 'unit_price', e.target.value)}
                                        style={{
                                            width: '100%',
                                            padding: '7px 6px',
                                            borderRadius: '6px',
                                            border: '1px solid var(--color-border)',
                                            background: 'var(--color-surface-secondary)',
                                            color: 'var(--color-text)',
                                            fontSize: '12.5px',
                                            textAlign: 'right'
                                        }}
                                        required
                                    />
                                </div>

                                {/* Discount */}
                                <div>
                                    <label style={{ fontSize: '10px', color: 'var(--color-text-muted)', display: 'block', marginBottom: '2px' }}>
                                        Disc.
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={line.discount_amount || ''}
                                        onChange={(e) => handleLineChange(idx, 'discount_amount', e.target.value)}
                                        placeholder="0"
                                        style={{
                                            width: '100%',
                                            padding: '7px 6px',
                                            borderRadius: '6px',
                                            border: '1px solid var(--color-border)',
                                            background: 'var(--color-surface-secondary)',
                                            color: 'var(--color-text)',
                                            fontSize: '12px',
                                            textAlign: 'right'
                                        }}
                                    />
                                </div>

                                {/* Tax */}
                                <div>
                                    <label style={{ fontSize: '10px', color: 'var(--color-text-muted)', display: 'block', marginBottom: '2px' }}>
                                        Tax
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={line.tax_amount || ''}
                                        onChange={(e) => handleLineChange(idx, 'tax_amount', e.target.value)}
                                        placeholder="0"
                                        style={{
                                            width: '100%',
                                            padding: '7px 6px',
                                            borderRadius: '6px',
                                            border: '1px solid var(--color-border)',
                                            background: 'var(--color-surface-secondary)',
                                            color: 'var(--color-text)',
                                            fontSize: '12px',
                                            textAlign: 'right'
                                        }}
                                    />
                                </div>

                                {/* Total */}
                                <div>
                                    <label style={{ fontSize: '10px', color: 'var(--color-text-muted)', display: 'block', marginBottom: '2px' }}>
                                        Total
                                    </label>
                                    <div style={{ fontSize: '12.5px', fontWeight: 700, textAlign: 'right', color: 'var(--color-primary)', padding: '7px 4px' }}>
                                        {Number(line.total_amount || 0).toLocaleString()}
                                    </div>
                                </div>

                                {/* Delete */}
                                <div style={{ paddingTop: '16px' }}>
                                    <button
                                        type="button"
                                        onClick={() => removeLine(idx)}
                                        style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '16px' }}
                                        title="Remove line"
                                    >
                                        <i className='bx bx-trash'></i>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* 3. Totals Breakdown & Notes */}
                <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '16px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: '4px' }}>
                            Order Notes / Delivery Instructions
                        </label>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            rows={3}
                            placeholder="Add delivery terms, packaging specs, or security handling instructions..."
                            style={{
                                width: '100%',
                                padding: '9px 12px',
                                borderRadius: '8px',
                                border: '1px solid var(--color-border)',
                                background: 'var(--color-surface)',
                                color: 'var(--color-text)',
                                fontSize: '13px',
                                fontFamily: 'inherit',
                                boxSizing: 'border-box'
                            }}
                        />
                    </div>

                    <div style={{ background: 'var(--color-surface-secondary)', padding: '14px 16px', borderRadius: '10px', border: '1px solid var(--color-border)', fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--color-text-muted)' }}>Subtotal:</span>
                            <span>PKR {subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--color-text-muted)' }}>Total Discount:</span>
                            <span style={{ color: '#ef4444' }}>- PKR {totalDiscount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--color-text-muted)' }}>Total Tax:</span>
                            <span>+ PKR {totalTax.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--color-border)', paddingTop: '8px', fontSize: '15px', fontWeight: 700 }}>
                            <span>Grand Total:</span>
                            <span style={{ color: 'var(--color-primary)' }}>PKR {grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                    </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', borderTop: '1px solid var(--color-border)', paddingTop: '14px' }}>
                    <Button type="button" variant="secondary" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button type="submit" variant="primary" disabled={isSaving}>
                        {isSaving ? 'Saving...' : po ? 'Update Purchase Order' : 'Save as Draft PO'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
};
