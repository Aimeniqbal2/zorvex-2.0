import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getItems } from '../../../modules/inventory/api';
import type { Item } from '../../../modules/inventory/types';
import { usePosStore } from '../store/usePosStore';
import { Badge } from '../../../components/ui/Badge';
import { LoadingState } from '../../../components/ui/LoadingState';

// ─── Debounce hook ──────────────────────────────────────────────────────────
function useDebounce<T>(value: T, delay: number): T {
    const [debouncedValue, setDebouncedValue] = useState<T>(value);
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedValue(value), delay);
        return () => clearTimeout(timer);
    }, [value, delay]);
    return debouncedValue;
}

// ─── Stock badge helper ──────────────────────────────────────────────────────
function StockBadge({ item }: { item: Item }) {
    if (!item.track_inventory) return <Badge variant="default">Service / Non-tracked</Badge>;
    const qty = parseFloat(item.current_stock || '0');
    if (qty <= 0) return <Badge variant="danger">Out of Stock</Badge>;
    if (qty <= 3) return <Badge variant="warning">Low: {qty} {item.unit_of_measure}</Badge>;
    return <Badge variant="success">In Stock: {qty} {item.unit_of_measure}</Badge>;
}

// ─── Single product card ──────────────────────────────────────────────────────
interface ProductCardProps {
    item: Item;
    onSelect: (item: Item) => void;
}

const ProductCard: React.FC<ProductCardProps> = ({ item, onSelect }) => {
    const isOutOfStock = item.track_inventory && parseFloat(item.current_stock || '0') <= 0;
    const price = parseFloat(item.selling_price || '0');

    return (
        <div
            onClick={() => !isOutOfStock && onSelect(item)}
            style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--spacing-1)',
                padding: 'var(--spacing-3)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                backgroundColor: 'var(--color-surface)',
                cursor: isOutOfStock ? 'not-allowed' : 'pointer',
                opacity: isOutOfStock ? 0.5 : 1,
                transition: 'background-color 0.15s, border-color 0.15s, transform 0.1s',
            }}
            onMouseEnter={e => {
                if (!isOutOfStock) {
                    (e.currentTarget as HTMLDivElement).style.backgroundColor = 'var(--color-surface-elevated)';
                    (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--color-primary)';
                    (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-1px)';
                }
            }}
            onMouseLeave={e => {
                (e.currentTarget as HTMLDivElement).style.backgroundColor = 'var(--color-surface)';
                (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--color-border)';
                (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
            }}
            title={isOutOfStock ? 'Out of stock — cannot add to cart' : `Add ${item.name} to cart`}
        >
            {/* Name + stock badge */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--spacing-2)' }}>
                <span style={{ fontWeight: 600, color: 'var(--color-text)', fontSize: '13px', lineHeight: 1.3 }}>
                    {item.name}
                </span>
                <StockBadge item={item} />
            </div>

            {/* Category + brand + sku */}
            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', display: 'flex', gap: 'var(--spacing-2)', flexWrap: 'wrap' }}>
                {item.category_name && <span>{item.category_name}</span>}
                {item.brand && <span>· {item.brand}</span>}
                {item.sku && <span>· SKU: {item.sku}</span>}
                {item.item_type && <span>· {item.item_type}</span>}
            </div>

            {/* Barcode + price row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'var(--spacing-1)' }}>
                <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontFamily: 'monospace' }}>
                    {item.barcode || 'No barcode'}
                </span>
                <span style={{ fontWeight: 700, color: 'var(--color-primary)', fontSize: '14px' }}>
                    PKR {price.toLocaleString()}
                </span>
            </div>
        </div>
    );
};

// ─── Main Product Search Panel ────────────────────────────────────────────────
export const ProductSearchPanel: React.FC = () => {
    const { addToCart } = usePosStore();

    // Search state
    const [searchQuery, setSearchQuery] = useState('');
    const debouncedQuery = useDebounce(searchQuery, 300);

    // Results state
    const [items, setItems] = useState<Item[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [totalCount, setTotalCount] = useState(0);

    // Barcode scanner state
    const [scannerValue, setScannerValue] = useState('');
    const [scanStatus, setScanStatus] = useState<'idle' | 'hit' | 'miss' | 'scanning'>('idle');
    const searchRef = useRef<HTMLInputElement>(null);

    // ── Fetch products whenever debounced query changes ──
    const fetchItems = useCallback(async (query: string) => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await getItems({
                search: query || undefined,
                page_size: 40,
                page: 1,
                is_active: 'true',
                is_sellable: 'true'
            });
            setItems(response.results);
            setTotalCount(response.count);
        } catch (err: any) {
            console.error('Item search error:', err);
            setError('Failed to load items. Please try again.');
            setItems([]);
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Initial load + search changes
    useEffect(() => {
        fetchItems(debouncedQuery);
    }, [debouncedQuery, fetchItems]);

    // ── Barcode scanner: fires on Enter key — resolves via server API, not in-memory list ──
    const handleScannerKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key !== 'Enter') return;
        const barcode = scannerValue.trim();
        if (!barcode) return;

        // Immediately clear input so scanner is ready for the next physical scan
        setScannerValue('');
        setScanStatus('scanning');

        try {
            // Search by the exact barcode string; page_size=5 is enough — we want the first exact hit
            const response = await getItems({ search: barcode, page: 1, page_size: 5, is_active: 'true', is_sellable: 'true' });

            // Prefer an exact barcode match; fall back to the first result if only one is returned
            const hit =
                response.results.find(
                    p => p.barcode && p.barcode.toLowerCase() === barcode.toLowerCase()
                ) || (response.results.length === 1 ? response.results[0] : null);

            if (hit) {
                const stockQty = parseFloat(hit.current_stock || '0');
                if (!hit.track_inventory || stockQty > 0) {
                    addToCart(hit);
                    setScanStatus('hit');
                    setTimeout(() => setScanStatus('idle'), 400);
                    return;
                }
            }
            // Either not found, ambiguous, or out of stock
            setScanStatus('miss');
            setTimeout(() => setScanStatus('idle'), 600);
        } catch {
            setScanStatus('miss');
            setTimeout(() => setScanStatus('idle'), 600);
        }
    };

    // ── Product selected from grid ──
    const handleProductSelect = (item: Item) => {
        addToCart(item);
        // Briefly flash search box border to confirm
        if (searchRef.current) {
            searchRef.current.style.borderColor = 'var(--color-success, #22c55e)';
            setTimeout(() => {
                if (searchRef.current) searchRef.current.style.borderColor = '';
            }, 400);
        }
    };

    const scanBorderColor =
        scanStatus === 'hit'      ? 'var(--color-success, #22c55e)'
        : scanStatus === 'miss'   ? 'var(--color-danger, #ef4444)'
        : scanStatus === 'scanning' ? 'var(--color-warning, #f59e0b)'
        : undefined;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 'var(--spacing-3)' }}>
            {/* ── Search & Scanner Row ── */}
            <div style={{
                display: 'flex',
                gap: 'var(--spacing-2)',
                padding: 'var(--spacing-3)',
                backgroundColor: 'var(--color-surface)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
            }}>
                {/* Text search */}
                <div style={{ flex: 1, position: 'relative' }}>
                    <i className="bx bx-search" style={{
                        position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)',
                        color: 'var(--color-text-muted)', fontSize: '16px', pointerEvents: 'none'
                    }} />
                    <input
                        ref={searchRef}
                        type="text"
                        className="input-base"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="Search by name, brand, or SKU..."
                        style={{ width: '100%', paddingLeft: '34px', transition: 'border-color 0.2s' }}
                        autoFocus
                    />
                </div>

                {/* Barcode scanner input */}
                <div style={{ position: 'relative', flexShrink: 0 }}>
                    <i
                        className={scanStatus === 'scanning' ? 'bx bx-loader-alt bx-spin' : 'bx bx-barcode'}
                        style={{
                            position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)',
                            color: 'var(--color-text-muted)', fontSize: '16px', pointerEvents: 'none'
                        }}
                    />
                    <input
                        type="text"
                        className="input-base"
                        value={scannerValue}
                        onChange={e => setScannerValue(e.target.value)}
                        onKeyDown={handleScannerKeyDown}
                        placeholder={scanStatus === 'scanning' ? 'Looking up...' : 'Scan barcode...'}
                        disabled={scanStatus === 'scanning'}
                        style={{
                            width: '180px',
                            paddingLeft: '34px',
                            borderColor: scanBorderColor,
                            transition: 'border-color 0.15s',
                            opacity: scanStatus === 'scanning' ? 0.7 : 1,
                        }}
                        title="Focus here and scan a barcode. Press Enter to add to cart."
                    />
                </div>
            </div>

            {/* ── Results summary ── */}
            {!isLoading && !error && (
                <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', paddingLeft: 'var(--spacing-1)' }}>
                    {debouncedQuery
                        ? `${totalCount} result${totalCount !== 1 ? 's' : ''} for "${debouncedQuery}"`
                        : `${totalCount} product${totalCount !== 1 ? 's' : ''} available`
                    }
                    {totalCount > 40 && ' (showing first 40)'}
                </div>
            )}

            {/* ── Product Grid ── */}
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                {isLoading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '150px' }}>
                        <LoadingState message="Searching products..." />
                    </div>
                ) : error ? (
                    <div style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                        justifyContent: 'center', height: '150px', gap: 'var(--spacing-3)',
                        color: 'var(--color-danger)'
                    }}>
                        <i className="bx bx-error-circle" style={{ fontSize: '32px' }} />
                        <p style={{ margin: 0, color: 'var(--color-text-muted)', textAlign: 'center' }}>{error}</p>
                        <button className="btn btn-secondary" onClick={() => fetchItems(debouncedQuery)}>
                            <i className="bx bx-refresh" /> Retry
                        </button>
                    </div>
                ) : items.length === 0 ? (
                    <div style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                        justifyContent: 'center', height: '150px', gap: 'var(--spacing-2)',
                        color: 'var(--color-text-muted)'
                    }}>
                        <i className="bx bx-search-alt" style={{ fontSize: '32px' }} />
                        <p style={{ margin: 0 }}>
                            {debouncedQuery ? `No products matching "${debouncedQuery}"` : 'No products found'}
                        </p>
                    </div>
                ) : (
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                        gap: 'var(--spacing-2)',
                        paddingBottom: 'var(--spacing-2)',
                    }}>
                        {items.map(item => (
                            <ProductCard
                                key={item.id}
                                item={item}
                                onSelect={handleProductSelect}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
