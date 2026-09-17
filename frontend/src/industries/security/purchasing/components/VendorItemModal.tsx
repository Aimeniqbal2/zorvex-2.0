import React, { useState, useEffect } from 'react';
import { Modal } from '../../../../components/ui/Modal';
import { Button } from '../../../../components/ui/Button';
import { Input } from '../../../../components/ui/Input';
import { useToastStore } from '../../../../stores/toastStore';
import { 
    createVendorItem, updateVendorItem, getUniversalInventoryItems, 
    type VendorItem, type UniversalItem 
} from '../api';

interface VendorItemModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSaved: () => void;
    vendorId: string;
    vendorItem?: VendorItem | null;
}

export const VendorItemModal: React.FC<VendorItemModalProps> = ({
    isOpen,
    onClose,
    onSaved,
    vendorId,
    vendorItem
}) => {
    const [inventoryItems, setInventoryItems] = useState<UniversalItem[]>([]);
    const [selectedItemId, setSelectedItemId] = useState('');
    const [vendorSku, setVendorSku] = useState('');
    const [vendorPrice, setVendorPrice] = useState('');
    const [currency, setCurrency] = useState('PKR');
    const [moq, setMoq] = useState('1');
    const [leadTimeDays, setLeadTimeDays] = useState('0');
    const [isPreferred, setIsPreferred] = useState(false);
    const [isActive, setIsActive] = useState(true);
    const [notes, setNotes] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (isOpen) {
            loadItems();
            if (vendorItem) {
                setSelectedItemId(vendorItem.item || '');
                setVendorSku(vendorItem.vendor_sku || '');
                setVendorPrice(String(vendorItem.vendor_price || ''));
                setCurrency(vendorItem.currency || 'PKR');
                setMoq(String(vendorItem.minimum_order_quantity || '1'));
                setLeadTimeDays(String(vendorItem.lead_time_days || '0'));
                setIsPreferred(vendorItem.is_preferred || false);
                setIsActive(vendorItem.is_active !== undefined ? vendorItem.is_active : true);
                setNotes(vendorItem.notes || '');
            } else {
                setSelectedItemId('');
                setVendorSku('');
                setVendorPrice('');
                setCurrency('PKR');
                setMoq('1');
                setLeadTimeDays('0');
                setIsPreferred(false);
                setIsActive(true);
                setNotes('');
            }
        }
    }, [isOpen, vendorItem]);

    const loadItems = async () => {
        const items = await getUniversalInventoryItems();
        setInventoryItems(items || []);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedItemId) {
            useToastStore.getState().error('Please select an Inventory Item.');
            return;
        }
        if (!vendorPrice || isNaN(parseFloat(vendorPrice))) {
            useToastStore.getState().error('Please enter a valid vendor price.');
            return;
        }

        setIsSaving(true);
        try {
            const payload: Partial<VendorItem> = {
                vendor: vendorId,
                item: selectedItemId,
                vendor_sku: vendorSku.trim(),
                vendor_price: parseFloat(vendorPrice),
                currency,
                minimum_order_quantity: parseFloat(moq) || 1,
                lead_time_days: parseInt(leadTimeDays, 10) || 0,
                is_preferred: isPreferred,
                is_active: isActive,
                notes: notes.trim()
            };

            if (vendorItem) {
                await updateVendorItem(vendorItem.id, payload);
                useToastStore.getState().success('Vendor item pricing updated.');
            } else {
                await createVendorItem(payload);
                useToastStore.getState().success('Item added to vendor catalogue.');
            }
            onSaved();
            onClose();
        } catch (err: any) {
            useToastStore.getState().error(err?.response?.data?.detail || err?.response?.data?.non_field_errors?.[0] || 'Failed to save vendor item.');
        } finally {
            setIsSaving(false);
        }
    };

    if (!isOpen) return null;

    const chosenItem = inventoryItems.find(i => i.id === selectedItemId);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={vendorItem ? "Edit Vendor Item Pricing" : "Map Inventory Item to Vendor"} size="medium">
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                    <label style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: '4px' }}>
                        Select Universal Inventory Item *
                    </label>
                    <select
                        value={selectedItemId}
                        onChange={(e) => {
                            setSelectedItemId(e.target.value);
                            const item = inventoryItems.find(i => i.id === e.target.value);
                            if (item && !vendorSku) {
                                setVendorSku(item.sku || '');
                            }
                            if (item && item.cost_price && !vendorPrice) {
                                setVendorPrice(String(item.cost_price));
                            }
                        }}
                        disabled={!!vendorItem}
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
                        <option value="">-- Choose Item from Inventory --</option>
                        {inventoryItems.map(item => (
                            <option key={item.id} value={item.id}>
                                {item.name} {item.sku ? `(${item.sku})` : ''} {item.brand ? `• ${item.brand}` : ''}
                            </option>
                        ))}
                    </select>
                </div>

                {chosenItem && (
                    <div style={{ padding: '8px 12px', background: 'var(--color-surface-secondary)', border: '1px solid var(--color-border)', borderRadius: '6px', fontSize: '12px', display: 'flex', gap: '16px' }}>
                        <div><strong>Standard Cost:</strong> PKR {chosenItem.cost_price || 0}</div>
                        <div><strong>Selling Price:</strong> PKR {chosenItem.selling_price || 0}</div>
                        <div><strong>UOM:</strong> {chosenItem.unit_of_measure || 'pcs'}</div>
                    </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <Input
                        label="Vendor Part / Catalog SKU"
                        placeholder="e.g. VEN-SKU-992"
                        value={vendorSku}
                        onChange={(e) => setVendorSku(e.target.value)}
                    />
                    <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: '6px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: '4px' }}>
                                Curr.
                            </label>
                            <input
                                type="text"
                                value={currency}
                                onChange={(e) => setCurrency(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '9px 8px',
                                    borderRadius: '8px',
                                    border: '1px solid var(--color-border)',
                                    background: 'var(--color-surface)',
                                    color: 'var(--color-text)',
                                    fontSize: '13px',
                                    textAlign: 'center'
                                }}
                            />
                        </div>
                        <Input
                            label="Vendor Price *"
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            value={vendorPrice}
                            onChange={(e) => setVendorPrice(e.target.value)}
                            required
                        />
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <Input
                        label="Minimum Order Quantity (MOQ)"
                        type="number"
                        placeholder="1"
                        value={moq}
                        onChange={(e) => setMoq(e.target.value)}
                    />
                    <Input
                        label="Lead Time (Days)"
                        type="number"
                        placeholder="0"
                        value={leadTimeDays}
                        onChange={(e) => setLeadTimeDays(e.target.value)}
                    />
                </div>

                <div style={{ display: 'flex', gap: '20px', alignItems: 'center', marginTop: '4px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                        <input
                            type="checkbox"
                            checked={isPreferred}
                            onChange={(e) => setIsPreferred(e.target.checked)}
                        />
                        <span>Preferred Vendor for this item</span>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                        <input
                            type="checkbox"
                            checked={isActive}
                            onChange={(e) => setIsActive(e.target.checked)}
                        />
                        <span>Active Item</span>
                    </label>
                </div>

                <div>
                    <label style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: '4px' }}>
                        Item Notes / Warranty Terms
                    </label>
                    <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        rows={2}
                        placeholder="e.g. Includes 1-year replacement warranty, OEM authentic"
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

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
                    <Button type="button" variant="secondary" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button type="submit" variant="primary" disabled={isSaving}>
                        {isSaving ? 'Saving...' : vendorItem ? 'Update Pricing' : 'Add Item to Catalogue'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
};
