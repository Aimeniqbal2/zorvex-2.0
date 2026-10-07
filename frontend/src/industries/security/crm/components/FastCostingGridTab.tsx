import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Button } from '../../../../components/ui/Button';
import { Input } from '../../../../components/ui/Input';
import { useToastStore } from '../../../../stores/toastStore';
import { fetchCostingGrid, syncCostingGrid, importCostingExcel, getClientLocations } from '../api';
import type { CostingGridRow } from '../api';
import { getEntities } from '../../../../modules/crm/api';
import type { CRMEntity } from '../../../../modules/crm/types';

interface RoleColDef {
    key: string;
    label: string;
    rateKey: keyof CostingGridRow;
    salKey: keyof CostingGridRow;
    qtyKey: keyof CostingGridRow;
}

// 14 Canonical Role categories matching Sheet 1 & HRM designations
const ROLE_COLUMNS: RoleColDef[] = [
    {
        key: 'sup_civ',
        label: 'Supervisor Civil',
        rateKey: 'sup_civ_rate',
        salKey: 'sup_civ_sal',
        qtyKey: 'sup_civ_qty'
    },
    {
        key: 'sup_ex',
        label: 'Supervisor Ex-Army',
        rateKey: 'sup_ex_rate',
        salKey: 'sup_ex_sal',
        qtyKey: 'sup_ex_qty'
    },
    {
        key: 'sr_sup_civ',
        label: 'Senior Supervisor Civil',
        rateKey: 'sr_sup_civ_rate',
        salKey: 'sr_sup_civ_sal',
        qtyKey: 'sr_sup_civ_qty'
    },
    {
        key: 'sr_sup_ex',
        label: 'Senior Supervisor Ex-Army',
        rateKey: 'sr_sup_ex_rate',
        salKey: 'sr_sup_ex_sal',
        qtyKey: 'sr_sup_ex_qty'
    },
    {
        key: 'guard_civ',
        label: 'Security Guard Civil',
        rateKey: 'guard_civ_rate',
        salKey: 'guard_civ_sal',
        qtyKey: 'guard_civ_qty'
    },
    {
        key: 'guard_ex',
        label: 'Security Guard Ex-Army',
        rateKey: 'guard_ex_rate',
        salKey: 'guard_ex_sal',
        qtyKey: 'guard_ex_qty'
    },
    {
        key: 'hd_gd_civ',
        label: 'Head / Senior Guard Civil',
        rateKey: 'hd_gd_civ_rate',
        salKey: 'hd_gd_civ_sal',
        qtyKey: 'hd_gd_civ_qty'
    },
    {
        key: 'hd_gd_ex',
        label: 'Head / Senior Guard Ex-Army',
        rateKey: 'hd_gd_ex_rate',
        salKey: 'hd_gd_ex_sal',
        qtyKey: 'hd_gd_ex_qty'
    },
    {
        key: 'cpo_civ',
        label: 'Close Protection Officer Civil',
        rateKey: 'cpo_civ_rate',
        salKey: 'cpo_civ_sal',
        qtyKey: 'cpo_civ_qty'
    },
    {
        key: 'cpo_ex',
        label: 'Close Protection Officer Ex-Army',
        rateKey: 'cpo_ex_rate',
        salKey: 'cpo_ex_sal',
        qtyKey: 'cpo_ex_qty'
    },
    {
        key: 'cpo_ssg',
        label: 'Close Protection Officer Ex-SSG Commando',
        rateKey: 'cpo_ssg_rate',
        salKey: 'cpo_ssg_sal',
        qtyKey: 'cpo_ssg_qty'
    },
    {
        key: 'lady_searcher',
        label: 'Lady Searcher',
        rateKey: 'lady_searcher_rate',
        salKey: 'lady_searcher_sal',
        qtyKey: 'lady_searcher_qty'
    },
    {
        key: 'cctv_op',
        label: 'CCTV Operator',
        rateKey: 'cctv_op_rate',
        salKey: 'cctv_op_sal',
        qtyKey: 'cctv_op_qty'
    },
    {
        key: 'deo',
        label: 'Data Entry Operator (DEO)',
        rateKey: 'deo_rate',
        salKey: 'deo_sal',
        qtyKey: 'deo_qty'
    }
];

export const FastCostingGridTab: React.FC = () => {
    const [rows, setRows] = useState<CostingGridRow[]>([]);
    const [existingCustomers, setExistingCustomers] = useState<CRMEntity[]>([]);
    const [existingLocations, setExistingLocations] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [search, setSearch] = useState('');
    const [selectedClientFilter, setSelectedClientFilter] = useState<string>('ALL');
    const [selectedLocationFilter, setSelectedLocationFilter] = useState<string>('ALL');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const tableContainerRef = useRef<HTMLDivElement>(null);

    const loadGrid = async () => {
        setIsLoading(true);
        try {
            const [gridData, customersRes, locationsRes] = await Promise.all([
                fetchCostingGrid(),
                getEntities({ entity_type: 'CUSTOMER' }).catch(() => ({ results: [] })),
                getClientLocations().catch(() => ({ results: [] }))
            ]);
            setRows(gridData);
            setExistingCustomers(customersRes.results || []);
            setExistingLocations((locationsRes as any)?.results || locationsRes || []);
        } catch (err: any) {
            useToastStore.getState().error('Failed to load costing grid.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadGrid();
    }, []);

    // Compute live Sheet 1 metrics for a single row
    const computeRowTotals = (r: CostingGridRow) => {
        let totalStrength = 0;
        let monthlySale = 0;
        let monthlySalary = 0;

        ROLE_COLUMNS.forEach(role => {
            const qty = Number(r[role.qtyKey]) || 0;
            const rate = Number(r[role.rateKey]) || 0;
            const sal = Number(r[role.salKey]) || 0;
            totalStrength += qty;
            monthlySale += qty * rate;
            monthlySalary += qty * sal;
        });

        const overheadPerGuard = r.overhead_per_guard !== undefined && r.overhead_per_guard !== null && r.overhead_per_guard !== '' ? Number(r.overhead_per_guard) : 6000;
        const serviceCharges = (r.service_charges_per_guard !== undefined && r.service_charges_per_guard !== null && r.service_charges_per_guard !== '') ? Number(r.service_charges_per_guard) : 3000; // Col AG (Flat monthly)
        const taxWhtRate = (r.tax_wht_rate !== undefined && r.tax_wht_rate !== null && r.tax_wht_rate !== '') ? Number(r.tax_wht_rate) : 7;
        const salesTaxRate = (r.sales_tax_rate !== undefined && r.sales_tax_rate !== null && r.sales_tax_rate !== '') ? Number(r.sales_tax_rate) : 8;
        const sessi = Number(r.sessi) || 0;
        const eobi = Number(r.eobi) || 0;

        const expense = totalStrength * overheadPerGuard; // Col AB

        // Check for manual overrides or compute formula default
        const salesTax = (r.sales_tax_override !== undefined && r.sales_tax_override !== null && r.sales_tax_override !== '')
            ? Number(r.sales_tax_override)
            : (serviceCharges * (salesTaxRate / 100)); // Col AH

        const wht = (r.withholding_tax_override !== undefined && r.withholding_tax_override !== null && r.withholding_tax_override !== '')
            ? Number(r.withholding_tax_override)
            : (serviceCharges * (taxWhtRate / 100)); // Col AC

        const invoiceAmount = monthlySale + salesTax; // Col AI
        const difference = monthlySale - monthlySalary - wht - sessi - eobi; // Col AJ
        const diffPerHead = totalStrength > 0 ? (difference / totalStrength) : 0; // Col AK
        const profitLoss = monthlySale - monthlySalary - expense - wht; // Col AD

        return {
            totalStrength,
            monthlySale,
            monthlySalary,
            expense,
            serviceCharges,
            wht,
            salesTax,
            invoiceAmount,
            sessi,
            eobi,
            difference,
            diffPerHead,
            profitLoss
        };
    };

    // Aggregate summary across all rows
    const summary = useMemo(() => {
        let totalGuards = 0;
        let totalSale = 0;
        let totalSalary = 0;
        let totalExpense = 0;
        let totalServiceCharges = 0;
        let totalSalesTax = 0;
        let totalWht = 0;
        let totalSessi = 0;
        let totalEobi = 0;
        let totalDifference = 0;
        let totalProfit = 0;
        const clientsSet = new Set<string>();

        rows.forEach(r => {
            const calc = computeRowTotals(r);
            totalGuards += calc.totalStrength;
            totalSale += calc.monthlySale;
            totalSalary += calc.monthlySalary;
            totalExpense += calc.expense;
            totalServiceCharges += calc.serviceCharges;
            totalSalesTax += calc.salesTax;
            totalWht += calc.wht;
            totalSessi += calc.sessi;
            totalEobi += calc.eobi;
            totalDifference += calc.difference;
            totalProfit += calc.profitLoss;

            const name = r.client_name?.trim();
            if (name) {
                clientsSet.add(name.toLowerCase());
            }
        });

        return {
            totalLocations: rows.length,
            totalClients: clientsSet.size,
            totalGuards,
            totalSale,
            totalSalary,
            totalExpense,
            totalServiceCharges,
            totalSalesTax,
            totalWht,
            totalSessi,
            totalEobi,
            totalDifference,
            totalProfit
        };
    }, [rows]);

    const clientLocationsMap = useMemo(() => {
        const map: Record<string, string[]> = {};
        const locList = Array.isArray(existingLocations) ? existingLocations : (existingLocations as any)?.results || [];
        locList.forEach((loc: any) => {
            const custId = typeof loc.customer === 'object' ? loc.customer?.id : loc.customer;
            const cust = existingCustomers.find(c => String(c.id) === String(custId));
            const custNameKey = cust ? cust.name.toLowerCase().trim() : '';
            if (custNameKey && loc.name) {
                if (!map[custNameKey]) map[custNameKey] = [];
                if (!map[custNameKey].includes(loc.name)) map[custNameKey].push(loc.name);
            }
        });
        return map;
    }, [existingLocations, existingCustomers]);

    const allLocationNames = useMemo(() => {
        const locList = Array.isArray(existingLocations) ? existingLocations : (existingLocations as any)?.results || [];
        const names = locList.map((l: any) => l.name).filter(Boolean);
        return Array.from(new Set(names)) as string[];
    }, [existingLocations]);

    const handleAddBlankRow = () => {
        const newRow: CostingGridRow = {
            id: `temp-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            client_id: null,
            client_name: '',
            location_name: '',
            overhead_per_guard: 0,
            service_charges_per_guard: 0,
            tax_wht_rate: 0,
            sales_tax_rate: 0,
            sessi: 0,
            eobi: 0,
            ot_rate: 0,
            sup_civ_qty: 0, sup_civ_rate: 0, sup_civ_sal: 0,
            sup_ex_qty: 0, sup_ex_rate: 0, sup_ex_sal: 0,
            sr_sup_civ_qty: 0, sr_sup_civ_rate: 0, sr_sup_civ_sal: 0,
            sr_sup_ex_qty: 0, sr_sup_ex_rate: 0, sr_sup_ex_sal: 0,
            guard_civ_qty: 0, guard_civ_rate: 0, guard_civ_sal: 0,
            guard_ex_qty: 0, guard_ex_rate: 0, guard_ex_sal: 0,
            hd_gd_civ_qty: 0, hd_gd_civ_rate: 0, hd_gd_civ_sal: 0,
            hd_gd_ex_qty: 0, hd_gd_ex_rate: 0, hd_gd_ex_sal: 0,
            cpo_civ_qty: 0, cpo_civ_rate: 0, cpo_civ_sal: 0,
            cpo_ex_qty: 0, cpo_ex_rate: 0, cpo_ex_sal: 0,
            cpo_ssg_qty: 0, cpo_ssg_rate: 0, cpo_ssg_sal: 0,
            lady_searcher_qty: 0, lady_searcher_rate: 0, lady_searcher_sal: 0,
            cctv_op_qty: 0, cctv_op_rate: 0, cctv_op_sal: 0,
            deo_qty: 0, deo_rate: 0, deo_sal: 0,
            lady_cctv_qty: 0, lady_cctv_rate: 0, lady_cctv_sal: 0,
        };
        setRows([newRow, ...rows]);
    };

    const handleUpdateRow = (targetRow: CostingGridRow, field: keyof CostingGridRow, value: any) => {
        setRows(prevRows => prevRows.map(r => {
            if (r === targetRow || (r.id && r.id === targetRow.id)) {
                const updated = { ...r };
                if (field === 'client_name') {
                    const matched = existingCustomers.find(c => c.name.toLowerCase() === String(value).trim().toLowerCase());
                    updated.client_id = matched ? matched.id : null;
                }
                updated[field] = value as never;
                return updated;
            }
            return r;
        }));
    };

    const handleDeleteRow = (targetRow: CostingGridRow) => {
        setRows(prevRows => prevRows.filter(r => r !== targetRow && (!r.id || r.id !== targetRow.id)));
    };

    const handleSaveSync = async () => {
        if (rows.length === 0) {
            useToastStore.getState().error('No rows to sync.');
            return;
        }

        const invalidRows = rows.filter(r => !r.client_name?.trim());
        if (invalidRows.length > 0) {
            useToastStore.getState().error('Please ensure all rows have a Client Name.');
            return;
        }

        setIsSaving(true);
        try {
            const preparedRows = rows.map(r => ({
                ...r,
                overhead_per_guard: (r.overhead_per_guard !== '' && r.overhead_per_guard !== null && r.overhead_per_guard !== undefined) ? Number(r.overhead_per_guard) : 6000,
                service_charges_per_guard: (r.service_charges_per_guard !== '' && r.service_charges_per_guard !== null && r.service_charges_per_guard !== undefined) ? Number(r.service_charges_per_guard) : 3000,
                sales_tax_override: (r.sales_tax_override !== '' && r.sales_tax_override !== null && r.sales_tax_override !== undefined) ? Number(r.sales_tax_override) : null,
                withholding_tax_override: (r.withholding_tax_override !== '' && r.withholding_tax_override !== null && r.withholding_tax_override !== undefined) ? Number(r.withholding_tax_override) : null,
                sessi: (r.sessi !== '' && r.sessi !== null && r.sessi !== undefined) ? Number(r.sessi) : 0,
                eobi: (r.eobi !== '' && r.eobi !== null && r.eobi !== undefined) ? Number(r.eobi) : 0,
                ot_rate: (r.ot_rate !== '' && r.ot_rate !== null && r.ot_rate !== undefined) ? Number(r.ot_rate) : 0,
            }));
            const res = await syncCostingGrid(preparedRows as any);
            useToastStore.getState().success(res.message || 'Costing grid synced to CRM successfully!');
            await loadGrid();
        } catch (err: any) {
            useToastStore.getState().error(err?.response?.data?.error || err?.message || 'Failed to sync costing grid.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsImporting(true);
        try {
            const res = await importCostingExcel(file);
            useToastStore.getState().success(res.message || `Imported ${res.imported_clients} clients successfully!`);
            await loadGrid();
        } catch (err: any) {
            useToastStore.getState().error(err?.response?.data?.error || err?.message || 'Failed to import Excel file.');
        } finally {
            setIsImporting(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    const uniqueClients = useMemo(() => {
        const set = new Set<string>();
        rows.forEach(r => {
            const name = (r.client_name || '').trim();
            if (name) set.add(name);
        });
        existingCustomers.forEach(c => {
            const name = (c.name || '').trim();
            if (name) set.add(name);
        });
        return Array.from(set).sort((a, b) => a.localeCompare(b));
    }, [rows, existingCustomers]);

    const clientLocationsForFilter = useMemo(() => {
        if (!selectedClientFilter || selectedClientFilter === 'ALL') return [];
        const locSet = new Set<string>();
        const targetClient = selectedClientFilter.toLowerCase().trim();
        rows.forEach(r => {
            if ((r.client_name || '').toLowerCase().trim() === targetClient) {
                const locName = (r.location_name || '').trim();
                if (locName) locSet.add(locName);
            }
        });
        if (clientLocationsMap[targetClient]) {
            clientLocationsMap[targetClient].forEach(loc => locSet.add(loc));
        }
        return Array.from(locSet).sort((a, b) => a.localeCompare(b));
    }, [rows, selectedClientFilter, clientLocationsMap]);

    const filteredRows = useMemo(() => {
        let result = rows;
        if (selectedClientFilter && selectedClientFilter !== 'ALL') {
            const cKey = selectedClientFilter.toLowerCase().trim();
            result = result.filter(r => (r.client_name || '').toLowerCase().trim() === cKey);
        }
        if (selectedLocationFilter && selectedLocationFilter !== 'ALL') {
            const lKey = selectedLocationFilter.toLowerCase().trim();
            result = result.filter(r => (r.location_name || '').toLowerCase().trim() === lKey);
        }
        if (search.trim()) {
            const q = search.toLowerCase();
            result = result.filter(r => 
                r.client_name?.toLowerCase().includes(q) ||
                r.location_name?.toLowerCase().includes(q)
            );
        }
        return result;
    }, [rows, selectedClientFilter, selectedLocationFilter, search]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', height: '100%', flex: 1, minHeight: 0 }}>
            {/* Costing Summary KPI Cards Bar */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: '8px'
            }}>
                <div style={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '8px',
                    padding: '6px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center'
                }}>
                    <div style={{ fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                        Clients & Locations
                    </div>
                    <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--color-text)' }}>
                        {summary.totalClients} <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--color-text-muted)' }}>({summary.totalLocations} Sites)</span>
                    </div>
                </div>

                <div style={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '8px',
                    padding: '6px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center'
                }}>
                    <div style={{ fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                        Total Force
                    </div>
                    <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--color-primary)' }}>
                        {summary.totalGuards} <span style={{ fontSize: '11px', fontWeight: 600 }}>Guards</span>
                    </div>
                </div>

                <div style={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '8px',
                    padding: '6px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center'
                }}>
                    <div style={{ fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                        Total Monthly Sale
                    </div>
                    <div style={{ fontSize: '16px', fontWeight: 800, color: '#3b82f6' }}>
                        PKR {summary.totalSale.toLocaleString()}
                    </div>
                </div>

                <div style={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '8px',
                    padding: '6px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center'
                }}>
                    <div style={{ fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                        Direct Guard Salary
                    </div>
                    <div style={{ fontSize: '16px', fontWeight: 800, color: '#f59e0b' }}>
                        PKR {summary.totalSalary.toLocaleString()}
                    </div>
                </div>

                <div style={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '8px',
                    padding: '6px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center'
                }}>
                    <div style={{ fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                        Gross Margin
                    </div>
                    <div style={{ fontSize: '16px', fontWeight: 800, color: summary.totalDifference >= 0 ? '#10b981' : '#ef4444' }}>
                        PKR {summary.totalDifference.toLocaleString()}
                    </div>
                </div>

                <div style={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '8px',
                    padding: '6px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center'
                }}>
                    <div style={{ fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                        Net Profit
                    </div>
                    <div style={{ fontSize: '16px', fontWeight: 800, color: summary.totalProfit >= 0 ? '#10b981' : '#ef4444' }}>
                        PKR {summary.totalProfit.toLocaleString()}
                    </div>
                </div>
            </div>

            {/* Action Toolbar */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '8px',
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: '8px',
                padding: '8px 14px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <Button variant="primary" onClick={handleAddBlankRow} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <i className='bx bx-plus' style={{ fontSize: '18px' }}></i> Add Client / Location Row
                    </Button>

                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        style={{ display: 'none' }} 
                        accept=".xlsx, .xls"
                        onChange={handleFileChange}
                    />

                    <Button 
                        variant="secondary" 
                        disabled={isImporting}
                        onClick={() => fileInputRef.current?.click()}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                    >
                        <i className='bx bx-upload' style={{ fontSize: '18px' }}></i> 
                        {isImporting ? 'Importing Excel...' : 'Import Excel Sheet (.xlsx)'}
                    </Button>

                    <Button 
                        variant="ghost" 
                        disabled={isLoading}
                        onClick={loadGrid}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                    >
                        <i className={`bx bx-refresh ${isLoading ? 'bx-spin' : ''}`} style={{ fontSize: '18px' }}></i> Refresh
                    </Button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    {/* Client Filter Dropdown */}
                    <select
                        value={selectedClientFilter}
                        onChange={(e) => {
                            setSelectedClientFilter(e.target.value);
                            setSelectedLocationFilter('ALL');
                        }}
                        style={{
                            height: '36px',
                            padding: '0 8px',
                            fontSize: '12.5px',
                            borderRadius: '6px',
                            border: '1px solid var(--color-border)',
                            background: 'var(--color-surface)',
                            color: 'var(--color-text)',
                            fontWeight: selectedClientFilter !== 'ALL' ? 700 : 500,
                            maxWidth: '190px'
                        }}
                        title="Filter by Client"
                    >
                        <option value="ALL">All Clients ({uniqueClients.length})</option>
                        {uniqueClients.map(cName => (
                            <option key={cName} value={cName}>{cName}</option>
                        ))}
                    </select>

                    {/* Location Filter Dropdown (contextual when client selected) */}
                    {selectedClientFilter !== 'ALL' && clientLocationsForFilter.length > 0 && (
                        <select
                            value={selectedLocationFilter}
                            onChange={(e) => setSelectedLocationFilter(e.target.value)}
                            style={{
                                height: '36px',
                                padding: '0 8px',
                                fontSize: '12.5px',
                                borderRadius: '6px',
                                border: '1px solid var(--color-border)',
                                background: 'var(--color-surface)',
                                color: 'var(--color-text)',
                                fontWeight: selectedLocationFilter !== 'ALL' ? 700 : 500,
                                maxWidth: '170px'
                            }}
                            title="Filter by Location"
                        >
                            <option value="ALL">All Sites ({clientLocationsForFilter.length})</option>
                            {clientLocationsForFilter.map(lName => (
                                <option key={lName} value={lName}>{lName}</option>
                            ))}
                        </select>
                    )}

                    <div style={{ width: '210px' }}>
                        <Input 
                            placeholder="Filter by client or location..." 
                            value={search} 
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>

                    {(selectedClientFilter !== 'ALL' || selectedLocationFilter !== 'ALL' || search.trim()) && (
                        <button
                            type="button"
                            onClick={() => {
                                setSelectedClientFilter('ALL');
                                setSelectedLocationFilter('ALL');
                                setSearch('');
                            }}
                            style={{
                                background: 'rgba(239, 68, 68, 0.1)',
                                border: '1px solid rgba(239, 68, 68, 0.25)',
                                color: '#dc2626',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '11.5px',
                                fontWeight: 600,
                                padding: '4px 8px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px'
                            }}
                            title="Clear all filters"
                        >
                            ✕ Clear
                        </button>
                    )}

                    <Button 
                        variant="primary"
                        disabled={isSaving || rows.length === 0}
                        onClick={handleSaveSync}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            background: '#10b981',
                            borderColor: '#10b981',
                            fontWeight: 700
                        }}
                    >
                        <i className='bx bx-cloud-upload' style={{ fontSize: '20px' }}></i>
                        {isSaving ? 'Syncing to CRM...' : 'Save & Sync to CRM'}
                    </Button>
                </div>
            </div>

            {/* Datalist for fast auto-completion of existing clients */}
            <datalist id="existing-clients-list">
                {existingCustomers.map(c => (
                    <option key={c.id} value={c.name} />
                ))}
            </datalist>

            {/* Interactive Wide Matrix Costing Table with Sticky Header & Freeze Panes */}
            <div 
                ref={tableContainerRef}
                className="fast-costing-scroll-container"
                style={{
                    flex: 1,
                    minHeight: 0,
                    height: '100%',
                    overflow: 'auto',
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '8px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                    WebkitOverflowScrolling: 'touch'
                }}
            >
                <table className="fast-costing-table" style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, textAlign: 'left', fontSize: '13px', minWidth: '5500px', overflow: 'visible', borderRadius: 0 }}>
                    <thead>
                        {/* Level 1 Group Header Row */}
                        <tr style={{ background: 'var(--color-surface)', height: '42px' }}>
                            <th 
                                colSpan={3} 
                                style={{ 
                                    padding: '10px 16px', 
                                    borderRight: '2px solid var(--color-border)', 
                                    borderBottom: '1px solid var(--color-border)',
                                    fontWeight: 700, 
                                    color: 'var(--color-text)',
                                    width: '480px',
                                    minWidth: '480px',
                                    position: 'sticky',
                                    left: 0,
                                    top: 0,
                                    zIndex: 60,
                                    background: 'var(--color-surface)',
                                    boxShadow: '4px 0 10px rgba(0,0,0,0.18)',
                                    boxSizing: 'border-box',
                                    height: '42px'
                                }}
                            >
                                Client & Deployment Location
                            </th>
                            {ROLE_COLUMNS.map((col, cIdx) => (
                                <th 
                                    key={col.key} 
                                    colSpan={3} 
                                    style={{ 
                                        padding: '10px 10px', 
                                        textAlign: 'center', 
                                        borderRight: '2px solid var(--color-border)',
                                        borderBottom: '1px solid var(--color-border)',
                                        backgroundColor: 'var(--color-surface)',
                                        backgroundImage: cIdx % 2 === 0 
                                            ? 'linear-gradient(rgba(16, 185, 129, 0.16), rgba(16, 185, 129, 0.16))' 
                                            : 'linear-gradient(rgba(59, 130, 246, 0.16), rgba(59, 130, 246, 0.16))',
                                        color: 'var(--color-text)',
                                        fontWeight: 700,
                                        fontSize: '13px',
                                        width: '270px',
                                        minWidth: '270px',
                                        position: 'sticky',
                                        top: 0,
                                        zIndex: 35,
                                        boxSizing: 'border-box',
                                        height: '42px'
                                    }}
                                >
                                    {col.label}
                                </th>
                            ))}
                            <th colSpan={13} style={{ 
                                padding: '10px 16px', 
                                textAlign: 'center', 
                                backgroundColor: 'var(--color-surface)',
                                backgroundImage: 'linear-gradient(rgba(245, 158, 11, 0.16), rgba(245, 158, 11, 0.16))',
                                color: 'var(--color-text)',
                                borderBottom: '1px solid var(--color-border)', 
                                fontWeight: 700, 
                                minWidth: '1355px', 
                                position: 'sticky', 
                                top: 0, 
                                zIndex: 35, 
                                boxSizing: 'border-box', 
                                height: '42px' 
                            }}>
                                Live Costing, Tax & Margins
                            </th>
                            <th style={{ padding: '10px 8px', width: '50px', minWidth: '50px', position: 'sticky', top: 0, zIndex: 35, background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)', boxSizing: 'border-box', height: '42px' }}></th>
                        </tr>

                        {/* Level 2 Sub-Column Header Row */}
                        <tr style={{ background: 'var(--color-surface)', height: '40px' }}>
                            <th style={{ padding: '9px 8px', width: '45px', minWidth: '45px', textAlign: 'center', position: 'sticky', left: 0, top: '42px', zIndex: 60, background: 'var(--color-surface)', color: 'var(--color-text)', borderBottom: '2px solid var(--color-border)', boxSizing: 'border-box', height: '40px' }}>#</th>
                            <th style={{ padding: '9px 10px', width: '235px', minWidth: '235px', position: 'sticky', left: '45px', top: '42px', zIndex: 60, background: 'var(--color-surface)', color: 'var(--color-text)', borderBottom: '2px solid var(--color-border)', boxSizing: 'border-box', height: '40px' }}>Client / Company Name *</th>
                            <th style={{ padding: '9px 10px', width: '200px', minWidth: '200px', borderRight: '2px solid var(--color-border)', position: 'sticky', left: '280px', top: '42px', zIndex: 60, background: 'var(--color-surface)', color: 'var(--color-text)', borderBottom: '2px solid var(--color-border)', boxShadow: '4px 0 10px rgba(0,0,0,0.18)', boxSizing: 'border-box', height: '40px' }}>Location / Site *</th>

                            {/* Under each role: Rate, Sal, Qty with ample width */}
                            {ROLE_COLUMNS.map(col => (
                                <React.Fragment key={`${col.key}-sub`}>
                                    <th style={{ padding: '9px 6px', width: '105px', minWidth: '105px', textAlign: 'center', position: 'sticky', top: '42px', zIndex: 35, background: 'var(--color-surface-secondary)', color: 'var(--color-text)', borderBottom: '2px solid var(--color-border)', boxSizing: 'border-box', height: '40px' }}>Rate (PKR)</th>
                                    <th style={{ padding: '9px 6px', width: '105px', minWidth: '105px', textAlign: 'center', position: 'sticky', top: '42px', zIndex: 35, background: 'var(--color-surface-secondary)', color: 'var(--color-text)', borderBottom: '2px solid var(--color-border)', boxSizing: 'border-box', height: '40px' }}>Salary (PKR)</th>
                                    <th style={{ padding: '9px 6px', width: '60px', minWidth: '60px', textAlign: 'center', borderRight: '2px solid var(--color-border)', position: 'sticky', top: '42px', zIndex: 35, background: 'var(--color-surface-secondary)', color: 'var(--color-text)', borderBottom: '2px solid var(--color-border)', boxSizing: 'border-box', height: '40px' }}>Qty</th>
                                </React.Fragment>
                            ))}

                            {/* Summary Columns with generous space */}
                            <th style={{ padding: '9px 10px', width: '120px', minWidth: '120px', textAlign: 'right', color: '#38bdf8', fontWeight: 700, position: 'sticky', top: '42px', zIndex: 35, background: 'var(--color-surface-secondary)', borderBottom: '2px solid var(--color-border)', boxSizing: 'border-box', height: '40px' }}>Monthly Sale</th>
                            <th style={{ padding: '9px 10px', width: '120px', minWidth: '120px', textAlign: 'right', color: '#fbbf24', fontWeight: 700, position: 'sticky', top: '42px', zIndex: 35, background: 'var(--color-surface-secondary)', borderBottom: '2px solid var(--color-border)', boxSizing: 'border-box', height: '40px' }}>Direct Salary</th>
                            <th style={{ padding: '9px 6px', width: '65px', minWidth: '65px', textAlign: 'center', color: 'var(--color-text)', fontWeight: 700, position: 'sticky', top: '42px', zIndex: 35, background: 'var(--color-surface-secondary)', borderBottom: '2px solid var(--color-border)', boxSizing: 'border-box', height: '40px' }}>Strength</th>
                            <th style={{ padding: '9px 8px', width: '95px', minWidth: '95px', textAlign: 'right', color: 'var(--color-text-muted)', position: 'sticky', top: '42px', zIndex: 35, background: 'var(--color-surface-secondary)', borderBottom: '2px solid var(--color-border)', boxSizing: 'border-box', height: '40px' }}>Overhead Exp</th>
                            <th style={{ padding: '9px 8px', width: '95px', minWidth: '95px', textAlign: 'right', color: '#10b981', fontWeight: 700, position: 'sticky', top: '42px', zIndex: 35, background: 'var(--color-surface-secondary)', borderBottom: '2px solid var(--color-border)', boxSizing: 'border-box', height: '40px' }}>OT / Hr</th>
                            <th style={{ padding: '9px 8px', width: '110px', minWidth: '110px', textAlign: 'right', color: '#60a5fa', fontWeight: 700, position: 'sticky', top: '42px', zIndex: 35, background: 'var(--color-surface-secondary)', borderBottom: '2px solid var(--color-border)', boxSizing: 'border-box', height: '40px' }}>Service Charges</th>
                            <th style={{ padding: '9px 8px', width: '100px', minWidth: '100px', textAlign: 'right', color: '#fbbf24', fontWeight: 700, position: 'sticky', top: '42px', zIndex: 35, background: 'var(--color-surface-secondary)', borderBottom: '2px solid var(--color-border)', boxSizing: 'border-box', height: '40px' }}>Sales Tax</th>
                            <th style={{ padding: '9px 8px', width: '95px', minWidth: '95px', textAlign: 'right', color: 'var(--color-text-muted)', position: 'sticky', top: '42px', zIndex: 35, background: 'var(--color-surface-secondary)', borderBottom: '2px solid var(--color-border)', boxSizing: 'border-box', height: '40px' }}>WHT Tax</th>
                            <th style={{ padding: '9px 6px', width: '85px', minWidth: '85px', textAlign: 'right', color: 'var(--color-text-muted)', position: 'sticky', top: '42px', zIndex: 35, background: 'var(--color-surface-secondary)', borderBottom: '2px solid var(--color-border)', boxSizing: 'border-box', height: '40px' }}>SESSI</th>
                            <th style={{ padding: '9px 6px', width: '85px', minWidth: '85px', textAlign: 'right', color: 'var(--color-text-muted)', position: 'sticky', top: '42px', zIndex: 35, background: 'var(--color-surface-secondary)', borderBottom: '2px solid var(--color-border)', boxSizing: 'border-box', height: '40px' }}>EOBI</th>
                            <th style={{ padding: '9px 10px', width: '125px', minWidth: '125px', textAlign: 'right', color: '#34d399', fontWeight: 700, position: 'sticky', top: '42px', zIndex: 35, background: 'var(--color-surface-secondary)', borderBottom: '2px solid var(--color-border)', boxSizing: 'border-box', height: '40px' }}>Gross Margin</th>
                            <th style={{ padding: '9px 8px', width: '100px', minWidth: '100px', textAlign: 'right', color: 'var(--color-text-muted)', position: 'sticky', top: '42px', zIndex: 35, background: 'var(--color-surface-secondary)', borderBottom: '2px solid var(--color-border)', boxSizing: 'border-box', height: '40px' }}>Diff / Head</th>
                            <th style={{ padding: '9px 10px', width: '110px', minWidth: '110px', textAlign: 'right', color: '#34d399', fontWeight: 700, position: 'sticky', top: '42px', zIndex: 35, background: 'var(--color-surface-secondary)', borderBottom: '2px solid var(--color-border)', boxSizing: 'border-box', height: '40px' }}>Net Profit</th>
                            <th style={{ padding: '9px 6px', width: '50px', minWidth: '50px', position: 'sticky', top: '42px', zIndex: 35, background: 'var(--color-surface-secondary)', borderBottom: '2px solid var(--color-border)', boxSizing: 'border-box', height: '40px' }}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredRows.length === 0 ? (
                            <tr>
                                <td colSpan={3 + (ROLE_COLUMNS.length * 3) + 14} style={{ padding: '50px 20px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                                    {isLoading ? 'Loading costing matrix...' : 'No client locations found. Click "+ Add Client / Location Row" or "Import Excel Sheet" to begin.'}
                                </td>
                            </tr>
                        ) : (
                            filteredRows.map((row, idx) => {
                                const calc = computeRowTotals(row);
                                const rowBg = idx % 2 === 0 ? 'var(--color-surface)' : 'var(--color-surface-secondary)';

                                return (
                                    <tr 
                                        key={row.id || idx}
                                        style={{ 
                                            borderBottom: '1px solid var(--color-border)',
                                            background: rowBg
                                        }}
                                    >
                                        {/* Row # Sticky */}
                                        <td style={{ 
                                            padding: '8px 8px', 
                                            color: 'var(--color-text-muted)', 
                                            fontWeight: 600, 
                                            textAlign: 'center',
                                            position: 'sticky',
                                            left: 0,
                                            zIndex: 20,
                                            background: rowBg,
                                            boxSizing: 'border-box'
                                        }}>
                                            {idx + 1}
                                        </td>

                                        {/* Client Name Sticky */}
                                        <td style={{ 
                                            padding: '8px 8px',
                                            position: 'sticky',
                                            left: '45px',
                                            zIndex: 20,
                                            background: rowBg,
                                            boxSizing: 'border-box'
                                        }}>
                                            <input 
                                                type="text"
                                                list="existing-clients-list"
                                                value={row.client_name}
                                                onChange={(e) => handleUpdateRow(row, 'client_name', e.target.value)}
                                                placeholder="e.g. KatKom (Gharo & M9)"
                                                style={{
                                                    width: '100%',
                                                    height: '36px',
                                                    padding: '0 12px',
                                                    fontSize: '13px',
                                                    borderRadius: '6px',
                                                    border: '1px solid var(--color-border)',
                                                    background: 'var(--color-surface)',
                                                    color: 'var(--color-text)',
                                                    fontWeight: 600
                                                }}
                                            />
                                        </td>

                                        {/* Location / Site Name Sticky */}
                                        <td style={{ 
                                            padding: '8px 8px', 
                                            borderRight: '2px solid var(--color-border)',
                                            position: 'sticky',
                                            left: '280px',
                                            zIndex: 20,
                                            background: rowBg,
                                            boxShadow: '4px 0 10px rgba(0,0,0,0.18)',
                                            boxSizing: 'border-box'
                                        }}>
                                            <input 
                                                type="text"
                                                list={`existing-locations-${row.id || idx}`}
                                                value={row.location_name}
                                                onChange={(e) => handleUpdateRow(row, 'location_name', e.target.value)}
                                                placeholder="e.g. Gharo Site"
                                                style={{
                                                    width: '100%',
                                                    height: '36px',
                                                    padding: '0 12px',
                                                    fontSize: '13px',
                                                    borderRadius: '6px',
                                                    border: '1px solid var(--color-border)',
                                                    background: 'var(--color-surface)',
                                                    color: 'var(--color-text)',
                                                    fontWeight: 600
                                                }}
                                            />
                                            <datalist id={`existing-locations-${row.id || idx}`}>
                                                {(() => {
                                                    const clientKey = (row.client_name || '').toLowerCase().trim();
                                                    const clientLocs = clientKey && clientLocationsMap[clientKey];
                                                    const suggestions = (clientLocs && clientLocs.length > 0) ? clientLocs : allLocationNames;
                                                    return suggestions.map((locName, lIdx) => (
                                                        <option key={lIdx} value={locName} />
                                                    ));
                                                })()}
                                            </datalist>
                                        </td>

                                        {/* 7 Roles Side-by-Side (Rate, Salary, Qty) */}
                                        {ROLE_COLUMNS.map(role => {
                                            const qty = row[role.qtyKey] || 0;
                                            const hasDeployment = Number(qty) > 0;

                                            return (
                                                <React.Fragment key={`${role.key}-${idx}`}>
                                                    {/* Rate */}
                                                    <td style={{ padding: '6px 4px', background: hasDeployment ? 'rgba(59, 130, 246, 0.03)' : 'transparent' }}>
                                                        <input 
                                                            type="number"
                                                            step="any"
                                                            value={row[role.rateKey] !== undefined && row[role.rateKey] !== null ? (row[role.rateKey] as string | number) : ''}
                                                            onChange={(e) => handleUpdateRow(row, role.rateKey, e.target.value)}
                                                            placeholder="0"
                                                            style={{
                                                                width: '100%',
                                                                height: '36px',
                                                                padding: '0 10px',
                                                                fontSize: '13px',
                                                                textAlign: 'right',
                                                                fontWeight: 600,
                                                                borderRadius: '6px',
                                                                border: '1px solid var(--color-border)',
                                                                background: 'var(--color-surface)',
                                                                color: 'var(--color-text)'
                                                            }}
                                                        />
                                                    </td>

                                                    {/* Salary */}
                                                    <td style={{ padding: '6px 4px', background: hasDeployment ? 'rgba(245, 158, 11, 0.03)' : 'transparent' }}>
                                                        <input 
                                                            type="number"
                                                            step="any"
                                                            value={row[role.salKey] !== undefined && row[role.salKey] !== null ? (row[role.salKey] as string | number) : ''}
                                                            onChange={(e) => handleUpdateRow(row, role.salKey, e.target.value)}
                                                            placeholder="0"
                                                            style={{
                                                                width: '100%',
                                                                height: '36px',
                                                                padding: '0 10px',
                                                                fontSize: '13px',
                                                                textAlign: 'right',
                                                                fontWeight: 600,
                                                                borderRadius: '6px',
                                                                border: '1px solid var(--color-border)',
                                                                background: 'var(--color-surface)',
                                                                color: '#d97706'
                                                            }}
                                                        />
                                                    </td>

                                                    {/* Qty */}
                                                    <td style={{ padding: '6px 4px', borderRight: '2px solid var(--color-border)', background: hasDeployment ? 'rgba(16, 185, 129, 0.05)' : 'transparent' }}>
                                                        <input 
                                                            type="number"
                                                            min="0"
                                                            value={row[role.qtyKey] !== undefined && row[role.qtyKey] !== null ? (row[role.qtyKey] as string | number) : ''}
                                                            onChange={(e) => handleUpdateRow(row, role.qtyKey, e.target.value)}
                                                            placeholder="0"
                                                            style={{
                                                                width: '100%',
                                                                height: '36px',
                                                                padding: '0 6px',
                                                                fontSize: '13px',
                                                                textAlign: 'center',
                                                                fontWeight: hasDeployment ? 800 : 400,
                                                                borderRadius: '6px',
                                                                border: hasDeployment ? '1.5px solid var(--color-primary)' : '1px solid var(--color-border)',
                                                                background: 'var(--color-surface)',
                                                                color: hasDeployment ? 'var(--color-primary)' : 'var(--color-text-muted)'
                                                            }}
                                                        />
                                                    </td>
                                                </React.Fragment>
                                            );
                                        })}

                                        {/* Col Y: Total Monthly Sale */}
                                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, fontSize: '13px', color: '#3b82f6', background: 'rgba(59, 130, 246, 0.04)' }}>
                                            PKR {calc.monthlySale.toLocaleString()}
                                        </td>

                                        {/* Col Z: Total Monthly Salary */}
                                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, fontSize: '13px', color: '#f59e0b', background: 'rgba(245, 158, 11, 0.04)' }}>
                                            PKR {calc.monthlySalary.toLocaleString()}
                                        </td>

                                        {/* Col AA: Total Strength */}
                                        <td style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 800, fontSize: '14px', color: 'var(--color-primary)' }}>
                                            {calc.totalStrength}
                                        </td>

                                        {/* Col AB: Expense @ Rs 6,000/head default */}
                                        <td style={{ padding: '10px 10px', textAlign: 'right', fontSize: '13px', color: 'var(--color-text-muted)' }}>
                                            {calc.expense.toLocaleString()}
                                        </td>

                                        {/* Col OT: Overtime Hourly Billing Rate */}
                                        <td style={{ padding: '6px 4px' }}>
                                            <input 
                                                type="number"
                                                step="any"
                                                value={row.ot_rate !== undefined && row.ot_rate !== null ? row.ot_rate : ''}
                                                onChange={(e) => handleUpdateRow(row, 'ot_rate', e.target.value)}
                                                placeholder="0"
                                                title="Overtime Hourly Billing Rate in PKR"
                                                style={{
                                                    width: '100%',
                                                    height: '34px',
                                                    padding: '0 8px',
                                                    fontSize: '12px',
                                                    textAlign: 'right',
                                                    borderRadius: '6px',
                                                    border: '1px solid var(--color-border)',
                                                    background: 'var(--color-surface)',
                                                    color: '#10b981',
                                                    fontWeight: 700
                                                }}
                                            />
                                        </td>

                                        {/* Col AG: Service Charges (Editable inline cell, flat monthly) */}
                                        <td style={{ padding: '6px 4px' }}>
                                            <input 
                                                type="number"
                                                step="any"
                                                value={row.service_charges_per_guard !== undefined && row.service_charges_per_guard !== null ? row.service_charges_per_guard : ''}
                                                onChange={(e) => handleUpdateRow(row, 'service_charges_per_guard', e.target.value)}
                                                placeholder="3000"
                                                title="Service Charges in PKR (Flat monthly, enter 0 to waive)"
                                                style={{
                                                    width: '100%',
                                                    height: '34px',
                                                    padding: '0 8px',
                                                    fontSize: '12px',
                                                    textAlign: 'right',
                                                    borderRadius: '6px',
                                                    border: '1px solid var(--color-border)',
                                                    background: 'var(--color-surface)',
                                                    color: '#60a5fa',
                                                    fontWeight: 700
                                                }}
                                            />
                                        </td>

                                        {/* Col AH: Sales Tax (Editable input with default 8% on Col AG) */}
                                        <td style={{ padding: '6px 4px' }}>
                                            <input 
                                                type="number"
                                                step="any"
                                                value={row.sales_tax_override !== undefined && row.sales_tax_override !== null ? row.sales_tax_override : (calc.salesTax !== undefined ? Math.round(calc.salesTax) : '')}
                                                onChange={(e) => handleUpdateRow(row, 'sales_tax_override', e.target.value)}
                                                placeholder="240"
                                                title="Sales Tax in PKR (Auto-calculates from formula, or enter custom amount)"
                                                style={{
                                                    width: '100%',
                                                    height: '34px',
                                                    padding: '0 8px',
                                                    fontSize: '12px',
                                                    textAlign: 'right',
                                                    borderRadius: '6px',
                                                    border: (row.sales_tax_override !== undefined && row.sales_tax_override !== null && row.sales_tax_override !== '') ? '1.5px solid #f59e0b' : '1px solid var(--color-border)',
                                                    background: (row.sales_tax_override !== undefined && row.sales_tax_override !== null && row.sales_tax_override !== '') ? 'rgba(245, 158, 11, 0.08)' : 'var(--color-surface)',
                                                    color: '#f59e0b',
                                                    fontWeight: 700
                                                }}
                                            />
                                        </td>

                                        {/* Col AC: Tax WHT 7% (Editable input with default 7% on Col AG) */}
                                        <td style={{ padding: '6px 4px' }}>
                                            <input 
                                                type="number"
                                                step="any"
                                                value={row.withholding_tax_override !== undefined && row.withholding_tax_override !== null ? row.withholding_tax_override : (calc.wht !== undefined ? Math.round(calc.wht) : '')}
                                                onChange={(e) => handleUpdateRow(row, 'withholding_tax_override', e.target.value)}
                                                placeholder="210"
                                                title="Income Tax / WHT in PKR (Auto-calculates from formula, or enter custom amount)"
                                                style={{
                                                    width: '100%',
                                                    height: '34px',
                                                    padding: '0 8px',
                                                    fontSize: '12px',
                                                    textAlign: 'right',
                                                    borderRadius: '6px',
                                                    border: (row.withholding_tax_override !== undefined && row.withholding_tax_override !== null && row.withholding_tax_override !== '') ? '1.5px solid #a855f7' : '1px solid var(--color-border)',
                                                    background: (row.withholding_tax_override !== undefined && row.withholding_tax_override !== null && row.withholding_tax_override !== '') ? 'rgba(168, 85, 247, 0.08)' : 'var(--color-surface)',
                                                    color: 'var(--color-text)',
                                                    fontWeight: 700
                                                }}
                                            />
                                        </td>

                                        {/* Col AE: SESSI (Editable inline cell) */}
                                        <td style={{ padding: '6px 4px' }}>
                                            <input 
                                                type="number"
                                                step="any"
                                                value={row.sessi !== undefined && row.sessi !== null ? row.sessi : ''}
                                                onChange={(e) => handleUpdateRow(row, 'sessi', e.target.value)}
                                                placeholder="0"
                                                style={{
                                                    width: '100%',
                                                    height: '34px',
                                                    padding: '0 8px',
                                                    fontSize: '12px',
                                                    textAlign: 'right',
                                                    borderRadius: '6px',
                                                    border: '1px solid var(--color-border)',
                                                    background: 'var(--color-surface)',
                                                    color: 'var(--color-text)'
                                                }}
                                            />
                                        </td>

                                        {/* Col AF: EOBI (Editable inline cell) */}
                                        <td style={{ padding: '6px 4px' }}>
                                            <input 
                                                type="number"
                                                step="any"
                                                value={row.eobi !== undefined && row.eobi !== null ? row.eobi : ''}
                                                onChange={(e) => handleUpdateRow(row, 'eobi', e.target.value)}
                                                placeholder="0"
                                                style={{
                                                    width: '100%',
                                                    height: '34px',
                                                    padding: '0 8px',
                                                    fontSize: '12px',
                                                    textAlign: 'right',
                                                    borderRadius: '6px',
                                                    border: '1px solid var(--color-border)',
                                                    background: 'var(--color-surface)',
                                                    color: 'var(--color-text)'
                                                }}
                                            />
                                        </td>

                                        {/* Col AJ: Gross Margin / Difference */}
                                        <td style={{ padding: '10px 12px', textAlign: 'right', background: 'rgba(16, 185, 129, 0.04)' }}>
                                            <span style={{
                                                display: 'inline-block',
                                                padding: '3px 8px',
                                                borderRadius: '6px',
                                                fontWeight: 800,
                                                fontSize: '12.5px',
                                                background: calc.difference >= 0 ? 'rgba(16, 185, 129, 0.14)' : 'rgba(239, 68, 68, 0.14)',
                                                color: calc.difference >= 0 ? '#10b981' : '#ef4444'
                                            }}>
                                                PKR {Math.round(calc.difference).toLocaleString()}
                                            </span>
                                        </td>

                                        {/* Col AK: Diff / Head */}
                                        <td style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 700, fontSize: '13px', color: calc.diffPerHead >= 0 ? 'var(--color-text)' : '#ef4444' }}>
                                            PKR {Math.round(calc.diffPerHead).toLocaleString()}
                                        </td>

                                        {/* Col AD: Net Profit / Loss */}
                                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, fontSize: '13px', color: calc.profitLoss >= 0 ? '#10b981' : '#ef4444' }}>
                                            PKR {Math.round(calc.profitLoss).toLocaleString()}
                                        </td>

                                        {/* Delete Action */}
                                        <td style={{ padding: '6px 4px', textAlign: 'center' }}>
                                            <button
                                                type="button"
                                                onClick={() => handleDeleteRow(row)}
                                                style={{
                                                    background: 'none',
                                                    border: 'none',
                                                    color: 'var(--color-danger, #ef4444)',
                                                    cursor: 'pointer',
                                                    fontSize: '18px',
                                                    padding: '4px',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    borderRadius: '6px'
                                                }}
                                                title="Delete row"
                                            >
                                                <i className='bx bx-trash'></i>
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>

                    {/* Summary Footer Row */}
                    {filteredRows.length > 0 && (
                        <tfoot>
                            <tr style={{
                                background: 'var(--color-surface-secondary)',
                                borderTop: '2px solid var(--color-border)',
                                fontWeight: 800,
                                fontSize: '13px'
                            }}>
                                <td 
                                    colSpan={3} 
                                    style={{ 
                                        padding: '14px 16px', 
                                        borderRight: '2px solid var(--color-border)',
                                        position: 'sticky',
                                        left: 0,
                                        zIndex: 30,
                                        background: 'var(--color-surface-secondary)',
                                        color: 'var(--color-text)',
                                        boxShadow: '4px 0 10px rgba(0,0,0,0.18)'
                                    }}
                                >
                                    PORTFOLIO TOTALS ({filteredRows.length} Locations)
                                </td>
                                {ROLE_COLUMNS.map(role => {
                                    let roleTotalQty = 0;
                                    filteredRows.forEach(r => {
                                        roleTotalQty += Number(r[role.qtyKey]) || 0;
                                    });

                                    return (
                                        <React.Fragment key={`${role.key}-foot`}>
                                            <td colSpan={2} style={{ padding: '14px 6px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                                                -
                                            </td>
                                            <td style={{ padding: '14px 6px', textAlign: 'center', borderRight: '2px solid var(--color-border)', color: 'var(--color-primary)' }}>
                                                {roleTotalQty}
                                            </td>
                                        </React.Fragment>
                                    );
                                })}

                                <td style={{ padding: '14px 12px', textAlign: 'right', color: '#3b82f6' }}>
                                    PKR {summary.totalSale.toLocaleString()}
                                </td>
                                <td style={{ padding: '14px 12px', textAlign: 'right', color: '#f59e0b' }}>
                                    PKR {summary.totalSalary.toLocaleString()}
                                </td>
                                <td style={{ padding: '14px 8px', textAlign: 'center', color: 'var(--color-primary)' }}>
                                    {summary.totalGuards}
                                </td>
                                <td style={{ padding: '14px 10px', textAlign: 'right', color: 'var(--color-text-muted)' }}>
                                    PKR {summary.totalExpense.toLocaleString()}
                                </td>
                                <td style={{ padding: '14px 8px', textAlign: 'right', color: '#10b981', fontWeight: 800 }}>
                                    -
                                </td>
                                <td style={{ padding: '14px 10px', textAlign: 'right', color: '#60a5fa', fontWeight: 800 }}>
                                    PKR {Math.round(summary.totalServiceCharges).toLocaleString()}
                                </td>
                                <td style={{ padding: '14px 10px', textAlign: 'right', color: '#f59e0b', fontWeight: 800 }}>
                                    PKR {Math.round(summary.totalSalesTax).toLocaleString()}
                                </td>
                                <td style={{ padding: '14px 10px', textAlign: 'right', color: 'var(--color-text-muted)' }}>
                                    PKR {Math.round(summary.totalWht).toLocaleString()}
                                </td>
                                <td style={{ padding: '14px 8px', textAlign: 'right', color: 'var(--color-text-muted)' }}>
                                    PKR {Math.round(summary.totalSessi).toLocaleString()}
                                </td>
                                <td style={{ padding: '14px 8px', textAlign: 'right', color: 'var(--color-text-muted)' }}>
                                    PKR {Math.round(summary.totalEobi).toLocaleString()}
                                </td>
                                <td style={{ padding: '14px 12px', textAlign: 'right', color: summary.totalDifference >= 0 ? '#10b981' : '#ef4444' }}>
                                    PKR {Math.round(summary.totalDifference).toLocaleString()}
                                </td>
                                <td style={{ padding: '14px 10px', textAlign: 'right', color: 'var(--color-text)' }}>
                                    PKR {summary.totalGuards > 0 ? Math.round(summary.totalDifference / summary.totalGuards).toLocaleString() : 0}
                                </td>
                                <td style={{ padding: '14px 12px', textAlign: 'right', color: summary.totalProfit >= 0 ? '#10b981' : '#ef4444' }}>
                                    PKR {Math.round(summary.totalProfit).toLocaleString()}
                                </td>
                                <td></td>
                            </tr>
                        </tfoot>
                    )}
                </table>
            </div>
        </div>
    );
};
