import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Button } from '../../../../components/ui/Button';
import { Input } from '../../../../components/ui/Input';
import { useToastStore } from '../../../../stores/toastStore';
import { fetchCostingGrid, syncCostingGrid, importCostingExcel } from '../api';
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

// 7 exact role categories matching Sheet 1 without duplicate/redundant badges
const ROLE_COLUMNS: RoleColDef[] = [
    {
        key: 'sup_ex',
        label: 'Supervisor (Ex-Army)',
        rateKey: 'sup_ex_rate',
        salKey: 'sup_ex_sal',
        qtyKey: 'sup_ex_qty'
    },
    {
        key: 'sup_civ',
        label: 'Supervisor (Civil)',
        rateKey: 'sup_civ_rate',
        salKey: 'sup_civ_sal',
        qtyKey: 'sup_civ_qty'
    },
    {
        key: 'guard_ex',
        label: 'Security Guard (Ex-Army)',
        rateKey: 'guard_ex_rate',
        salKey: 'guard_ex_sal',
        qtyKey: 'guard_ex_qty'
    },
    {
        key: 'guard_civ',
        label: 'Security Guard (Civil)',
        rateKey: 'guard_civ_rate',
        salKey: 'guard_civ_sal',
        qtyKey: 'guard_civ_qty'
    },
    {
        key: 'lady_cctv',
        label: 'Lady Searcher / CCTV',
        rateKey: 'lady_cctv_rate',
        salKey: 'lady_cctv_sal',
        qtyKey: 'lady_cctv_qty'
    },
    {
        key: 'cpo_ex',
        label: 'CPO (Ex-Army)',
        rateKey: 'cpo_ex_rate',
        salKey: 'cpo_ex_sal',
        qtyKey: 'cpo_ex_qty'
    },
    {
        key: 'cpo_civ',
        label: 'CPO (Civil)',
        rateKey: 'cpo_civ_rate',
        salKey: 'cpo_civ_sal',
        qtyKey: 'cpo_civ_qty'
    }
];

export const FastCostingGridTab: React.FC = () => {
    const [rows, setRows] = useState<CostingGridRow[]>([]);
    const [existingCustomers, setExistingCustomers] = useState<CRMEntity[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [search, setSearch] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const tableContainerRef = useRef<HTMLDivElement>(null);
    const topScrollRef = useRef<HTMLDivElement>(null);
    const isSyncingRef = useRef<boolean>(false);
    const [scrollLeft, setScrollLeft] = useState<number>(0);
    const [isFitScreen, setIsFitScreen] = useState<boolean>(true);

    const SECTIONS = [
        { label: 'Client & Site', icon: 'bx-buildings', offset: 0, min: 0, max: 250 },
        { label: 'Supervisors', icon: 'bx-shield', offset: 480, min: 250, max: 900 },
        { label: 'Security Guards', icon: 'bx-user-check', offset: 1020, min: 900, max: 1450 },
        { label: 'Lady CCTV & CPO', icon: 'bx-video', offset: 1560, min: 1450, max: 2000 },
        { label: 'Revenue & Payroll (Y & Z)', icon: 'bx-line-chart', offset: 2150, min: 2000, max: 2500 },
        { label: 'Tax & Statutory', icon: 'bx-receipt', offset: 2550, min: 2500, max: 2850 },
        { label: 'Margins & Profit (AJ, AD)', icon: 'bx-dollar-circle', offset: 2950, min: 2850, max: 4000 },
    ];

    const handleTableScroll = (e: React.UIEvent<HTMLDivElement>) => {
        if (isSyncingRef.current) return;
        isSyncingRef.current = true;
        const currentLeft = e.currentTarget.scrollLeft;
        setScrollLeft(currentLeft);
        if (topScrollRef.current) {
            topScrollRef.current.scrollLeft = currentLeft;
        }
        requestAnimationFrame(() => {
            isSyncingRef.current = false;
        });
    };

    const handleTopScroll = (e: React.UIEvent<HTMLDivElement>) => {
        if (isSyncingRef.current) return;
        isSyncingRef.current = true;
        const currentLeft = e.currentTarget.scrollLeft;
        setScrollLeft(currentLeft);
        if (tableContainerRef.current) {
            tableContainerRef.current.scrollLeft = currentLeft;
        }
        requestAnimationFrame(() => {
            isSyncingRef.current = false;
        });
    };

    const scrollToOffset = (left: number) => {
        if (tableContainerRef.current) {
            tableContainerRef.current.scrollTo({ left, behavior: 'smooth' });
        }
        if (topScrollRef.current) {
            topScrollRef.current.scrollTo({ left, behavior: 'smooth' });
        }
    };

    const scrollByDelta = (delta: number) => {
        if (tableContainerRef.current) {
            tableContainerRef.current.scrollBy({ left: delta, behavior: 'smooth' });
        }
        if (topScrollRef.current) {
            topScrollRef.current.scrollBy({ left: delta, behavior: 'smooth' });
        }
    };

    const loadGrid = async () => {
        setIsLoading(true);
        try {
            const [gridData, customersRes] = await Promise.all([
                fetchCostingGrid(),
                getEntities({ entity_type: 'CUSTOMER' }).catch(() => ({ results: [] }))
            ]);
            setRows(gridData);
            setExistingCustomers(customersRes.results || []);
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

        const overheadPerGuard = r.overhead_per_guard !== undefined && r.overhead_per_guard !== null ? Number(r.overhead_per_guard) : 6000;
        const serviceCharges = r.service_charges_per_guard !== undefined && r.service_charges_per_guard !== null ? Number(r.service_charges_per_guard) : 3000; // Col AG (Flat monthly)
        const taxWhtRate = r.tax_wht_rate !== undefined && r.tax_wht_rate !== null ? Number(r.tax_wht_rate) : 7;
        const salesTaxRate = r.sales_tax_rate !== undefined && r.sales_tax_rate !== null ? Number(r.sales_tax_rate) : 8;
        const sessi = Number(r.sessi) || 0;
        const eobi = Number(r.eobi) || 0;

        const expense = totalStrength * overheadPerGuard; // Col AB

        // Check for manual overrides or compute formula default
        const salesTax = (r.sales_tax_override !== undefined && r.sales_tax_override !== null)
            ? Number(r.sales_tax_override)
            : (serviceCharges * (salesTaxRate / 100)); // Col AH

        const wht = (r.withholding_tax_override !== undefined && r.withholding_tax_override !== null)
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

    const handleAddBlankRow = () => {
        const newRow: CostingGridRow = {
            id: `temp-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            client_id: null,
            client_name: '',
            location_name: 'Head Office',
            overhead_per_guard: 6000,
            service_charges_per_guard: 3000,
            tax_wht_rate: 7,
            sales_tax_rate: 8,
            sessi: 0,
            eobi: 0,
            sup_ex_qty: 0, sup_ex_rate: 0, sup_ex_sal: 0,
            sup_civ_qty: 0, sup_civ_rate: 0, sup_civ_sal: 0,
            guard_ex_qty: 0, guard_ex_rate: 0, guard_ex_sal: 0,
            guard_civ_qty: 1, guard_civ_rate: 45000, guard_civ_sal: 32000,
            lady_cctv_qty: 0, lady_cctv_rate: 0, lady_cctv_sal: 0,
            cpo_ex_qty: 0, cpo_ex_rate: 0, cpo_ex_sal: 0,
            cpo_civ_qty: 0, cpo_civ_rate: 0, cpo_civ_sal: 0,
        };
        setRows([newRow, ...rows]);
    };

    const handleUpdateRow = (index: number, field: keyof CostingGridRow, value: any) => {
        const updated = [...rows];
        const currentRow = { ...updated[index] };

        // If updating client_name, check if it matches an existing customer to auto-link client_id
        if (field === 'client_name') {
            const matched = existingCustomers.find(c => c.name.toLowerCase() === String(value).trim().toLowerCase());
            currentRow.client_id = matched ? matched.id : null;
        }

        currentRow[field] = value as never;
        updated[index] = currentRow;
        setRows(updated);
    };

    const handleDeleteRow = (index: number) => {
        const updated = rows.filter((_, i) => i !== index);
        setRows(updated);
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
            const res = await syncCostingGrid(rows);
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

    const filteredRows = useMemo(() => {
        if (!search.trim()) return rows;
        const q = search.toLowerCase();
        return rows.filter(r => 
            r.client_name?.toLowerCase().includes(q) ||
            r.location_name?.toLowerCase().includes(q)
        );
    }, [rows, search]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Sheet 1 Summary KPI Cards Bar */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '14px'
            }}>
                <div style={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '12px',
                    padding: '14px 18px',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.04)'
                }}>
                    <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                        Clients & Locations
                    </div>
                    <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--color-text)', marginTop: '4px' }}>
                        {summary.totalClients} <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text-muted)' }}>({summary.totalLocations} Sites)</span>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                        Active Sheet 1 Portfolio
                    </div>
                </div>

                <div style={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '12px',
                    padding: '14px 18px',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.04)'
                }}>
                    <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                        Total Force (Col AA)
                    </div>
                    <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--color-primary)', marginTop: '4px' }}>
                        {summary.totalGuards} <span style={{ fontSize: '13px', fontWeight: 600 }}>Guards</span>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                        Total Deployed Strength
                    </div>
                </div>

                <div style={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '12px',
                    padding: '14px 18px',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.04)'
                }}>
                    <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                        Total Sale (Col Y)
                    </div>
                    <div style={{ fontSize: '20px', fontWeight: 800, color: '#3b82f6', marginTop: '4px' }}>
                        PKR {summary.totalSale.toLocaleString()}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                        Monthly Client Revenue
                    </div>
                </div>

                <div style={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '12px',
                    padding: '14px 18px',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.04)'
                }}>
                    <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                        Direct Salary (Col Z)
                    </div>
                    <div style={{ fontSize: '20px', fontWeight: 800, color: '#f59e0b', marginTop: '4px' }}>
                        PKR {summary.totalSalary.toLocaleString()}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                        Monthly Guard Payroll
                    </div>
                </div>

                <div style={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '12px',
                    padding: '14px 18px',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.04)'
                }}>
                    <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                        Gross Margin (Col AJ)
                    </div>
                    <div style={{ fontSize: '20px', fontWeight: 800, color: summary.totalDifference >= 0 ? '#10b981' : '#ef4444', marginTop: '4px' }}>
                        PKR {summary.totalDifference.toLocaleString()}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                        Sale - Salary - WHT - SESSI
                    </div>
                </div>

                <div style={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '12px',
                    padding: '14px 18px',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.04)'
                }}>
                    <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                        Net Profit (Col AD)
                    </div>
                    <div style={{ fontSize: '20px', fontWeight: 800, color: summary.totalProfit >= 0 ? '#10b981' : '#ef4444', marginTop: '4px' }}>
                        PKR {summary.totalProfit.toLocaleString()}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                        After Operations Overhead
                    </div>
                </div>
            </div>

            {/* Action Toolbar */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px',
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: '12px',
                padding: '12px 18px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
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
                        {isImporting ? 'Importing Sheet 1...' : 'Import Excel Sheet (.xlsx)'}
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

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '260px' }}>
                        <Input 
                            placeholder="Filter by client or location..." 
                            value={search} 
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>

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

            {/* Top Horizontal Scroll & Quick Navigation Center (Sticky & Synced) */}
            <div style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: '12px',
                padding: '12px 16px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                position: 'sticky',
                top: 0,
                zIndex: 20
            }}>
                <style>{`
                    .custom-sheet-scrollbar::-webkit-scrollbar {
                        height: 12px;
                        width: 10px;
                    }
                    .custom-sheet-scrollbar::-webkit-scrollbar-track {
                        background: var(--color-surface-secondary, #f1f5f9);
                        border-radius: 6px;
                    }
                    .custom-sheet-scrollbar::-webkit-scrollbar-thumb {
                        background: var(--color-primary, #3b82f6);
                        border-radius: 6px;
                        border: 2px solid var(--color-surface, #ffffff);
                    }
                    .custom-sheet-scrollbar::-webkit-scrollbar-thumb:hover {
                        background: #2563eb;
                    }
                    .quick-jump-chip {
                        padding: 5px 11px;
                        border-radius: 6px;
                        border: 1px solid var(--color-border);
                        background: var(--color-surface);
                        color: var(--color-text);
                        font-size: 11px;
                        font-weight: 600;
                        cursor: pointer;
                        display: inline-flex;
                        align-items: center;
                        gap: 5px;
                        transition: all 0.15s ease;
                        white-space: nowrap;
                    }
                    .quick-jump-chip:hover {
                        background: var(--color-surface-secondary);
                        border-color: var(--color-primary);
                        color: var(--color-primary);
                    }
                    .quick-jump-chip.active {
                        background: var(--color-primary);
                        color: #ffffff;
                        border-color: var(--color-primary);
                        box-shadow: 0 2px 4px rgba(59, 130, 246, 0.25);
                    }
                    .scroll-nav-btn {
                        padding: 6px 12px;
                        border-radius: 6px;
                        border: 1px solid var(--color-border);
                        background: var(--color-surface);
                        color: var(--color-text);
                        font-size: 12px;
                        font-weight: 600;
                        cursor: pointer;
                        display: inline-flex;
                        align-items: center;
                        gap: 6px;
                        transition: all 0.15s ease;
                    }
                    .scroll-nav-btn:hover {
                        background: var(--color-surface-secondary);
                        border-color: var(--color-primary);
                        color: var(--color-primary);
                    }
                `}</style>

                {/* Top Row: Quick Jump Sections & Stepper Buttons & Height Toggle */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-text-muted)', marginRight: '4px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <i className='bx bx-compass' style={{ color: 'var(--color-primary)', fontSize: '14px' }}></i> Jump To:
                        </span>
                        {SECTIONS.map(s => {
                            const isActive = scrollLeft >= s.min && scrollLeft < s.max;
                            return (
                                <button
                                    key={s.label}
                                    type="button"
                                    onClick={() => scrollToOffset(s.offset)}
                                    className={`quick-jump-chip ${isActive ? 'active' : ''}`}
                                    title={`Scroll to ${s.label}`}
                                >
                                    <i className={`bx ${s.icon}`}></i>
                                    {s.label}
                                </button>
                            );
                        })}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {/* Stepper Buttons */}
                        <button
                            type="button"
                            onClick={() => scrollByDelta(-350)}
                            className="scroll-nav-btn"
                            title="Scroll Left (350px)"
                        >
                            <i className='bx bx-chevron-left' style={{ fontSize: '16px' }}></i>
                            Left
                        </button>
                        <button
                            type="button"
                            onClick={() => scrollByDelta(350)}
                            className="scroll-nav-btn"
                            title="Scroll Right (350px)"
                        >
                            Right
                            <i className='bx bx-chevron-right' style={{ fontSize: '16px' }}></i>
                        </button>

                        {/* Viewport Height Toggle */}
                        <button
                            type="button"
                            onClick={() => setIsFitScreen(!isFitScreen)}
                            className="scroll-nav-btn"
                            style={isFitScreen ? { borderColor: 'var(--color-primary)', color: 'var(--color-primary)' } : {}}
                            title={isFitScreen ? "Click to expand sheet to full unbounded page height" : "Click to constrain sheet to viewport height with internal scroll"}
                        >
                            <i className={`bx ${isFitScreen ? 'bx-collapse-vertical' : 'bx-expand-vertical'}`}></i>
                            {isFitScreen ? 'Fit Screen' : 'Full Height'}
                        </button>
                    </div>
                </div>

                {/* Bottom Row: Synchronized Top Horizontal Scrollbar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                        <i className='bx bx-slider-alt' style={{ color: 'var(--color-primary)', fontSize: '14px' }}></i>
                        <span>Scroll Bar:</span>
                    </div>

                    <div
                        ref={topScrollRef}
                        onScroll={handleTopScroll}
                        className="custom-sheet-scrollbar"
                        style={{
                            flex: 1,
                            overflowX: 'auto',
                            overflowY: 'hidden',
                            height: '16px',
                            background: 'var(--color-surface-secondary, #f8fafc)',
                            borderRadius: '8px',
                            border: '1px solid var(--color-border)',
                            padding: '2px 0'
                        }}
                        title="Drag or scroll horizontally here to pan across the entire costing sheet"
                    >
                        {/* Dummy wide spacer tracking table minWidth */}
                        <div style={{ width: '3450px', height: '1px' }} />
                    </div>
                </div>
            </div>

            {/* Interactive Wide Matrix Sheet 1 Table with Freeze Panes */}
            <div 
                ref={tableContainerRef}
                onScroll={handleTableScroll}
                className="custom-sheet-scrollbar"
                style={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '12px',
                    overflowX: 'auto',
                    overflowY: isFitScreen ? 'auto' : 'visible',
                    maxHeight: isFitScreen ? 'calc(100vh - 290px)' : 'none',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                    WebkitOverflowScrolling: 'touch',
                    position: 'relative'
                }}
            >
                <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, textAlign: 'left', fontSize: '13px', minWidth: '3450px' }}>
                    <thead>
                        {/* Level 1 Group Header Row */}
                        <tr style={{ position: 'sticky', top: 0, zIndex: 12, background: 'var(--color-surface-secondary)', borderBottom: '1px solid var(--color-border)', color: 'var(--color-text)' }}>
                            <th 
                                colSpan={3} 
                                style={{ 
                                    padding: '12px 16px', 
                                    borderRight: '2px solid var(--color-border)', 
                                    fontWeight: 700, 
                                    width: '480px',
                                    minWidth: '480px',
                                    position: 'sticky',
                                    left: 0,
                                    top: 0,
                                    zIndex: 14,
                                    background: 'var(--color-surface-secondary)',
                                    boxShadow: '4px 0 8px rgba(0,0,0,0.06)'
                                }}
                            >
                                Client & Deployment Location (Cols B & C)
                            </th>
                            {ROLE_COLUMNS.map((col, cIdx) => (
                                <th 
                                    key={col.key} 
                                    colSpan={3} 
                                    style={{ 
                                        padding: '12px 10px', 
                                        textAlign: 'center', 
                                        borderRight: '2px solid var(--color-border)',
                                        background: cIdx % 2 === 0 ? 'rgba(59, 130, 246, 0.08)' : 'rgba(16, 185, 129, 0.08)',
                                        fontWeight: 700,
                                        fontSize: '13px',
                                        width: '270px',
                                        minWidth: '270px',
                                        position: 'sticky',
                                        top: 0,
                                        zIndex: 12
                                    }}
                                >
                                    {col.label}
                                </th>
                            ))}
                            <th colSpan={12} style={{ padding: '12px 16px', textAlign: 'center', background: 'rgba(245, 158, 11, 0.12)', fontWeight: 700, minWidth: '1260px', position: 'sticky', top: 0, zIndex: 12 }}>
                                Live Costing, Tax & Margins (Sheet 1 Cols Y – AK)
                            </th>
                            <th style={{ padding: '12px 8px', width: '50px', minWidth: '50px', position: 'sticky', top: 0, zIndex: 12, background: 'var(--color-surface-secondary)' }}></th>
                        </tr>

                        {/* Level 2 Sub-Column Header Row */}
                        <tr style={{ position: 'sticky', top: '42px', zIndex: 12, background: 'var(--color-surface)', borderBottom: '2px solid var(--color-border)', color: 'var(--color-text-muted)', fontSize: '12px' }}>
                            <th style={{ padding: '10px 8px', width: '45px', minWidth: '45px', textAlign: 'center', position: 'sticky', left: 0, top: '42px', zIndex: 14, background: 'var(--color-surface)' }}>#</th>
                            <th style={{ padding: '10px 10px', width: '235px', minWidth: '235px', position: 'sticky', left: '45px', top: '42px', zIndex: 14, background: 'var(--color-surface)' }}>Client / Company Name *</th>
                            <th style={{ padding: '10px 10px', width: '200px', minWidth: '200px', borderRight: '2px solid var(--color-border)', position: 'sticky', left: '280px', top: '42px', zIndex: 14, background: 'var(--color-surface)', boxShadow: '4px 0 8px rgba(0,0,0,0.06)' }}>Location / Site *</th>

                            {/* Under each role: Rate, Sal, Qty with ample width */}
                            {ROLE_COLUMNS.map(col => (
                                <React.Fragment key={`${col.key}-sub`}>
                                    <th style={{ padding: '10px 6px', width: '105px', minWidth: '105px', textAlign: 'center', position: 'sticky', top: '42px', zIndex: 12, background: 'var(--color-surface)' }}>Rate (PKR)</th>
                                    <th style={{ padding: '10px 6px', width: '105px', minWidth: '105px', textAlign: 'center', position: 'sticky', top: '42px', zIndex: 12, background: 'var(--color-surface)' }}>Salary (PKR)</th>
                                    <th style={{ padding: '10px 6px', width: '60px', minWidth: '60px', textAlign: 'center', borderRight: '2px solid var(--color-border)', position: 'sticky', top: '42px', zIndex: 12, background: 'var(--color-surface)' }}>Qty</th>
                                </React.Fragment>
                            ))}

                            {/* Summary Columns Y through AK with generous space */}
                            <th style={{ padding: '10px 10px', width: '120px', minWidth: '120px', textAlign: 'right', color: '#3b82f6', fontWeight: 700, position: 'sticky', top: '42px', zIndex: 12, background: 'var(--color-surface)' }}>Monthly Sale (Y)</th>
                            <th style={{ padding: '10px 10px', width: '120px', minWidth: '120px', textAlign: 'right', color: '#f59e0b', fontWeight: 700, position: 'sticky', top: '42px', zIndex: 12, background: 'var(--color-surface)' }}>Direct Salary (Z)</th>
                            <th style={{ padding: '10px 6px', width: '65px', minWidth: '65px', textAlign: 'center', fontWeight: 700, position: 'sticky', top: '42px', zIndex: 12, background: 'var(--color-surface)' }}>Str (AA)</th>
                            <th style={{ padding: '10px 8px', width: '95px', minWidth: '95px', textAlign: 'right', position: 'sticky', top: '42px', zIndex: 12, background: 'var(--color-surface)' }}>Expense (AB)</th>
                            <th style={{ padding: '10px 8px', width: '110px', minWidth: '110px', textAlign: 'right', color: '#60a5fa', fontWeight: 700, position: 'sticky', top: '42px', zIndex: 12, background: 'var(--color-surface)' }}>Service Chg (AG)</th>
                            <th style={{ padding: '10px 8px', width: '100px', minWidth: '100px', textAlign: 'right', color: '#f59e0b', fontWeight: 700, position: 'sticky', top: '42px', zIndex: 12, background: 'var(--color-surface)' }}>Sales Tax (AH)</th>
                            <th style={{ padding: '10px 8px', width: '95px', minWidth: '95px', textAlign: 'right', position: 'sticky', top: '42px', zIndex: 12, background: 'var(--color-surface)' }}>WHT 7% (AC)</th>
                            <th style={{ padding: '10px 6px', width: '85px', minWidth: '85px', textAlign: 'right', position: 'sticky', top: '42px', zIndex: 12, background: 'var(--color-surface)' }}>SESSI (AE)</th>
                            <th style={{ padding: '10px 6px', width: '85px', minWidth: '85px', textAlign: 'right', position: 'sticky', top: '42px', zIndex: 12, background: 'var(--color-surface)' }}>EOBI (AF)</th>
                            <th style={{ padding: '10px 10px', width: '125px', minWidth: '125px', textAlign: 'right', color: '#10b981', fontWeight: 700, position: 'sticky', top: '42px', zIndex: 12, background: 'var(--color-surface)' }}>Margin (AJ)</th>
                            <th style={{ padding: '10px 8px', width: '100px', minWidth: '100px', textAlign: 'right', position: 'sticky', top: '42px', zIndex: 12, background: 'var(--color-surface)' }}>Diff / Hd (AK)</th>
                            <th style={{ padding: '10px 10px', width: '110px', minWidth: '110px', textAlign: 'right', fontWeight: 700, position: 'sticky', top: '42px', zIndex: 12, background: 'var(--color-surface)' }}>Profit (AD)</th>
                            <th style={{ padding: '10px 6px', width: '50px', minWidth: '50px', position: 'sticky', top: '42px', zIndex: 12, background: 'var(--color-surface)' }}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredRows.length === 0 ? (
                            <tr>
                                <td colSpan={3 + (ROLE_COLUMNS.length * 3) + 13} style={{ padding: '50px 20px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                                    {isLoading ? 'Loading Sheet 1 costing matrix...' : 'No client locations found. Click "+ Add Client / Location Row" or "Import Excel Sheet" to begin.'}
                                </td>
                            </tr>
                        ) : (
                            filteredRows.map((row, idx) => {
                                const calc = computeRowTotals(row);
                                const rowBg = idx % 2 === 0 ? 'var(--color-surface)' : 'rgba(0,0,0,0.015)';

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
                                            zIndex: 2,
                                            background: rowBg
                                        }}>
                                            {idx + 1}
                                        </td>

                                        {/* Client Name Sticky */}
                                        <td style={{ 
                                            padding: '8px 8px',
                                            position: 'sticky',
                                            left: '45px',
                                            zIndex: 2,
                                            background: rowBg
                                        }}>
                                            <input 
                                                type="text"
                                                list="existing-clients-list"
                                                value={row.client_name}
                                                onChange={(e) => handleUpdateRow(idx, 'client_name', e.target.value)}
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
                                            zIndex: 2,
                                            background: rowBg,
                                            boxShadow: '4px 0 8px rgba(0,0,0,0.06)'
                                        }}>
                                            <input 
                                                type="text"
                                                value={row.location_name}
                                                onChange={(e) => handleUpdateRow(idx, 'location_name', e.target.value)}
                                                placeholder="e.g. Gharo Site"
                                                style={{
                                                    width: '100%',
                                                    height: '36px',
                                                    padding: '0 12px',
                                                    fontSize: '13px',
                                                    borderRadius: '6px',
                                                    border: '1px solid var(--color-border)',
                                                    background: 'var(--color-surface)',
                                                    color: 'var(--color-text)'
                                                }}
                                            />
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
                                                            value={row[role.rateKey] || ''}
                                                            onChange={(e) => handleUpdateRow(idx, role.rateKey, parseFloat(e.target.value) || 0)}
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
                                                            value={row[role.salKey] || ''}
                                                            onChange={(e) => handleUpdateRow(idx, role.salKey, parseFloat(e.target.value) || 0)}
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
                                                            value={row[role.qtyKey] || ''}
                                                            onChange={(e) => handleUpdateRow(idx, role.qtyKey, parseInt(e.target.value) || 0)}
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

                                        {/* Col AG: Service Charges (Editable inline cell, flat monthly) */}
                                        <td style={{ padding: '6px 4px' }}>
                                            <input 
                                                type="number"
                                                step="any"
                                                value={row.service_charges_per_guard !== undefined && row.service_charges_per_guard !== null ? row.service_charges_per_guard : ''}
                                                onChange={(e) => {
                                                    const val = e.target.value === '' ? null : parseFloat(e.target.value);
                                                    handleUpdateRow(idx, 'service_charges_per_guard', val);
                                                }}
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
                                                onChange={(e) => {
                                                    const val = e.target.value === '' ? null : parseFloat(e.target.value);
                                                    handleUpdateRow(idx, 'sales_tax_override', val);
                                                }}
                                                placeholder="240"
                                                title="Sales Tax in PKR (Auto-calculates from formula, or enter 0 / custom amount)"
                                                style={{
                                                    width: '100%',
                                                    height: '34px',
                                                    padding: '0 8px',
                                                    fontSize: '12px',
                                                    textAlign: 'right',
                                                    borderRadius: '6px',
                                                    border: row.sales_tax_override !== undefined && row.sales_tax_override !== null ? '1.5px solid #f59e0b' : '1px solid var(--color-border)',
                                                    background: row.sales_tax_override !== undefined && row.sales_tax_override !== null ? 'rgba(245, 158, 11, 0.08)' : 'var(--color-surface)',
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
                                                onChange={(e) => {
                                                    const val = e.target.value === '' ? null : parseFloat(e.target.value);
                                                    handleUpdateRow(idx, 'withholding_tax_override', val);
                                                }}
                                                placeholder="210"
                                                title="Income Tax / WHT in PKR (Auto-calculates from formula, or enter 0 / custom amount)"
                                                style={{
                                                    width: '100%',
                                                    height: '34px',
                                                    padding: '0 8px',
                                                    fontSize: '12px',
                                                    textAlign: 'right',
                                                    borderRadius: '6px',
                                                    border: row.withholding_tax_override !== undefined && row.withholding_tax_override !== null ? '1.5px solid #a855f7' : '1px solid var(--color-border)',
                                                    background: row.withholding_tax_override !== undefined && row.withholding_tax_override !== null ? 'rgba(168, 85, 247, 0.08)' : 'var(--color-surface)',
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
                                                value={row.sessi || ''}
                                                onChange={(e) => handleUpdateRow(idx, 'sessi', parseFloat(e.target.value) || 0)}
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
                                                value={row.eobi || ''}
                                                onChange={(e) => handleUpdateRow(idx, 'eobi', parseFloat(e.target.value) || 0)}
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
                                                onClick={() => handleDeleteRow(idx)}
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
                                        zIndex: 3,
                                        background: 'var(--color-surface-secondary)',
                                        boxShadow: '4px 0 8px rgba(0,0,0,0.06)'
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
