import React, { useState, useEffect } from 'react';
import { Modal } from '../../../../components/ui/Modal';
import { Button } from '../../../../components/ui/Button';
import { Input } from '../../../../components/ui/Input';
import { useToastStore } from '../../../../stores/toastStore';
import { 
    createVendorItem, updateVendorItem, getUniversalInventoryItems, createUniversalInventoryItem,
    extractApiError, type VendorItem, type UniversalItem 
} from '../api';

interface VendorItemModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSaved: () => void;
    vendorId: string;
    vendorItem?: VendorItem | null;
}

const SECURITY_CATEGORIES = [
    { value: 'UNIFORM', label: 'Uniform & Tactical Apparel' },
    { value: 'SHOES_PPE', label: 'Shoes / PPE / Tactical Boots' },
    { value: 'RADIO_COMMS', label: 'Radio / Communication Equipment' },
    { value: 'TORCH_SECURITY', label: 'Torch / Security Gear' },
    { value: 'CCTV_ELECTRONIC', label: 'CCTV / Surveillance Electronics' },
    { value: 'ACCESS_CONTROL', label: 'Access Control / Biometrics' },
    { value: 'WEAPONS_AMMO', label: 'Weapons / Ammunition (Regulated)' },
    { value: 'CONSUMABLES', label: 'Stationery / Logbooks / Consumables' },
    { value: 'OTHER', label: 'Other Security Equipment' },
];

export const VendorItemModal: React.FC<VendorItemModalProps> = ({
    isOpen,
    onClose,
    onSaved,
    vendorId,
    vendorItem
}) => {
    const [entryMode, setEntryMode] = useState<'existing' | 'new'>('existing');
    const [inventoryItems, setInventoryItems] = useState<UniversalItem[]>([]);
    
    // Existing item mapping state
    const [selectedItemId, setSelectedItemId] = useState('');
    
    // New item creation state
    const [newItemName, setNewItemName] = useState('');
    const [newItemSku, setNewItemSku] = useState('');
    const [newItemCategory, setNewItemCategory] = useState('UNIFORM');
    const [newItemUom, setNewItemUom] = useState('pcs');
    const [newItemTrackSerial, setNewItemTrackSerial] = useState(false);
    const [newItemCostPrice, setNewItemCostPrice] = useState('');
    const [newItemBrand, setNewItemBrand] = useState('');

    // Vendor pricing state
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
                setEntryMode('existing');
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
                setNewItemName('');
                setNewItemSku('');
                setNewItemCategory('UNIFORM');
                setNewItemUom('pcs');
                setNewItemTrackSerial(false);
                setNewItemCostPrice('');
                setNewItemBrand('');
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
        if (!vendorItem && items && items.length === 0) {
            setEntryMode('new');
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!vendorPrice || isNaN(parseFloat(vendorPrice))) {
            useToastStore.getState().error('Please enter a valid vendor price.');
            return;
        }

        setIsSaving(true);
        try {
            let itemId = selectedItemId;

            if (!vendorItem && entryMode === 'new') {
                if (!newItemName.trim()) {
                    useToastStore.getState().error('Please enter the Item Name.');
                    setIsSaving(false);
                    return;
                }
                const cost = parseFloat(newItemCostPrice) || parseFloat(vendorPrice) || 0;
                const createdItem = await createUniversalInventoryItem({
                    name: newItemName.trim(),
                    sku: newItemSku.trim() || undefined,
                    security_category: newItemCategory,
                    unit_of_measure: newItemUom,
                    cost_price: cost,
                    selling_price: cost,
                    brand: newItemBrand.trim() || undefined,
                    track_inventory: true,
                    track_serial_number: newItemTrackSerial,
                    is_controlled: ['WEAPONS_AMMO', 'RADIO_COMMS'].includes(newItemCategory)
                });
                itemId = createdItem.id;
            }

            if (!itemId) {
                useToastStore.getState().error('Please select an existing item or enter details for a new item.');
                setIsSaving(false);
                return;
            }

            const payload: Partial<VendorItem> = {
                vendor: vendorId,
                item: itemId,
                vendor_sku: vendorSku.trim() || (entryMode === 'new' ? newItemSku.trim() : ''),
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
                useToastStore.getState().success('Item mapped to vendor catalogue successfully.');
            }
            onSaved();
            onClose();
        } catch (err: any) {
            useToastStore.getState().error(extractApiError(err, 'Failed to save vendor item.'));
        } finally {
            setIsSaving(false);
        }
    };

    if (!isOpen) return null;

    const chosenItem = inventoryItems.find(i => i.id === selectedItemId);

    return (
        <Modal 
            isOpen={isOpen} 
            onClose={onClose} 
            title={vendorItem ? "Edit Vendor Item Pricing" : "Add Item to Vendor Catalogue"} 
            size="medium"
        >
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '76vh', overflowY: 'auto', paddingRight: '4px' }}>
                
                {/* Mode Selector for New Mappings */}
                {!vendorItem && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', background: 'var(--color-surface-secondary, #f8fafc)', padding: '4px', borderRadius: '8px', border: '1px solid var(--color-border, #e2e8f0)' }}>
                        <button
                            type="button"
                            onClick={() => setEntryMode('existing')}
                            style={{
                                padding: '8px 12px',
                                borderRadius: '6px',
                                border: 'none',
                                background: entryMode === 'existing' ? 'var(--color-primary, #2563eb)' : 'transparent',
                                color: entryMode === 'existing' ? '#ffffff' : 'var(--color-text-muted, #64748b)',
                                fontWeight: 600,
                                fontSize: '12px',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            <i className="bx bx-list-check" style={{ marginRight: '4px' }}></i> Select Existing Item ({inventoryItems.length})
                        </button>
                        <button
                            type="button"
                            onClick={() => setEntryMode('new')}
                            style={{
                                padding: '8px 12px',
                                borderRadius: '6px',
                                border: 'none',
                                background: entryMode === 'new' ? 'var(--color-primary, #2563eb)' : 'transparent',
                                color: entryMode === 'new' ? '#ffffff' : 'var(--color-text-muted, #64748b)',
                                fontWeight: 600,
                                fontSize: '12px',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            <i className="bx bx-plus-circle" style={{ marginRight: '4px' }}></i> Direct Entry (Create New Item)
                        </button>
                    </div>
                )}

                {/* Mode 1: Select Existing Item */}
                {(vendorItem || entryMode === 'existing') && (
                    <div>
                        <label style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted, #64748b)', fontWeight: 600, marginBottom: '4px' }}>
                            Select Inventory Item *
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
                                border: '1px solid var(--color-border, #e2e8f0)',
                                background: 'var(--color-surface, #ffffff)',
                                color: 'var(--color-text, #1e293b)',
                                fontSize: '13px'
                            }}
                            required
                        >
                            <option value="">-- Choose Item from Inventory ({inventoryItems.length} available) --</option>
                            {inventoryItems.map(item => (
                                <option key={item.id} value={item.id}>
                                    {item.name} {item.sku ? `(${item.sku})` : ''} {item.brand ? `• ${item.brand}` : ''}
                                </option>
                            ))}
                        </select>
                        {inventoryItems.length === 0 && (
                            <div style={{ fontSize: '12px', color: '#ea580c', marginTop: '6px' }}>
                                No items found in inventory. Switch to "Direct Entry" above to create items directly.
                            </div>
                        )}
                        {chosenItem && (
                            <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--color-text-muted, #64748b)', display: 'flex', gap: '12px' }}>
                                <span>UOM: <b>{chosenItem.unit_of_measure}</b></span>
                                <span>Cost Price: <b>Rs. {chosenItem.cost_price || 0}</b></span>
                                {chosenItem.track_serial_number && <span style={{ color: '#7c3aed' }}>• Serial Tracking</span>}
                            </div>
                        )}
                    </div>
                )}

                {/* Mode 2: Create New Item Directly */}
                {!vendorItem && entryMode === 'new' && (
                    <div style={{ background: 'var(--color-surface-secondary, #f8fafc)', border: '1px solid var(--color-border, #e2e8f0)', borderRadius: '10px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-primary, #2563eb)', fontWeight: 700 }}>
                            New Store Item Details
                        </div>
                        <div>
                            <Input
                                label="Item Name *"
                                placeholder="e.g. Tactical Security Guard Uniform Set (Summer)"
                                value={newItemName}
                                onChange={(e) => setNewItemName(e.target.value)}
                                required
                            />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '10px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted, #64748b)', fontWeight: 600, marginBottom: '4px' }}>
                                    Security Category
                                </label>
                                <select
                                    value={newItemCategory}
                                    onChange={(e) => setNewItemCategory(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '9px 12px',
                                        borderRadius: '8px',
                                        border: '1px solid var(--color-border, #e2e8f0)',
                                        background: 'var(--color-surface, #ffffff)',
                                        color: 'var(--color-text, #1e293b)',
                                        fontSize: '13px'
                                    }}
                                >
                                    {SECURITY_CATEGORIES.map(c => (
                                        <option key={c.value} value={c.value}>{c.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <Input
                                    label="Item Code / SKU (Auto if blank)"
                                    placeholder="e.g. SEC-UNI-001"
                                    value={newItemSku}
                                    onChange={(e) => setNewItemSku(e.target.value)}
                                />
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                            <div>
                                <Input
                                    label="Unit of Measure"
                                    placeholder="pcs, pairs, sets"
                                    value={newItemUom}
                                    onChange={(e) => setNewItemUom(e.target.value)}
                                />
                            </div>
                            <div>
                                <Input
                                    label="Brand / Manufacturer"
                                    placeholder="e.g. Apex, Motorola, Glock"
                                    value={newItemBrand}
                                    onChange={(e) => setNewItemBrand(e.target.value)}
                                />
                            </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                            <input
                                type="checkbox"
                                id="newItemTrackSerial"
                                checked={newItemTrackSerial}
                                onChange={(e) => setNewItemTrackSerial(e.target.checked)}
                                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                            />
                            <label htmlFor="newItemTrackSerial" style={{ fontSize: '12px', color: 'var(--color-text, #1e293b)', cursor: 'pointer', fontWeight: 500 }}>
                                Track individual serial numbers (e.g. for radios, weapons, metal detectors)
                            </label>
                        </div>
                    </div>
                )}

                {/* Vendor Commercial & Pricing Terms */}
                <div style={{ background: 'var(--color-surface, #ffffff)', border: '1px solid var(--color-border, #e2e8f0)', borderRadius: '10px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted, #64748b)', fontWeight: 700 }}>
                        Vendor Supply Terms & Pricing
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '10px' }}>
                        <div>
                            <Input
                                label="Vendor Quoted Price (PKR) *"
                                type="number"
                                step="0.01"
                                min="0"
                                placeholder="0.00"
                                value={vendorPrice}
                                onChange={(e) => setVendorPrice(e.target.value)}
                                required
                            />
                        </div>
                        <div>
                            <Input
                                label="Vendor SKU / Part Number"
                                placeholder="Supplier item ref"
                                value={vendorSku}
                                onChange={(e) => setVendorSku(e.target.value)}
                            />
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <div>
                            <Input
                                label="Minimum Order Qty (MOQ)"
                                type="number"
                                min="1"
                                value={moq}
                                onChange={(e) => setMoq(e.target.value)}
                            />
                        </div>
                        <div>
                            <Input
                                label="Lead Time (Days)"
                                type="number"
                                min="0"
                                placeholder="e.g. 7"
                                value={leadTimeDays}
                                onChange={(e) => setLeadTimeDays(e.target.value)}
                            />
                        </div>
                    </div>

                    <div>
                        <Input
                            label="Catalogue Notes & Specifications"
                            placeholder="Material grade, supplier terms, guarantee..."
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                        />
                    </div>

                    <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={isPreferred}
                                onChange={(e) => setIsPreferred(e.target.checked)}
                            />
                            Preferred Vendor for this Item
                        </label>

                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={isActive}
                                onChange={(e) => setIsActive(e.target.checked)}
                            />
                            Active in Vendor Catalogue
                        </label>
                    </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
                    <Button type="button" variant="secondary" onClick={onClose} disabled={isSaving}>
                        Cancel
                    </Button>
                    <Button type="submit" variant="primary" disabled={isSaving}>
                        {isSaving ? 'Saving...' : vendorItem ? 'Update Pricing' : 'Save to Catalogue'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
};
