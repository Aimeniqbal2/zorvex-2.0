import React, { useEffect, useState, useCallback } from 'react';
import {
    getSecurityInventoryOverview,
    getSecurityStores,
    createSecurityStore,
    getSecurityStockAvailability,
    issueSecurityEquipment,
    returnSecurityEquipment,
    transferSecurityStoreStock,
    reportEquipmentIncident,
    resolveEquipmentIncident,
    getEquipmentIncidents,
    getSerializedEquipmentHistory,
    getSecurityItemProfiles,
    getEquipmentIssues,
    getOperationalSites
} from '../api';
import type {
    SecurityInventoryOverview,
    SecurityStoreProfile,
    SecurityStockAvailabilityItem,
    EquipmentIssue,
    EquipmentIncident,
    SerializedEquipmentHistory,
    OperationalSite
} from '../types';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { ErrorState } from '../../../components/ui/ErrorState';

type SubTab = 'availability' | 'stores' | 'custody' | 'transfers' | 'incidents' | 'serialized';

const SECURITY_CATEGORIES = [
    { value: 'UNIFORM', label: 'Uniform' },
    { value: 'SHOES_PPE', label: 'Shoes / PPE' },
    { value: 'RADIO_COMMS', label: 'Radio / Communication' },
    { value: 'TORCH_SECURITY', label: 'Torch / Security Equipment' },
    { value: 'CCTV_ELECTRONIC', label: 'CCTV / Electronic Equipment' },
    { value: 'ACCESS_CONTROL', label: 'Access-Control Equipment' },
    { value: 'CONSUMABLES', label: 'Consumables' },
    { value: 'CONTROLLED_REGULATED', label: 'Controlled / Regulated Equipment' },
    { value: 'WEAPONS_AMMO', label: 'Weapons / Ammunition' },
    { value: 'OTHER', label: 'Other Security Equipment' },
];

export const SecurityInventoryWorkspace: React.FC = () => {
    const [subTab, setSubTab] = useState<SubTab>('availability');
    const [overview, setOverview] = useState<SecurityInventoryOverview | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Filter states
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedStore, setSelectedStore] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('');
    const [isControlledFilter, setIsControlledFilter] = useState('');
    const [isSerializedFilter, setIsSerializedFilter] = useState('');
    const [custodyTypeFilter, setCustodyTypeFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');

    // Data collections
    const [stockList, setStockList] = useState<SecurityStockAvailabilityItem[]>([]);
    const [stores, setStores] = useState<SecurityStoreProfile[]>([]);
    const [allWarehouses, setAllWarehouses] = useState<Array<{ id: string; name: string; code: string }>>([]);
    const [issues, setIssues] = useState<EquipmentIssue[]>([]);
    const [incidents, setIncidents] = useState<EquipmentIncident[]>([]);
    const [sites, setSites] = useState<OperationalSite[]>([]);
    const [availableItems, setAvailableItems] = useState<Array<{ id: string; name: string; code: string; is_serialized: boolean }>>([]);

    // Serialized history lookup
    const [serialSearchInput, setSerialSearchInput] = useState('');
    const [serializedHistory, setSerializedHistory] = useState<SerializedEquipmentHistory | null>(null);
    const [loadingSerial, setLoadingSerial] = useState(false);

    // Modals
    const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);
    const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
    const [selectedIssueForReturn, setSelectedIssueForReturn] = useState<EquipmentIssue | null>(null);
    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
    const [isIncidentModalOpen, setIsIncidentModalOpen] = useState(false);
    const [isResolveModalOpen, setIsResolveModalOpen] = useState(false);
    const [selectedIncidentForResolve, setSelectedIncidentForResolve] = useState<EquipmentIncident | null>(null);
    const [isConfigureStoreModalOpen, setIsConfigureStoreModalOpen] = useState(false);

    // Form inputs state
    const [issueForm, setIssueForm] = useState({
        store_id: '',
        item_id: '',
        custody_type: 'EMPLOYEE' as 'EMPLOYEE' | 'SITE',
        employee_id: '',
        site_id: '',
        serial_number: '',
        quantity: 1,
        expected_return_date: '',
        purpose: '',
        condition: 'GOOD',
        notes: '',
        authorization_code: ''
    });

    const [returnForm, setReturnForm] = useState({
        store_id: '',
        condition: 'GOOD',
        notes: '',
        authorization_code: ''
    });

    const [transferForm, setTransferForm] = useState({
        from_store_id: '',
        to_store_id: '',
        item_id: '',
        quantity: 1,
        serial_numbers: '',
        notes: '',
        authorization_code: ''
    });

    const [incidentForm, setIncidentForm] = useState({
        incident_type: 'DAMAGED' as 'LOST' | 'DAMAGED' | 'UNUSABLE',
        issue_id: '',
        store_id: '',
        item_id: '',
        serial_number: '',
        quantity: 1,
        incident_date: new Date().toISOString().split('T')[0],
        condition_on_incident: '',
        damage_severity: 'MEDIUM',
        notes: ''
    });

    const [resolveForm, setResolveForm] = useState({
        status: 'APPROVED_WRITE_OFF',
        resolution_notes: '',
        approved_write_off: false,
        recommended_payroll_deduction: 0,
        deduction_notes: ''
    });

    const [storeForm, setStoreForm] = useState({
        warehouse_id: '',
        name: '',
        code: '',
        store_type: 'MAIN_STORE',
        site_id: '',
        is_armory: false,
        requires_strong_auth: false,
        notes: ''
    });

    // Fetch initial datasets
    const loadOverviewAndData = useCallback(async () => {
        setError(null);
        try {
            const [ov, storeRes, stockRes, issueRes, incRes, siteRes, profRes] = await Promise.all([
                getSecurityInventoryOverview(),
                getSecurityStores(),
                getSecurityStockAvailability({
                    search: searchQuery || undefined,
                    warehouse_id: selectedStore || undefined,
                    category: selectedCategory || undefined,
                    is_controlled: isControlledFilter || undefined,
                    is_serialized: isSerializedFilter || undefined
                }),
                getEquipmentIssues({ search: searchQuery || undefined, status: statusFilter || undefined }),
                getEquipmentIncidents(),
                getOperationalSites({ is_active: true, page: 1 }),
                getSecurityItemProfiles()
            ]);

            setOverview(ov);
            setStores(storeRes.stores || []);
            setAllWarehouses(storeRes.all_warehouses || []);
            setStockList(stockRes || []);
            setIssues(issueRes.results || []);
            setIncidents(incRes || []);
            setSites(siteRes.results || []);
            setAvailableItems((profRes.items || []).map((item: any) => ({
                id: item.id,
                name: item.name,
                code: item.item_code || item.code || item.sku || '',
                is_serialized: item.track_serial_number ?? item.is_serialized ?? false,
            })));
        } catch (err: any) {
            console.error('Failed to load security inventory data', err);
            setError(err.message || 'Failed to load security inventory.');
        }
    }, [searchQuery, selectedStore, selectedCategory, isControlledFilter, isSerializedFilter, statusFilter]);

    useEffect(() => {
        loadOverviewAndData();
    }, [loadOverviewAndData]);

    // Handle serial lookup
    const handleLookupSerial = async (serialToSearch?: string) => {
        const query = (serialToSearch || serialSearchInput).trim();
        if (!query) return;
        setLoadingSerial(true);
        try {
            const result = await getSerializedEquipmentHistory(query);
            setSerializedHistory(result);
        } catch (err: any) {
            alert(err?.response?.data?.error || 'Failed to find serialized history.');
            setSerializedHistory(null);
        } finally {
            setLoadingSerial(false);
        }
    };

    // Actions
    const handleIssueSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await issueSecurityEquipment({
                ...issueForm,
                quantity: Number(issueForm.quantity),
                employee_id: issueForm.custody_type === 'EMPLOYEE' ? issueForm.employee_id : null,
                site_id: issueForm.custody_type === 'SITE' ? issueForm.site_id : null,
                serial_number: issueForm.serial_number ? issueForm.serial_number.trim() : null
            });
            setIsIssueModalOpen(false);
            setIssueForm({
                store_id: '',
                item_id: '',
                custody_type: 'EMPLOYEE',
                employee_id: '',
                site_id: '',
                serial_number: '',
                quantity: 1,
                expected_return_date: '',
                purpose: '',
                condition: 'GOOD',
                notes: '',
                authorization_code: ''
            });
            await loadOverviewAndData();
        } catch (err: any) {
            alert(err?.response?.data?.error || err.message || 'Failed to issue equipment.');
        }
    };

    const handleReturnSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedIssueForReturn) return;
        try {
            await returnSecurityEquipment({
                issue_id: selectedIssueForReturn.id,
                store_id: returnForm.store_id || selectedIssueForReturn.warehouse,
                condition: returnForm.condition,
                notes: returnForm.notes,
                authorization_code: returnForm.authorization_code
            });
            setIsReturnModalOpen(false);
            setSelectedIssueForReturn(null);
            setReturnForm({ store_id: '', condition: 'GOOD', notes: '', authorization_code: '' });
            await loadOverviewAndData();
        } catch (err: any) {
            alert(err?.response?.data?.error || err.message || 'Failed to return equipment.');
        }
    };

    const handleTransferSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const serials = transferForm.serial_numbers
                ? transferForm.serial_numbers.split(',').map(s => s.trim()).filter(Boolean)
                : undefined;

            await transferSecurityStoreStock({
                from_store_id: transferForm.from_store_id,
                to_store_id: transferForm.to_store_id,
                item_id: transferForm.item_id,
                quantity: Number(transferForm.quantity),
                serial_numbers: serials,
                notes: transferForm.notes,
                authorization_code: transferForm.authorization_code
            });
            setIsTransferModalOpen(false);
            setTransferForm({
                from_store_id: '',
                to_store_id: '',
                item_id: '',
                quantity: 1,
                serial_numbers: '',
                notes: '',
                authorization_code: ''
            });
            await loadOverviewAndData();
        } catch (err: any) {
            alert(err?.response?.data?.error || err.message || 'Failed to execute store transfer.');
        }
    };

    const handleIncidentSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await reportEquipmentIncident({
                incident_type: incidentForm.incident_type,
                issue_id: incidentForm.issue_id || null,
                store_id: incidentForm.store_id || null,
                item_id: incidentForm.item_id || null,
                serial_number: incidentForm.serial_number || null,
                quantity: Number(incidentForm.quantity),
                incident_date: incidentForm.incident_date,
                condition_on_incident: incidentForm.condition_on_incident,
                damage_severity: incidentForm.damage_severity,
                notes: incidentForm.notes
            });
            setIsIncidentModalOpen(false);
            setIncidentForm({
                incident_type: 'DAMAGED',
                issue_id: '',
                store_id: '',
                item_id: '',
                serial_number: '',
                quantity: 1,
                incident_date: new Date().toISOString().split('T')[0],
                condition_on_incident: '',
                damage_severity: 'MEDIUM',
                notes: ''
            });
            await loadOverviewAndData();
        } catch (err: any) {
            alert(err?.response?.data?.error || err.message || 'Failed to report incident.');
        }
    };

    const handleResolveSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedIncidentForResolve) return;
        try {
            await resolveEquipmentIncident(selectedIncidentForResolve.id, {
                status: resolveForm.status,
                resolution_notes: resolveForm.resolution_notes,
                approved_write_off: resolveForm.approved_write_off,
                recommended_payroll_deduction: Number(resolveForm.recommended_payroll_deduction),
                deduction_notes: resolveForm.deduction_notes
            });
            setIsResolveModalOpen(false);
            setSelectedIncidentForResolve(null);
            setResolveForm({
                status: 'APPROVED_WRITE_OFF',
                resolution_notes: '',
                approved_write_off: false,
                recommended_payroll_deduction: 0,
                deduction_notes: ''
            });
            await loadOverviewAndData();
        } catch (err: any) {
            alert(err?.response?.data?.error || err.message || 'Failed to resolve incident.');
        }
    };

    const handleStoreConfigureSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await createSecurityStore(storeForm);
            setIsConfigureStoreModalOpen(false);
            setStoreForm({
                warehouse_id: '',
                name: '',
                code: '',
                store_type: 'MAIN_STORE',
                site_id: '',
                is_armory: false,
                requires_strong_auth: false,
                notes: ''
            });
            await loadOverviewAndData();
        } catch (err: any) {
            alert(err?.response?.data?.error || err.message || 'Failed to configure store.');
        }
    };

    if (error && !overview) {
        return <ErrorState message={error} onRetry={loadOverviewAndData} />;
    }

    return (
        <div className="security-inventory-workspace" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Header & Overview KPIs */}
            <div style={{
                background: 'var(--color-surface, #ffffff)',
                border: '1px solid var(--color-border, #e5e7eb)',
                borderRadius: '12px',
                padding: '24px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-text, #111827)' }}>
                            <i className="bx bx-shield-quarter" style={{ marginRight: '8px', color: 'var(--color-primary, #2563eb)' }}></i>
                            Security Stores & Equipment Inventory
                        </h2>
                        <p style={{ margin: '4px 0 0', color: 'var(--color-text-muted, #6b7280)', fontSize: '0.875rem' }}>
                            Universal inventory-backed controlled custody, stores, site assignments, serialized tracking, and damage workflows.
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <Button variant="secondary" onClick={() => setIsTransferModalOpen(true)}>
                            <i className="bx bx-transfer-alt" style={{ marginRight: '6px' }}></i> Stock Transfer
                        </Button>
                        <Button variant="secondary" onClick={() => setIsIncidentModalOpen(true)}>
                            <i className="bx bx-error" style={{ marginRight: '6px' }}></i> Report Loss/Damage
                        </Button>
                        <Button variant="primary" onClick={() => setIsIssueModalOpen(true)}>
                            <i className="bx bx-plus" style={{ marginRight: '6px' }}></i> Issue Equipment
                        </Button>
                    </div>
                </div>

                {/* KPI Cards */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
                    gap: '16px'
                }}>
                    <div style={{ padding: '16px', background: 'var(--color-surface-subtle, #f9fafb)', borderRadius: '8px', border: '1px solid var(--color-border, #e5e7eb)' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted, #6b7280)', textTransform: 'uppercase' }}>Total Stores</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: '4px', color: 'var(--color-text, #111827)' }}>
                            {overview?.total_stores ?? 0}
                        </div>
                    </div>

                    <div style={{ padding: '16px', background: 'var(--color-surface-subtle, #f9fafb)', borderRadius: '8px', border: '1px solid var(--color-border, #e5e7eb)' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted, #6b7280)', textTransform: 'uppercase' }}>Employee Custody</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: '4px', color: '#2563eb' }}>
                            {overview?.active_employee_issues ?? 0}
                        </div>
                    </div>

                    <div style={{ padding: '16px', background: 'var(--color-surface-subtle, #f9fafb)', borderRadius: '8px', border: '1px solid var(--color-border, #e5e7eb)' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted, #6b7280)', textTransform: 'uppercase' }}>Site Equipment</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: '4px', color: '#059669' }}>
                            {overview?.active_site_issues ?? 0}
                        </div>
                    </div>

                    <div style={{ padding: '16px', background: 'var(--color-surface-subtle, #f9fafb)', borderRadius: '8px', border: '1px solid var(--color-border, #e5e7eb)' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted, #6b7280)', textTransform: 'uppercase' }}>Controlled Items</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: '4px', color: '#7c3aed' }}>
                            {overview?.controlled_items_count ?? 0}
                        </div>
                    </div>

                    <div style={{ padding: '16px', background: 'var(--color-surface-subtle, #f9fafb)', borderRadius: '8px', border: '1px solid var(--color-border, #e5e7eb)' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted, #6b7280)', textTransform: 'uppercase' }}>Damaged Units</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: '4px', color: '#ea580c' }}>
                            {overview?.total_damaged_units ?? 0}
                        </div>
                    </div>

                    <div style={{ padding: '16px', background: 'var(--color-surface-subtle, #f9fafb)', borderRadius: '8px', border: '1px solid var(--color-border, #e5e7eb)' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted, #6b7280)', textTransform: 'uppercase' }}>Lost Units</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: '4px', color: '#dc2626' }}>
                            {overview?.total_lost_units ?? 0}
                        </div>
                    </div>

                    <div style={{ padding: '16px', background: 'var(--color-surface-subtle, #f9fafb)', borderRadius: '8px', border: '1px solid var(--color-border, #e5e7eb)' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted, #6b7280)', textTransform: 'uppercase' }}>Open Incidents</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: '4px', color: '#b91c1c' }}>
                            {overview?.open_incidents ?? 0}
                        </div>
                    </div>
                </div>
            </div>

            {/* Navigation Sub-Tabs */}
            <div style={{
                display: 'flex',
                gap: '8px',
                borderBottom: '1px solid var(--color-border, #e5e7eb)',
                paddingBottom: '8px'
            }}>
                {[
                    { id: 'availability', label: 'Stock Availability & Catalog', icon: 'bx-layer' },
                    { id: 'stores', label: 'Stores & Armories', icon: 'bx-store' },
                    { id: 'custody', label: 'Custody & Issues', icon: 'bx-user-check' },
                    { id: 'transfers', label: 'Store Transfers', icon: 'bx-transfer' },
                    { id: 'incidents', label: 'Lost / Damaged Incidents', icon: 'bx-shield-x' },
                    { id: 'serialized', label: 'Serialized Lifecycle Audit', icon: 'bx-barcode' },
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setSubTab(tab.id as SubTab)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '8px 16px',
                            borderRadius: '8px',
                            border: 'none',
                            background: subTab === tab.id ? 'var(--color-primary, #2563eb)' : 'transparent',
                            color: subTab === tab.id ? '#ffffff' : 'var(--color-text, #374151)',
                            fontWeight: subTab === tab.id ? 600 : 500,
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                        }}
                    >
                        <i className={`bx ${tab.icon}`}></i>
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Sub-Tab 1: Stock Availability */}
            {subTab === 'availability' && (
                <div style={{ background: 'var(--color-surface, #ffffff)', border: '1px solid var(--color-border, #e5e7eb)', borderRadius: '12px', padding: '20px' }}>
                    {/* Filters Toolbar */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '16px', alignItems: 'center' }}>
                        <Input
                            placeholder="Search item name or code..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            style={{ minWidth: '220px' }}
                        />
                        <select
                            value={selectedStore}
                            onChange={e => setSelectedStore(e.target.value)}
                            style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--color-border, #d1d5db)' }}
                        >
                            <option value="">All Stores & Armories</option>
                            {stores.map(st => (
                                <option key={st.warehouse} value={st.warehouse}>{st.warehouse_name} ({st.store_type_label})</option>
                            ))}
                        </select>
                        <select
                            value={selectedCategory}
                            onChange={e => setSelectedCategory(e.target.value)}
                            style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--color-border, #d1d5db)' }}
                        >
                            <option value="">All Security Categories</option>
                            {SECURITY_CATEGORIES.map(c => (
                                <option key={c.value} value={c.value}>{c.label}</option>
                            ))}
                        </select>
                        <select
                            value={isControlledFilter}
                            onChange={e => setIsControlledFilter(e.target.value)}
                            style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--color-border, #d1d5db)' }}
                        >
                            <option value="">All Control Levels</option>
                            <option value="true">Controlled Only</option>
                            <option value="false">Standard Only</option>
                        </select>
                        <select
                            value={isSerializedFilter}
                            onChange={e => setIsSerializedFilter(e.target.value)}
                            style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--color-border, #d1d5db)' }}
                        >
                            <option value="">All Item Types</option>
                            <option value="true">Serialized</option>
                            <option value="false">Non-Serialized</option>
                        </select>
                    </div>

                    {/* Stock Table */}
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid var(--color-border, #e5e7eb)', color: 'var(--color-text-muted, #6b7280)' }}>
                                    <th style={{ padding: '12px 8px' }}>Item Code</th>
                                    <th style={{ padding: '12px 8px' }}>Item Name</th>
                                    <th style={{ padding: '12px 8px' }}>Security Category</th>
                                    <th style={{ padding: '12px 8px' }}>Classification</th>
                                    <th style={{ padding: '12px 8px', textAlign: 'right' }}>Store Stock</th>
                                    <th style={{ padding: '12px 8px', textAlign: 'right' }}>Emp Custody</th>
                                    <th style={{ padding: '12px 8px', textAlign: 'right' }}>Site Assigned</th>
                                    <th style={{ padding: '12px 8px', textAlign: 'right' }}>Damaged</th>
                                    <th style={{ padding: '12px 8px', textAlign: 'right' }}>Lost</th>
                                    <th style={{ padding: '12px 8px', textAlign: 'right' }}>Total Managed</th>
                                    <th style={{ padding: '12px 8px', textAlign: 'center' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {stockList.length === 0 ? (
                                    <tr>
                                        <td colSpan={11} style={{ textAlign: 'center', padding: '32px', color: 'var(--color-text-muted, #6b7280)' }}>
                                            No stock records found matching filters.
                                        </td>
                                    </tr>
                                ) : (
                                    stockList.map(item => (
                                        <tr key={item.item_id} style={{ borderBottom: '1px solid var(--color-border, #f3f4f6)' }}>
                                            <td style={{ padding: '12px 8px', fontWeight: 600 }}>{item.item_code}</td>
                                            <td style={{ padding: '12px 8px' }}>
                                                <div style={{ fontWeight: 600 }}>{item.item_name}</div>
                                            </td>
                                            <td style={{ padding: '12px 8px' }}>
                                                <Badge variant="default">{item.category}</Badge>
                                            </td>
                                            <td style={{ padding: '12px 8px' }}>
                                                <div style={{ display: 'flex', gap: '4px' }}>
                                                    {item.is_controlled && <Badge variant="danger">Controlled</Badge>}
                                                    {item.is_serialized ? <Badge variant="primary">Serialized</Badge> : <Badge variant="default">Bulk</Badge>}
                                                </div>
                                            </td>
                                            <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: 700, color: '#059669' }}>
                                                {item.store_balance}
                                            </td>
                                            <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: 600, color: '#2563eb' }}>
                                                {item.issued_to_employees}
                                            </td>
                                            <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: 600, color: '#4f46e5' }}>
                                                {item.issued_to_sites}
                                            </td>
                                            <td style={{ padding: '12px 8px', textAlign: 'right', color: '#ea580c' }}>
                                                {item.damaged}
                                            </td>
                                            <td style={{ padding: '12px 8px', textAlign: 'right', color: '#dc2626' }}>
                                                {item.lost}
                                            </td>
                                            <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: 700 }}>
                                                {item.total_managed}
                                            </td>
                                            <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                                                <Button
                                                    variant="secondary"
                                                    size="sm"
                                                    onClick={() => {
                                                        setIssueForm(prev => ({ ...prev, item_id: item.item_id }));
                                                        setIsIssueModalOpen(true);
                                                    }}
                                                >
                                                    Issue
                                                </Button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Sub-Tab 2: Stores & Locations */}
            {subTab === 'stores' && (
                <div style={{ background: 'var(--color-surface, #ffffff)', border: '1px solid var(--color-border, #e5e7eb)', borderRadius: '12px', padding: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600 }}>Registered Security Stores & Armories</h3>
                            <p style={{ margin: '4px 0 0', color: 'var(--color-text-muted, #6b7280)', fontSize: '0.875rem' }}>
                                Warehouses configured as Main Stores, Branch Stores, Site Stores, or High-Security Armories.
                            </p>
                        </div>
                        <Button variant="primary" onClick={() => setIsConfigureStoreModalOpen(true)}>
                            <i className="bx bx-plus" style={{ marginRight: '6px' }}></i> Configure Store
                        </Button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
                        {stores.map(store => (
                            <div
                                key={store.id}
                                style={{
                                    border: '1px solid var(--color-border, #e5e7eb)',
                                    borderRadius: '8px',
                                    padding: '16px',
                                    background: store.is_armory ? 'rgba(239, 68, 68, 0.03)' : 'var(--color-surface, #ffffff)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '10px'
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                        <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--color-text, #111827)' }}>
                                            {store.warehouse_name}
                                        </div>
                                        <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted, #6b7280)' }}>
                                            Code: {store.warehouse_code}
                                        </div>
                                    </div>
                                    <Badge variant={store.is_armory ? 'danger' : 'primary'}>
                                        {store.store_type_label}
                                    </Badge>
                                </div>

                                {store.site_name && (
                                    <div style={{ fontSize: '0.8125rem', color: 'var(--color-text, #374151)' }}>
                                        <i className="bx bx-building" style={{ marginRight: '4px', color: '#6b7280' }}></i>
                                        Linked Site: <strong>{store.site_name}</strong>
                                    </div>
                                )}

                                {store.supervisor_name && (
                                    <div style={{ fontSize: '0.8125rem', color: 'var(--color-text, #374151)' }}>
                                        <i className="bx bx-user" style={{ marginRight: '4px', color: '#6b7280' }}></i>
                                        Supervisor / Custodian: <strong>{store.supervisor_name}</strong>
                                    </div>
                                )}

                                <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                                    {store.is_armory && (
                                        <span style={{ fontSize: '0.75rem', background: '#fee2e2', color: '#b91c1c', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
                                            <i className="bx bx-lock" style={{ marginRight: '3px' }}></i> Armory
                                        </span>
                                    )}
                                    {store.requires_strong_auth && (
                                        <span style={{ fontSize: '0.75rem', background: '#fef3c7', color: '#b45309', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
                                            Strong Auth Required
                                        </span>
                                    )}
                                </div>

                                {store.notes && (
                                    <div style={{ fontSize: '0.75rem', color: '#6b7280', fontStyle: 'italic', marginTop: '4px' }}>
                                        {store.notes}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Sub-Tab 3: Custody & Issues */}
            {subTab === 'custody' && (
                <div style={{ background: 'var(--color-surface, #ffffff)', border: '1px solid var(--color-border, #e5e7eb)', borderRadius: '12px', padding: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                            <Input
                                placeholder="Search employee, site, item, serial..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                style={{ width: '280px' }}
                            />
                            <select
                                value={custodyTypeFilter}
                                onChange={e => setCustodyTypeFilter(e.target.value)}
                                style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--color-border, #d1d5db)' }}
                            >
                                <option value="">All Custody Types</option>
                                <option value="EMPLOYEE">Employee Custody</option>
                                <option value="SITE">Site Equipment</option>
                            </select>
                            <select
                                value={statusFilter}
                                onChange={e => setStatusFilter(e.target.value)}
                                style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--color-border, #d1d5db)' }}
                            >
                                <option value="">All Statuses</option>
                                <option value="ISSUED">Issued (Active)</option>
                                <option value="RETURNED">Returned</option>
                                <option value="LOST">Lost</option>
                                <option value="DAMAGED">Damaged</option>
                                <option value="WRITTEN_OFF">Written Off</option>
                            </select>
                        </div>

                        <Button variant="primary" onClick={() => setIsIssueModalOpen(true)}>
                            <i className="bx bx-plus" style={{ marginRight: '6px' }}></i> Controlled Issue
                        </Button>
                    </div>

                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid var(--color-border, #e5e7eb)', color: 'var(--color-text-muted, #6b7280)' }}>
                                    <th style={{ padding: '12px 8px' }}>Custody Type</th>
                                    <th style={{ padding: '12px 8px' }}>Custodian / Target</th>
                                    <th style={{ padding: '12px 8px' }}>Item</th>
                                    <th style={{ padding: '12px 8px' }}>Serial No</th>
                                    <th style={{ padding: '12px 8px', textAlign: 'right' }}>Qty</th>
                                    <th style={{ padding: '12px 8px' }}>Source Store</th>
                                    <th style={{ padding: '12px 8px' }}>Issue Date</th>
                                    <th style={{ padding: '12px 8px' }}>Condition</th>
                                    <th style={{ padding: '12px 8px' }}>Status</th>
                                    <th style={{ padding: '12px 8px', textAlign: 'center' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {issues
                                    .filter(i => (!custodyTypeFilter || (i.custody_type || 'EMPLOYEE') === custodyTypeFilter))
                                    .map(row => (
                                        <tr key={row.id} style={{ borderBottom: '1px solid var(--color-border, #f3f4f6)' }}>
                                            <td style={{ padding: '12px 8px' }}>
                                                <Badge variant={row.custody_type === 'SITE' ? 'default' : 'primary'}>
                                                    {row.custody_type === 'SITE' ? 'Site' : 'Employee'}
                                                </Badge>
                                            </td>
                                            <td style={{ padding: '12px 8px' }}>
                                                {row.custody_type === 'SITE' ? (
                                                    <div>
                                                        <strong>{row.site_name}</strong>
                                                        {row.client_name && <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Client: {row.client_name}</div>}
                                                    </div>
                                                ) : (
                                                    <div>
                                                        <strong>{row.employee_name}</strong>
                                                        {row.employee_code && <span style={{ fontSize: '0.75rem', color: '#6b7280', marginLeft: '4px' }}>({row.employee_code})</span>}
                                                    </div>
                                                )}
                                            </td>
                                            <td style={{ padding: '12px 8px', fontWeight: 600 }}>{row.item_name}</td>
                                            <td style={{ padding: '12px 8px' }}>
                                                {row.serial_number ? (
                                                    <span
                                                        style={{ color: '#2563eb', cursor: 'pointer', textDecoration: 'underline' }}
                                                        onClick={() => {
                                                            setSubTab('serialized');
                                                            setSerialSearchInput(row.serial_number!);
                                                            handleLookupSerial(row.serial_number!);
                                                        }}
                                                    >
                                                        {row.serial_number}
                                                    </span>
                                                ) : '-'}
                                            </td>
                                            <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: 600 }}>
                                                {Number(row.quantity).toFixed(0)}
                                            </td>
                                            <td style={{ padding: '12px 8px' }}>{row.warehouse_name}</td>
                                            <td style={{ padding: '12px 8px' }}>{new Date(row.issued_at).toLocaleDateString()}</td>
                                            <td style={{ padding: '12px 8px' }}>{row.condition_label || row.issue_condition}</td>
                                            <td style={{ padding: '12px 8px' }}>
                                                <Badge variant={
                                                    row.status === 'ISSUED' ? 'warning' :
                                                    row.status === 'RETURNED' ? 'success' :
                                                    row.status === 'WRITTEN_OFF' ? 'default' : 'danger'
                                                }>
                                                    {row.status_label || row.status}
                                                </Badge>
                                            </td>
                                            <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                                                {row.status === 'ISSUED' && (
                                                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                                                        <Button
                                                            size="sm"
                                                            variant="secondary"
                                                            onClick={() => {
                                                                setSelectedIssueForReturn(row);
                                                                setIsReturnModalOpen(true);
                                                            }}
                                                        >
                                                            Return
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="danger"
                                                            onClick={() => {
                                                                setIncidentForm(prev => ({
                                                                    ...prev,
                                                                    issue_id: row.id,
                                                                    item_id: row.item,
                                                                    serial_number: row.serial_number || '',
                                                                    quantity: Number(row.quantity)
                                                                }));
                                                                setIsIncidentModalOpen(true);
                                                            }}
                                                        >
                                                            Report Loss
                                                        </Button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Sub-Tab 4: Store Transfers */}
            {subTab === 'transfers' && (
                <div style={{ background: 'var(--color-surface, #ffffff)', border: '1px solid var(--color-border, #e5e7eb)', borderRadius: '12px', padding: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600 }}>Controlled Store-to-Store & Site Transfers</h3>
                            <p style={{ margin: '4px 0 0', color: 'var(--color-text-muted, #6b7280)', fontSize: '0.875rem' }}>
                                Transfers execute strictly via Universal Inventory Transfer Service, preserving atomic serial location updates.
                            </p>
                        </div>
                        <Button variant="primary" onClick={() => setIsTransferModalOpen(true)}>
                            <i className="bx bx-transfer-alt" style={{ marginRight: '6px' }}></i> New Stock Transfer
                        </Button>
                    </div>

                    <div style={{ padding: '24px', background: 'var(--color-surface-subtle, #f9fafb)', borderRadius: '8px', border: '1px dashed var(--color-border, #d1d5db)', textAlign: 'center' }}>
                        <i className="bx bx-check-shield" style={{ fontSize: '2.5rem', color: '#059669', marginBottom: '8px' }}></i>
                        <h4 style={{ margin: '0 0 8px', fontSize: '1rem', fontWeight: 600 }}>Universal Stock Ledger Protection</h4>
                        <p style={{ margin: '0 auto', maxWidth: '600px', color: '#6b7280', fontSize: '0.875rem' }}>
                            All store-to-store, store-to-site, and site-to-store transfers create dual OUT / IN movement audit records in the universal stock ledger with zero balance divergence. Click "New Stock Transfer" above to initiate a verified stock relocation.
                        </p>
                    </div>
                </div>
            )}

            {/* Sub-Tab 5: Incidents (Lost/Damaged) */}
            {subTab === 'incidents' && (
                <div style={{ background: 'var(--color-surface, #ffffff)', border: '1px solid var(--color-border, #e5e7eb)', borderRadius: '12px', padding: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600 }}>Equipment Incidents (Lost, Damaged, Unusable)</h3>
                            <p style={{ margin: '4px 0 0', color: 'var(--color-text-muted, #6b7280)', fontSize: '0.875rem' }}>
                                Authorized investigation and resolution workflows. Recommended payroll recoveries do not auto-mutate employee salary.
                            </p>
                        </div>
                        <Button variant="primary" onClick={() => setIsIncidentModalOpen(true)}>
                            <i className="bx bx-error" style={{ marginRight: '6px' }}></i> Report Incident
                        </Button>
                    </div>

                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid var(--color-border, #e5e7eb)', color: 'var(--color-text-muted, #6b7280)' }}>
                                    <th style={{ padding: '12px 8px' }}>Incident No</th>
                                    <th style={{ padding: '12px 8px' }}>Type</th>
                                    <th style={{ padding: '12px 8px' }}>Item</th>
                                    <th style={{ padding: '12px 8px' }}>Serial No</th>
                                    <th style={{ padding: '12px 8px' }}>Responsible Party</th>
                                    <th style={{ padding: '12px 8px' }}>Incident Date</th>
                                    <th style={{ padding: '12px 8px' }}>Severity</th>
                                    <th style={{ padding: '12px 8px' }}>Status</th>
                                    <th style={{ padding: '12px 8px', textAlign: 'right' }}>Rec. Recovery</th>
                                    <th style={{ padding: '12px 8px', textAlign: 'center' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {incidents.length === 0 ? (
                                    <tr>
                                        <td colSpan={10} style={{ textAlign: 'center', padding: '32px', color: 'var(--color-text-muted, #6b7280)' }}>
                                            No equipment incident reports recorded.
                                        </td>
                                    </tr>
                                ) : (
                                    incidents.map(inc => (
                                        <tr key={inc.id} style={{ borderBottom: '1px solid var(--color-border, #f3f4f6)' }}>
                                            <td style={{ padding: '12px 8px', fontWeight: 700 }}>{inc.incident_number}</td>
                                            <td style={{ padding: '12px 8px' }}>
                                                <Badge variant={inc.incident_type === 'LOST' ? 'danger' : 'warning'}>
                                                    {inc.incident_type_label || inc.incident_type}
                                                </Badge>
                                            </td>
                                            <td style={{ padding: '12px 8px', fontWeight: 600 }}>{inc.item_name || '-'}</td>
                                            <td style={{ padding: '12px 8px' }}>{inc.serial_number || '-'}</td>
                                            <td style={{ padding: '12px 8px' }}>
                                                {inc.employee_name ? `Emp: ${inc.employee_name}` : inc.site_name ? `Site: ${inc.site_name}` : inc.store_name || '-'}
                                            </td>
                                            <td style={{ padding: '12px 8px' }}>{new Date(inc.incident_date).toLocaleDateString()}</td>
                                            <td style={{ padding: '12px 8px' }}>{inc.damage_severity || '-'}</td>
                                            <td style={{ padding: '12px 8px' }}>
                                                <Badge variant={
                                                    inc.status === 'REPORTED' ? 'warning' :
                                                    inc.status === 'UNDER_INVESTIGATION' ? 'default' :
                                                    inc.status === 'APPROVED_WRITE_OFF' ? 'danger' : 'success'
                                                }>
                                                    {inc.status_label || inc.status}
                                                </Badge>
                                            </td>
                                            <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: 600, color: Number(inc.recommended_payroll_deduction) > 0 ? '#b91c1c' : '#6b7280' }}>
                                                {Number(inc.recommended_payroll_deduction) > 0 ? `$${Number(inc.recommended_payroll_deduction).toFixed(2)}` : '-'}
                                            </td>
                                            <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                                                {inc.status !== 'CLOSED' && inc.status !== 'APPROVED_WRITE_OFF' && inc.status !== 'REJECTED' && (
                                                    <Button
                                                        size="sm"
                                                        variant="secondary"
                                                        onClick={() => {
                                                            setSelectedIncidentForResolve(inc);
                                                            setIsResolveModalOpen(true);
                                                        }}
                                                    >
                                                        Resolve
                                                    </Button>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Sub-Tab 6: Serialized Lifecycle Audit */}
            {subTab === 'serialized' && (
                <div style={{ background: 'var(--color-surface, #ffffff)', border: '1px solid var(--color-border, #e5e7eb)', borderRadius: '12px', padding: '20px' }}>
                    <div style={{ marginBottom: '20px' }}>
                        <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600 }}>Serialized Security Equipment Lifecycle Audit</h3>
                        <p style={{ margin: '4px 0 16px', color: 'var(--color-text-muted, #6b7280)', fontSize: '0.875rem' }}>
                            Inspect the immutable custody history, condition inspections, and incident logs for any serialized asset.
                        </p>

                        <div style={{ display: 'flex', gap: '10px', maxWidth: '500px' }}>
                            <Input
                                placeholder="Enter asset serial number (e.g. RAD-001)..."
                                value={serialSearchInput}
                                onChange={e => setSerialSearchInput(e.target.value)}
                            />
                            <Button variant="primary" onClick={() => handleLookupSerial()} disabled={loadingSerial}>
                                {loadingSerial ? 'Searching...' : 'Audit Serial'}
                            </Button>
                        </div>
                    </div>

                    {serializedHistory ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            {/* Current Asset Header */}
                            <div style={{ padding: '16px', background: 'var(--color-surface-subtle, #f9fafb)', borderRadius: '8px', border: '1px solid var(--color-border, #e5e7eb)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text, #111827)' }}>
                                        Serial: {serializedHistory.serial_number}
                                    </div>
                                    <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                                        Item: <strong>{serializedHistory.item_name}</strong> ({serializedHistory.item_code})
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <Badge variant={serializedHistory.current_status === 'ISSUED' ? 'warning' : serializedHistory.current_status === 'DEFECTIVE' ? 'danger' : 'success'}>
                                        Status: {serializedHistory.current_status}
                                    </Badge>
                                    <div style={{ fontSize: '0.8125rem', marginTop: '4px', color: '#374151' }}>
                                        Current Custodian/Location: <strong>{serializedHistory.current_custodian || serializedHistory.current_store || 'Unassigned'}</strong>
                                    </div>
                                </div>
                            </div>

                            {/* Custody History Timeline */}
                            <div>
                                <h4 style={{ margin: '0 0 12px', fontSize: '1rem', fontWeight: 600 }}>Immutable Custody History</h4>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {serializedHistory.custody_history.length === 0 ? (
                                        <div style={{ color: '#6b7280', fontSize: '0.875rem' }}>No custody records recorded for this serial number.</div>
                                    ) : (
                                        serializedHistory.custody_history.map((custody, idx) => (
                                            <div
                                                key={custody.issue_id || idx}
                                                style={{
                                                    padding: '12px 16px',
                                                    borderLeft: '3px solid #2563eb',
                                                    background: 'var(--color-surface, #ffffff)',
                                                    border: '1px solid var(--color-border, #e5e7eb)',
                                                    borderLeftWidth: '4px',
                                                    borderRadius: '6px'
                                                }}
                                            >
                                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                    <span style={{ fontWeight: 600 }}>
                                                        {custody.custody_type === 'SITE' ? 'Site Assignment' : 'Employee Custody'}: {custody.custodian}
                                                    </span>
                                                    <Badge variant={custody.status === 'ISSUED' ? 'warning' : 'success'}>{custody.status}</Badge>
                                                </div>
                                                <div style={{ fontSize: '0.8125rem', color: '#6b7280', marginTop: '4px' }}>
                                                    Issued: {new Date(custody.issued_at).toLocaleString()} | Source Store: {custody.store}
                                                    {custody.returned_at && ` | Returned: ${new Date(custody.returned_at).toLocaleString()}`}
                                                </div>
                                                {custody.purpose && (
                                                    <div style={{ fontSize: '0.8125rem', color: '#374151', marginTop: '4px' }}>
                                                        Purpose: {custody.purpose}
                                                    </div>
                                                )}
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            {/* Condition History Log */}
                            <div>
                                <h4 style={{ margin: '0 0 12px', fontSize: '1rem', fontWeight: 600 }}>Condition Inspection Log</h4>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    {serializedHistory.condition_history.map((cond, idx) => (
                                        <div key={idx} style={{ padding: '8px 12px', background: 'var(--color-surface-subtle, #f9fafb)', borderRadius: '6px', fontSize: '0.8125rem', display: 'flex', justifyContent: 'space-between' }}>
                                            <span>
                                                <strong>{cond.event}</strong>: {cond.condition}
                                                {cond.notes && <span style={{ color: '#6b7280', marginLeft: '6px' }}>({cond.notes})</span>}
                                            </span>
                                            <span style={{ color: '#6b7280' }}>
                                                {new Date(cond.date).toLocaleDateString()} by {cond.actor}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div style={{ padding: '32px', textAlign: 'center', color: '#6b7280' }}>
                            Search for any serialized item above to view complete chronological custody records.
                        </div>
                    )}
                </div>
            )}

            {/* MODAL: Issue Equipment */}
            {isIssueModalOpen && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
                }}>
                    <div style={{ background: '#ffffff', borderRadius: '12px', width: '550px', maxHeight: '90vh', overflowY: 'auto', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                        <h3 style={{ margin: '0 0 16px', fontSize: '1.25rem', fontWeight: 600 }}>Controlled Equipment Issue</h3>
                        <form onSubmit={handleIssueSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '4px' }}>Source Store / Armory *</label>
                                <select
                                    required
                                    value={issueForm.store_id}
                                    onChange={e => setIssueForm({ ...issueForm, store_id: e.target.value })}
                                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db' }}
                                >
                                    <option value="">Select Store</option>
                                    {stores.map(st => (
                                        <option key={st.warehouse} value={st.warehouse}>{st.warehouse_name} ({st.store_type_label})</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '4px' }}>Item *</label>
                                <select
                                    required
                                    value={issueForm.item_id}
                                    onChange={e => setIssueForm({ ...issueForm, item_id: e.target.value })}
                                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db' }}
                                >
                                    <option value="">Select Item</option>
                                    {availableItems.map(item => (
                                        <option key={item.id} value={item.id}>{item.name} ({item.code}) {item.is_serialized ? '[Serialized]' : ''}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '4px' }}>Custody Assignment Type *</label>
                                <div style={{ display: 'flex', gap: '16px' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                                        <input
                                            type="radio"
                                            checked={issueForm.custody_type === 'EMPLOYEE'}
                                            onChange={() => setIssueForm({ ...issueForm, custody_type: 'EMPLOYEE' })}
                                        />
                                        Employee Custody
                                    </label>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                                        <input
                                            type="radio"
                                            checked={issueForm.custody_type === 'SITE'}
                                            onChange={() => setIssueForm({ ...issueForm, custody_type: 'SITE' })}
                                        />
                                        Site Equipment Assignment
                                    </label>
                                </div>
                            </div>

                            {issueForm.custody_type === 'EMPLOYEE' ? (
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '4px' }}>Employee ID / UUID *</label>
                                    <Input
                                        placeholder="Enter Employee UUID"
                                        required
                                        value={issueForm.employee_id}
                                        onChange={e => setIssueForm({ ...issueForm, employee_id: e.target.value })}
                                    />
                                </div>
                            ) : (
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '4px' }}>Operational Site *</label>
                                    <select
                                        required
                                        value={issueForm.site_id}
                                        onChange={e => setIssueForm({ ...issueForm, site_id: e.target.value })}
                                        style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db' }}
                                    >
                                        <option value="">Select Operational Site</option>
                                        {sites.map(s => (
                                            <option key={s.id} value={s.id}>{s.name} ({s.customer_name || 'No Client'})</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <div>
                                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '4px' }}>Serial Number (if serialized)</label>
                                <Input
                                    placeholder="e.g. RAD-1004"
                                    value={issueForm.serial_number}
                                    onChange={e => setIssueForm({ ...issueForm, serial_number: e.target.value })}
                                />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '4px' }}>Quantity</label>
                                    <Input
                                        type="number"
                                        min="1"
                                        value={issueForm.quantity}
                                        onChange={e => setIssueForm({ ...issueForm, quantity: Number(e.target.value) })}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '4px' }}>Expected Return Date</label>
                                    <Input
                                        type="date"
                                        value={issueForm.expected_return_date}
                                        onChange={e => setIssueForm({ ...issueForm, expected_return_date: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '4px' }}>Purpose / Assignment Notes</label>
                                <Input
                                    placeholder="Duty assignment, deployment shift, etc."
                                    value={issueForm.purpose}
                                    onChange={e => setIssueForm({ ...issueForm, purpose: e.target.value })}
                                />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '4px' }}>Condition on Issue</label>
                                <select
                                    value={issueForm.condition}
                                    onChange={e => setIssueForm({ ...issueForm, condition: e.target.value })}
                                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db' }}
                                >
                                    <option value="NEW">New</option>
                                    <option value="GOOD">Good</option>
                                    <option value="FAIR">Fair</option>
                                </select>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '4px' }}>Authorization / Armory Code (for controlled items)</label>
                                <Input
                                    placeholder="Optional / Required for armories"
                                    value={issueForm.authorization_code}
                                    onChange={e => setIssueForm({ ...issueForm, authorization_code: e.target.value })}
                                />
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                                <Button type="button" variant="secondary" onClick={() => setIsIssueModalOpen(false)}>Cancel</Button>
                                <Button type="submit" variant="primary">Confirm Issue</Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL: Return Equipment */}
            {isReturnModalOpen && selectedIssueForReturn && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
                }}>
                    <div style={{ background: '#ffffff', borderRadius: '12px', width: '480px', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                        <h3 style={{ margin: '0 0 16px', fontSize: '1.25rem', fontWeight: 600 }}>Return Equipment to Store</h3>
                        <p style={{ margin: '0 0 14px', fontSize: '0.875rem', color: '#4b5563' }}>
                            Returning <strong>{selectedIssueForReturn.item_name}</strong>
                            {selectedIssueForReturn.serial_number && ` (Serial: ${selectedIssueForReturn.serial_number})`}
                        </p>
                        <form onSubmit={handleReturnSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '4px' }}>Target Store / Warehouse *</label>
                                <select
                                    required
                                    value={returnForm.store_id || selectedIssueForReturn.warehouse}
                                    onChange={e => setReturnForm({ ...returnForm, store_id: e.target.value })}
                                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db' }}
                                >
                                    {stores.map(st => (
                                        <option key={st.warehouse} value={st.warehouse}>{st.warehouse_name} ({st.store_type_label})</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '4px' }}>Returned Condition *</label>
                                <select
                                    value={returnForm.condition}
                                    onChange={e => setReturnForm({ ...returnForm, condition: e.target.value })}
                                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db' }}
                                >
                                    <option value="GOOD">Good / Serviceable</option>
                                    <option value="FAIR">Fair</option>
                                    <option value="DAMAGED">Damaged / Defective</option>
                                    <option value="UNUSABLE">Unusable / Beyond Repair</option>
                                </select>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '4px' }}>Inspection Notes</label>
                                <Input
                                    placeholder="Wear and tear, antenna damage, battery status, etc."
                                    value={returnForm.notes}
                                    onChange={e => setReturnForm({ ...returnForm, notes: e.target.value })}
                                />
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                                <Button type="button" variant="secondary" onClick={() => setIsReturnModalOpen(false)}>Cancel</Button>
                                <Button type="submit" variant="primary">Confirm Return</Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL: Stock Transfer */}
            {isTransferModalOpen && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
                }}>
                    <div style={{ background: '#ffffff', borderRadius: '12px', width: '520px', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                        <h3 style={{ margin: '0 0 16px', fontSize: '1.25rem', fontWeight: 600 }}>Store-to-Store Stock Transfer</h3>
                        <form onSubmit={handleTransferSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '4px' }}>From Store *</label>
                                    <select
                                        required
                                        value={transferForm.from_store_id}
                                        onChange={e => setTransferForm({ ...transferForm, from_store_id: e.target.value })}
                                        style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db' }}
                                    >
                                        <option value="">Source</option>
                                        {stores.map(st => (
                                            <option key={st.warehouse} value={st.warehouse}>{st.warehouse_name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '4px' }}>To Store *</label>
                                    <select
                                        required
                                        value={transferForm.to_store_id}
                                        onChange={e => setTransferForm({ ...transferForm, to_store_id: e.target.value })}
                                        style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db' }}
                                    >
                                        <option value="">Destination</option>
                                        {stores.map(st => (
                                            <option key={st.warehouse} value={st.warehouse}>{st.warehouse_name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '4px' }}>Item *</label>
                                <select
                                    required
                                    value={transferForm.item_id}
                                    onChange={e => setTransferForm({ ...transferForm, item_id: e.target.value })}
                                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db' }}
                                >
                                    <option value="">Select Item</option>
                                    {availableItems.map(item => (
                                        <option key={item.id} value={item.id}>{item.name} ({item.code}) {item.is_serialized ? '[Serialized]' : ''}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '4px' }}>Quantity *</label>
                                <Input
                                    type="number"
                                    min="1"
                                    value={transferForm.quantity}
                                    onChange={e => setTransferForm({ ...transferForm, quantity: Number(e.target.value) })}
                                />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '4px' }}>Serial Numbers (comma-separated if serialized)</label>
                                <Input
                                    placeholder="e.g. RAD-001, RAD-002"
                                    value={transferForm.serial_numbers}
                                    onChange={e => setTransferForm({ ...transferForm, serial_numbers: e.target.value })}
                                />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '4px' }}>Transfer Notes</label>
                                <Input
                                    placeholder="Reason for stock movement"
                                    value={transferForm.notes}
                                    onChange={e => setTransferForm({ ...transferForm, notes: e.target.value })}
                                />
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                                <Button type="button" variant="secondary" onClick={() => setIsTransferModalOpen(false)}>Cancel</Button>
                                <Button type="submit" variant="primary">Transfer Stock</Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL: Report Incident */}
            {isIncidentModalOpen && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
                }}>
                    <div style={{ background: '#ffffff', borderRadius: '12px', width: '500px', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                        <h3 style={{ margin: '0 0 16px', fontSize: '1.25rem', fontWeight: 600 }}>Report Equipment Loss / Damage</h3>
                        <form onSubmit={handleIncidentSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '4px' }}>Incident Type *</label>
                                <select
                                    value={incidentForm.incident_type}
                                    onChange={e => setIncidentForm({ ...incidentForm, incident_type: e.target.value as any })}
                                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db' }}
                                >
                                    <option value="DAMAGED">Damaged</option>
                                    <option value="LOST">Lost</option>
                                    <option value="UNUSABLE">Unusable / Destroyed</option>
                                </select>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '4px' }}>Incident Date</label>
                                <Input
                                    type="date"
                                    value={incidentForm.incident_date}
                                    onChange={e => setIncidentForm({ ...incidentForm, incident_date: e.target.value })}
                                />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '4px' }}>Severity</label>
                                <select
                                    value={incidentForm.damage_severity}
                                    onChange={e => setIncidentForm({ ...incidentForm, damage_severity: e.target.value })}
                                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db' }}
                                >
                                    <option value="LOW">Low</option>
                                    <option value="MEDIUM">Medium</option>
                                    <option value="HIGH">High</option>
                                    <option value="TOTAL_LOSS">Total Loss</option>
                                </select>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '4px' }}>Incident Description & Evidence Notes *</label>
                                <Input
                                    required
                                    placeholder="Describe circumstances, witness, police report if any..."
                                    value={incidentForm.notes}
                                    onChange={e => setIncidentForm({ ...incidentForm, notes: e.target.value })}
                                />
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                                <Button type="button" variant="secondary" onClick={() => setIsIncidentModalOpen(false)}>Cancel</Button>
                                <Button type="submit" variant="danger">Submit Incident</Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL: Resolve Incident */}
            {isResolveModalOpen && selectedIncidentForResolve && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
                }}>
                    <div style={{ background: '#ffffff', borderRadius: '12px', width: '500px', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                        <h3 style={{ margin: '0 0 16px', fontSize: '1.25rem', fontWeight: 600 }}>Resolve Incident {selectedIncidentForResolve.incident_number}</h3>
                        <form onSubmit={handleResolveSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '4px' }}>Resolution Status *</label>
                                <select
                                    value={resolveForm.status}
                                    onChange={e => setResolveForm({ ...resolveForm, status: e.target.value })}
                                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db' }}
                                >
                                    <option value="UNDER_INVESTIGATION">Under Investigation</option>
                                    <option value="APPROVED_REPAIR">Approved Repair</option>
                                    <option value="APPROVED_WRITE_OFF">Approved Write-Off</option>
                                    <option value="RESOLVED_FOUND">Resolved / Found</option>
                                    <option value="REJECTED">Rejected</option>
                                    <option value="CLOSED">Closed</option>
                                </select>
                            </div>

                            <div>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600 }}>
                                    <input
                                        type="checkbox"
                                        checked={resolveForm.approved_write_off}
                                        onChange={e => setResolveForm({ ...resolveForm, approved_write_off: e.target.checked })}
                                    />
                                    Approve Write-Off from Custody / Stores
                                </label>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '4px' }}>Recommended Payroll Deduction ($)</label>
                                <Input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={resolveForm.recommended_payroll_deduction}
                                    onChange={e => setResolveForm({ ...resolveForm, recommended_payroll_deduction: Number(e.target.value) })}
                                />
                                <small style={{ color: '#6b7280' }}>Note: Will NOT automatically deduct employee salary. Follows approved payroll deduction workflow.</small>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '4px' }}>Resolution Notes *</label>
                                <Input
                                    required
                                    placeholder="Approved justification, armorer sign-off, or recovery notes"
                                    value={resolveForm.resolution_notes}
                                    onChange={e => setResolveForm({ ...resolveForm, resolution_notes: e.target.value })}
                                />
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                                <Button type="button" variant="secondary" onClick={() => setIsResolveModalOpen(false)}>Cancel</Button>
                                <Button type="submit" variant="primary">Confirm Resolution</Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL: Configure Store */}
            {isConfigureStoreModalOpen && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
                }}>
                    <div style={{ background: '#ffffff', borderRadius: '12px', width: '500px', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                        <h3 style={{ margin: '0 0 16px', fontSize: '1.25rem', fontWeight: 600 }}>Configure Security Store / Armory</h3>
                        <form onSubmit={handleStoreConfigureSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '4px' }}>Link Existing Warehouse or Create New</label>
                                <select
                                    value={storeForm.warehouse_id}
                                    onChange={e => setStoreForm({ ...storeForm, warehouse_id: e.target.value })}
                                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db' }}
                                >
                                    <option value="">-- Create New Warehouse --</option>
                                    {allWarehouses.map(w => (
                                        <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
                                    ))}
                                </select>
                            </div>

                            {!storeForm.warehouse_id && (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '4px' }}>Store Name *</label>
                                        <Input
                                            required
                                            placeholder="e.g. Central Armory"
                                            value={storeForm.name}
                                            onChange={e => setStoreForm({ ...storeForm, name: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '4px' }}>Store Code *</label>
                                        <Input
                                            required
                                            placeholder="e.g. ARM-01"
                                            value={storeForm.code}
                                            onChange={e => setStoreForm({ ...storeForm, code: e.target.value })}
                                        />
                                    </div>
                                </div>
                            )}

                            <div>
                                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '4px' }}>Store Type *</label>
                                <select
                                    value={storeForm.store_type}
                                    onChange={e => setStoreForm({
                                        ...storeForm,
                                        store_type: e.target.value,
                                        is_armory: e.target.value === 'ARMORY',
                                        requires_strong_auth: e.target.value === 'ARMORY'
                                    })}
                                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db' }}
                                >
                                    <option value="MAIN_STORE">Main Store</option>
                                    <option value="BRANCH_STORE">Branch Store</option>
                                    <option value="SITE_STORE">Operational Site Store</option>
                                    <option value="ARMORY">Armory / High-Security Store</option>
                                </select>
                            </div>

                            {storeForm.store_type === 'SITE_STORE' && (
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '4px' }}>Linked Operational Site</label>
                                    <select
                                        value={storeForm.site_id}
                                        onChange={e => setStoreForm({ ...storeForm, site_id: e.target.value })}
                                        style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db' }}
                                    >
                                        <option value="">Select Site</option>
                                        {sites.map(s => (
                                            <option key={s.id} value={s.id}>{s.name}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: '16px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.8125rem' }}>
                                    <input
                                        type="checkbox"
                                        checked={storeForm.is_armory}
                                        onChange={e => setStoreForm({ ...storeForm, is_armory: e.target.checked })}
                                    />
                                    Armory (Weapons / Comms)
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.8125rem' }}>
                                    <input
                                        type="checkbox"
                                        checked={storeForm.requires_strong_auth}
                                        onChange={e => setStoreForm({ ...storeForm, requires_strong_auth: e.target.checked })}
                                    />
                                    Requires Armorer Auth
                                </label>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '4px' }}>Notes / Address</label>
                                <Input
                                    placeholder="Storage room number, safety specs, etc."
                                    value={storeForm.notes}
                                    onChange={e => setStoreForm({ ...storeForm, notes: e.target.value })}
                                />
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                                <Button type="button" variant="secondary" onClick={() => setIsConfigureStoreModalOpen(false)}>Cancel</Button>
                                <Button type="submit" variant="primary">Save Store</Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
