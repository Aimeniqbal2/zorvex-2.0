import { create } from 'zustand';
import type { 
    Customer, 
    POSSession, 
    CartItem, 
    Discount,
    CheckoutPayload,
    CheckoutLinePayload
} from '../types';
import type { Item } from '../../inventory/types';

export interface PosState {
    // Current active session
    activeSession: POSSession | null;
    
    // Cart Data
    cartItems: CartItem[];
    
    // Config
    selectedCustomer: Customer | null;
    discount: Discount | null;
    taxRate: number; // e.g., 0.16 for 16% tax
    
    // Computed (derived) state getters
    getSubtotal: () => number;
    getDiscountAmount: () => number;
    getTaxAmount: () => number;
    getTotalAmount: () => number;

    // Actions
    setSession: (session: POSSession | null) => void;
    
    addToCart: (item: Item) => void;
    updateQuantity: (itemId: string, quantity: number) => void;
    removeFromCart: (itemId: string) => void;
    clearCart: () => void;
    
    setCustomer: (customer: Customer | null) => void;
    clearCustomer: () => void;
    
    setDiscount: (discount: Discount | null) => void;
    setTaxRate: (rate: number) => void;
    
    // Reset operations
    resetSale: () => void; // Clears cart, customer, discount, but keeps session
    resetPosState: () => void; // Total reset (e.g. log out of POS)
    
    // Checkout preparation
    getCheckoutPayload: (paymentMethod: CheckoutPayload['payment_method'], receivedAmount: number, splitCash?: number, splitCard?: number) => CheckoutPayload;
}

export const usePosStore = create<PosState>((set, get) => ({
    activeSession: null,
    
    cartItems: [],
    selectedCustomer: null,
    discount: null,
    taxRate: 0, // Default to 0, should be fetched from config/backend

    setSession: (session) => set({ activeSession: session }),

    addToCart: (item: Item) => {
        const { cartItems } = get();
        const existingItem = cartItems.find(cartItem => cartItem.item.id === item.id);

        if (existingItem) {
            // Check stock limit UX safeguard
            const newQuantity = existingItem.quantity + 1;
            const currentStock = parseFloat(item.current_stock || '0');
            
            if (!item.track_inventory || newQuantity <= currentStock) {
                set({
                    cartItems: cartItems.map(cartItem => 
                        cartItem.item.id === item.id 
                            ? { ...cartItem, quantity: newQuantity } 
                            : cartItem
                    )
                });
            }
        } else {
            // New item, check stock
            const currentStock = parseFloat(item.current_stock || '0');
            if (!item.track_inventory || currentStock > 0) {
                const newItem: CartItem = {
                    id: item.id,
                    item: item,
                    quantity: 1,
                    unitPrice: parseFloat(item.selling_price || '0')
                };
                set({ cartItems: [...cartItems, newItem] });
            }
        }
    },

    updateQuantity: (itemId: string, quantity: number) => {
        const { cartItems } = get();
        if (quantity < 0) return; // Prevent negative
        
        if (quantity === 0) {
            get().removeFromCart(itemId);
            return;
        }

        const existingItem = cartItems.find(cartItem => cartItem.item.id === itemId);
        if (existingItem) {
            const currentStock = parseFloat(existingItem.item.current_stock || '0');
            if (!existingItem.item.track_inventory || quantity <= currentStock) {
                set({
                    cartItems: cartItems.map(cartItem => 
                        cartItem.item.id === itemId ? { ...cartItem, quantity } : cartItem
                    )
                });
            }
        }
    },

    removeFromCart: (itemId: string) => {
        const { cartItems } = get();
        set({
            cartItems: cartItems.filter(cartItem => cartItem.item.id !== itemId)
        });
    },

    clearCart: () => set({ cartItems: [] }),

    setCustomer: (customer) => set({ selectedCustomer: customer }),
    clearCustomer: () => set({ selectedCustomer: null }),

    setDiscount: (discount) => set({ discount }),
    setTaxRate: (rate) => set({ taxRate: rate }),

    getSubtotal: () => {
        return get().cartItems.reduce((total, item) => total + (item.unitPrice * item.quantity), 0);
    },

    getDiscountAmount: () => {
        const subtotal = get().getSubtotal();
        const discount = get().discount;
        if (!discount) return 0;
        
        if (discount.type === 'percentage') {
            return subtotal * (discount.value / 100);
        }
        return discount.value;
    },

    getTaxAmount: () => {
        const taxableAmount = get().getSubtotal() - get().getDiscountAmount();
        // Prevent negative tax if discount exceeds subtotal
        if (taxableAmount <= 0) return 0;
        return taxableAmount * get().taxRate;
    },

    getTotalAmount: () => {
        const subtotal = get().getSubtotal();
        const discountAmt = get().getDiscountAmount();
        const taxAmt = get().getTaxAmount();
        const total = subtotal - discountAmt + taxAmt;
        return total > 0 ? total : 0;
    },

    resetSale: () => {
        set({
            cartItems: [],
            selectedCustomer: null,
            discount: null,
            // taxRate might be kept as it's global
        });
    },

    resetPosState: () => {
        set({
            activeSession: null,
            cartItems: [],
            selectedCustomer: null,
            discount: null,
            taxRate: 0
        });
    },

    getCheckoutPayload: (paymentMethod, receivedAmount, splitCash = 0, splitCard = 0) => {
        const state = get();
        
        const lines: CheckoutLinePayload[] = state.cartItems.map(cartItem => ({
            item_id: cartItem.item.id,
            quantity: cartItem.quantity,
            unit_price: cartItem.unitPrice
        }));

        const payload: CheckoutPayload = {
            subtotal: state.getSubtotal().toFixed(2),
            tax_amount: state.getTaxAmount().toFixed(2),
            discount_amount: state.getDiscountAmount().toFixed(2),
            total_amount: state.getTotalAmount().toFixed(2),
            received_amount: receivedAmount.toFixed(2),
            payment_method: paymentMethod,
            customer: state.selectedCustomer?.id || null,
            crm_entity: typeof state.selectedCustomer?.crm_entity === 'string' 
                ? state.selectedCustomer.crm_entity 
                : state.selectedCustomer?.crm_entity?.id || null,
            lines: lines
        };

        if (paymentMethod === 'split') {
            payload.split_cash = splitCash.toFixed(2);
            payload.split_card = splitCard.toFixed(2);
        }

        return payload;
    }
}));
