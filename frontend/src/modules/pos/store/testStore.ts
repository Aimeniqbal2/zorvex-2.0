import { usePosStore } from './usePosStore';
import type { Item } from '../../inventory/types';
import type { Customer } from '../types';

const assert = (condition: boolean, message: string) => {
    if (!condition) {
        throw new Error(`Assertion failed: ${message}`);
    }
};

const mockItem: Item = {
    id: 'p1',
    category: null,
    category_name: '',
    brand: 'Apple',
    name: 'iPhone 13',
    description: '',
    sku: 'IP13',
    item_code: 'IP13',
    item_type: 'PRODUCT',
    barcode: '12345',
    unit_of_measure: 'pcs',
    track_inventory: true,
    is_active: true,
    is_sellable: true,
    is_purchasable: true,
    track_serial_number: false,
    track_batch: false,
    cost_price: '800',
    selling_price: '1000',
    minimum_stock_level: '2',
    reorder_level: '2',
    current_stock: '5'
};

const mockCustomer: Customer = {
    id: 'c1',
    company: 'com1',
    name: 'John Doe',
    phone: '12345',
    email: 'j@d.com',
    crm_entity: 'crm1',
    balance: '0',
    total_credit: '0',
    total_paid: '0',
    created_at: 'now',
    updated_at: 'now'
};

const runTests = () => {
    console.log('Running POS Store Tests...');
    const store = usePosStore.getState();

    // 1. Initial State
    assert(store.cartItems.length === 0, 'Cart should be empty initially');

    // 2. Add item
    store.addToCart(mockItem);
    let state = usePosStore.getState();
    assert(state.cartItems.length === 1, 'Cart should have 1 item');
    assert(state.cartItems[0].quantity === 1, 'Quantity should be 1');

    // 3. Add same item twice (Increase quantity)
    state.addToCart(mockItem);
    state = usePosStore.getState();
    assert(state.cartItems.length === 1, 'Cart should still have 1 item');
    assert(state.cartItems[0].quantity === 2, 'Quantity should be 2');

    // 4. Update quantity
    state.updateQuantity('p1', 4);
    state = usePosStore.getState();
    assert(state.cartItems[0].quantity === 4, 'Quantity should be updated to 4');

    // 5. Decrease quantity
    state.updateQuantity('p1', 1);
    state = usePosStore.getState();
    assert(state.cartItems[0].quantity === 1, 'Quantity should be decreased to 1');

    // 6. Remove item
    state.removeFromCart('p1');
    state = usePosStore.getState();
    assert(state.cartItems.length === 0, 'Cart should be empty after removal');

    // 7. Stock UX Constraint
    state.addToCart(mockItem); // qty: 1
    state.updateQuantity('p1', 6); // stock is 5
    state = usePosStore.getState();
    // It should NOT update to 6, because stock is 5.
    assert(state.cartItems[0].quantity === 1, 'Quantity should not exceed stock');

    // 8. Discounts and Taxes
    state.updateQuantity('p1', 2); // subtotal = 2000
    state.setDiscount({ type: 'flat', value: 200 }); // discount = 200, taxable = 1800
    state.setTaxRate(0.10); // tax = 180
    state = usePosStore.getState();

    assert(state.getSubtotal() === 2000, 'Subtotal should be 2000');
    assert(state.getDiscountAmount() === 200, 'Discount amount should be 200');
    assert(state.getTaxAmount() === 180, 'Tax amount should be 180');
    assert(state.getTotalAmount() === 1980, 'Total should be 1980 (2000 - 200 + 180)');

    state.setDiscount({ type: 'percentage', value: 15 }); // 15% of 2000 = 300
    state = usePosStore.getState();
    assert(state.getDiscountAmount() === 300, 'Percentage discount should be 300');
    assert(state.getTaxAmount() === 170, 'Tax amount should be 170 (1700 * 0.10)');
    assert(state.getTotalAmount() === 1870, 'Total should be 1870 (2000 - 300 + 170)');

    // 9. Customer
    state.setCustomer(mockCustomer);
    state = usePosStore.getState();
    assert(state.selectedCustomer?.name === 'John Doe', 'Customer should be set');

    state.clearCustomer();
    state = usePosStore.getState();
    assert(state.selectedCustomer === null, 'Customer should be cleared');

    // 10. Workspace Persistence Note:
    // Since Zustand stores live outside the React tree, their state naturally
    // persists while tabs are mounted/unmounted by WorkspaceManager.

    // 11. Reset Sale
    state.resetSale();
    state = usePosStore.getState();
    assert(state.cartItems.length === 0, 'Reset should clear cart');
    assert(state.discount === null, 'Reset should clear discount');
    assert(state.taxRate === 0.10, 'Reset should keep tax rate if preserved globally'); // our reset doesn't clear tax rate

    console.log('All POS Store tests passed successfully!');
};

runTests();
