function formatCurrency(amount) {
    return "₨ " + Number(amount).toLocaleString('en-PK');
}

let orderDiscountValue = 0;
let orderDiscountType = 'percent';
let shiftTaxRate = parseFloat(localStorage.getItem('pos_tax_rate') || '0');

window.setDiscountType = (type) => {
    orderDiscountType = type;
    const discTypeEl = document.getElementById('discType');
    if (discTypeEl) discTypeEl.value = type;
    const pctBtn = document.getElementById('discTypePctBtn');
    const fixBtn = document.getElementById('discTypeFixedBtn');
    const label = document.getElementById('discInputLabel');
    if (type === 'percent') {
        pctBtn?.classList.add('selected');
        pctBtn?.style.setProperty('border-color', 'var(--primary)');
        pctBtn?.style.setProperty('color', 'var(--primary)');
        pctBtn?.style.setProperty('background', 'rgba(67,24,255,0.05)');
        fixBtn?.classList.remove('selected');
        fixBtn?.style.removeProperty('border-color');
        fixBtn?.style.removeProperty('color');
        fixBtn?.style.removeProperty('background');
        if (label) label.innerText = 'DISCOUNT PERCENTAGE (%)';
    } else {
        fixBtn?.classList.add('selected');
        fixBtn?.style.setProperty('border-color', 'var(--primary)');
        fixBtn?.style.setProperty('color', 'var(--primary)');
        fixBtn?.style.setProperty('background', 'rgba(67,24,255,0.05)');
        pctBtn?.classList.remove('selected');
        pctBtn?.style.removeProperty('border-color');
        pctBtn?.style.removeProperty('color');
        pctBtn?.style.removeProperty('background');
        if (label) label.innerText = 'DISCOUNT FIXED AMOUNT (PKR)';
    }
};

window.clearDiscount = () => {
    orderDiscountValue = 0;
    orderDiscountType = 'percent';
    const input = document.getElementById('discValueInput');
    if (input) input.value = '';
    window.setDiscountType('percent');
    document.getElementById('discountModal')?.classList.remove('active');
    if (typeof window.renderCart === 'function') window.renderCart();
};

window.selectTaxPreset = (rate) => {
    const input = document.getElementById('taxValueInput');
    if (input) input.value = rate;
    document.querySelectorAll('.tax-preset-btn').forEach(b => {
        if (parseFloat(b.innerText) === rate) {
            b.style.background = 'var(--primary)';
            b.style.color = '#fff';
        } else {
            b.style.background = '';
            b.style.color = '';
        }
    });
};

window.applyDiscountForm = () => {
    const val = parseFloat(document.getElementById('discValueInput')?.value || '0');
    if (isNaN(val) || val < 0) {
        alert("Please enter a valid discount value.");
        return;
    }
    orderDiscountValue = val;
    orderDiscountType = document.getElementById('discType')?.value || 'percent';
    document.getElementById('discountModal')?.classList.remove('active');
    if (typeof window.renderCart === 'function') window.renderCart();
};

window.applyTaxForm = () => {
    const val = parseFloat(document.getElementById('taxValueInput')?.value || '0');
    if (isNaN(val) || val < 0 || val > 100) {
        alert("Please enter a valid tax percentage (0-100).");
        return;
    }
    shiftTaxRate = val;
    localStorage.setItem('pos_tax_rate', val.toString());
    window.selectTaxPreset(val);
    document.getElementById('taxModal')?.classList.remove('active');
    if (typeof window.renderCart === 'function') window.renderCart();
};

function initPOS() {
    const token = localStorage.getItem('access_token');
    if (!token) { window.location.href = '/login/'; return; }

    const headersJSON = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
    const API = '/api';

    let products = [], cart = [], customers = [], activeSession = null;
    let selectedCustomerId = null;

    // UI Bridges
    const grid = document.getElementById('productGrid'), cartContainer = document.getElementById('cartContainer');
    const subNode = document.getElementById('cartSubtotal'), discNode = document.getElementById('cartDiscount');
    const taxNode = document.getElementById('cartTax'), totNode = document.getElementById('cartTotal');
    const barcodeScanner = document.getElementById('barcodeScanner'), posSearch = document.getElementById('posSearch');
    const categoryFilter = document.getElementById('categoryFilter');

    // CRM Bridges
    const customerSearch = document.getElementById('customerSearch');
    const customerResults = document.getElementById('customerResults');
    const selectedCustomerBadge = document.getElementById('selectedCustomerBadge');
    const scLabel = document.getElementById('scLabel');
    const clearCustomerBtn = document.getElementById('clearCustomerBtn');

    // Modals
    const sessionModal = document.getElementById('sessionModal'), closeSessionModal = document.getElementById('closeSessionModal');
    const paymentModal = document.getElementById('paymentModal'), receiptModal = document.getElementById('receiptModal');
    const customerModal = document.getElementById('customerModal');

    // ─── 1. Session Orchestration ────────────────────────────────────────────────
    async function checkSession() {
        try {
            const resp = await fetch(`${API}/sales/sessions/`, { headers: headersJSON });
            const data = await resp.json();
            const open = (data.results || data).find(s => s.status === 'OPEN');
            if (open) {
                activeSession = open;
                sessionModal.classList.remove('active');
                initTerminal();
            } else {
                sessionModal.classList.add('active');
            }
        } catch (e) { console.error("Session Check Failed", e); }
    }

    document.getElementById('sessionForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const opening = document.getElementById('openingCash').value;
        const resp = await fetch(`${API}/sales/sessions/`, {
            method: 'POST', headers: headersJSON,
            body: JSON.stringify({ opening_cash: opening })
        });
        if (resp.ok) {
            activeSession = await resp.json();
            sessionModal.classList.remove('active');
            initTerminal();
        } else {
            const err = await resp.json();
            alert(err.detail || "Failed to open session.");
        }
    });

    document.getElementById('closeSessionBtn').addEventListener('click', () => closeSessionModal.classList.add('active'));
    document.getElementById('reconcileForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const closing = document.getElementById('closingCash').value;
        const resp = await fetch(`${API}/sales/sessions/${activeSession.id}/`, {
            method: 'PATCH', headers: headersJSON,
            body: JSON.stringify({ status: 'CLOSED', closing_cash: closing })
        });
        if (resp.ok) {
            window.location.reload();
        } else {
            const err = await resp.json();
            alert(err.detail || "Failed to close session.");
        }
    });

    const exitPOS = () => {
        if (document.referrer && document.referrer.includes(window.location.host) && !document.referrer.includes('/pos')) {
            window.history.back();
        } else {
            window.location.href = '/';
        }
    };
    document.getElementById('closeOpenSessionBtn')?.addEventListener('click', exitPOS);
    document.getElementById('cancelOpenSessionBtn')?.addEventListener('click', exitPOS);
    document.getElementById('closeReconcileModalBtn')?.addEventListener('click', () => closeSessionModal.classList.remove('active'));
    document.getElementById('cancelReconcileBtn')?.addEventListener('click', () => closeSessionModal.classList.remove('active'));

    // ─── 2. Terminal Initialization ──────────────────────────────────────────────
    async function initTerminal() {
        try {
            const [pResp, cResp] = await Promise.all([
                fetch(`${API}/inventory/products/`, { headers: headersJSON }),
                fetch(`${API}/sales/customers/`, { headers: headersJSON })
            ]);

            const pData = await pResp.json();
            products = pData.results || pData;

            // Populate Categories
            const cats = [...new Set(products.map(p => p.category_name || "Hardware"))].filter(Boolean);
            categoryFilter.innerHTML = '<option value="">All Categories</option>';
            cats.forEach(c => categoryFilter.insertAdjacentHTML('beforeend', `<option value="${c}">${c}</option>`));

            renderGrid(products);

            const cData = await cResp.json();
            customers = cData.results || cData;
        } catch (e) { grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; color:var(--danger); padding:40px;">Terminal Offline: API Sync Failure.</div>`; }
    }

    function renderGrid(dataset) {
        grid.innerHTML = '';
        if(dataset.length === 0) {
            grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding: 40px; color: var(--text-muted);">No products match your search.</div>`;
            return;
        }
        dataset.forEach(p => {
            const empty = p.stock_quantity <= 0;
            const price = parseFloat(p.sale_price !== null && p.sale_price !== undefined ? p.sale_price : p.price);
            const card = document.createElement('div');
            card.className = `product-card ${empty ? 'empty-stock' : ''}`;
            card.innerHTML = `<h4>${p.brand} ${p.model_name}</h4>
                            <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">${p.barcode || 'No Barcode'}</div>
                            <p>PKR${price.toFixed(2)}</p>
                            <span>${empty ? 'OUT OF STOCK' : p.stock_quantity + ' available'}</span>`;
            if (!empty) card.addEventListener('click', () => pushToCart(p));
            grid.appendChild(card);
        });
    }

    // ─── 3. Global & Top Bar Searching ──────────────────────────────────────────
    
    // Laser Keyboard Binding
    barcodeScanner.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const val = barcodeScanner.value.trim().toLowerCase();
            if(!val) return;
            const hit = products.find(p => 
                (p.barcode && p.barcode.toLowerCase() === val) || 
                p.id.toLowerCase().includes(val) ||
                p.model_name.toLowerCase().includes(val) ||
                p.brand.toLowerCase().includes(val)
            );
            if (hit) {
                pushToCart(hit);
                barcodeScanner.style.borderColor = 'var(--success)';
                setTimeout(() => barcodeScanner.style.borderColor = 'var(--primary)', 300);
            } else {
                barcodeScanner.style.borderColor = 'var(--danger)';
                setTimeout(() => barcodeScanner.style.borderColor = 'var(--primary)', 500);
            }
            barcodeScanner.value = ''; // Fast reset for next laser scan
        }
    });

    // Top Bar General Search
    posSearch.addEventListener('input', (e) => {
        const q = e.target.value.toLowerCase();
        const cat = categoryFilter.value;
        const filtered = products.filter(p => {
            const matchQuery = !q || p.brand.toLowerCase().includes(q) || p.model_name.toLowerCase().includes(q) || (p.barcode && p.barcode.toLowerCase().includes(q));
            const matchCat = !cat || p.category_name === cat;
            return matchQuery && matchCat;
        });
        renderGrid(filtered);
    });

    categoryFilter.addEventListener('change', () => {
        posSearch.dispatchEvent(new Event('input')); // trigger combined filter
    });

    // ─── 4. Cart Management ──────────────────────────────────────────────────────
    function pushToCart(p) {
        const existing = cart.find(x => x.id === p.id);
        const price = parseFloat(p.sale_price !== null && p.sale_price !== undefined ? p.sale_price : p.price);
        
        if (existing) {
            if (existing.quantity < p.stock_quantity) existing.quantity++;
            else alert("Maximum available stock reached.");
        } else {
            cart.push({ id: p.id, name: `${p.brand} ${p.model_name}`, price: price, quantity: 1, stock: p.stock_quantity });
        }
        renderCart();
    }

    window.updateQty = (id, delta) => {
        const item = cart.find(x => x.id === id);
        if (!item) return;
        item.quantity += delta;
        if (item.quantity <= 0) cart = cart.filter(x => x.id !== id);
        else if (item.quantity > item.stock) { item.quantity = item.stock; alert("Stock limit reached."); }
        renderCart();
    };

    function renderCart() {
        cartContainer.innerHTML = '';
        let subtotal = 0;
        if (!cart.length) {
            cartContainer.innerHTML = '<div style="text-align:center; color:var(--text-muted); padding:40px;">Cart is empty</div>';
            updateFinancials(0); return;
        }

        cart.forEach(item => {
            subtotal += item.price * item.quantity;
            const div = document.createElement('div');
            div.className = 'cart-item';
            div.innerHTML = `
                <div class="ci-info">
                    <h5>${item.name}</h5>
                    <div class="ci-controls">
                        <button class="qty-btn" onclick="updateQty('${item.id}', -1)" style="background:var(--input-bg); color:var(--text-main);">-</button>
                        <span style="font-weight:800; min-width:20px; text-align:center; color:var(--text-main);">${item.quantity}</span>
                        <button class="qty-btn" onclick="updateQty('${item.id}', 1)" style="background:var(--primary);">+</button>
                    </div>
                </div>
                <div class="ci-price">PKR${(item.price * item.quantity).toFixed(2)}</div>
            `;
            cartContainer.appendChild(div);
        });
        updateFinancials(subtotal);
    }

    function updateFinancials(sub) {
        let discountAmt = 0;
        if (orderDiscountType === 'percent') {
            discountAmt = sub * (orderDiscountValue / 100);
        } else {
            discountAmt = orderDiscountValue;
        }
        discountAmt = Math.min(Math.max(discountAmt, 0), sub);
        const afterDiscount = Math.max(0, sub - discountAmt);

        const taxRate = shiftTaxRate || 0;
        const tax = afterDiscount * (taxRate / 100);
        const total = parseFloat((afterDiscount + tax).toFixed(2));

        if (discNode) {
            discNode.innerText = `-PKR${discountAmt.toFixed(2)}`;
            const discBadge = document.getElementById('discountRateBadge');
            if (discBadge) {
                if (discountAmt > 0 || orderDiscountValue > 0) {
                    discBadge.innerText = orderDiscountType === 'percent' ? `(${orderDiscountValue}%)` : `(Fixed)`;
                    discBadge.style.display = 'inline';
                } else {
                    discBadge.style.display = 'none';
                }
            }
        }
        if (subNode) subNode.innerText = `PKR${sub.toFixed(2)}`;
        if (taxNode) {
            taxNode.innerText = `+PKR${tax.toFixed(2)}`;
            const taxBadge = document.getElementById('taxRateBadge');
            if (taxBadge) {
                if (taxRate > 0) {
                    taxBadge.innerText = `(${taxRate}%)`;
                    taxBadge.style.display = 'inline';
                } else {
                    taxBadge.style.display = 'none';
                }
            }
        }
        if (totNode) {
            totNode.innerText = `PKR${total.toFixed(2)}`;
            totNode.dataset.net      = total;
            totNode.dataset.subtotal = sub.toFixed(2);
            totNode.dataset.discount = discountAmt.toFixed(2);
            totNode.dataset.tax      = tax.toFixed(2);
            totNode.dataset.taxrate  = taxRate;
        }
    }

    window.renderCart = renderCart;
    window.updateFinancials = updateFinancials;

    // ─── 5. CRM Advanced Searching ───────────────────────────────────────────────
    function renderCustomerResults(query) {
        if(!query) { customerResults.style.display = 'none'; return; }
        const q = query.toLowerCase();
        const hits = customers.filter(c => c.name.toLowerCase().includes(q) || (c.phone && c.phone.toLowerCase().includes(q)));
        
        customerResults.innerHTML = '';
        if(hits.length === 0) {
            customerResults.innerHTML = `<div style="padding:15px; font-size:12px; color:var(--text-muted); text-align:center;">No CRM profile matched. Register a new user.</div>`;
        } else {
            hits.forEach(c => {
                const row = document.createElement('div');
                row.style.padding = '12px 15px';
                row.style.cursor = 'pointer';
                row.style.borderBottom = '1px dashed var(--border-light)';
                row.style.fontSize = '13px';
                row.style.fontWeight = '600';
                row.innerHTML = `${c.name} <span style="float:right; color:var(--text-muted); font-size:11px;">${c.phone || 'No Phone'}</span>`;
                row.addEventListener('click', () => selectCustomer(c));
                customerResults.appendChild(row);
            });
        }
        customerResults.style.display = 'block';
    }

    customerSearch.addEventListener('input', (e) => renderCustomerResults(e.target.value));
    
    // Hide results if clicking outside
    document.addEventListener('click', (e) => {
        if(e.target !== customerSearch && e.target !== customerResults) {
            customerResults.style.display = 'none';
        }
    });

    function selectCustomer(cust) {
        selectedCustomerId = cust.id;
        scLabel.innerText = `Linked: ${cust.name} (${cust.phone || 'N/A'})`;
        customerResults.style.display = 'none';
        customerSearch.style.display = 'none';
        selectedCustomerBadge.style.display = 'flex';
        customerSearch.value = '';
    }

    clearCustomerBtn.addEventListener('click', () => {
        selectedCustomerId = null;
        selectedCustomerBadge.style.display = 'none';
        customerSearch.style.display = 'block';
    });

    document.getElementById('addCustomerBtn').addEventListener('click', () => customerModal.classList.add('active'));
    document.getElementById('closeCustomerModal').addEventListener('click', () => customerModal.classList.remove('active'));
    document.getElementById('customerForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = {
            name: document.getElementById('custName').value,
            phone: document.getElementById('custPhone').value,
            email: document.getElementById('custEmail').value
        };
        try {
            const resp = await fetch(`${API}/sales/customers/`, {
                method: 'POST', headers: headersJSON, body: JSON.stringify(payload)
            });
            if (!resp.ok) throw new Error("Failed to create customer");
            const newCust = await resp.json();
            customerModal.classList.remove('active');
            
            // Re-fetch customers & auto-select
            const cResp = await fetch(`${API}/sales/customers/`, { headers: headersJSON });
            const cData = await cResp.json();
            customers = cData.results || cData;
            selectCustomer(newCust);
        } catch(e) { alert(e.message); }
    });

    // ─── 6. Payment & Checkout ───────────────────────────────────────────────────
    const openPaymentBtn = document.getElementById('openPaymentBtn');
    openPaymentBtn.addEventListener('click', () => {
        if (!cart.length) return alert("Select products first.");
        document.getElementById('paymentDue').innerText = totNode.innerText;
        document.getElementById('receivedAmt').value = totNode.dataset.net;
        updateChange();
        paymentModal.classList.add('active');
    });

    const pBtns = document.querySelectorAll('.p-btn');
    pBtns.forEach(btn => btn.addEventListener('click', () => {
        pBtns.forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        const method = btn.dataset.method;
        document.getElementById('cashLogic').style.display = (method === 'cash') ? 'block' : 'none';
        document.getElementById('splitLogic').style.display = (method === 'split') ? 'flex' : 'none';
    }));

    function updateChange() {
        const due = parseFloat(totNode.dataset.net);
        const rec = parseFloat(document.getElementById('receivedAmt').value) || 0;
        document.getElementById('changeAmt').innerText = `PKR${Math.max(0, rec - due).toFixed(2)}`;
    }
    document.getElementById('receivedAmt').addEventListener('input', updateChange);

    document.getElementById('finalProcessBtn').addEventListener('click', async () => {
        const method = document.querySelector('.p-btn.selected').dataset.method;
        const net = parseFloat(totNode.dataset.net);

        // Crucial Validation for Credit Ledgers
        if (method === 'credit' && !selectedCustomerId) {
            alert("B2B Credit Sales REQUIRE a formal CRM Customer profile selection. Please search and select a client first before issuing debt.");
            paymentModal.classList.remove('active');
            customerSearch.focus();
            return;
        }

        // Build a numerically precise payload — all values rounded to 2dp
        const subtotal    = parseFloat(parseFloat(totNode.dataset.subtotal || '0').toFixed(2));
        const discountAmt = parseFloat(parseFloat(totNode.dataset.discount  || '0').toFixed(2));
        const taxAmt      = parseFloat(parseFloat(totNode.dataset.tax       || '0').toFixed(2));
        const totalAmt    = parseFloat(parseFloat(totNode.dataset.net       || net).toFixed(2));
        const receivedAmt = parseFloat(parseFloat(document.getElementById('receivedAmt').value || totalAmt).toFixed(2));

        const payload = {
            customer:        selectedCustomerId || null,
            subtotal:        subtotal,
            discount_amount: discountAmt,
            tax_amount:      taxAmt,
            tax_rate:        parseFloat(totNode.dataset.taxrate || '0'),
            total_amount:    totalAmt,
            payment_method:  method,
            received_amount: receivedAmt,
        };

        if (method === 'split') {
            payload.split_cash = parseFloat(document.getElementById('sCash').value) || 0;
            payload.split_card = parseFloat(document.getElementById('sCard').value) || 0;
        }

        // Add visual loading state
        const originalText = document.getElementById('finalProcessBtn').innerText;
        document.getElementById('finalProcessBtn').innerText = 'Deducting Stock Arrays...';
        
        try {
            const resp = await fetch(`${API}/sales/sales/`, {
                method: 'POST', headers: headersJSON, body: JSON.stringify(payload)
            });
            if (!resp.ok) {
                const err = await resp.json();
                throw new Error(err.detail || JSON.stringify(err));
            }
            const sale = await resp.json();

            // Create Items sequentially
            for (let item of cart) {
                await fetch(`${API}/sales/saleitems/`, {
                    method: 'POST', headers: headersJSON,
                    body: JSON.stringify({ sale: sale.id, product: item.id, quantity: item.quantity, unit_price: item.price })
                });
            }

            paymentModal.classList.remove('active');
            printReceipt(sale, cart, payload);
            cart = []; 
            orderDiscountValue = 0;
            orderDiscountType = 'percent';
            if (document.getElementById('discValueInput')) document.getElementById('discValueInput').value = '';
            clearCustomerBtn.click(); // Reset customer
            renderCart(); 
            initTerminal(); // Resync inventory logic
        } catch (e) {
            let msg = e.message;
            // Try to parse JSON error detail from DRF
            try {
                const parsed = JSON.parse(msg);
                if (parsed.detail) msg = parsed.detail;
                else if (parsed.non_field_errors) msg = parsed.non_field_errors.join(' ');
                else msg = Object.entries(parsed).map(([k,v]) => `${k}: ${Array.isArray(v)?v.join(', '):v}`).join('\n');
            } catch(_) {}
            alert("Transaction Failed: " + msg);
        }
        finally { document.getElementById('finalProcessBtn').innerText = originalText; }
    });

    function printReceipt(sale, items, meta) {
        const rc = document.getElementById('receiptContent');
        let html = `
            <div style="text-align:center; margin-bottom:15px; border-bottom:1px dashed #000; padding-bottom:10px;">
                <h2 style="margin:0; font-family:monospace; font-size:20px; font-weight:800;">ZORVEX ERP</h2>
                <p style="margin:2px 0; font-size:11px;">Digital Retail Terminal</p>
                <p style="margin:5px 0 0 0; font-size:12px; font-weight:bold;">Inv: #SAL-${sale.id.substring(0, 8).toUpperCase()}</p>
                <p style="margin:2px 0; font-size:11px;">Date: ${new Date().toLocaleString()}</p>
            </div>
            
            <div style="margin-bottom:15px; font-size:12px;">
                ${items.map(i => `
                    <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                        <span style="max-width:60%;">${i.quantity}x ${i.name}</span>
                        <span>PKR${(i.price * i.quantity).toFixed(2)}</span>
                    </div>
                `).join('')}
            </div>

            <div style="border-top:1px dashed #000; padding-top:10px; font-size:13px;">
                <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                    <span>Subtotal:</span><span>PKR${meta.subtotal.toFixed(2)}</span>
                </div>
                ${meta.discount_amount > 0 ? `
                <div style="display:flex; justify-content:space-between; margin-bottom:4px; color:#e11d48;">
                    <span>Discount:</span><span>-PKR${meta.discount_amount.toFixed(2)}</span>
                </div>` : ''}
                <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                    <span>Tax (${meta.tax_rate || 0}%):</span><span>+PKR${meta.tax_amount.toFixed(2)}</span>
                </div>
                <div style="display:flex; justify-content:space-between; font-weight:800; font-size:15px; margin-top:5px;">
                    <span>TOTAL:</span><span>PKR${meta.total_amount.toFixed(2)}</span>
                </div>
            </div>
            
            <div style="text-align:center; margin-top:20px; font-size:11px;">
                <p style="margin:0;">Method: ${meta.payment_method.toUpperCase()}</p>
                <p style="margin:5px 0 0 0; font-style:italic;">Thank you for your business!</p>
            </div>
        `;
        rc.innerHTML = html;
        receiptModal.classList.add('active');
        
        // Ensure browser print dialog ignores bg
        document.body.style.background = '#fff';
    }

    // Standard Listeners
    document.getElementById('closePaymentBtn').addEventListener('click', () => paymentModal.classList.remove('active'));
    document.getElementById('closeReceiptBtn').addEventListener('click', () => { 
        receiptModal.classList.remove('active');
        document.body.style.background = ''; // restore bg
    });

    // Initialize tax UI from localStorage
    const taxInputEl = document.getElementById('taxValueInput');
    if (taxInputEl) taxInputEl.value = shiftTaxRate;
    window.selectTaxPreset(shiftTaxRate);

    checkSession();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPOS);
} else {
    initPOS();
}

