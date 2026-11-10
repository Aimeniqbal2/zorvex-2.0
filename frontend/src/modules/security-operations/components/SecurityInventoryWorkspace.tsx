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
    getOperationalSites,
    directStockInward,
    getActivePersonnel
} from '../api';
import { useToastStore } from '../../../stores/toastStore';
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

type MainTab = 'stock' | 'custody' | 'transfers_incidents';
type TransferSubTab = 'transfers' | 'incidents' | 'serialized';

const SECURITY_CATEGORIES = [
    { value: 'UNIFORM', label: 'Uniform & Dress' },
    { value: 'SHOES_PPE', label: 'Boots / Shoes & PPE' },
    { value: 'RADIO_COMMS', label: 'Radio & Wireless Comms' },
    { value: 'TORCH_SECURITY', label: 'Torches & Metal Detectors' },
    { value: 'WEAPONS_AMMO', label: 'Weapons & Ammunition' },
    { value: 'CCTV_ELECTRONIC', label: 'CCTV & Electronics' },
    { value: 'ACCESS_CONTROL', label: 'Access Control & Gates' },
    { value: 'CONSUMABLES', label: 'Consumables & Ammo Rounds' },
    { value: 'OTHER', label: 'Other Security Equipment' },
];

export const SecurityInventoryWorkspace: React.FC = () => {
    const [activeTab, setActiveTab] = useState<MainTab>('stock');
    const [transferSubTab, setTransferSubTab] = useState<TransferSubTab>('transfers');
    const [overview, setOverview] = useState<SecurityInventoryOverview | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState<boolean>(true);

    // Filters
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
    const [personnel, setPersonnel] = useState<Array<{ id: string; full_name: string; employee_id: string; designation_name?: string }>>([]);

    // Stores view toggle
    const [showStoreLocations, setShowStoreLocations] = useState(false);

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
    const [isDirectEntryModalOpen, setIsDirectEntryModalOpen] = useState(false);
    const [directEntryMode, setDirectEntryMode] = useState<'existing' | 'new'>('existing');

    // Forms
    const [directEntryForm, setDirectEntryForm] = useState({
        store_id: '',
        item_id: '',
        item_name: '',
        item_code: '',
        security_category: 'UNIFORM',
        unit_of_measure: 'pcs',
        track_serial_number: false,
        movement_type: 'OPENING_BALANCE' as 'OPENING_BALANCE' | 'IN' | 'ADJUSTMENT_IN',
        quantity: 1,
        unit_cost: 0,
        reference: '',
        notes: '',
        serial_numbers: ''
    });

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
        setLoading(true);
        try {
            const [ov, storeRes, stockRes, issueRes, incRes, siteRes, profRes, personnelRes] = await Promise.all([
                getSecurityInventoryOverview().catch(() => null),
                getSecurityStores().catch(() => ({ stores: [], all_warehouses: [] })),
                getSecurityStockAvailability({
                    search: searchQuery || undefined,
                    warehouse_id: selectedStore || undefined,
                    category: selectedCategory || undefined,
                    is_controlled: isControlledFilter || undefined,
                    is_serialized: isSerializedFilter || undefined
                }).catch(() => []),
                getEquipmentIssues({ search: searchQuery || undefined, status: statusFilter || undefined }).catch(() => ({ results: [] })),
                getEquipmentIncidents().catch(() => []),
                getOperationalSites({ is_active: true, page: 1 }).catch(() => ({ results: [] })),
                getSecurityItemProfiles().catch(() => ({ items: [] })),
                getActivePersonnel().catch(() => [])
            ]);

            setOverview(ov);
            setStores(storeRes?.stores || []);
            setAllWarehouses(storeRes?.all_warehouses || []);
            setStockList(stockRes || []);
            setIssues(issueRes?.results || []);
            setIncidents(incRes || []);
            setSites(siteRes?.results || []);
            setPersonnel(personnelRes || []);
            setAvailableItems((profRes?.items || []).map((item: any) => ({
                id: item.id,
                name: item.name,
                code: item.item_code || item.code || item.sku || '',
                is_serialized: item.track_serial_number ?? item.is_serialized ?? false,
            })));
        } catch (err: any) {
            console.error('Failed to load security inventory data', err);
            setError(err.message || 'Failed to load security inventory.');
        } finally {
            setLoading(false);
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
    const handleDirectEntrySubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!directEntryForm.store_id) {
            useToastStore.getState().error('Please select a destination store / armory.');
            return;
        }
        if (directEntryMode === 'existing' && !directEntryForm.item_id) {
            useToastStore.getState().error('Please select an item from store inventory.');
            return;
        }
        if (directEntryMode === 'new' && !directEntryForm.item_name.trim()) {
            useToastStore.getState().error('Please enter the new item name.');
            return;
        }
        if (Number(directEntryForm.quantity) <= 0) {
            useToastStore.getState().error('Quantity must be greater than zero.');
            return;
        }

        try {
            const payload: any = {
                store_id: directEntryForm.store_id,
                movement_type: directEntryForm.movement_type,
                quantity: Number(directEntryForm.quantity),
                unit_cost: Number(directEntryForm.unit_cost) || 0,
                reference: directEntryForm.reference.trim(),
                notes: directEntryForm.notes.trim(),
                serial_numbers: directEntryForm.serial_numbers.trim()
            };

            if (directEntryMode === 'existing') {
                payload.item_id = directEntryForm.item_id;
            } else {
                payload.item_name = directEntryForm.item_name.trim();
                payload.item_code = directEntryForm.item_code.trim();
                payload.security_category = directEntryForm.security_category;
                payload.unit_of_measure = directEntryForm.unit_of_measure.trim() || 'pcs';
                payload.track_serial_number = directEntryForm.track_serial_number;
            }

            const res = await directStockInward(payload);
            useToastStore.getState().success(res.message || 'Direct stock inward successfully recorded.');
            setIsDirectEntryModalOpen(false);
            setDirectEntryForm({
                store_id: (stores[0]?.warehouse as any) || stores[0]?.id || '',
                item_id: '',
                item_name: '',
                item_code: '',
                security_category: 'UNIFORM',
                unit_of_measure: 'pcs',
                track_serial_number: false,
                movement_type: 'OPENING_BALANCE',
                quantity: 1,
                unit_cost: 0,
                reference: '',
                notes: '',
                serial_numbers: ''
            });
            await loadOverviewAndData();
        } catch (err: any) {
            useToastStore.getState().error(err?.response?.data?.error || err.message || 'Failed to process direct stock entry.');
        }
    };

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
            useToastStore.getState().success('Equipment successfully issued.');
            await loadOverviewAndData();
        } catch (err: any) {
            useToastStore.getState().error(err?.response?.data?.error || err.message || 'Failed to issue equipment.');
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
            useToastStore.getState().success('Equipment return logged and stock updated.');
            await loadOverviewAndData();
        } catch (err: any) {
            useToastStore.getState().error(err?.response?.data?.error || err.message || 'Failed to return equipment.');
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
            useToastStore.getState().success('Store transfer completed successfully.');
            await loadOverviewAndData();
        } catch (err: any) {
            useToastStore.getState().error(err?.response?.data?.error || err.message || 'Failed to execute store transfer.');
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
            useToastStore.getState().success('Incident report successfully recorded.');
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
            useToastStore.getState().success('Incident resolved.');
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
            useToastStore.getState().success('Store / Armory configured successfully.');
            await loadOverviewAndData();
        } catch (err: any) {
            alert(err?.response?.data?.error || err.message || 'Failed to configure store.');
        }
    };

    if (error && !overview && stockList.length === 0) {
        return <ErrorState message={error} onRetry={loadOverviewAndData} />;
    }

    // Calculations for top metrics
    const totalInStoreStock = stockList.reduce((sum, item) => sum + (Number(item.store_balance) || 0), 0);
    const totalIssuedField = (overview?.active_employee_issues || 0) + (overview?.active_site_issues || 0);
    const totalDamagedOrLost = (overview?.total_damaged_units || 0) + (overview?.total_lost_units || 0);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '4px' }}>
            {/* Header & Primary Actions */}
            <div style={{
                background: 'var(--color-surface, #ffffff)',
                border: '1px solid var(--color-border, #e5e7eb)',
                borderRadius: '12px',
                padding: '20px 24px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                            width: '44px', height: '44px', borderRadius: '10px',
                            background: 'rgba(37, 99, 235, 0.1)', color: 'var(--color-primary, #2563eb)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px'
                        }}>
                            <i className="bx bx-shield-quarter"></i>
                        </div>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700, color: 'var(--color-text, #111827)' }}>
                                Security Stores & Equipment
                            </h2>
                            <p style={{ margin: '3px 0 0', color: 'var(--color-text-muted, #6b7280)', fontSize: '0.875rem' }}>
                                Manage armories, guard gear issues, store stock, and equipment returns.
                            </p>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <Button
                            variant="secondary"
                            onClick={() => setIsConfigureStoreModalOpen(true)}
                            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                        >
                            <i className="bx bx-plus"></i> + New Store Location
                        </Button>
                        <Button
                            variant="primary"
                            onClick={() => {
                                if (stores.length > 0 && !directEntryForm.store_id) {
                                    setDirectEntryForm(prev => ({ ...prev, store_id: (stores[0].warehouse as any) || stores[0].id }));
                                }
                                setIsDirectEntryModalOpen(true);
                            }}
                            style={{ background: '#10b981', borderColor: '#059669', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '6px' }}
                        >
                            <i className="bx bx-plus-circle"></i> + Direct Stock Entry
                        </Button>
                        <Button
                            variant="primary"
                            onClick={() => setIsIssueModalOpen(true)}
                            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                        >
                            <i className="bx bx-user-check"></i> + Issue to Guard
                        </Button>
                    </div>
                </div>

                {/* 2 Ways Stock Enters Store - Explanatory Strip */}
                <div style={{
                    marginTop: '16px',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                    gap: '12px'
                }}>
                    <div style={{
                        padding: '12px 14px',
                        borderRadius: '8px',
                        background: 'rgba(16, 185, 129, 0.06)',
                        border: '1px solid rgba(16, 185, 129, 0.25)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#10b981', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '13px' }}>
                                1
                            </div>
                            <div>
                                <div style={{ fontSize: '13px', fontWeight: 600, color: '#065f46' }}>
                                    Direct Stock Entry / Opening Balance
                                </div>
                                <div style={{ fontSize: '12px', color: '#047857' }}>
                                    Add existing weapons, uniforms, or off-PO stock manually into stores.
                                </div>
                            </div>
                        </div>
                        <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                                if (stores.length > 0 && !directEntryForm.store_id) {
                                    setDirectEntryForm(prev => ({ ...prev, store_id: (stores[0].warehouse as any) || stores[0].id }));
                                }
                                setIsDirectEntryModalOpen(true);
                            }}
                            style={{ background: '#ffffff', borderColor: '#10b981', color: '#065f46', whiteSpace: 'nowrap', fontSize: '12px' }}
                        >
                            + Enter Stock
                        </Button>
                    </div>

                    <div style={{
                        padding: '12px 14px',
                        borderRadius: '8px',
                        background: 'rgba(99, 102, 241, 0.06)',
                        border: '1px solid rgba(99, 102, 241, 0.25)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#6366f1', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '13px' }}>
                                2
                            </div>
                            <div>
                                <div style={{ fontSize: '13px', fontWeight: 600, color: '#3730a3' }}>
                                    Automatic Delivery via Purchase Orders
                                </div>
                                <div style={{ fontSize: '12px', color: '#4f46e5' }}>
                                    When goods arrive from a vendor PO, posting GRN instantly stocks your store.
                                </div>
                            </div>
                        </div>
                        <span style={{ fontSize: '11px', fontWeight: 600, color: '#4f46e5', background: '#ffffff', padding: '4px 8px', borderRadius: '4px', border: '1px solid rgba(99, 102, 241, 0.3)' }}>
                            Auto-Synced
                        </span>
                    </div>
                </div>

                {/* KPI Metrics */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: '14px',
                    marginTop: '16px'
                }}>
                    <div style={{
                        padding: '14px 16px',
                        borderRadius: '10px',
                        background: 'var(--color-surface-subtle, #f9fafb)',
                        border: '1px solid var(--color-border, #e5e7eb)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px'
                    }}>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted, #6b7280)', textTransform: 'uppercase' }}>
                            Stores & Armories
                        </span>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                            <span style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--color-text, #111827)' }}>
                                {stores.length || overview?.total_stores || 0}
                            </span>
                            <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                                locations
                            </span>
                        </div>
                    </div>

                    <div style={{
                        padding: '14px 16px',
                        borderRadius: '10px',
                        background: 'var(--color-surface-subtle, #f9fafb)',
                        border: '1px solid var(--color-border, #e5e7eb)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px'
                    }}>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted, #6b7280)', textTransform: 'uppercase' }}>
                            Available Store Stock
                        </span>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                            <span style={{ fontSize: '1.4rem', fontWeight: 700, color: '#10b981' }}>
                                {totalInStoreStock}
                            </span>
                            <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                                units in hand
                            </span>
                        </div>
                    </div>

                    <div style={{
                        padding: '14px 16px',
                        borderRadius: '10px',
                        background: 'var(--color-surface-subtle, #f9fafb)',
                        border: '1px solid var(--color-border, #e5e7eb)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px'
                    }}>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted, #6b7280)', textTransform: 'uppercase' }}>
                            Issued to Guards & Sites
                        </span>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                            <span style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--color-primary, #2563eb)' }}>
                                {totalIssuedField}
                            </span>
                            <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                                on duty
                            </span>
                        </div>
                    </div>

                    <div style={{
                        padding: '14px 16px',
                        borderRadius: '10px',
                        background: 'var(--color-surface-subtle, #f9fafb)',
                        border: '1px solid var(--color-border, #e5e7eb)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px'
                    }}>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted, #6b7280)', textTransform: 'uppercase' }}>
                            Reported Damaged / Lost
                        </span>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                            <span style={{ fontSize: '1.4rem', fontWeight: 700, color: totalDamagedOrLost > 0 ? '#ef4444' : '#6b7280' }}>
                                {totalDamagedOrLost}
                            </span>
                            <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                                units
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Streamlined Navigation Sub-Tabs */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid var(--color-border, #e5e7eb)',
                paddingBottom: '4px',
                flexWrap: 'wrap',
                gap: '8px'
            }}>
                <div style={{ display: 'flex', gap: '8px', overflowX: 'auto' }}>
                    <button
                        onClick={() => setActiveTab('stock')}
                        style={{
                            padding: '9px 18px',
                            borderRadius: '8px',
                            border: '1px solid',
                            borderColor: activeTab === 'stock' ? 'var(--color-primary, #2563eb)' : 'var(--color-border, #e5e7eb)',
                            background: activeTab === 'stock' ? 'rgba(37, 99, 235, 0.12)' : 'var(--color-surface, #ffffff)',
                            color: activeTab === 'stock' ? 'var(--color-primary, #2563eb)' : 'var(--color-text, #374151)',
                            fontWeight: activeTab === 'stock' ? 700 : 500,
                            fontSize: '13.5px',
                            cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '7px',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        <i className='bx bx-layer' style={{ fontSize: '16px' }}></i>
                        Store Stock & Warehouses
                    </button>

                    <button
                        onClick={() => setActiveTab('custody')}
                        style={{
                            padding: '9px 18px',
                            borderRadius: '8px',
                            border: '1px solid',
                            borderColor: activeTab === 'custody' ? 'var(--color-primary, #2563eb)' : 'var(--color-border, #e5e7eb)',
                            background: activeTab === 'custody' ? 'rgba(37, 99, 235, 0.12)' : 'var(--color-surface, #ffffff)',
                            color: activeTab === 'custody' ? 'var(--color-primary, #2563eb)' : 'var(--color-text, #374151)',
                            fontWeight: activeTab === 'custody' ? 700 : 500,
                            fontSize: '13.5px',
                            cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '7px',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        <i className='bx bx-user-check' style={{ fontSize: '16px' }}></i>
                        Guard Equipment Issues & Custody
                        {issues.filter(i => i.status === 'ISSUED').length > 0 && (
                            <span style={{ background: '#2563eb', color: '#fff', fontSize: '11px', padding: '1px 6px', borderRadius: '10px' }}>
                                {issues.filter(i => i.status === 'ISSUED').length}
                            </span>
                        )}
                    </button>

                    <button
                        onClick={() => setActiveTab('transfers_incidents')}
                        style={{
                            padding: '9px 18px',
                            borderRadius: '8px',
                            border: '1px solid',
                            borderColor: activeTab === 'transfers_incidents' ? 'var(--color-primary, #2563eb)' : 'var(--color-border, #e5e7eb)',
                            background: activeTab === 'transfers_incidents' ? 'rgba(37, 99, 235, 0.12)' : 'var(--color-surface, #ffffff)',
                            color: activeTab === 'transfers_incidents' ? 'var(--color-primary, #2563eb)' : 'var(--color-text, #374151)',
                            fontWeight: activeTab === 'transfers_incidents' ? 700 : 500,
                            fontSize: '13.5px',
                            cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '7px',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        <i className='bx bx-transfer-alt' style={{ fontSize: '16px' }}></i>
                        Transfers, Damage & Serial Audit
                    </button>
                </div>

                {activeTab === 'stock' && (
                    <button
                        onClick={() => setShowStoreLocations(!showStoreLocations)}
                        style={{
                            padding: '7px 12px',
                            borderRadius: '6px',
                            border: '1px solid var(--color-border, #e5e7eb)',
                            background: showStoreLocations ? 'var(--color-surface-secondary, #f1f5f9)' : 'transparent',
                            color: 'var(--color-text, #374151)',
                            fontSize: '12.5px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '5px'
                        }}
                    >
                        <i className='bx bx-store'></i>
                        {showStoreLocations ? 'Hide Store Locations' : `View Store Locations (${stores.length})`}
                    </button>
                )}
            </div>

            {/* TAB 1: STORE STOCK & WAREHOUSES */}
            {activeTab === 'stock' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* Collapsible Store Locations Grid */}
                    {showStoreLocations && (
                        <div style={{
                            background: 'var(--color-surface, #ffffff)',
                            border: '1px solid var(--color-border, #e5e7eb)',
                            borderRadius: '12px',
                            padding: '16px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '12px'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600 }}>Registered Store Locations & Armories</h3>
                                <Button size="sm" variant="primary" onClick={() => setIsConfigureStoreModalOpen(true)}>
                                    <i className="bx bx-plus"></i> + Add Location
                                </Button>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px' }}>
                                {stores.map(store => (
                                    <div
                                        key={store.id}
                                        style={{
                                            border: '1px solid var(--color-border, #e5e7eb)',
                                            borderRadius: '8px',
                                            padding: '12px',
                                            background: store.is_armory ? 'rgba(239, 68, 68, 0.03)' : 'var(--color-surface-subtle, #f9fafb)',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '6px'
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontWeight: 700, fontSize: '13.5px' }}>{store.warehouse_name}</span>
                                            <Badge variant={store.is_armory ? 'danger' : 'primary'}>
                                                {store.store_type_label || (store.is_armory ? 'Armory' : 'Store')}
                                            </Badge>
                                        </div>
                                        <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Code: {store.warehouse_code}</div>
                                        {store.site_name && (
                                            <div style={{ fontSize: '12px', color: 'var(--color-text)' }}>
                                                <i className="bx bx-building" style={{ marginRight: '4px' }}></i> Site: {store.site_name}
                                            </div>
                                        )}
                                        {store.supervisor_name && (
                                            <div style={{ fontSize: '12px', color: 'var(--color-text)' }}>
                                                <i className="bx bx-user" style={{ marginRight: '4px' }}></i> Custodian: {store.supervisor_name}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Stock Table Card */}
                    <div style={{
                        background: 'var(--color-surface, #ffffff)',
                        border: '1px solid var(--color-border, #e5e7eb)',
                        borderRadius: '12px',
                        padding: '18px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                    }}>
                        {/* Filters Toolbar */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '16px', alignItems: 'center' }}>
                            <div style={{ flex: 1, minWidth: '220px' }}>
                                <Input
                                    placeholder="Search item name or code..."
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                />
                            </div>
                            <select
                                value={selectedStore}
                                onChange={e => setSelectedStore(e.target.value)}
                                style={{
                                    padding: '9px 12px',
                                    borderRadius: '8px',
                                    border: '1px solid var(--color-border, #d1d5db)',
                                    background: 'var(--color-surface, #ffffff)',
                                    color: 'var(--color-text, #111827)',
                                    fontSize: '13px'
                                }}
                            >
                                <option value="">All Stores & Armories</option>
                                {stores.map(st => (
                                    <option key={st.warehouse} value={st.warehouse}>{st.warehouse_name}</option>
                                ))}
                            </select>
                            <select
                                value={selectedCategory}
                                onChange={e => setSelectedCategory(e.target.value)}
                                style={{
                                    padding: '9px 12px',
                                    borderRadius: '8px',
                                    border: '1px solid var(--color-border, #d1d5db)',
                                    background: 'var(--color-surface, #ffffff)',
                                    color: 'var(--color-text, #111827)',
                                    fontSize: '13px'
                                }}
                            >
                                <option value="">All Categories</option>
                                {SECURITY_CATEGORIES.map(c => (
                                    <option key={c.value} value={c.value}>{c.label}</option>
                                ))}
                            </select>
                            <select
                                value={isControlledFilter}
                                onChange={e => setIsControlledFilter(e.target.value)}
                                style={{
                                    padding: '9px 12px',
                                    borderRadius: '8px',
                                    border: '1px solid var(--color-border, #d1d5db)',
                                    background: 'var(--color-surface, #ffffff)',
                                    color: 'var(--color-text, #111827)',
                                    fontSize: '13px'
                                }}
                            >
                                <option value="">All Control Levels</option>
                                <option value="true">Controlled Only</option>
                                <option value="false">Standard Only</option>
                            </select>
                        </div>

                        {/* Stock Table */}
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                                <thead>
                                    <tr style={{ borderBottom: '2px solid var(--color-border, #e5e7eb)', color: 'var(--color-text-muted, #6b7280)' }}>
                                        <th style={{ padding: '12px 10px' }}>Item Code</th>
                                        <th style={{ padding: '12px 10px' }}>Item Name</th>
                                        <th style={{ padding: '12px 10px' }}>Category</th>
                                        <th style={{ padding: '12px 10px' }}>Type</th>
                                        <th style={{ padding: '12px 10px', textAlign: 'right' }}>In Store</th>
                                        <th style={{ padding: '12px 10px', textAlign: 'right' }}>With Guards</th>
                                        <th style={{ padding: '12px 10px', textAlign: 'right' }}>At Sites</th>
                                        <th style={{ padding: '12px 10px', textAlign: 'right' }}>Damaged / Lost</th>
                                        <th style={{ padding: '12px 10px', textAlign: 'right' }}>Total</th>
                                        <th style={{ padding: '12px 10px', textAlign: 'center' }}>Quick Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {stockList.length === 0 ? (
                                        <tr>
                                            <td colSpan={10} style={{ textAlign: 'center', padding: '36px', color: 'var(--color-text-muted, #6b7280)' }}>
                                                {loading ? 'Loading stock...' : 'No stock records found matching filters.'}
                                            </td>
                                        </tr>
                                    ) : (
                                        stockList.map(item => (
                                            <tr key={item.item_id} style={{ borderBottom: '1px solid var(--color-border, #f3f4f6)' }}>
                                                <td style={{ padding: '12px 10px', fontWeight: 600 }}>{item.item_code}</td>
                                                <td style={{ padding: '12px 10px' }}>
                                                    <div style={{ fontWeight: 600, color: 'var(--color-text, #111827)' }}>{item.item_name}</div>
                                                </td>
                                                <td style={{ padding: '12px 10px' }}>
                                                    <Badge variant="default">{item.category}</Badge>
                                                </td>
                                                <td style={{ padding: '12px 10px' }}>
                                                    <div style={{ display: 'flex', gap: '4px' }}>
                                                        {item.is_controlled && <Badge variant="danger">Controlled</Badge>}
                                                        {item.is_serialized ? <Badge variant="primary">Serialized</Badge> : <Badge variant="default">Bulk</Badge>}
                                                    </div>
                                                </td>
                                                <td style={{ padding: '12px 10px', textAlign: 'right', fontWeight: 700, color: '#10b981', fontSize: '1rem' }}>
                                                    {item.store_balance}
                                                </td>
                                                <td style={{ padding: '12px 10px', textAlign: 'right', fontWeight: 600, color: 'var(--color-primary, #2563eb)' }}>
                                                    {item.issued_to_employees}
                                                </td>
                                                <td style={{ padding: '12px 10px', textAlign: 'right', fontWeight: 600, color: '#4f46e5' }}>
                                                    {item.issued_to_sites}
                                                </td>
                                                <td style={{ padding: '12px 10px', textAlign: 'right', color: Number(item.damaged) + Number(item.lost) > 0 ? '#ef4444' : 'var(--color-text-muted)' }}>
                                                    {Number(item.damaged) + Number(item.lost)}
                                                </td>
                                                <td style={{ padding: '12px 10px', textAlign: 'right', fontWeight: 700 }}>
                                                    {item.total_managed}
                                                </td>
                                                <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                                                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                                                        <Button
                                                            variant="primary"
                                                            size="sm"
                                                            onClick={() => {
                                                                setIssueForm(prev => ({ ...prev, item_id: item.item_id }));
                                                                setIsIssueModalOpen(true);
                                                            }}
                                                        >
                                                            <i className="bx bx-user-plus" style={{ marginRight: '4px' }}></i> Issue
                                                        </Button>
                                                        <Button
                                                            variant="secondary"
                                                            size="sm"
                                                            onClick={() => {
                                                                setTransferForm(prev => ({ ...prev, item_id: item.item_id }));
                                                                setIsTransferModalOpen(true);
                                                            }}
                                                        >
                                                            Transfer
                                                        </Button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB 2: GUARD EQUIPMENT ISSUES & CUSTODY */}
            {activeTab === 'custody' && (
                <div style={{
                    background: 'var(--color-surface, #ffffff)',
                    border: '1px solid var(--color-border, #e5e7eb)',
                    borderRadius: '12px',
                    padding: '20px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', flex: 1 }}>
                            <div style={{ minWidth: '240px', flex: 1 }}>
                                <Input
                                    placeholder="Search guard name, code, serial number, or site..."
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                />
                            </div>
                            <select
                                value={custodyTypeFilter}
                                onChange={e => setCustodyTypeFilter(e.target.value)}
                                style={{
                                    padding: '9px 12px',
                                    borderRadius: '8px',
                                    border: '1px solid var(--color-border, #d1d5db)',
                                    background: 'var(--color-surface, #ffffff)',
                                    color: 'var(--color-text, #111827)',
                                    fontSize: '13px'
                                }}
                            >
                                <option value="">All Custody Types</option>
                                <option value="EMPLOYEE">Security Guard Custody</option>
                                <option value="SITE">Site Equipment</option>
                            </select>
                            <select
                                value={statusFilter}
                                onChange={e => setStatusFilter(e.target.value)}
                                style={{
                                    padding: '9px 12px',
                                    borderRadius: '8px',
                                    border: '1px solid var(--color-border, #d1d5db)',
                                    background: 'var(--color-surface, #ffffff)',
                                    color: 'var(--color-text, #111827)',
                                    fontSize: '13px'
                                }}
                            >
                                <option value="">All Statuses</option>
                                <option value="ISSUED">Currently Issued (Active)</option>
                                <option value="RETURNED">Returned to Store</option>
                                <option value="LOST">Lost</option>
                                <option value="DAMAGED">Damaged</option>
                            </select>
                        </div>

                        <Button variant="primary" onClick={() => setIsIssueModalOpen(true)}>
                            <i className="bx bx-shield-plus" style={{ marginRight: '6px' }}></i> Issue Equipment to Guard
                        </Button>
                    </div>

                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid var(--color-border, #e5e7eb)', color: 'var(--color-text-muted, #6b7280)' }}>
                                    <th style={{ padding: '12px 10px' }}>Assignment Type</th>
                                    <th style={{ padding: '12px 10px' }}>Guard / Site Custodian</th>
                                    <th style={{ padding: '12px 10px' }}>Equipment Item</th>
                                    <th style={{ padding: '12px 10px' }}>Serial Number</th>
                                    <th style={{ padding: '12px 10px', textAlign: 'right' }}>Qty</th>
                                    <th style={{ padding: '12px 10px' }}>Source Store</th>
                                    <th style={{ padding: '12px 10px' }}>Issue Date</th>
                                    <th style={{ padding: '12px 10px' }}>Condition</th>
                                    <th style={{ padding: '12px 10px' }}>Status</th>
                                    <th style={{ padding: '12px 10px', textAlign: 'center' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {issues
                                    .filter(i => (!custodyTypeFilter || (i.custody_type || 'EMPLOYEE') === custodyTypeFilter))
                                    .map(row => (
                                        <tr key={row.id} style={{ borderBottom: '1px solid var(--color-border, #f3f4f6)' }}>
                                            <td style={{ padding: '12px 10px' }}>
                                                <Badge variant={row.custody_type === 'SITE' ? 'default' : 'primary'}>
                                                    {row.custody_type === 'SITE' ? 'Site' : 'Guard'}
                                                </Badge>
                                            </td>
                                            <td style={{ padding: '12px 10px' }}>
                                                {row.custody_type === 'SITE' ? (
                                                    <div>
                                                        <strong>{row.site_name}</strong>
                                                        {row.client_name && <div style={{ fontSize: '11.5px', color: '#6b7280' }}>Client: {row.client_name}</div>}
                                                    </div>
                                                ) : (
                                                    <div>
                                                        <strong>{row.employee_name}</strong>
                                                        {row.employee_code && <span style={{ fontSize: '11.5px', color: '#6b7280', marginLeft: '5px' }}>({row.employee_code})</span>}
                                                    </div>
                                                )}
                                            </td>
                                            <td style={{ padding: '12px 10px', fontWeight: 600 }}>{row.item_name}</td>
                                            <td style={{ padding: '12px 10px' }}>
                                                {row.serial_number ? (
                                                    <span
                                                        style={{ color: 'var(--color-primary, #2563eb)', cursor: 'pointer', textDecoration: 'underline', fontWeight: 600 }}
                                                        onClick={() => {
                                                            setActiveTab('transfers_incidents');
                                                            setTransferSubTab('serialized');
                                                            setSerialSearchInput(row.serial_number!);
                                                            handleLookupSerial(row.serial_number!);
                                                        }}
                                                    >
                                                        {row.serial_number}
                                                    </span>
                                                ) : '-'}
                                            </td>
                                            <td style={{ padding: '12px 10px', textAlign: 'right', fontWeight: 600 }}>
                                                {Number(row.quantity).toFixed(0)}
                                            </td>
                                            <td style={{ padding: '12px 10px' }}>{row.warehouse_name}</td>
                                            <td style={{ padding: '12px 10px' }}>{new Date(row.issued_at).toLocaleDateString()}</td>
                                            <td style={{ padding: '12px 10px' }}>{row.condition_label || row.issue_condition}</td>
                                            <td style={{ padding: '12px 10px' }}>
                                                <Badge variant={
                                                    row.status === 'ISSUED' ? 'warning' :
                                                    row.status === 'RETURNED' ? 'success' :
                                                    row.status === 'WRITTEN_OFF' ? 'default' : 'danger'
                                                }>
                                                    {row.status === 'ISSUED' ? 'In Custody' : (row.status_label || row.status)}
                                                </Badge>
                                            </td>
                                            <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                                                {row.status === 'ISSUED' && (
                                                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                                                        <Button
                                                            size="sm"
                                                            variant="secondary"
                                                            onClick={() => {
                                                                setSelectedIssueForReturn(row);
                                                                setIsReturnModalOpen(true);
                                                            }}
                                                            style={{ color: '#059669', borderColor: '#059669' }}
                                                        >
                                                            <i className="bx bx-check" style={{ marginRight: '3px' }}></i> Return
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

            {/* TAB 3: TRANSFERS, INCIDENTS & SERIAL AUDIT */}
            {activeTab === 'transfers_incidents' && (
                <div style={{
                    background: 'var(--color-surface, #ffffff)',
                    border: '1px solid var(--color-border, #e5e7eb)',
                    borderRadius: '12px',
                    padding: '20px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '16px'
                }}>
                    {/* Sub-Toggle */}
                    <div style={{
                        display: 'flex',
                        gap: '8px',
                        borderBottom: '1px solid var(--color-border, #e5e7eb)',
                        paddingBottom: '12px'
                    }}>
                        <button
                            onClick={() => setTransferSubTab('transfers')}
                            style={{
                                padding: '8px 16px',
                                borderRadius: '8px',
                                border: '1px solid',
                                borderColor: transferSubTab === 'transfers' ? 'var(--color-primary, #2563eb)' : 'var(--color-border, #e5e7eb)',
                                background: transferSubTab === 'transfers' ? 'rgba(37, 99, 235, 0.12)' : 'transparent',
                                color: transferSubTab === 'transfers' ? 'var(--color-primary, #2563eb)' : 'var(--color-text, #374151)',
                                fontWeight: transferSubTab === 'transfers' ? 600 : 500,
                                fontSize: '13px',
                                cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '6px'
                            }}
                        >
                            <i className="bx bx-transfer"></i> Store Transfers
                        </button>

                        <button
                            onClick={() => setTransferSubTab('incidents')}
                            style={{
                                padding: '8px 16px',
                                borderRadius: '8px',
                                border: '1px solid',
                                borderColor: transferSubTab === 'incidents' ? '#ef4444' : 'var(--color-border, #e5e7eb)',
                                background: transferSubTab === 'incidents' ? 'rgba(239, 68, 68, 0.1)' : 'transparent',
                                color: transferSubTab === 'incidents' ? '#ef4444' : 'var(--color-text, #374151)',
                                fontWeight: transferSubTab === 'incidents' ? 600 : 500,
                                fontSize: '13px',
                                cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '6px'
                            }}
                        >
                            <i className="bx bx-error"></i> Damage & Loss Reports ({incidents.length})
                        </button>

                        <button
                            onClick={() => setTransferSubTab('serialized')}
                            style={{
                                padding: '8px 16px',
                                borderRadius: '8px',
                                border: '1px solid',
                                borderColor: transferSubTab === 'serialized' ? 'var(--color-primary, #2563eb)' : 'var(--color-border, #e5e7eb)',
                                background: transferSubTab === 'serialized' ? 'rgba(37, 99, 235, 0.12)' : 'transparent',
                                color: transferSubTab === 'serialized' ? 'var(--color-primary, #2563eb)' : 'var(--color-text, #374151)',
                                fontWeight: transferSubTab === 'serialized' ? 600 : 500,
                                fontSize: '13px',
                                cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '6px'
                            }}
                        >
                            <i className="bx bx-barcode"></i> Serial Number Lookup
                        </button>
                    </div>

                    {/* Transfers View */}
                    {transferSubTab === 'transfers' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Inter-Store & Armory Stock Transfers</h3>
                                    <p style={{ margin: '3px 0 0', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                                        Move uniforms, radios, or weapons from Central Store to Branch or Site Armories.
                                    </p>
                                </div>
                                <Button variant="primary" onClick={() => setIsTransferModalOpen(true)}>
                                    <i className="bx bx-transfer-alt" style={{ marginRight: '6px' }}></i> New Stock Transfer
                                </Button>
                            </div>

                            <div style={{
                                padding: '24px',
                                background: 'var(--color-surface-subtle, #f9fafb)',
                                borderRadius: '10px',
                                border: '1px dashed var(--color-border, #d1d5db)',
                                textAlign: 'center'
                            }}>
                                <i className="bx bx-transfer-alt" style={{ fontSize: '2.4rem', color: '#2563eb', marginBottom: '8px' }}></i>
                                <h4 style={{ margin: '0 0 6px', fontSize: '1rem', fontWeight: 600 }}>Relocate Equipment Between Stores</h4>
                                <p style={{ margin: '0 auto 16px', maxWidth: '540px', color: '#6b7280', fontSize: '0.875rem' }}>
                                    Need to dispatch uniforms or weapons to another branch or site store? Click below to record a verified stock relocation.
                                </p>
                                <Button variant="primary" onClick={() => setIsTransferModalOpen(true)}>
                                    <i className="bx bx-plus" style={{ marginRight: '6px' }}></i> Start Stock Transfer
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* Incidents View */}
                    {transferSubTab === 'incidents' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Equipment Incidents (Lost & Damaged)</h3>
                                    <p style={{ margin: '3px 0 0', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                                        Track damaged gear, lost items, and approve store write-offs or repair resolutions.
                                    </p>
                                </div>
                                <Button variant="primary" onClick={() => setIsIncidentModalOpen(true)} style={{ background: '#ef4444', borderColor: '#dc2626', color: '#fff' }}>
                                    <i className="bx bx-error" style={{ marginRight: '6px' }}></i> Report Lost / Damaged
                                </Button>
                            </div>

                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '2px solid var(--color-border, #e5e7eb)', color: 'var(--color-text-muted, #6b7280)' }}>
                                            <th style={{ padding: '12px 10px' }}>Incident #</th>
                                            <th style={{ padding: '12px 10px' }}>Type</th>
                                            <th style={{ padding: '12px 10px' }}>Item</th>
                                            <th style={{ padding: '12px 10px' }}>Serial No</th>
                                            <th style={{ padding: '12px 10px' }}>Responsible Guard / Site</th>
                                            <th style={{ padding: '12px 10px' }}>Date</th>
                                            <th style={{ padding: '12px 10px' }}>Severity</th>
                                            <th style={{ padding: '12px 10px' }}>Status</th>
                                            <th style={{ padding: '12px 10px', textAlign: 'center' }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {incidents.length === 0 ? (
                                            <tr>
                                                <td colSpan={9} style={{ textAlign: 'center', padding: '36px', color: 'var(--color-text-muted, #6b7280)' }}>
                                                    No equipment loss or damage reports recorded.
                                                </td>
                                            </tr>
                                        ) : (
                                            incidents.map(inc => (
                                                <tr key={inc.id} style={{ borderBottom: '1px solid var(--color-border, #f3f4f6)' }}>
                                                    <td style={{ padding: '12px 10px', fontWeight: 700 }}>{inc.incident_number}</td>
                                                    <td style={{ padding: '12px 10px' }}>
                                                        <Badge variant={inc.incident_type === 'LOST' ? 'danger' : 'warning'}>
                                                            {inc.incident_type_label || inc.incident_type}
                                                        </Badge>
                                                    </td>
                                                    <td style={{ padding: '12px 10px', fontWeight: 600 }}>{inc.item_name || '-'}</td>
                                                    <td style={{ padding: '12px 10px' }}>{inc.serial_number || '-'}</td>
                                                    <td style={{ padding: '12px 10px' }}>
                                                        {inc.employee_name ? `Guard: ${inc.employee_name}` : inc.site_name ? `Site: ${inc.site_name}` : inc.store_name || '-'}
                                                    </td>
                                                    <td style={{ padding: '12px 10px' }}>{new Date(inc.incident_date).toLocaleDateString()}</td>
                                                    <td style={{ padding: '12px 10px' }}>{inc.damage_severity || '-'}</td>
                                                    <td style={{ padding: '12px 10px' }}>
                                                        <Badge variant={
                                                            inc.status === 'REPORTED' ? 'warning' :
                                                            inc.status === 'UNDER_INVESTIGATION' ? 'default' :
                                                            inc.status === 'APPROVED_WRITE_OFF' ? 'danger' : 'success'
                                                        }>
                                                            {inc.status_label || inc.status}
                                                        </Badge>
                                                    </td>
                                                    <td style={{ padding: '12px 10px', textAlign: 'center' }}>
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

                    {/* Serialized Lookup View */}
                    {transferSubTab === 'serialized' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Serialized Equipment Lifecycle Audit</h3>
                                <p style={{ margin: '3px 0 12px', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                                    Search any radio, firearm, or electronic device by serial number to see its complete custody history.
                                </p>
                                <div style={{ display: 'flex', gap: '10px', maxWidth: '480px' }}>
                                    <Input
                                        placeholder="Enter serial number (e.g. RAD-001)..."
                                        value={serialSearchInput}
                                        onChange={e => setSerialSearchInput(e.target.value)}
                                    />
                                    <Button variant="primary" onClick={() => handleLookupSerial()} disabled={loadingSerial}>
                                        {loadingSerial ? 'Searching...' : 'Audit Serial'}
                                    </Button>
                                </div>
                            </div>

                            {serializedHistory ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '8px' }}>
                                    <div style={{ padding: '16px', background: 'var(--color-surface-subtle, #f9fafb)', borderRadius: '8px', border: '1px solid var(--color-border, #e5e7eb)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--color-text, #111827)' }}>
                                                Serial: {serializedHistory.serial_number}
                                            </div>
                                            <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                                                Item: <strong>{serializedHistory.item_name}</strong> ({serializedHistory.item_code})
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <Badge variant={serializedHistory.current_status === 'ISSUED' ? 'warning' : 'success'}>
                                                {serializedHistory.current_status}
                                            </Badge>
                                            <div style={{ fontSize: '0.8125rem', marginTop: '4px', color: '#374151' }}>
                                                Location: <strong>{serializedHistory.current_custodian || serializedHistory.current_store || 'Unassigned'}</strong>
                                            </div>
                                        </div>
                                    </div>

                                    <div>
                                        <h4 style={{ margin: '0 0 10px', fontSize: '0.95rem', fontWeight: 600 }}>Custody Timeline</h4>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            {serializedHistory.custody_history.map((custody, idx) => (
                                                <div
                                                    key={custody.issue_id || idx}
                                                    style={{
                                                        padding: '10px 14px',
                                                        borderLeft: '4px solid #2563eb',
                                                        background: 'var(--color-surface, #ffffff)',
                                                        border: '1px solid var(--color-border, #e5e7eb)',
                                                        borderLeftWidth: '4px',
                                                        borderRadius: '6px'
                                                    }}
                                                >
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                                                        <span style={{ fontWeight: 600 }}>{custody.custodian}</span>
                                                        <Badge variant={custody.status === 'ISSUED' ? 'warning' : 'success'}>{custody.status}</Badge>
                                                    </div>
                                                    <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '3px' }}>
                                                        Issued: {new Date(custody.issued_at).toLocaleDateString()} | Store: {custody.store}
                                                        {custody.returned_at && ` | Returned: ${new Date(custody.returned_at).toLocaleDateString()}`}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div style={{ padding: '24px', textAlign: 'center', color: '#6b7280', fontSize: '13px' }}>
                                    Enter a serial number above and click Audit Serial to view complete records.
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* MODALS */}

            {/* MODAL 1: Issue Equipment */}
            {isIssueModalOpen && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px'
                }}>
                    <div style={{ background: '#ffffff', borderRadius: '12px', width: '560px', maxHeight: '90vh', overflowY: 'auto', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#111827' }}>
                                Issue Equipment to Guard or Site
                            </h3>
                            <button
                                type="button"
                                onClick={() => setIsIssueModalOpen(false)}
                                style={{ background: 'transparent', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#6b7280' }}
                            >
                                &times;
                            </button>
                        </div>

                        <form onSubmit={handleIssueSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '4px' }}>Source Store / Armory *</label>
                                <select
                                    required
                                    value={issueForm.store_id}
                                    onChange={e => setIssueForm({ ...issueForm, store_id: e.target.value })}
                                    style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '13px' }}
                                >
                                    <option value="">-- Select Store / Armory --</option>
                                    {stores.map(st => (
                                        <option key={st.warehouse} value={st.warehouse}>{st.warehouse_name} ({st.store_type_label || 'Store'})</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '4px' }}>Equipment Item *</label>
                                <select
                                    required
                                    value={issueForm.item_id}
                                    onChange={e => setIssueForm({ ...issueForm, item_id: e.target.value })}
                                    style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '13px' }}
                                >
                                    <option value="">-- Choose Item --</option>
                                    {availableItems.map(item => (
                                        <option key={item.id} value={item.id}>{item.name} ({item.code}) {item.is_serialized ? '[Serialized]' : ''}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '4px' }}>Assign Custody To *</label>
                                <div style={{ display: 'flex', gap: '16px' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
                                        <input
                                            type="radio"
                                            checked={issueForm.custody_type === 'EMPLOYEE'}
                                            onChange={() => setIssueForm({ ...issueForm, custody_type: 'EMPLOYEE' })}
                                        />
                                        Security Guard / Employee
                                    </label>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
                                        <input
                                            type="radio"
                                            checked={issueForm.custody_type === 'SITE'}
                                            onChange={() => setIssueForm({ ...issueForm, custody_type: 'SITE' })}
                                        />
                                        Operational Client Site
                                    </label>
                                </div>
                            </div>

                            {issueForm.custody_type === 'EMPLOYEE' ? (
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '4px' }}>
                                        Select Security Guard * ({personnel.length} active guards)
                                    </label>
                                    <select
                                        required
                                        value={issueForm.employee_id}
                                        onChange={e => setIssueForm({ ...issueForm, employee_id: e.target.value })}
                                        style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '13px' }}
                                    >
                                        <option value="">-- Choose Guard --</option>
                                        {personnel.map(p => (
                                            <option key={p.id} value={p.id}>
                                                {p.full_name} {p.employee_id ? `(${p.employee_id})` : ''} {p.designation_name ? `• ${p.designation_name}` : ''}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            ) : (
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '4px' }}>Operational Site *</label>
                                    <select
                                        required
                                        value={issueForm.site_id}
                                        onChange={e => setIssueForm({ ...issueForm, site_id: e.target.value })}
                                        style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '13px' }}
                                    >
                                        <option value="">-- Select Operational Site --</option>
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
                                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '4px' }}>Condition on Issue</label>
                                <select
                                    value={issueForm.condition}
                                    onChange={e => setIssueForm({ ...issueForm, condition: e.target.value })}
                                    style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '13px' }}
                                >
                                    <option value="NEW">New</option>
                                    <option value="GOOD">Good / Serviceable</option>
                                    <option value="FAIR">Fair</option>
                                </select>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                                <Button type="button" variant="secondary" onClick={() => setIsIssueModalOpen(false)}>Cancel</Button>
                                <Button type="submit" variant="primary">Confirm Issue</Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL 2: Return Equipment */}
            {isReturnModalOpen && selectedIssueForReturn && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px'
                }}>
                    <div style={{ background: '#ffffff', borderRadius: '12px', width: '480px', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>Return Equipment to Store</h3>
                            <button
                                type="button"
                                onClick={() => setIsReturnModalOpen(false)}
                                style={{ background: 'transparent', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#6b7280' }}
                            >
                                &times;
                            </button>
                        </div>
                        <p style={{ margin: '0 0 14px', fontSize: '0.875rem', color: '#4b5563' }}>
                            Returning: <strong>{selectedIssueForReturn.item_name}</strong>
                            {selectedIssueForReturn.serial_number && ` (Serial: ${selectedIssueForReturn.serial_number})`}
                        </p>
                        <form onSubmit={handleReturnSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '4px' }}>Target Store / Warehouse *</label>
                                <select
                                    required
                                    value={returnForm.store_id || selectedIssueForReturn.warehouse}
                                    onChange={e => setReturnForm({ ...returnForm, store_id: e.target.value })}
                                    style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '13px' }}
                                >
                                    {stores.map(st => (
                                        <option key={st.warehouse} value={st.warehouse}>{st.warehouse_name}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '4px' }}>Returned Condition *</label>
                                <select
                                    value={returnForm.condition}
                                    onChange={e => setReturnForm({ ...returnForm, condition: e.target.value })}
                                    style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '13px' }}
                                >
                                    <option value="GOOD">Good / Serviceable</option>
                                    <option value="FAIR">Fair</option>
                                    <option value="DAMAGED">Damaged / Defective</option>
                                    <option value="UNUSABLE">Unusable / Destroyed</option>
                                </select>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '4px' }}>Inspection Notes</label>
                                <Input
                                    placeholder="Condition check, battery check, etc."
                                    value={returnForm.notes}
                                    onChange={e => setReturnForm({ ...returnForm, notes: e.target.value })}
                                />
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                                <Button type="button" variant="secondary" onClick={() => setIsReturnModalOpen(false)}>Cancel</Button>
                                <Button type="submit" variant="primary">Confirm Return to Store</Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL 3: Direct Stock Entry */}
            {isDirectEntryModalOpen && (
                <div style={{
                    position: 'fixed', inset: 0, backgroundColor: 'rgba(0, 0, 0, 0.65)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1050, padding: '16px'
                }}>
                    <div style={{
                        background: 'var(--color-surface, #ffffff)', borderRadius: '12px',
                        width: '100%', maxWidth: '640px', maxHeight: '90vh', overflowY: 'auto',
                        padding: '24px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text, #111827)' }}>
                                    Direct Store Stock Intake & Opening Balance
                                </h3>
                                <p style={{ margin: '3px 0 0', fontSize: '12.5px', color: 'var(--color-text-muted, #6b7280)' }}>
                                    Manually stock armories and stores without requiring a Purchase Order.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsDirectEntryModalOpen(false)}
                                style={{ background: 'transparent', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#6b7280' }}
                            >
                                &times;
                            </button>
                        </div>

                        <form onSubmit={handleDirectEntrySubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '4px' }}>
                                    Destination Store / Armory *
                                </label>
                                <select
                                    required
                                    value={directEntryForm.store_id}
                                    onChange={e => setDirectEntryForm({ ...directEntryForm, store_id: e.target.value })}
                                    style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '13px' }}
                                >
                                    <option value="">-- Select Store --</option>
                                    {stores.map(st => (
                                        <option key={st.id} value={(st.warehouse as any) || st.id}>
                                            {st.warehouse_name} ({st.warehouse_code}) {st.is_armory ? '• Armory' : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '4px' }}>
                                    Entry Reason / Type *
                                </label>
                                <select
                                    value={directEntryForm.movement_type}
                                    onChange={e => setDirectEntryForm({ ...directEntryForm, movement_type: e.target.value as any })}
                                    style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '13px' }}
                                >
                                    <option value="OPENING_BALANCE">Opening Stock Balance (Historical / Initial Stock)</option>
                                    <option value="IN">Direct Store Inward (No Purchase Order)</option>
                                    <option value="ADJUSTMENT_IN">Stock Audit Surplus</option>
                                </select>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', background: 'var(--color-surface-secondary, #f8fafc)', padding: '4px', borderRadius: '8px', border: '1px solid var(--color-border, #e2e8f0)' }}>
                                <button
                                    type="button"
                                    onClick={() => setDirectEntryMode('existing')}
                                    style={{
                                        padding: '8px',
                                        borderRadius: '6px',
                                        border: 'none',
                                        background: directEntryMode === 'existing' ? 'var(--color-primary, #2563eb)' : 'transparent',
                                        color: directEntryMode === 'existing' ? '#ffffff' : 'var(--color-text-muted)',
                                        fontWeight: 600,
                                        fontSize: '12.5px',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Pick Existing Item ({availableItems.length})
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setDirectEntryMode('new')}
                                    style={{
                                        padding: '8px',
                                        borderRadius: '6px',
                                        border: 'none',
                                        background: directEntryMode === 'new' ? 'var(--color-primary, #2563eb)' : 'transparent',
                                        color: directEntryMode === 'new' ? '#ffffff' : 'var(--color-text-muted)',
                                        fontWeight: 600,
                                        fontSize: '12.5px',
                                        cursor: 'pointer'
                                    }}
                                >
                                    + Add New Item to Catalog
                                </button>
                            </div>

                            {directEntryMode === 'existing' ? (
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '4px' }}>
                                        Store Inventory Item *
                                    </label>
                                    <select
                                        required
                                        value={directEntryForm.item_id}
                                        onChange={e => {
                                            const selected = availableItems.find(it => it.id === e.target.value);
                                            setDirectEntryForm({
                                                ...directEntryForm,
                                                item_id: e.target.value,
                                                track_serial_number: selected?.is_serialized || false
                                            });
                                        }}
                                        style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '13px' }}
                                    >
                                        <option value="">-- Choose Item ({availableItems.length} available) --</option>
                                        {availableItems.map(it => (
                                            <option key={it.id} value={it.id}>
                                                {it.name} {it.code ? `(${it.code})` : ''} {it.is_serialized ? '• Serialized' : ''}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            ) : (
                                <div style={{ background: 'var(--color-surface-secondary, #f8fafc)', border: '1px solid var(--color-border, #e2e8f0)', borderRadius: '8px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    <div>
                                        <Input
                                            label="Item Name *"
                                            placeholder="e.g. Tactical Security Boots / Motorola CP040"
                                            value={directEntryForm.item_name}
                                            onChange={e => setDirectEntryForm({ ...directEntryForm, item_name: e.target.value })}
                                            required
                                        />
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '10px' }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '4px' }}>Security Category</label>
                                            <select
                                                value={directEntryForm.security_category}
                                                onChange={e => setDirectEntryForm({ ...directEntryForm, security_category: e.target.value })}
                                                style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '13px' }}
                                            >
                                                {SECURITY_CATEGORIES.map(c => (
                                                    <option key={c.value} value={c.value}>{c.label}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <Input
                                                label="Item Code / SKU"
                                                placeholder="Auto if empty"
                                                value={directEntryForm.item_code}
                                                onChange={e => setDirectEntryForm({ ...directEntryForm, item_code: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <input
                                            type="checkbox"
                                            id="deTrackSerial"
                                            checked={directEntryForm.track_serial_number}
                                            onChange={e => setDirectEntryForm({ ...directEntryForm, track_serial_number: e.target.checked })}
                                        />
                                        <label htmlFor="deTrackSerial" style={{ fontSize: '12px', cursor: 'pointer', fontWeight: 500 }}>
                                            Track individual serial numbers for each unit
                                        </label>
                                    </div>
                                </div>
                            )}

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div>
                                    <Input
                                        label="Quantity to Stock *"
                                        type="number"
                                        min="1"
                                        value={directEntryForm.quantity}
                                        onChange={e => setDirectEntryForm({ ...directEntryForm, quantity: Number(e.target.value) })}
                                        required
                                    />
                                </div>
                                <div>
                                    <Input
                                        label="Unit Cost Price (PKR)"
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        placeholder="0.00"
                                        value={directEntryForm.unit_cost}
                                        onChange={e => setDirectEntryForm({ ...directEntryForm, unit_cost: Number(e.target.value) })}
                                    />
                                </div>
                            </div>

                            {directEntryForm.track_serial_number && (
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '4px' }}>
                                        Serial Numbers (1 per line or comma-separated) — {directEntryForm.quantity} required
                                    </label>
                                    <textarea
                                        rows={3}
                                        placeholder="e.g. SN-8801, SN-8802, SN-8803"
                                        value={directEntryForm.serial_numbers}
                                        onChange={e => setDirectEntryForm({ ...directEntryForm, serial_numbers: e.target.value })}
                                        style={{
                                            width: '100%', padding: '8px 12px', borderRadius: '6px',
                                            border: '1px solid #d1d5db', fontSize: '13px', fontFamily: 'monospace'
                                        }}
                                    />
                                </div>
                            )}

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div>
                                    <Input
                                        label="Reference #"
                                        placeholder="e.g. OB-2026-001"
                                        value={directEntryForm.reference}
                                        onChange={e => setDirectEntryForm({ ...directEntryForm, reference: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <Input
                                        label="Notes"
                                        placeholder="Opening balance, donation, etc."
                                        value={directEntryForm.notes}
                                        onChange={e => setDirectEntryForm({ ...directEntryForm, notes: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                                <Button type="button" variant="secondary" onClick={() => setIsDirectEntryModalOpen(false)}>
                                    Cancel
                                </Button>
                                <Button type="submit" variant="primary" style={{ background: '#10b981', borderColor: '#059669', color: '#ffffff' }}>
                                    <i className="bx bx-check"></i> Post to Store Stock
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL 4: Stock Transfer */}
            {isTransferModalOpen && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px'
                }}>
                    <div style={{ background: '#ffffff', borderRadius: '12px', width: '520px', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>Store-to-Store Stock Transfer</h3>
                            <button
                                type="button"
                                onClick={() => setIsTransferModalOpen(false)}
                                style={{ background: 'transparent', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#6b7280' }}
                            >
                                &times;
                            </button>
                        </div>
                        <form onSubmit={handleTransferSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '4px' }}>From Store *</label>
                                    <select
                                        required
                                        value={transferForm.from_store_id}
                                        onChange={e => setTransferForm({ ...transferForm, from_store_id: e.target.value })}
                                        style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '13px' }}
                                    >
                                        <option value="">-- From --</option>
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
                                        style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '13px' }}
                                    >
                                        <option value="">-- To --</option>
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
                                    style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '13px' }}
                                >
                                    <option value="">-- Select Item --</option>
                                    {availableItems.map(item => (
                                        <option key={item.id} value={item.id}>{item.name} ({item.code})</option>
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
                                    placeholder="Reason for transfer..."
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

            {/* MODAL 5: Report Incident */}
            {isIncidentModalOpen && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px'
                }}>
                    <div style={{ background: '#ffffff', borderRadius: '12px', width: '500px', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>Report Equipment Loss / Damage</h3>
                            <button
                                type="button"
                                onClick={() => setIsIncidentModalOpen(false)}
                                style={{ background: 'transparent', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#6b7280' }}
                            >
                                &times;
                            </button>
                        </div>
                        <form onSubmit={handleIncidentSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '4px' }}>Incident Type *</label>
                                <select
                                    value={incidentForm.incident_type}
                                    onChange={e => setIncidentForm({ ...incidentForm, incident_type: e.target.value as any })}
                                    style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '13px' }}
                                >
                                    <option value="DAMAGED">Damaged / Needs Repair</option>
                                    <option value="LOST">Lost / Missing</option>
                                    <option value="UNUSABLE">Destroyed / Unusable</option>
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
                                    style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '13px' }}
                                >
                                    <option value="LOW">Minor</option>
                                    <option value="MEDIUM">Moderate</option>
                                    <option value="HIGH">Severe</option>
                                    <option value="TOTAL_LOSS">Total Loss</option>
                                </select>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '4px' }}>Incident Notes & Circumstances *</label>
                                <Input
                                    required
                                    placeholder="Describe how damage or loss occurred..."
                                    value={incidentForm.notes}
                                    onChange={e => setIncidentForm({ ...incidentForm, notes: e.target.value })}
                                />
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                                <Button type="button" variant="secondary" onClick={() => setIsIncidentModalOpen(false)}>Cancel</Button>
                                <Button type="submit" variant="danger">Submit Incident Report</Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL 6: Resolve Incident */}
            {isResolveModalOpen && selectedIncidentForResolve && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px'
                }}>
                    <div style={{ background: '#ffffff', borderRadius: '12px', width: '500px', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>Resolve Incident #{selectedIncidentForResolve.incident_number}</h3>
                            <button
                                type="button"
                                onClick={() => setIsResolveModalOpen(false)}
                                style={{ background: 'transparent', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#6b7280' }}
                            >
                                &times;
                            </button>
                        </div>
                        <form onSubmit={handleResolveSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '4px' }}>Resolution *</label>
                                <select
                                    value={resolveForm.status}
                                    onChange={e => setResolveForm({ ...resolveForm, status: e.target.value })}
                                    style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '13px' }}
                                >
                                    <option value="APPROVED_REPAIR">Approved for Repair</option>
                                    <option value="APPROVED_WRITE_OFF">Approved Write-Off from Stores</option>
                                    <option value="RESOLVED_FOUND">Found / Returned to Service</option>
                                    <option value="CLOSED">Close Incident</option>
                                </select>
                            </div>

                            <div>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
                                    <input
                                        type="checkbox"
                                        checked={resolveForm.approved_write_off}
                                        onChange={e => setResolveForm({ ...resolveForm, approved_write_off: e.target.checked })}
                                    />
                                    Write off and remove unit from active store balance
                                </label>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '4px' }}>Resolution Remarks *</label>
                                <Input
                                    required
                                    placeholder="Explanation of resolution or sign-off"
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

            {/* MODAL 7: Configure Store Location */}
            {isConfigureStoreModalOpen && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px'
                }}>
                    <div style={{ background: '#ffffff', borderRadius: '12px', width: '500px', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>Add Store Location or Armory</h3>
                            <button
                                type="button"
                                onClick={() => setIsConfigureStoreModalOpen(false)}
                                style={{ background: 'transparent', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#6b7280' }}
                            >
                                &times;
                            </button>
                        </div>
                        <form onSubmit={handleStoreConfigureSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '4px' }}>Link Existing Warehouse or Create New</label>
                                <select
                                    value={storeForm.warehouse_id}
                                    onChange={e => setStoreForm({ ...storeForm, warehouse_id: e.target.value })}
                                    style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '13px' }}
                                >
                                    <option value="">-- Create New Warehouse / Store --</option>
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
                                            placeholder="e.g. Head Office Armory"
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
                                        is_armory: e.target.value === 'ARMORY'
                                    })}
                                    style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '13px' }}
                                >
                                    <option value="MAIN_STORE">Main Store / Central Warehouse</option>
                                    <option value="BRANCH_STORE">Branch Store</option>
                                    <option value="SITE_STORE">Operational Site Store</option>
                                    <option value="ARMORY">Armory (Weapons & Ammunition)</option>
                                </select>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '4px' }}>Notes / Storage Specifications</label>
                                <Input
                                    placeholder="Room number, safe box, etc."
                                    value={storeForm.notes}
                                    onChange={e => setStoreForm({ ...storeForm, notes: e.target.value })}
                                />
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                                <Button type="button" variant="secondary" onClick={() => setIsConfigureStoreModalOpen(false)}>Cancel</Button>
                                <Button type="submit" variant="primary">Save Store Location</Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
