import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Button } from '../../../../components/ui/Button';
import { Input } from '../../../../components/ui/Input';
import { useToastStore } from '../../../../stores/toastStore';
import { fetchCostingGrid, syncCostingGrid, deleteCostingGridRow, importCostingExcel, getClientLocations, fetchCostingSettings } from '../api';
import type { CostingGridRow, CostingSettings } from '../api';
import { getEntities } from '../../../../modules/crm/api';
import type { CRMEntity } from '../../../../modules/crm/types';
import { useAuthStore } from '../../../../auth/authStore';
import { FastCostingPrintModal } from './FastCostingPrintModal';
import { CostingRulesConfigModal } from './CostingRulesConfigModal';
import { ToggleSwitch } from './ToggleSwitch';

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

interface FastCostingGridTabProps {
    onBack?: () => void;
}

export const FastCostingGridTab: React.FC<FastCostingGridTabProps> = ({ onBack }) => {
    const { user } = useAuthStore();
    const companyName = user?.company_name || 'ZORVEX SECURITY SERVICES';
    const [rows, setRows] = useState<CostingGridRow[]>([]);
    const [dirtyRowKeys, setDirtyRowKeys] = useState<Set<string>>(new Set());
    const [existingCustomers, setExistingCustomers] = useState<CRMEntity[]>([]);
    const [existingLocations, setExistingLocations] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
    const [isRulesModalOpen, setIsRulesModalOpen] = useState(false);
    const [costingConfig, setCostingConfig] = useState<CostingSettings | null>(null);
    const [search, setSearch] = useState('');
    const [selectedClientFilter, setSelectedClientFilter] = useState<string>('ALL');
    const [selectedLocationFilter, setSelectedLocationFilter] = useState<string>('ALL');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const tableContainerRef = useRef<HTMLDivElement>(null);

    const getRowKey = (r: CostingGridRow, fallbackIdx?: number) => {
        if (r.id) return String(r.id);
        if (r.proposal_version_id) return `ver-${r.proposal_version_id}`;
        if (r.location_id) return `loc-${r.location_id}`;
        return `row-${(r.client_name || '').toLowerCase().trim()}-${(r.location_name || '').toLowerCase().trim()}${fallbackIdx !== undefined ? `-${fallbackIdx}` : ''}`;
    };

    const loadGrid = async () => {
        setIsLoading(true);
        try {
            const [gridData, customersRes, locationsRes, settingsRes] = await Promise.all([
                fetchCostingGrid(),
                getEntities({ entity_type: 'CUSTOMER' }).catch(() => ({ results: [] })),
                getClientLocations().catch(() => ({ results: [] })),
                fetchCostingSettings().catch(() => null)
            ]);
            if (settingsRes) setCostingConfig(settingsRes);
            const prepared = (gridData || []).map((r: any, idx: number) => ({
                ...r,
                id: r.id || (r.proposal_version_id ? `ver-${r.proposal_version_id}` : `loc-${r.location_id || idx}`)
            }));
            setRows(prepared);
            setDirtyRowKeys(new Set());
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

        // Statutory & Charges Formulas & Toggles
        const eobiEnabled = r.eobi_enabled !== undefined ? !!r.eobi_enabled : (costingConfig?.eobi_default_enabled ?? false);
        const sessiEnabled = r.sessi_enabled !== undefined ? !!r.sessi_enabled : (costingConfig?.sessi_default_enabled ?? false);
        const adminEnabled = r.admin_charges_enabled !== undefined ? !!r.admin_charges_enabled : (costingConfig?.admin_charges_default_enabled ?? false);
        const insuranceEnabled = r.insurance_enabled !== undefined ? !!r.insurance_enabled : (costingConfig?.insurance_default_enabled ?? false);

        const eobiRate = (r.eobi_rate !== undefined && r.eobi_rate !== null && r.eobi_rate !== '') ? Number(r.eobi_rate) : (costingConfig?.eobi_rate ?? 1500);
        const sessiMinWage = (r.sessi_minimum_wage !== undefined && r.sessi_minimum_wage !== null && r.sessi_minimum_wage !== '') ? Number(r.sessi_minimum_wage) : (costingConfig?.sessi_minimum_wage ?? 37000);
        const sessiPercentage = (r.sessi_percentage !== undefined && r.sessi_percentage !== null && r.sessi_percentage !== '') ? Number(r.sessi_percentage) : (costingConfig?.sessi_percentage ?? 6.0);
        const adminChargesRate = (r.admin_charges_percentage !== undefined && r.admin_charges_percentage !== null && r.admin_charges_percentage !== '') ? Number(r.admin_charges_percentage) : (costingConfig?.admin_charges_percentage ?? 5.0);
        const insuranceRate = (r.insurance_percentage !== undefined && r.insurance_percentage !== null && r.insurance_percentage !== '') ? Number(r.insurance_percentage) : (costingConfig?.insurance_percentage ?? 2.0);

        // EOBI Formula: Eobi manual * total strength
        const eobi = eobiEnabled ? Math.round(eobiRate * totalStrength) : 0;
        // SESSI Formula: minimum wage * percentage * total strength
        const sessi = sessiEnabled ? Math.round((sessiMinWage * (sessiPercentage / 100)) * totalStrength) : 0;
        // Admin Charges Formula: monthly sale * percentage
        const adminCharges = adminEnabled ? Math.round(monthlySale * (adminChargesRate / 100)) : 0;
        // Insurance Formula: monthly sale * percentage
        const insurance = insuranceEnabled ? Math.round(monthlySale * (insuranceRate / 100)) : 0;

        const expense = totalStrength * overheadPerGuard; // Col AB

        // Dynamic Sales Tax Engine: Formula selection or manual PKR override
        const rawStBasis = r.sales_tax_basis || (r.sales_tax_override !== undefined && r.sales_tax_override !== null && r.sales_tax_override !== '' ? 'MANUAL' : 'TOTAL_SALE');
        const stBasis = rawStBasis === 'INVOICE_AMOUNT' ? 'TOTAL_SALE' : rawStBasis;
        let salesTax = 0;
        if (stBasis === 'MANUAL') {
            salesTax = Number(r.sales_tax_override) || 0;
        } else if (stBasis === 'SERVICE_CHARGES') {
            salesTax = (totalStrength * serviceCharges) * (salesTaxRate / 100);
        } else {
            // TOTAL_SALE: standard service sales tax computed on billing base
            salesTax = monthlySale * (salesTaxRate / 100);
        }

        const invoiceAmount = monthlySale + salesTax; // Col AI: Gross Invoiced Amount

        // Dynamic Withholding Tax Engine: Formula selection or manual PKR override
        const whtBasis = r.withholding_tax_basis || (r.withholding_tax_override !== undefined && r.withholding_tax_override !== null && r.withholding_tax_override !== '' ? 'MANUAL' : 'INVOICE_AMOUNT');
        let wht = 0;
        if (whtBasis === 'MANUAL') {
            wht = Number(r.withholding_tax_override) || 0;
        } else if (whtBasis === 'SERVICE_CHARGES') {
            wht = (totalStrength * serviceCharges) * (taxWhtRate / 100);
        } else {
            // INVOICE_AMOUNT: standard income tax withholding on gross invoice amount
            wht = invoiceAmount * (taxWhtRate / 100);
        }

        const difference = monthlySale - monthlySalary - wht - sessi - eobi - insurance; // Col AJ
        const diffPerHead = totalStrength > 0 ? (difference / totalStrength) : 0; // Col AK
        const profitLoss = monthlySale - monthlySalary - expense - wht - sessi - eobi - insurance; // Col AD

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
            adminCharges,
            insurance,
            eobiEnabled,
            sessiEnabled,
            adminEnabled,
            insuranceEnabled,
            eobiRate,
            sessiMinWage,
            sessiPercentage,
            sessiRate: Math.round(sessiMinWage * (sessiPercentage / 100)),
            sessiPct: sessiPercentage,
            adminChargesRate,
            adminChargesPct: adminChargesRate,
            insuranceRate,
            insurancePct: insuranceRate,
            difference,
            diffPerHead,
            profitLoss
        };
    };


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
        const newId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        const newRow: CostingGridRow = {
            id: newId,
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
        setDirtyRowKeys(prev => {
            const next = new Set(prev);
            next.add(newId);
            return next;
        });
        setRows([newRow, ...rows]);
    };

    const handleUpdateRow = (targetRow: CostingGridRow, field: keyof CostingGridRow, value: any) => {
        const rowKey = getRowKey(targetRow);
        setDirtyRowKeys(prev => {
            const next = new Set(prev);
            next.add(rowKey);
            return next;
        });
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

    const handleDeleteRow = async (targetRow: CostingGridRow) => {
        const locName = targetRow.location_name || targetRow.client_name || 'this location';
        if (!window.confirm(`Are you sure you want to delete "${locName}" and remove all its requirements from CRM and Operations?`)) {
            return;
        }

        const rowKey = getRowKey(targetRow);
        setDirtyRowKeys(prev => {
            const next = new Set(prev);
            next.delete(rowKey);
            return next;
        });

        // If it's an unsaved row without backend references
        if (!targetRow.location_id && !targetRow.proposal_version_id && !targetRow.client_id) {
            setRows(prevRows => prevRows.filter(r => r !== targetRow && (!r.id || r.id !== targetRow.id)));
            return;
        }

        try {
            await deleteCostingGridRow({
                client_id: targetRow.client_id,
                client_name: targetRow.client_name,
                location_id: targetRow.location_id,
                location_name: targetRow.location_name,
                proposal_version_id: targetRow.proposal_version_id
            });
            useToastStore.getState().success(`"${locName}" and its requirements deleted successfully!`);
            setRows(prevRows => prevRows.filter(r => r !== targetRow && (!r.id || r.id !== targetRow.id)));
            await loadGrid();
        } catch (err: any) {
            useToastStore.getState().error(err?.response?.data?.error || err?.message || 'Failed to delete row.');
        }
    };

    const handleSaveSync = async () => {
        if (rows.length === 0) {
            useToastStore.getState().error('No rows to sync.');
            return;
        }

        let targetRows = rows.filter(r => dirtyRowKeys.has(getRowKey(r)));
        if (targetRows.length === 0) {
            if (!window.confirm('All costing rows are currently in sync. Do you want to re-sync all locations into Operations & CRM now?')) {
                return;
            }
            targetRows = rows.filter(r => r.client_name?.trim());
        }

        const invalidRows = targetRows.filter(r => !r.client_name?.trim());
        if (invalidRows.length > 0) {
            useToastStore.getState().error('Please ensure all modified rows have a Client Name.');
            return;
        }

        setIsSaving(true);
        try {
            const preparedRows = targetRows.map(r => {
                const rowCalc = computeRowTotals(r);
                return {
                    ...r,
                    overhead_per_guard: (r.overhead_per_guard !== '' && r.overhead_per_guard !== null && r.overhead_per_guard !== undefined) ? Number(r.overhead_per_guard) : 6000,
                    service_charges_per_guard: (r.service_charges_per_guard !== '' && r.service_charges_per_guard !== null && r.service_charges_per_guard !== undefined) ? Number(r.service_charges_per_guard) : 3000,
                    sales_tax_override: (r.sales_tax_override !== '' && r.sales_tax_override !== null && r.sales_tax_override !== undefined) ? Number(r.sales_tax_override) : null,
                    withholding_tax_override: (r.withholding_tax_override !== '' && r.withholding_tax_override !== null && r.withholding_tax_override !== undefined) ? Number(r.withholding_tax_override) : null,
                    eobi_enabled: !!r.eobi_enabled,
                    eobi_rate: (r.eobi_rate !== '' && r.eobi_rate !== null && r.eobi_rate !== undefined) ? Number(r.eobi_rate) : (costingConfig?.eobi_rate ?? 1500),
                    sessi_enabled: !!r.sessi_enabled,
                    sessi_minimum_wage: (r.sessi_minimum_wage !== '' && r.sessi_minimum_wage !== null && r.sessi_minimum_wage !== undefined) ? Number(r.sessi_minimum_wage) : (costingConfig?.sessi_minimum_wage ?? 37000),
                    sessi_percentage: (r.sessi_percentage !== '' && r.sessi_percentage !== null && r.sessi_percentage !== undefined) ? Number(r.sessi_percentage) : (costingConfig?.sessi_percentage ?? 6),
                    admin_charges_enabled: !!r.admin_charges_enabled,
                    admin_charges_percentage: (r.admin_charges_percentage !== '' && r.admin_charges_percentage !== null && r.admin_charges_percentage !== undefined) ? Number(r.admin_charges_percentage) : (costingConfig?.admin_charges_percentage ?? 5),
                    insurance_enabled: !!r.insurance_enabled,
                    insurance_percentage: (r.insurance_percentage !== '' && r.insurance_percentage !== null && r.insurance_percentage !== undefined) ? Number(r.insurance_percentage) : (costingConfig?.insurance_percentage ?? 2),
                    sessi: rowCalc.sessi,
                    eobi: rowCalc.eobi,
                    ot_rate: (r.ot_rate !== '' && r.ot_rate !== null && r.ot_rate !== undefined && Number(r.ot_rate) > 0) 
                        ? Number(r.ot_rate) 
                        : (rowCalc.totalStrength > 0 
                            ? Math.round((rowCalc.monthlySalary / rowCalc.totalStrength) / 30) 
                            : Math.round(Number(r.guard_civ_sal || 35000) / 30)),
                };
            });
            const res = await syncCostingGrid(preparedRows as any);
            useToastStore.getState().success(res.message || `Successfully synced ${targetRows.length} location(s) into Operations & CRM!`);
            setDirtyRowKeys(new Set());
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

    // Aggregate summary across filtered rows (reflecting active company/search selection)
    const summary = useMemo(() => {
        let totalGuards = 0;
        let totalSale = 0;
        let totalSalary = 0;
        let totalExpense = 0;
        let totalServiceCharges = 0;
        let totalSalesTax = 0;
        let totalInvoiceAmount = 0;
        let totalWht = 0;
        let totalSessi = 0;
        let totalEobi = 0;
        let totalAdminCharges = 0;
        let totalInsurance = 0;
        let totalDifference = 0;
        let totalProfit = 0;
        const clientsSet = new Set<string>();

        filteredRows.forEach(r => {
            const calc = computeRowTotals(r);
            totalGuards += calc.totalStrength;
            totalSale += calc.monthlySale;
            totalSalary += calc.monthlySalary;
            totalExpense += calc.expense;
            totalServiceCharges += calc.serviceCharges;
            totalSalesTax += calc.salesTax;
            totalInvoiceAmount += calc.invoiceAmount;
            totalWht += calc.wht;
            totalSessi += calc.sessi;
            totalEobi += calc.eobi;
            totalAdminCharges += calc.adminCharges;
            totalInsurance += calc.insurance;
            totalDifference += calc.difference;
            totalProfit += calc.profitLoss;

            const name = r.client_name?.trim();
            if (name) {
                clientsSet.add(name.toLowerCase());
            }
        });

        return {
            totalLocations: filteredRows.length,
            totalClients: clientsSet.size,
            totalGuards,
            totalSale,
            totalSalary,
            totalExpense,
            totalServiceCharges,
            totalSalesTax,
            totalInvoice: totalInvoiceAmount,
            totalWht,
            totalSessi,
            totalEobi,
            totalAdminCharges,
            totalInsurance,
            totalDifference,
            totalProfit
        };
    }, [filteredRows]);

    const handleExportCSV = (customRows?: CostingGridRow[], customClientName?: string) => {
        const rowsToExport = customRows || filteredRows;
        if (rowsToExport.length === 0) {
            useToastStore.getState().error('No costing data available to export.');
            return;
        }

        const effectiveClient = customClientName || selectedClientFilter;

        const headers = [
            '#',
            'Client / Company Name',
            'Location / Site',
            ...ROLE_COLUMNS.flatMap(r => [
                `${r.label} Rate (PKR)`,
                `${r.label} Salary (PKR)`,
                `${r.label} Qty`
            ]),
            'Monthly Sale (PKR)',
            'Direct Salary (PKR)',
            'Total Strength (Guards)',
            'Overhead Exp (PKR)',
            'OT Rate / Hr (PKR)',
            'Service Charges (PKR)',
            'SESSI (PKR)',
            'EOBI (PKR)',
            'WHT Formula',
            'WHT Rate (%)',
            'WHT Amount (PKR)',
            'Sales Tax Formula',
            'Sales Tax Rate (%)',
            'Sales Tax Amount (PKR)',
            'Total Invoice Amount (PKR)',
            'Gross Margin (PKR)',
            'Net Profit (PKR)'
        ];

        const escapeCsv = (val: any) => {
            if (val === null || val === undefined) return '""';
            const str = String(val);
            return `"${str.replace(/"/g, '""')}"`;
        };

        const csvLines: string[] = [];
        csvLines.push(headers.map(escapeCsv).join(','));

        let expTotalGuards = 0;
        let expTotalSale = 0;
        let expTotalSalary = 0;
        let expTotalExpense = 0;
        let expTotalServiceCharges = 0;
        let expTotalSalesTax = 0;
        let expTotalInvoiceAmount = 0;
        let expTotalWht = 0;
        let expTotalSessi = 0;
        let expTotalEobi = 0;
        let expTotalDifference = 0;
        let expTotalProfit = 0;

        rowsToExport.forEach((row, idx) => {
            const calc = computeRowTotals(row);
            expTotalGuards += calc.totalStrength;
            expTotalSale += calc.monthlySale;
            expTotalSalary += calc.monthlySalary;
            expTotalExpense += calc.expense;
            expTotalServiceCharges += (calc.totalStrength * calc.serviceCharges);
            expTotalSalesTax += calc.salesTax;
            expTotalInvoiceAmount += calc.invoiceAmount;
            expTotalWht += calc.wht;
            expTotalSessi += calc.sessi;
            expTotalEobi += calc.eobi;
            expTotalDifference += calc.difference;
            expTotalProfit += calc.profitLoss;

            const whtBasis = row.withholding_tax_basis || (row.withholding_tax_override !== undefined && row.withholding_tax_override !== null && row.withholding_tax_override !== '' ? 'MANUAL' : 'INVOICE_AMOUNT');
            const rawStBasis = row.sales_tax_basis || (row.sales_tax_override !== undefined && row.sales_tax_override !== null && row.sales_tax_override !== '' ? 'MANUAL' : 'TOTAL_SALE');
            const stBasis = rawStBasis === 'INVOICE_AMOUNT' ? 'TOTAL_SALE' : rawStBasis;

            const rowData: any[] = [
                idx + 1,
                row.client_name || '',
                row.location_name || '',
                ...ROLE_COLUMNS.flatMap(r => [
                    Number(row[r.rateKey]) || 0,
                    Number(row[r.salKey]) || 0,
                    Number(row[r.qtyKey]) || 0
                ]),
                Math.round(calc.monthlySale),
                Math.round(calc.monthlySalary),
                calc.totalStrength,
                Math.round(calc.expense),
                row.ot_rate ? Number(row.ot_rate) : (calc.totalStrength > 0 ? Math.round((calc.monthlySalary / calc.totalStrength) / 30) : 0),
                Math.round(calc.totalStrength * calc.serviceCharges),
                Math.round(calc.sessi),
                Math.round(calc.eobi),
                whtBasis,
                row.tax_wht_rate !== undefined && row.tax_wht_rate !== null && row.tax_wht_rate !== '' ? Number(row.tax_wht_rate) : 7,
                Math.round(calc.wht),
                stBasis,
                row.sales_tax_rate !== undefined && row.sales_tax_rate !== null && row.sales_tax_rate !== '' ? Number(row.sales_tax_rate) : 8,
                Math.round(calc.salesTax),
                Math.round(calc.invoiceAmount),
                Math.round(calc.difference),
                Math.round(calc.profitLoss)
            ];
            csvLines.push(rowData.map(escapeCsv).join(','));
        });

        // Summary row for CSV
        const roleTotals: any[] = [];
        ROLE_COLUMNS.forEach(r => {
            let totalQty = 0;
            rowsToExport.forEach(row => {
                totalQty += Number(row[r.qtyKey]) || 0;
            });
            roleTotals.push('', '', totalQty);
        });

        const summaryRow: any[] = [
            'TOTALS',
            `${effectiveClient !== 'ALL' ? effectiveClient : 'All Clients'}`,
            `${rowsToExport.length} Location(s)`,
            ...roleTotals,
            Math.round(expTotalSale),
            Math.round(expTotalSalary),
            expTotalGuards,
            Math.round(expTotalExpense),
            '',
            Math.round(expTotalServiceCharges),
            Math.round(expTotalSessi),
            Math.round(expTotalEobi),
            '',
            '',
            Math.round(expTotalWht),
            '',
            '',
            Math.round(expTotalSalesTax),
            Math.round(expTotalInvoiceAmount),
            Math.round(expTotalDifference),
            Math.round(expTotalProfit)
        ];
        csvLines.push(summaryRow.map(escapeCsv).join(','));

        const csvContent = '\uFEFF' + csvLines.join('\r\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        const clientSlug = effectiveClient && effectiveClient !== 'ALL'
            ? effectiveClient.replace(/[^a-zA-Z0-9_-]/g, '_')
            : 'All_Clients';
        const dateStr = new Date().toISOString().split('T')[0];
        link.setAttribute('download', `Fast_Costing_Grid_${clientSlug}_${dateStr}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        useToastStore.getState().success(`Exported ${rowsToExport.length} costing location(s) to CSV!`);
    };

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
                    border: '1.5px solid rgba(139, 92, 246, 0.4)',
                    borderRadius: '8px',
                    padding: '6px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    boxShadow: '0 2px 8px rgba(139, 92, 246, 0.08)'
                }}>
                    <div style={{ fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#8b5cf6', fontWeight: 700 }}>
                        Total Invoice Amount
                    </div>
                    <div style={{ fontSize: '16px', fontWeight: 800, color: '#8b5cf6' }}>
                        PKR {Math.round(summary.totalInvoice).toLocaleString()}
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
                    {onBack && (
                        <Button 
                            variant="ghost" 
                            onClick={onBack}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: '6px', padding: '6px 12px' }}
                            title="Return to Clients & Contracts (CRM)"
                        >
                            <i className='bx bx-arrow-back' style={{ fontSize: '18px' }}></i> Back to CRM
                        </Button>
                    )}

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
                        variant="secondary" 
                        disabled={filteredRows.length === 0}
                        onClick={() => handleExportCSV()}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                        title="Export current costing grid with all roles and financial totals to CSV / Excel"
                    >
                        <i className='bx bx-download' style={{ fontSize: '18px' }}></i> Export CSV
                    </Button>

                    <Button 
                        variant="secondary" 
                        disabled={filteredRows.length === 0}
                        onClick={() => setIsPrintModalOpen(true)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                        title="Print or Save PDF of the full costing grid for this company or all clients"
                    >
                        <i className='bx bx-printer' style={{ fontSize: '18px' }}></i> Print / PDF
                    </Button>

                    <Button 
                        variant="secondary" 
                        onClick={() => setIsRulesModalOpen(true)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', borderColor: '#3b82f6', color: '#2563eb' }}
                        title="Configure Master Costing Rules & Formulas (EOBI, SESSI, Admin Charges, Insurance)"
                    >
                        <i className='bx bx-slider-alt' style={{ fontSize: '18px' }}></i> Costing Rules & Formulas
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
                            background: dirtyRowKeys.size > 0 ? '#10b981' : 'var(--color-surface-secondary)',
                            borderColor: dirtyRowKeys.size > 0 ? '#10b981' : 'var(--color-border)',
                            color: dirtyRowKeys.size > 0 ? '#ffffff' : 'var(--color-text)',
                            opacity: isSaving ? 0.7 : 1,
                            cursor: isSaving ? 'not-allowed' : 'pointer',
                            fontWeight: 700,
                            transition: 'all 0.2s ease',
                            boxShadow: dirtyRowKeys.size > 0 ? '0 2px 8px rgba(16, 185, 129, 0.3)' : 'none'
                        }}
                        title={dirtyRowKeys.size > 0 ? `${dirtyRowKeys.size} unsaved location change(s) - click to save and sync to Operations & CRM` : 'All costing sheets in sync. Click to re-sync all to Operations & CRM.'}
                    >
                        <i className={`bx bx-cloud-upload ${dirtyRowKeys.size > 0 ? 'bx-tada' : ''}`} style={{ fontSize: '20px' }}></i>
                        {isSaving ? 'Syncing to Operations & CRM...' : (dirtyRowKeys.size > 0 ? `Save & Sync to Operations & CRM (${dirtyRowKeys.size} changed)` : 'Save & Sync to Operations & CRM (In Sync)')}
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
                            <th colSpan={17} style={{ 
                                padding: '10px 16px', 
                                textAlign: 'center', 
                                backgroundColor: 'var(--color-surface)',
                                backgroundImage: 'linear-gradient(rgba(245, 158, 11, 0.16), rgba(245, 158, 11, 0.16))',
                                color: 'var(--color-text)',
                                borderBottom: '1px solid var(--color-border)', 
                                fontWeight: 700, 
                                minWidth: '1760px', 
                                position: 'sticky', 
                                top: 0, 
                                zIndex: 35, 
                                boxSizing: 'border-box', 
                                height: '42px' 
                            }}>
                                Live Costing, Taxes & Invoicing
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
                            <th style={{ padding: '9px 8px', width: '95px', minWidth: '95px', textAlign: 'right', color: '#10b981', fontWeight: 700, position: 'sticky', top: '42px', zIndex: 35, background: 'var(--color-surface-secondary)', borderBottom: '2px solid var(--color-border)', boxSizing: 'border-box', height: '40px' }}>Overtime Dozing OD</th>
                            <th style={{ padding: '9px 8px', width: '110px', minWidth: '110px', textAlign: 'right', color: '#60a5fa', fontWeight: 700, position: 'sticky', top: '42px', zIndex: 35, background: 'var(--color-surface-secondary)', borderBottom: '2px solid var(--color-border)', boxSizing: 'border-box', height: '40px' }}>Service Charges</th>
                            {/* Statutory Taxes moved next to Service Charges */}
                            <th style={{ padding: '9px 6px', width: '115px', minWidth: '115px', textAlign: 'center', color: 'var(--color-text)', position: 'sticky', top: '42px', zIndex: 35, background: 'var(--color-surface-secondary)', borderBottom: '2px solid var(--color-border)', boxSizing: 'border-box', height: '40px' }}>SESSI/PESSI</th>
                            <th style={{ padding: '9px 6px', width: '115px', minWidth: '115px', textAlign: 'center', color: 'var(--color-text)', position: 'sticky', top: '42px', zIndex: 35, background: 'var(--color-surface-secondary)', borderBottom: '2px solid var(--color-border)', boxSizing: 'border-box', height: '40px' }}>EOBI</th>
                            <th style={{ padding: '9px 6px', width: '105px', minWidth: '105px', textAlign: 'center', color: '#3b82f6', position: 'sticky', top: '42px', zIndex: 35, background: 'var(--color-surface-secondary)', borderBottom: '2px solid var(--color-border)', boxSizing: 'border-box', height: '40px' }}>Admin Chg</th>
                            <th style={{ padding: '9px 6px', width: '105px', minWidth: '105px', textAlign: 'center', color: '#10b981', position: 'sticky', top: '42px', zIndex: 35, background: 'var(--color-surface-secondary)', borderBottom: '2px solid var(--color-border)', boxSizing: 'border-box', height: '40px' }}>Insurance</th>
                            {/* WHT 3-Element Control Set */}
                            <th style={{ padding: '9px 6px', width: '150px', minWidth: '150px', textAlign: 'center', color: '#a855f7', fontWeight: 700, position: 'sticky', top: '42px', zIndex: 35, background: 'var(--color-surface-secondary)', borderBottom: '2px solid var(--color-border)', boxSizing: 'border-box', height: '40px' }}>WHT Formula</th>
                            <th style={{ padding: '9px 6px', width: '65px', minWidth: '65px', textAlign: 'center', color: '#a855f7', fontWeight: 700, position: 'sticky', top: '42px', zIndex: 35, background: 'var(--color-surface-secondary)', borderBottom: '2px solid var(--color-border)', boxSizing: 'border-box', height: '40px' }}>WHT %</th>
                            <th style={{ padding: '9px 8px', width: '105px', minWidth: '105px', textAlign: 'right', color: '#a855f7', fontWeight: 700, position: 'sticky', top: '42px', zIndex: 35, background: 'var(--color-surface-secondary)', borderBottom: '2px solid var(--color-border)', boxSizing: 'border-box', height: '40px' }}>WHT Tax</th>
                            {/* ST 3-Element Control Set */}
                            <th style={{ padding: '9px 6px', width: '140px', minWidth: '140px', textAlign: 'center', color: '#f59e0b', fontWeight: 700, position: 'sticky', top: '42px', zIndex: 35, background: 'var(--color-surface-secondary)', borderBottom: '2px solid var(--color-border)', boxSizing: 'border-box', height: '40px' }}>ST Formula</th>
                            <th style={{ padding: '9px 6px', width: '65px', minWidth: '65px', textAlign: 'center', color: '#f59e0b', fontWeight: 700, position: 'sticky', top: '42px', zIndex: 35, background: 'var(--color-surface-secondary)', borderBottom: '2px solid var(--color-border)', boxSizing: 'border-box', height: '40px' }}>ST %</th>
                            <th style={{ padding: '9px 8px', width: '105px', minWidth: '105px', textAlign: 'right', color: '#f59e0b', fontWeight: 700, position: 'sticky', top: '42px', zIndex: 35, background: 'var(--color-surface-secondary)', borderBottom: '2px solid var(--color-border)', boxSizing: 'border-box', height: '40px' }}>Sales Tax</th>
                            {/* Total Invoice Amount (Prominent Column) */}
                            <th style={{ padding: '9px 10px', width: '140px', minWidth: '140px', textAlign: 'right', color: '#8b5cf6', fontWeight: 800, position: 'sticky', top: '42px', zIndex: 35, background: 'rgba(139, 92, 246, 0.1)', borderBottom: '2px solid var(--color-border)', boxSizing: 'border-box', height: '40px' }}>Total Invoice Amount</th>
                            <th style={{ padding: '9px 6px', width: '50px', minWidth: '50px', position: 'sticky', top: '42px', zIndex: 35, background: 'var(--color-surface-secondary)', borderBottom: '2px solid var(--color-border)', boxSizing: 'border-box', height: '40px' }}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredRows.length === 0 ? (
                            <tr>
                                <td colSpan={3 + (ROLE_COLUMNS.length * 3) + 16} style={{ padding: '50px 20px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                                    {isLoading ? 'Loading costing matrix...' : 'No client locations found. Click "+ Add Client / Location Row" or "Import Excel Sheet" to begin.'}
                                </td>
                            </tr>
                        ) : (
                            filteredRows.map((row, idx) => {
                                const calc = computeRowTotals(row);
                                const isDirty = dirtyRowKeys.has(getRowKey(row));
                                const baseBg = idx % 2 === 0 ? 'var(--color-surface)' : 'var(--color-surface-secondary)';
                                const rowBg = isDirty ? 'rgba(245, 158, 11, 0.08)' : baseBg;

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
                                            color: isDirty ? '#d97706' : 'var(--color-text-muted)', 
                                            fontWeight: isDirty ? 700 : 600, 
                                            textAlign: 'center',
                                            position: 'sticky',
                                            left: 0,
                                            zIndex: 20,
                                            background: rowBg,
                                            boxSizing: 'border-box',
                                            borderLeft: isDirty ? '3px solid #f59e0b' : '3px solid transparent'
                                        }}
                                        title={isDirty ? 'Unsaved changes on this location row' : undefined}
                                        >
                                            {isDirty ? '● ' : ''}{idx + 1}
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

                                        {/* Col OT: Overtime Rate (Default: 1-Day Salary, Editable) */}
                                        <td style={{ padding: '6px 4px' }}>
                                            {(() => {
                                                const avgSal = calc.totalStrength > 0 ? (calc.monthlySalary / calc.totalStrength) : (row.guard_civ_sal || 35000);
                                                const defaultOt = Math.round(avgSal / 30);
                                                return (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                                        <input 
                                                            type="number"
                                                            step="any"
                                                            value={row.ot_rate !== undefined && row.ot_rate !== null ? row.ot_rate : ''}
                                                            onChange={(e) => handleUpdateRow(row, 'ot_rate', e.target.value)}
                                                            placeholder={String(defaultOt)}
                                                            title={`Overtime Rate in PKR (Editable). Default: PKR ${defaultOt}. Click ⚡ to reset.`}
                                                            style={{
                                                                width: '100%',
                                                                minWidth: '55px',
                                                                height: '34px',
                                                                padding: '0 6px',
                                                                fontSize: '12px',
                                                                textAlign: 'right',
                                                                borderRadius: '6px',
                                                                border: '1px solid var(--color-border)',
                                                                background: 'var(--color-surface)',
                                                                color: '#10b981',
                                                                fontWeight: 700
                                                            }}
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => handleUpdateRow(row, 'ot_rate', defaultOt)}
                                                            title={`Reset to default 1-day overtime rate (PKR ${defaultOt})`}
                                                            style={{
                                                                padding: '4px 6px',
                                                                fontSize: '11px',
                                                                borderRadius: '4px',
                                                                border: '1px solid rgba(16, 185, 129, 0.4)',
                                                                background: 'rgba(16, 185, 129, 0.1)',
                                                                color: '#059669',
                                                                cursor: 'pointer',
                                                                fontWeight: 700,
                                                                flexShrink: 0
                                                            }}
                                                        >
                                                            ⚡
                                                        </button>
                                                    </div>
                                                );
                                            })()}
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

                                        {/* Col AE: SESSI (Switchable Formula Toggle) */}
                                        <td style={{ padding: '6px 4px', width: '115px', minWidth: '115px', textAlign: 'center' }}>
                                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}>
                                                <ToggleSwitch
                                                    checked={!!row.sessi_enabled}
                                                    onChange={(val) => handleUpdateRow(row, 'sessi_enabled', val)}
                                                    title={row.sessi_enabled ? 'SESSI Enabled - Click to Disable' : 'SESSI Disabled - Click to Enable'}
                                                />
                                                {row.sessi_enabled && (
                                                    <span style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--color-text)', fontFamily: 'monospace' }} title={`SESSI: ₨ ${calc.sessiRate}/guard × ${calc.totalStrength} guards (Min Wage: ₨ ${calc.sessiMinWage} × ${calc.sessiPct}%)`}>
                                                        ₨ {Math.round(calc.sessi).toLocaleString()}
                                                    </span>
                                                )}
                                            </div>
                                        </td>

                                        {/* Col AF: EOBI (Switchable Formula Toggle) */}
                                        <td style={{ padding: '6px 4px', width: '115px', minWidth: '115px', textAlign: 'center' }}>
                                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}>
                                                <ToggleSwitch
                                                    checked={!!row.eobi_enabled}
                                                    onChange={(val) => handleUpdateRow(row, 'eobi_enabled', val)}
                                                    title={row.eobi_enabled ? 'EOBI Enabled - Click to Disable' : 'EOBI Disabled - Click to Enable'}
                                                />
                                                {row.eobi_enabled && (
                                                    <span style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--color-text)', fontFamily: 'monospace' }} title={`EOBI: ₨ ${calc.eobiRate}/guard × ${calc.totalStrength} guards`}>
                                                        ₨ {Math.round(calc.eobi).toLocaleString()}
                                                    </span>
                                                )}
                                            </div>
                                        </td>

                                        {/* Col Admin Charges (Switchable % Toggle) */}
                                        <td style={{ padding: '6px 4px', width: '105px', minWidth: '105px', textAlign: 'center' }}>
                                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}>
                                                <ToggleSwitch
                                                    checked={!!row.admin_charges_enabled}
                                                    onChange={(val) => handleUpdateRow(row, 'admin_charges_enabled', val)}
                                                    title={row.admin_charges_enabled ? 'Admin Charges Enabled - Click to Disable' : 'Admin Charges Disabled - Click to Enable'}
                                                />
                                                {row.admin_charges_enabled && (
                                                    <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#3b82f6', fontFamily: 'monospace' }} title={`Admin Charges: ${calc.adminChargesPct}% of Monthly Sale = ₨ ${Math.round(calc.adminCharges).toLocaleString()}`}>
                                                        {calc.adminChargesPct}%
                                                    </span>
                                                )}
                                            </div>
                                        </td>

                                        {/* Col Insurance (Switchable % Toggle) */}
                                        <td style={{ padding: '6px 4px', width: '105px', minWidth: '105px', textAlign: 'center' }}>
                                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}>
                                                <ToggleSwitch
                                                    checked={!!row.insurance_enabled}
                                                    onChange={(val) => handleUpdateRow(row, 'insurance_enabled', val)}
                                                    title={row.insurance_enabled ? 'Insurance Enabled - Click to Disable' : 'Insurance Disabled - Click to Enable'}
                                                />
                                                {row.insurance_enabled && (
                                                    <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#10b981', fontFamily: 'monospace' }} title={`Insurance: ${calc.insurancePct}% of Monthly Sale = ₨ ${Math.round(calc.insurance).toLocaleString()}`}>
                                                        {calc.insurancePct}%
                                                    </span>
                                                )}
                                            </div>
                                        </td>

                                        {/* Col WHT Formula: Dropdown (Invoice Amount %, Service Charges %, Manual) */}
                                        <td style={{ padding: '6px 4px', width: '150px', minWidth: '150px' }}>
                                            <select
                                                value={row.withholding_tax_basis || (row.withholding_tax_override !== undefined && row.withholding_tax_override !== null && row.withholding_tax_override !== '' ? 'MANUAL' : 'INVOICE_AMOUNT')}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    if (val === 'MANUAL') {
                                                        handleUpdateRow(row, 'withholding_tax_basis', 'MANUAL');
                                                        if (row.withholding_tax_override === undefined || row.withholding_tax_override === null || row.withholding_tax_override === '') {
                                                            handleUpdateRow(row, 'withholding_tax_override', Math.round(calc.wht));
                                                        }
                                                    } else {
                                                        handleUpdateRow(row, 'withholding_tax_basis', val);
                                                        handleUpdateRow(row, 'withholding_tax_override', null);
                                                    }
                                                }}
                                                style={{
                                                    width: '100%',
                                                    height: '34px',
                                                    padding: '0 6px',
                                                    fontSize: '11px',
                                                    fontWeight: 600,
                                                    borderRadius: '6px',
                                                    border: '1px solid var(--color-border)',
                                                    background: 'var(--color-surface)',
                                                    color: 'var(--color-text)'
                                                }}
                                            >
                                                <option value="INVOICE_AMOUNT">Invoice Amount × %</option>
                                                <option value="SERVICE_CHARGES">Total Count × SC × %</option>
                                                <option value="MANUAL">Manual</option>
                                            </select>
                                        </td>

                                        {/* Col WHT % */}
                                        <td style={{ padding: '6px 4px', width: '65px', minWidth: '65px' }}>
                                            <input 
                                                type="number"
                                                step="any"
                                                min="0"
                                                max="100"
                                                disabled={row.withholding_tax_basis === 'MANUAL' || (row.withholding_tax_override !== undefined && row.withholding_tax_override !== null && row.withholding_tax_override !== '' && row.withholding_tax_basis !== 'INVOICE_AMOUNT' && row.withholding_tax_basis !== 'SERVICE_CHARGES')}
                                                value={row.tax_wht_rate !== undefined && row.tax_wht_rate !== null ? row.tax_wht_rate : 7}
                                                onChange={(e) => handleUpdateRow(row, 'tax_wht_rate', e.target.value)}
                                                placeholder="7"
                                                title="Withholding Tax %"
                                                style={{
                                                    width: '100%',
                                                    height: '34px',
                                                    padding: '0 6px',
                                                    fontSize: '12px',
                                                    textAlign: 'center',
                                                    borderRadius: '6px',
                                                    border: '1px solid var(--color-border)',
                                                    background: (row.withholding_tax_basis === 'MANUAL' || (row.withholding_tax_override !== undefined && row.withholding_tax_override !== null && row.withholding_tax_override !== '' && row.withholding_tax_basis !== 'INVOICE_AMOUNT' && row.withholding_tax_basis !== 'SERVICE_CHARGES')) ? 'var(--color-surface-secondary)' : 'var(--color-surface)',
                                                    color: 'var(--color-text)',
                                                    fontWeight: 700,
                                                    opacity: (row.withholding_tax_basis === 'MANUAL' || (row.withholding_tax_override !== undefined && row.withholding_tax_override !== null && row.withholding_tax_override !== '' && row.withholding_tax_basis !== 'INVOICE_AMOUNT' && row.withholding_tax_basis !== 'SERVICE_CHARGES')) ? 0.5 : 1
                                                }}
                                            />
                                        </td>

                                        {/* Col WHT (PKR) */}
                                        <td style={{ padding: '6px 4px', width: '105px', minWidth: '105px' }}>
                                            {(() => {
                                                const isManual = row.withholding_tax_basis === 'MANUAL' || (row.withholding_tax_override !== undefined && row.withholding_tax_override !== null && row.withholding_tax_override !== '' && row.withholding_tax_basis !== 'INVOICE_AMOUNT' && row.withholding_tax_basis !== 'SERVICE_CHARGES');
                                                return isManual ? (
                                                    <input 
                                                        type="number"
                                                        step="any"
                                                        value={row.withholding_tax_override !== undefined && row.withholding_tax_override !== null ? row.withholding_tax_override : Math.round(calc.wht)}
                                                        onChange={(e) => handleUpdateRow(row, 'withholding_tax_override', e.target.value)}
                                                        placeholder="0"
                                                        title="Manual Withholding Tax in PKR"
                                                        style={{
                                                            width: '100%',
                                                            height: '34px',
                                                            padding: '0 8px',
                                                            fontSize: '12px',
                                                            textAlign: 'right',
                                                            borderRadius: '6px',
                                                            border: '1.5px solid #a855f7',
                                                            background: 'rgba(168, 85, 247, 0.08)',
                                                            color: 'var(--color-text)',
                                                            fontWeight: 700
                                                        }}
                                                    />
                                                ) : (
                                                    <div style={{
                                                        height: '34px',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'flex-end',
                                                        padding: '0 8px',
                                                        fontSize: '12.5px',
                                                        fontWeight: 700,
                                                        color: 'var(--color-text-muted)',
                                                        background: 'rgba(168, 85, 247, 0.04)',
                                                        borderRadius: '6px'
                                                    }}>
                                                        {Math.round(calc.wht).toLocaleString()}
                                                    </div>
                                                );
                                            })()}
                                        </td>

                                        {/* Col ST Formula: Dropdown (Total Sale %, On Service Charges %, Manual) */}
                                        <td style={{ padding: '6px 4px', width: '140px', minWidth: '140px' }}>
                                            {(() => {
                                                const currentStBasis = (row.sales_tax_basis && row.sales_tax_basis !== 'INVOICE_AMOUNT') ? row.sales_tax_basis : ((row.sales_tax_override !== undefined && row.sales_tax_override !== null && row.sales_tax_override !== '') ? 'MANUAL' : 'TOTAL_SALE');
                                                return (
                                                    <select
                                                        value={currentStBasis}
                                                        onChange={(e) => {
                                                            const val = e.target.value;
                                                            if (val === 'MANUAL') {
                                                                handleUpdateRow(row, 'sales_tax_basis', 'MANUAL');
                                                                if (row.sales_tax_override === undefined || row.sales_tax_override === null || row.sales_tax_override === '') {
                                                                    handleUpdateRow(row, 'sales_tax_override', Math.round(calc.salesTax));
                                                                }
                                                            } else {
                                                                handleUpdateRow(row, 'sales_tax_basis', val);
                                                                handleUpdateRow(row, 'sales_tax_override', null);
                                                            }
                                                        }}
                                                        style={{
                                                            width: '100%',
                                                            height: '34px',
                                                            padding: '0 6px',
                                                            fontSize: '11.5px',
                                                            fontWeight: 600,
                                                            borderRadius: '6px',
                                                            border: '1px solid var(--color-border)',
                                                            background: 'var(--color-surface)',
                                                            color: 'var(--color-text)'
                                                        }}
                                                    >
                                                        <option value="TOTAL_SALE">Total Sale × %</option>
                                                        <option value="SERVICE_CHARGES">Total Count × Service Charges × %</option>
                                                        <option value="MANUAL">Manual</option>
                                                    </select>
                                                );
                                            })()}
                                        </td>

                                        {/* Col ST % */}
                                        <td style={{ padding: '6px 4px', width: '65px', minWidth: '65px' }}>
                                            {(() => {
                                                const currentStBasis = (row.sales_tax_basis && row.sales_tax_basis !== 'INVOICE_AMOUNT') ? row.sales_tax_basis : ((row.sales_tax_override !== undefined && row.sales_tax_override !== null && row.sales_tax_override !== '') ? 'MANUAL' : 'TOTAL_SALE');
                                                const isStManual = currentStBasis === 'MANUAL';
                                                return (
                                                    <input 
                                                        type="number"
                                                        step="any"
                                                        min="0"
                                                        max="100"
                                                        disabled={isStManual}
                                                        value={row.sales_tax_rate !== undefined && row.sales_tax_rate !== null ? row.sales_tax_rate : 8}
                                                        onChange={(e) => handleUpdateRow(row, 'sales_tax_rate', e.target.value)}
                                                        placeholder="8"
                                                        title="Sales Tax %"
                                                        style={{
                                                            width: '100%',
                                                            height: '34px',
                                                            padding: '0 6px',
                                                            fontSize: '12px',
                                                            textAlign: 'center',
                                                            borderRadius: '6px',
                                                            border: '1px solid var(--color-border)',
                                                            background: isStManual ? 'var(--color-surface-secondary)' : 'var(--color-surface)',
                                                            color: 'var(--color-text)',
                                                            fontWeight: 700,
                                                            opacity: isStManual ? 0.5 : 1
                                                        }}
                                                    />
                                                );
                                            })()}
                                        </td>

                                        {/* Col ST (PKR) */}
                                        <td style={{ padding: '6px 4px', width: '105px', minWidth: '105px' }}>
                                            {(() => {
                                                const currentStBasis = (row.sales_tax_basis && row.sales_tax_basis !== 'INVOICE_AMOUNT') ? row.sales_tax_basis : ((row.sales_tax_override !== undefined && row.sales_tax_override !== null && row.sales_tax_override !== '') ? 'MANUAL' : 'TOTAL_SALE');
                                                const isStManual = currentStBasis === 'MANUAL';
                                                return isStManual ? (
                                                    <input 
                                                        type="number"
                                                        step="any"
                                                        value={row.sales_tax_override !== undefined && row.sales_tax_override !== null ? row.sales_tax_override : Math.round(calc.salesTax)}
                                                        onChange={(e) => handleUpdateRow(row, 'sales_tax_override', e.target.value)}
                                                        placeholder="0"
                                                        title="Manual Sales Tax in PKR"
                                                        style={{
                                                            width: '100%',
                                                            height: '34px',
                                                            padding: '0 8px',
                                                            fontSize: '12px',
                                                            textAlign: 'right',
                                                            borderRadius: '6px',
                                                            border: '1.5px solid #f59e0b',
                                                            background: 'rgba(245, 158, 11, 0.08)',
                                                            color: '#f59e0b',
                                                            fontWeight: 700
                                                        }}
                                                    />
                                                ) : (
                                                    <div style={{
                                                        height: '34px',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'flex-end',
                                                        padding: '0 8px',
                                                        fontSize: '12.5px',
                                                        fontWeight: 700,
                                                        color: '#f59e0b',
                                                        background: 'rgba(245, 158, 11, 0.04)',
                                                        borderRadius: '6px'
                                                    }}>
                                                        {Math.round(calc.salesTax).toLocaleString()}
                                                    </div>
                                                );
                                            })()}
                                        </td>

                                        {/* Total Invoice Amount Column (Prominent) */}
                                        <td style={{
                                            padding: '8px 12px',
                                            textAlign: 'right',
                                            fontWeight: 800,
                                            fontSize: '13.5px',
                                            color: '#8b5cf6',
                                            background: 'rgba(139, 92, 246, 0.06)',
                                            width: '140px',
                                            minWidth: '140px'
                                        }}>
                                            PKR {Math.round(calc.invoiceAmount).toLocaleString()}
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
                                    {selectedClientFilter !== 'ALL' 
                                        ? `${selectedClientFilter.toUpperCase()} TOTALS (${filteredRows.length} Locations)` 
                                        : `PORTFOLIO TOTALS (${filteredRows.length} Locations)`}
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
                                <td style={{ padding: '14px 8px', textAlign: 'center', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                                    ₨ {Math.round(summary.totalSessi).toLocaleString()}
                                </td>
                                <td style={{ padding: '14px 8px', textAlign: 'center', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                                    ₨ {Math.round(summary.totalEobi).toLocaleString()}
                                </td>
                                <td style={{ padding: '14px 8px', textAlign: 'center', color: '#3b82f6', fontWeight: 700 }}>
                                    ₨ {Math.round(summary.totalAdminCharges).toLocaleString()}
                                </td>
                                <td style={{ padding: '14px 8px', textAlign: 'center', color: '#10b981', fontWeight: 700 }}>
                                    ₨ {Math.round(summary.totalInsurance).toLocaleString()}
                                </td>
                                <td style={{ padding: '14px 6px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                                    -
                                </td>
                                <td style={{ padding: '14px 6px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                                    -
                                </td>
                                <td style={{ padding: '14px 10px', textAlign: 'right', color: 'var(--color-text-muted)', fontWeight: 700 }}>
                                    PKR {Math.round(summary.totalWht).toLocaleString()}
                                </td>
                                <td style={{ padding: '14px 6px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                                    -
                                </td>
                                <td style={{ padding: '14px 6px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                                    -
                                </td>
                                <td style={{ padding: '14px 10px', textAlign: 'right', color: '#f59e0b', fontWeight: 800 }}>
                                    PKR {Math.round(summary.totalSalesTax).toLocaleString()}
                                </td>
                                <td style={{ 
                                    padding: '14px 12px', 
                                    textAlign: 'right', 
                                    color: '#8b5cf6', 
                                    fontWeight: 800,
                                    fontSize: '13.5px',
                                    background: 'rgba(139, 92, 246, 0.08)'
                                }}>
                                    PKR {Math.round(summary.totalInvoice).toLocaleString()}
                                </td>
                                <td></td>
                            </tr>
                        </tfoot>
                    )}
                </table>
            </div>

            {/* Dedicated Landscape Print / PDF Modal */}
            <FastCostingPrintModal
                isOpen={isPrintModalOpen}
                onClose={() => setIsPrintModalOpen(false)}
                allRows={rows}
                initialClientFilter={selectedClientFilter}
                uniqueClients={uniqueClients}
                companyName={companyName}
                roleColumns={ROLE_COLUMNS}
                computeRowTotals={computeRowTotals}
                onExportCSV={(rowsToExport, clientName) => handleExportCSV(rowsToExport, clientName)}
            />

            {/* Costing Rules & Formulas Master Modal */}
            <CostingRulesConfigModal
                isOpen={isRulesModalOpen}
                onClose={() => setIsRulesModalOpen(false)}
                onApplied={(settings, applyToGrid, applyToggles) => {
                    setCostingConfig(settings);
                    if (applyToGrid) {
                        setRows(prevRows => prevRows.map(r => ({
                            ...r,
                            eobi_rate: settings.eobi_rate,
                            sessi_minimum_wage: settings.sessi_minimum_wage,
                            sessi_percentage: settings.sessi_percentage,
                            admin_charges_percentage: settings.admin_charges_percentage,
                            insurance_percentage: settings.insurance_percentage,
                            ...(applyToggles ? {
                                eobi_enabled: settings.eobi_default_enabled,
                                sessi_enabled: settings.sessi_default_enabled,
                                admin_charges_enabled: settings.admin_charges_default_enabled,
                                insurance_enabled: settings.insurance_default_enabled
                            } : {})
                        })));
                        setDirtyRowKeys(new Set(rows.map(r => getRowKey(r))));
                    }
                }}
            />
        </div>
    );
};
