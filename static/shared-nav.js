
/**
 * shared-nav.js
 * Role-aware sidebar navigation for Zorvex ERP.
 * Parses the JWT to get the user's role and hides unauthorized menu items.
 * Include before </body> on every authenticated page.
 */
(function () {
    'use strict';

    console.log('Shared Nav: Script loaded, checking DOM readiness...');

    function initSharedNav() {
        console.log('Shared Nav: Initializing navbar & controls...');
        var currentPage = window.location.pathname;
        var token = localStorage.getItem('access_token');

        // Auth guard
        if (currentPage !== '/login/' && !token) {
            console.warn('Shared Nav: No auth token found. Redirecting to login.');
            window.location.href = '/login/';
            return;
        }

        // Parse JWT payload to extract role
        function parseJwt(t) {
            try {
                var base64Url = t.split('.')[1];
                if (!base64Url) return {};
                var base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
                var padLen = (4 - (base64.length % 4)) % 4;
                var paddedBase64 = base64 + '='.repeat(padLen);
                var jsonPayload = decodeURIComponent(
                    window.atob(paddedBase64).split('').map(function (c) {
                        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
                    }).join('')
                );
                return JSON.parse(jsonPayload);
            } catch (e) {
                console.error('Failed to parse JWT:', e);
                return {};
            }
        }

        var payload = token ? parseJwt(token) : {};
        var userRole = String(payload.role || 'staff');
        var username = String(payload.username || 'User');
        console.log('Shared Nav: Authenticated user: ' + username + ' (Role: ' + userRole + ')');

        // Role hierarchy for UI gating
        var ROLE_LEVELS = {
            super_admin: 5, admin: 4, manager: 3,
            hardware_technician: 2, software_technician: 2,
            technician: 2,
            cashier: 1, staff: 0
        };

        var TECHNICIAN_ROLES = ['hardware_technician', 'software_technician'];
        var isTechnicianUser = TECHNICIAN_ROLES.includes(userRole);

        function canAccess(minRole) {
            return (ROLE_LEVELS[userRole] || 0) >= (ROLE_LEVELS[minRole] || 0);
        }

        var navItems = [
            { href: '/',              icon: 'bxs-dashboard',  label: 'Dashboard',     minRole: 'staff',   hide: false },
            { href: '/pos/',          icon: 'bx-credit-card', label: 'POS Sales',     minRole: 'cashier', hide: isTechnicianUser, requiredModule: 'pos' },
            { href: '/service-logs/', icon: 'bx-wrench',      label: 'Service Orders',minRole: 'cashier', hide: false, requiredModule: 'services' },
            { href: '/transactions/', icon: 'bx-receipt',     label: 'Transactions',  minRole: 'cashier', hide: isTechnicianUser, requiredModule: 'sales' },
            { href: '/analytics/',    icon: 'bx-trending-up', label: 'Analytics',     minRole: 'manager', hide: false, requiredModule: 'analytics' },
            { href: '/inventory/',    icon: 'bx-box',         label: 'Inventory',     minRole: 'manager', hide: false, requiredModule: 'inventory' },
            { href: '/vendors/',      icon: 'bx-buildings',   label: 'Vendors',       minRole: 'manager', hide: false, requiredModule: 'purchasing' },
            { href: '/credit/',       icon: 'bx-book',        label: 'Credit Ledger', minRole: 'manager', hide: isTechnicianUser, requiredModule: 'finance' },
            { href: '/team/',         icon: 'bx-group',       label: 'Team',          minRole: 'admin',   hide: false, requiredModule: 'hr' }
        ];

        function renderSidebar(enabledModules) {
            function buildNav() {
                return navItems
                    .filter(function (item) { 
                        var roleAllows = canAccess(item.minRole) && !item.hide;
                        var moduleAllows = !item.requiredModule || enabledModules[item.requiredModule] === true;
                        return roleAllows && moduleAllows;
                    })
                    .map(function (item) {
                        var isActive = currentPage === item.href;
                        var activeClass = isActive ? ' active' : '';
                        return '<a href="' + item.href + '" class="nav-item' + activeClass + '" title="' + item.label + '">' +
                            '<span class="nav-icon"><i class="bx ' + item.icon + '"></i></span>' +
                            '<span class="nav-label">' + item.label + '</span>' +
                            '</a>';
                    }).join('');
            }

            var avatarUrl = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(username) + '&background=4318ff&color=fff&rounded=true&size=32';
            var roleDisplay = userRole.replace(/_/g, ' ');

            var isSidebarCollapsed = localStorage.getItem('sidebar_collapsed') === 'true';
            if (window.innerWidth <= 1024) {
                isSidebarCollapsed = true; // Force icon logo on tablet/mobile by default
            }
            var sidebarClass = isSidebarCollapsed ? 'sidebar collapsed' : 'sidebar';
            var logoSrc = isSidebarCollapsed ? '/static/assets/logo-icon.png' : '/static/assets/logo-full.png';

            var sidebarHTML = '' +
                '<aside class="' + sidebarClass + '" id="mainSidebar">' +
                '<div class="brand">' +
                '<img src="' + logoSrc + '" alt="Zorvex ERP" class="brand-logo-img">' +
                '</div>' +
                '<p class="section-label">Main Menu</p>' +
                '<nav class="nav-menu" id="mainNav">' + buildNav() + '</nav>' +
                '<div style="margin-top:auto;padding-top:20px;border-top:1px solid var(--border-light);margin:auto 0 0 0;">' +
                '<div class="user-info-container" style="padding:12px 16px;display:flex;align-items:center;gap:10px;margin-bottom:8px;">' +
                '<img src="' + avatarUrl + '" alt="' + username + '" style="width:32px;height:32px;border-radius:50%;">' +
                '<div class="user-details" style="display:flex;flex-direction:column;">' +
                '<span style="font-size:13px;font-weight:700;color:var(--text-main);line-height:1;">' + username + '</span>' +
                '<span style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-top:3px;">' + roleDisplay + '</span>' +
                '</div>' +
                '</div>' +
                '<nav class="nav-menu">' +
                '<a href="#" class="nav-item" id="logoutBtn">' +
                '<span class="nav-icon"><i class="bx bx-lock-alt"></i></span>' +
                '<span class="nav-label">Logout</span>' +
                '</a>' +
                '</nav>' +
                '</div>' +
                '</aside>';

            // Inject sidebar
            var existingSidebar = document.querySelector('aside.sidebar, aside#mainSidebar');
            if (existingSidebar) {
                existingSidebar.outerHTML = sidebarHTML;
            } else {
                document.body.insertAdjacentHTML('afterbegin', sidebarHTML);
            }

            // Attach logout handler
            var logoutBtn = document.getElementById('logoutBtn');
            if (logoutBtn) {
                logoutBtn.addEventListener('click', function (e) {
                    e.preventDefault();
                    localStorage.clear();
                    window.location.href = '/login/';
                });
            }

            // Sidebar toggle button
            var headerActions = document.querySelector('.header-actions');
            if (headerActions && !document.querySelector('.sidebar-toggle-btn')) {
                var toggleBtn = document.createElement('button');
                toggleBtn.className = 'icon-btn sidebar-toggle-btn';
                toggleBtn.innerHTML = '<i class="bx bx-menu"></i>';
                toggleBtn.title = 'Toggle Sidebar Visibility';
                toggleBtn.addEventListener('click', function () {
                    var sidebar = document.querySelector('.sidebar');
                    if (!sidebar) return;
                    
                    if (window.innerWidth <= 1024) {
                        var isMobileOpen = sidebar.classList.toggle('mobile-open');
                        document.body.classList.toggle('tablet-drawer-open', isMobileOpen);
                        var logo = sidebar.querySelector('.brand img');
                        if (logo) {
                            logo.src = isMobileOpen
                                ? '/static/assets/logo-full.png'
                                : '/static/assets/logo-icon.png';
                        }
                    } else {
                        var isCollapsedNow = sidebar.classList.toggle('collapsed');
                        localStorage.setItem('sidebar_collapsed', isCollapsedNow);
                        var logo = sidebar.querySelector('.brand img');
                        if (logo) {
                            logo.src = isCollapsedNow
                                ? '/static/assets/logo-icon.png'
                                : '/static/assets/logo-full.png';
                        }
                    }
                });
                headerActions.insertBefore(toggleBtn, headerActions.firstChild);
            }
        }

        // Fetch module state
        fetch('/api/platform/module-state/', {
            headers: { 'Authorization': 'Bearer ' + token }
        })
        .then(function(res) {
            if (res.ok) return res.json();
            throw new Error('Module state fetch failed');
        })
        .then(function(data) {
            renderSidebar(data || {});
        })
        .catch(function(err) {
            console.warn(err);
            renderSidebar({});
        });

        // Global Search with Debounce (300ms)
        var searchBoxes = document.querySelectorAll('.search-box[data-global-search], .global-search-input');
        var API = '/api';

        searchBoxes.forEach(function (box) {
            var debounceTimer;
            var dropdown = document.createElement('div');
            dropdown.className = 'global-search-dropdown';
            dropdown.style.cssText = 'position:absolute;border:1px solid var(--border-light);border-radius:14px;box-shadow:var(--shadow-md);min-width:380px;max-height:400px;overflow-y:auto;z-index:9999;padding:8px;display:none;';
            box.parentNode.style.position = 'relative';
            box.parentNode.appendChild(dropdown);

            box.addEventListener('input', function (e) {
                clearTimeout(debounceTimer);
                var q = e.target.value.trim();
                if (q.length < 2) { dropdown.style.display = 'none'; return; }

                debounceTimer = setTimeout(function () {
                    fetch(API + '/search/?q=' + encodeURIComponent(q), {
                        headers: { 'Authorization': 'Bearer ' + token }
                    }).then(function (resp) {
                        if (!resp.ok) return;
                        return resp.json();
                    }).then(function (data) {
                        if (data) renderSearchResults(data, dropdown);
                    }).catch(function (err) { console.warn('Search error:', err); });
                }, 300);
            });

            document.addEventListener('click', function (e) {
                if (!box.contains(e.target) && !dropdown.contains(e.target)) {
                    dropdown.style.display = 'none';
                }
            });
        });

        function renderSearchResults(data, container) {
            var products = data.products || [];
            var customers = data.customers || [];
            var orders = data.orders || [];
            var sales = data.sales || [];
            var total = products.length + customers.length + orders.length + sales.length;

            if (total === 0) {
                container.innerHTML = '<p style="padding:20px;text-align:center;color:#94a3b8;font-size:13px;font-weight:600;">No results found</p>';
                container.style.display = 'block';
                return;
            }

            var html = '';
            if (products.length) {
                html += '<div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;padding:8px 12px;">Products</div>';
                products.forEach(function (p) {
                    html += '<div class="search-result-item" onclick="window.location.href=\'/inventory/\'" style="padding:10px 12px;border-radius:10px;cursor:pointer;">' +
                        '<div style="font-size:13px;font-weight:700;color:#0f172a;">' + p.brand + ' ' + p.model_name + '</div>' +
                        '<div style="font-size:11px;color:#64748b;">Stock: ' + p.stock_quantity + ' &bull; PKR' + parseFloat(p.sale_price).toLocaleString() + '</div>' +
                        '</div>';
                });
            }
            if (customers.length) {
                html += '<div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;padding:8px 12px;margin-top:4px;">Customers</div>';
                customers.forEach(function (c) {
                    html += '<div class="search-result-item" onclick="window.location.href=\'/credit/\'" style="padding:10px 12px;border-radius:10px;cursor:pointer;">' +
                        '<div style="font-size:13px;font-weight:700;color:#0f172a;">' + c.name + '</div>' +
                        '<div style="font-size:11px;color:#64748b;">' + (c.phone || '') + ' &bull; Balance: PKR' + parseFloat(c.balance || 0).toLocaleString() + '</div>' +
                        '</div>';
                });
            }
            if (orders.length) {
                html += '<div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;padding:8px 12px;margin-top:4px;">Service Orders</div>';
                orders.forEach(function (o) {
                    html += '<div class="search-result-item" onclick="window.location.href=\'/service-logs/\'" style="padding:10px 12px;border-radius:10px;cursor:pointer;">' +
                        '<div style="font-size:13px;font-weight:700;color:#0f172a;">' + o.customer_name + ' — ' + o.device_brand + ' ' + o.device_model + '</div>' +
                        '<div style="font-size:11px;color:#64748b;">Status: <strong>' + o.status + '</strong> &bull; ' + (o.phone || '') + '</div>' +
                        '</div>';
                });
            }
            if (sales.length) {
                html += '<div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;padding:8px 12px;margin-top:4px;">Historical Sales</div>';
                sales.forEach(function (s) {
                    var badge = s.payment_method === 'cash'
                        ? '<span style="color:#05cd99">CASH</span>'
                        : '<span style="color:#ffb547">CREDIT</span>';
                    html += '<div class="search-result-item" onclick="window.location.href=\'/\'" style="padding:10px 12px;border-radius:10px;cursor:pointer;">' +
                        '<div style="font-size:13px;font-weight:800;color:var(--primary);">#SAL-' + s.id.substring(0, 8).toUpperCase() + '</div>' +
                        '<div style="font-size:11px;color:#64748b;">' + badge + ' &bull; PKR' + parseFloat(s.total_amount).toLocaleString() + '</div>' +
                        '</div>';
                });
            }

            container.innerHTML = html;
            container.style.display = 'block';
        }

        // Profile Dropdown
        var userProfileNodes = document.querySelectorAll('.user-profile');
        userProfileNodes.forEach(function (node) {
            node.style.position = 'relative';
            node.style.cursor = 'pointer';

            var img = node.querySelector('img');
            var avatarSrc = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(username) + '&background=4318ff&color=fff&rounded=true';
            if (img) img.src = avatarSrc;

            var drop = document.createElement('div');
            drop.className = 'dropdown-panel';
            drop.style.cssText = 'position:absolute;right:0;top:50px;border:1px solid var(--border-light);border-radius:16px;width:280px;padding:20px;display:none;flex-direction:column;z-index:9000;cursor:default;';
            drop.innerHTML = '<div style="display:flex;align-items:center;gap:12px;margin-bottom:15px;border-bottom:1px solid var(--border-light);padding-bottom:15px;">' +
                '<img src="' + avatarSrc + '" style="width:48px;height:48px;border-radius:50%;box-shadow:0 5px 15px rgba(67,24,255,0.2);">' +
                '<div><h4 style="margin:0;font-size:16px;font-weight:800;color:var(--text-main);">' + username + '</h4>' +
                '<p style="margin:2px 0 0 0;font-size:12px;font-weight:700;color:var(--primary);text-transform:uppercase;">' + roleDisplay + '</p></div>' +
                '</div>' +
                '<a href="/team/" style="text-decoration:none;color:var(--text-main);font-size:14px;font-weight:600;padding:10px;border-radius:8px;display:block;transition:0.2s;background:var(--bg-secondary);text-align:center;">Manage HR Access Settings</a>';
            node.appendChild(drop);

            node.addEventListener('click', function (e) {
                if (drop.contains(e.target)) return;
                drop.style.display = drop.style.display === 'none' ? 'flex' : 'none';
                e.stopPropagation();
            });

            document.addEventListener('click', function (e) {
                if (!node.contains(e.target)) drop.style.display = 'none';
            });
        });

        // Bell / Notifications Dropdown
        var allIconBtns = Array.from(document.querySelectorAll('.icon-btn'));
        var bellNodes = allIconBtns.filter(function (btn) {
            return btn.innerHTML.indexOf('bx-bell') !== -1;
        });
        bellNodes.forEach(function (btn) {
            btn.style.position = 'relative';
            var notiDrop = document.createElement('div');
            notiDrop.className = 'dropdown-panel';
            notiDrop.style.cssText = 'position:absolute;right:-10px;top:45px;border:1px solid var(--border-light);border-radius:16px;width:320px;padding:20px 20px 30px 20px;display:none;flex-direction:column;z-index:9000;text-align:center;cursor:default;';
            notiDrop.innerHTML = '<h4 style="margin:0 0 15px 0;font-size:15px;font-weight:800;color:var(--text-main);text-align:left;border-bottom:1px solid var(--border-light);padding-bottom:10px;">Alerts</h4>' +
                '<div style="font-size:40px;margin-bottom:10px;"><i class="bx bx-party"></i></div>' +
                '<p style="margin:0;font-size:14px;font-weight:600;color:var(--text-main);">You\'re all caught up!</p>' +
                '<p style="margin:5px 0 0 0;font-size:12px;font-weight:500;color:var(--text-muted);">We\'ll notify you if any POS anomalies or inventory limits trigger.</p>';
            btn.appendChild(notiDrop);

            btn.addEventListener('click', function (e) {
                if (notiDrop.contains(e.target)) return;
                notiDrop.style.display = notiDrop.style.display === 'none' ? 'flex' : 'none';
                e.stopPropagation();
            });

            document.addEventListener('click', function (e) {
                if (!btn.contains(e.target)) notiDrop.style.display = 'none';
            });
        });

        // Expose role info globally
        window.erpUser = { role: userRole, payload: payload, isTechnician: isTechnicianUser };

        // Dark / Light Theme Toggle
        function updateToggleIcon(theme) {
            var btn = document.getElementById('themeToggleBtn');
            if (btn) {
                btn.innerHTML = theme === 'dark'
                    ? '<i class="bx bx-sun"></i>'
                    : '<i class="bx bx-moon"></i>';
            }
        }

        var savedTheme = localStorage.getItem('erp_theme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
        updateToggleIcon(savedTheme);

        if (!document.getElementById('themeToggleBtn')) {
            var themeBtn = document.createElement('button');
            themeBtn.id = 'themeToggleBtn';
            themeBtn.title = 'Toggle dark / light theme';
            themeBtn.innerHTML = savedTheme === 'dark' ? '<i class="bx bx-sun"></i>' : '<i class="bx bx-moon"></i>';
            document.body.appendChild(themeBtn);
        }

        document.addEventListener('click', function (e) {
            var target = e.target;
            if (target && (target.id === 'themeToggleBtn' || (target.closest && target.closest('#themeToggleBtn')))) {
                var current = document.documentElement.getAttribute('data-theme') || 'light';
                var next = current === 'dark' ? 'light' : 'dark';
                document.documentElement.setAttribute('data-theme', next);
                localStorage.setItem('erp_theme', next);
                updateToggleIcon(next);
            }
        });

        // Global Page Transition Loader
        function initGlobalLoader() {
            if (!document.getElementById('erpGlobalLoader')) {
                var loaderEl = document.createElement('div');
                loaderEl.className = 'global-loader';
                loaderEl.id = 'erpGlobalLoader';
                loaderEl.innerHTML = '<img src="/static/assets/logo-full.png" alt="Loading..." class="loader-logo"><div class="loader-spinner"></div>';
                document.body.appendChild(loaderEl);
            }
            var loader = document.getElementById('erpGlobalLoader');

            document.addEventListener('click', function (e) {
                var link = e.target.closest('a');
                if (link && link.href && !link.href.includes('#') && !link.href.includes('javascript:') && link.target !== '_blank' && link.hostname === window.location.hostname) {
                    loader.classList.add('active');
                }
            });

            window.addEventListener('pageshow', function () {
                loader.classList.remove('active');
            });
        }

        initGlobalLoader();
        
        // PWA Setup (Manifest & Service Worker)
        function initPWA() {
            // Inject manifest link if not present
            if (!document.querySelector('link[rel="manifest"]')) {
                var manifestLink = document.createElement('link');
                manifestLink.rel = 'manifest';
                manifestLink.href = '/static/manifest.json?v=2';
                document.head.appendChild(manifestLink);
            }

            // Register Service Worker
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.register('/sw.js')
                    .catch(function(err) { console.log('PWA SW err: ', err); });
            }
        }
        initPWA();

        function initNotifications() {
            var bellBtns = document.querySelectorAll('.header-actions .bx-bell');
            if (!bellBtns.length) return;

            var bellBtn = bellBtns[0].closest('button');
            if (!bellBtn) return;

            var panel = document.createElement('div');
            panel.id = 'notificationPanel';
            panel.style.position = 'absolute';
            // Determine position based on bell button bounding rect
            var rect = bellBtn.getBoundingClientRect();
            panel.style.top = (rect.bottom + 10) + 'px';
            panel.style.right = (window.innerWidth - rect.right - 10) + 'px';
            panel.style.width = '350px';
            panel.style.background = 'var(--card-bg, #fff)';
            panel.style.boxShadow = '0 10px 40px rgba(0,0,0,0.15)';
            panel.style.borderRadius = '12px';
            panel.style.border = '1px solid var(--border-color, #eee)';
            panel.style.zIndex = '9999';
            panel.style.display = 'none';
            panel.style.flexDirection = 'column';
            panel.style.maxHeight = '400px';
            panel.style.overflowY = 'auto';

            var header = document.createElement('div');
            header.style.padding = '15px';
            header.style.borderBottom = '1px solid var(--border-color, #eee)';
            header.style.fontWeight = '700';
            header.style.fontSize = '14px';
            header.style.color = 'var(--text-main, #333)';
            header.innerHTML = 'Notifications <span id="notifCount" style="background:var(--danger, #ff4d4f);color:#fff;padding:2px 8px;border-radius:10px;font-size:11px;margin-left:8px;">0</span>';
            panel.appendChild(header);

            var list = document.createElement('div');
            list.id = 'notificationList';
            list.style.padding = '10px 0';
            panel.appendChild(list);

            document.body.appendChild(panel);

            // Positioning relatively for badge
            bellBtn.style.position = 'relative';
            var badge = document.createElement('span');
            badge.style.position = 'absolute';
            badge.style.top = '0px';
            badge.style.right = '0px';
            badge.style.width = '8px';
            badge.style.height = '8px';
            badge.style.background = 'var(--danger, #ff4d4f)';
            badge.style.borderRadius = '50%';
            badge.style.display = 'none';
            bellBtn.appendChild(badge);

            bellBtn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                // recalculate position in case of window resize
                var r = bellBtn.getBoundingClientRect();
                panel.style.top = (r.bottom + 10) + 'px';
                panel.style.right = (window.innerWidth - r.right - 10) + 'px';
                panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
            });

            document.addEventListener('click', function(e) {
                if (!panel.contains(e.target) && !bellBtn.contains(e.target)) {
                    panel.style.display = 'none';
                }
            });

            function addNotificationItem(title, message, isWarning) {
                var item = document.createElement('div');
                item.style.padding = '12px 15px';
                item.style.borderBottom = '1px solid var(--border-light, #eee)';
                item.style.display = 'flex';
                item.style.gap = '12px';
                item.style.alignItems = 'flex-start';
                item.style.cursor = 'pointer';
                
                var iconColor = isWarning ? 'var(--danger, #ff4d4f)' : 'var(--primary, #2563eb)';
                var iconBg = isWarning ? 'rgba(255, 77, 79, 0.1)' : 'rgba(37, 99, 235, 0.1)';
                var iconClass = isWarning ? 'bx-error' : 'bx-info-circle';

                item.innerHTML = `
                    <div style="width:32px;height:32px;border-radius:50%;background:${iconBg};color:${iconColor};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                        <i class='bx ${iconClass}'></i>
                    </div>
                    <div>
                        <p style="margin:0;font-size:13px;font-weight:600;color:var(--text-main, #333);">${title}</p>
                        <p style="margin:3px 0 0 0;font-size:12px;color:var(--text-muted, #666);line-height:1.4;">${message}</p>
                    </div>
                `;
                item.addEventListener('mouseover', function() { item.style.background = 'var(--bg-secondary, #fafafa)'; });
                item.addEventListener('mouseout', function() { item.style.background = 'transparent'; });
                list.appendChild(item);
            }

            async function fetchNotifications() {
                var token = localStorage.getItem('access_token');
                if (!token) return;

                try {
                    var items = [];
                    
                    // 1. Fetch low stock products
                    var prodRes = await fetch('/api/inventory/products/low_stock/', { headers: { 'Authorization': 'Bearer ' + token } });
                    if (prodRes.ok) {
                        var products = await prodRes.json();
                        if (Array.isArray(products)) {
                            // strictly less than 5
                            var lowStock = products.filter(p => parseFloat(p.stock_quantity) < 5);
                            lowStock.forEach(p => {
                                items.push({
                                    title: 'Low Stock Alert',
                                    message: `${p.brand} ${p.model_name} stock is critically low (${parseFloat(p.stock_quantity)} remaining).`,
                                    isWarning: true
                                });
                            });
                        }
                    }

                    // 2. Fetch general system notifications
                    var notifRes = await fetch('/api/notifications/notifications/', { headers: { 'Authorization': 'Bearer ' + token } });
                    if (notifRes.ok) {
                        var notifs = await notifRes.json();
                        if (Array.isArray(notifs)) {
                            notifs.forEach(n => {
                                if (!n.is_read) {
                                    items.push({ title: n.title, message: n.message, isWarning: false });
                                }
                            });
                        }
                    }

                    list.innerHTML = '';
                    if (items.length > 0) {
                        badge.style.display = 'block';
                        document.getElementById('notifCount').innerText = items.length;
                        items.forEach(i => addNotificationItem(i.title, i.message, i.isWarning));
                    } else {
                        badge.style.display = 'none';
                        document.getElementById('notifCount').innerText = '0';
                        list.innerHTML = '<p style="text-align:center;padding:20px;color:var(--text-muted);font-size:13px;">No new notifications</p>';
                    }
                } catch (e) {
                    console.error("Notifications fetch error", e);
                }
            }

            // Fetch immediately, then poll every 30 seconds
            fetchNotifications();
            setInterval(fetchNotifications, 30000);
        }

        initNotifications();

    } // end initSharedNav

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            try { initSharedNav(); } catch(e) { alert("SharedNav Error: " + e.stack); }
        });
    } else {
        try { initSharedNav(); } catch(e) { alert("SharedNav Error: " + e.stack); }
    }

})();
