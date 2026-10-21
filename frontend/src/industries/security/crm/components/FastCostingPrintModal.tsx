import React, { useState, useMemo } from 'react';
import { Button } from '../../../../components/ui/Button';
import type { CostingGridRow } from '../api';

export interface RoleColDef {
    key: string;
    label: string;
    rateKey: keyof CostingGridRow;
    salKey: keyof CostingGridRow;
    qtyKey: keyof CostingGridRow;
}

interface FastCostingPrintModalProps {
    isOpen: boolean;
    onClose: () => void;
    allRows: CostingGridRow[];
    initialClientFilter: string;
    uniqueClients: string[];
    companyName?: string;
    roleColumns: RoleColDef[];
    computeRowTotals: (r: CostingGridRow) => any;
    onExportCSV: (rowsToExport: CostingGridRow[], clientName: string) => void;
}

export const FastCostingPrintModal: React.FC<FastCostingPrintModalProps> = ({
    isOpen,
    onClose,
    allRows,
    initialClientFilter,
    uniqueClients,
    companyName = 'ZORVEX SECURITY SERVICES',
    roleColumns,
    computeRowTotals,
    onExportCSV
}) => {
    const [selectedClient, setSelectedClient] = useState<string>(initialClientFilter || 'ALL');
    const [showActiveRolesOnly, setShowActiveRolesOnly] = useState<boolean>(false);

    // Keep active client synced if initial filter changes when modal is reopened
    React.useEffect(() => {
        if (isOpen) {
            setSelectedClient(initialClientFilter || 'ALL');
        }
    }, [isOpen, initialClientFilter]);

    // Rows filtered by active selection inside modal
    const displayRows = useMemo(() => {
        if (!selectedClient || selectedClient === 'ALL') {
            return allRows;
        }
        const target = selectedClient.toLowerCase().trim();
        return allRows.filter(r => (r.client_name || '').toLowerCase().trim() === target);
    }, [allRows, selectedClient]);

    // Aggregate summary for displayRows
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
        let totalDifference = 0;
        let totalProfit = 0;
        const clientsSet = new Set<string>();

        displayRows.forEach(r => {
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
            totalDifference += calc.difference;
            totalProfit += calc.profitLoss;

            const name = r.client_name?.trim();
            if (name) clientsSet.add(name.toLowerCase());
        });

        return {
            totalLocations: displayRows.length,
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
            totalDifference,
            totalProfit
        };
    }, [displayRows, computeRowTotals]);

    // Filter roles if user toggled "Active Roles Only"
    const visibleRoles = useMemo(() => {
        if (!showActiveRolesOnly) return roleColumns;
        return roleColumns.filter(role => {
            return displayRows.some(r => (Number(r[role.qtyKey]) || 0) > 0);
        });
    }, [roleColumns, displayRows, showActiveRolesOnly]);

    if (!isOpen) return null;

    const handlePrint = () => {
        window.print();
    };

    const isSingleCompany = selectedClient !== 'ALL';
    const reportTitle = isSingleCompany
        ? `FAST COSTING GRID — ${selectedClient.toUpperCase()}`
        : 'CONSOLIDATED FAST COSTING GRID — ALL CLIENTS & SITES';

    const formattedDate = new Date().toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    });

    return (
        <div
            className="fast-costing-print-modal-overlay"
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(15, 23, 42, 0.75)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 9999,
                padding: '16px',
                backdropFilter: 'blur(4px)'
            }}
        >
            <div
                className="fast-costing-print-modal-content"
                style={{
                    backgroundColor: '#ffffff',
                    color: '#0f172a',
                    borderRadius: '12px',
                    width: '100%',
                    maxWidth: '1440px',
                    height: '92vh',
                    display: 'flex',
                    flexDirection: 'column',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
                    overflow: 'hidden'
                }}
            >
                {/* Modal Toolbar (hidden during physical print) */}
                <div
                    className="no-print"
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 20px',
                        borderBottom: '1px solid #e2e8f0',
                        backgroundColor: '#f8fafc',
                        flexWrap: 'wrap',
                        gap: '12px'
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div
                            style={{
                                width: '36px',
                                height: '36px',
                                borderRadius: '8px',
                                background: 'linear-gradient(135deg, #1e3a8a, #3b82f6)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#ffffff'
                            }}
                        >
                            <i className="bx bx-printer" style={{ fontSize: '20px' }}></i>
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
                                Fast Costing Grid — Print / Export Sheet
                            </h3>
                            <div style={{ fontSize: '12px', color: '#64748b' }}>
                                Formatted landscape report with all role rates, salaries, deployment quantities, overheads, and statutory taxes
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        {/* Client Selector inside Modal */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Company / Client:</span>
                            <select
                                value={selectedClient}
                                onChange={(e) => setSelectedClient(e.target.value)}
                                style={{
                                    height: '34px',
                                    padding: '0 10px',
                                    fontSize: '12.5px',
                                    borderRadius: '6px',
                                    border: '1px solid #cbd5e1',
                                    backgroundColor: '#ffffff',
                                    color: '#0f172a',
                                    fontWeight: selectedClient !== 'ALL' ? 700 : 500,
                                    maxWidth: '220px'
                                }}
                            >
                                <option value="ALL">All Clients ({uniqueClients.length})</option>
                                {uniqueClients.map(c => (
                                    <option key={c} value={c}>{c}</option>
                                ))}
                            </select>
                        </div>

                        {/* Toggle Active Roles Only vs Full 14 Roles */}
                        <button
                            type="button"
                            onClick={() => setShowActiveRolesOnly(!showActiveRolesOnly)}
                            style={{
                                height: '34px',
                                padding: '0 12px',
                                fontSize: '12px',
                                fontWeight: 600,
                                borderRadius: '6px',
                                border: '1px solid #cbd5e1',
                                backgroundColor: showActiveRolesOnly ? '#eff6ff' : '#ffffff',
                                color: showActiveRolesOnly ? '#2563eb' : '#475569',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px'
                            }}
                            title="Switch between all 14 canonical roles and only currently deployed roles"
                        >
                            <i className={`bx ${showActiveRolesOnly ? 'bx-check-square' : 'bx-grid-alt'}`}></i>
                            {showActiveRolesOnly ? 'Showing: Active Roles Only' : 'Showing: Full 14 Roles Grid'}
                        </button>

                        {/* Export CSV Button */}
                        <Button
                            variant="secondary"
                            onClick={() => onExportCSV(displayRows, selectedClient)}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', height: '34px' }}
                            title="Export this view to CSV / Excel"
                        >
                            <i className="bx bx-download" style={{ fontSize: '16px' }}></i> Export CSV
                        </Button>

                        {/* Print / Save PDF Action */}
                        <Button
                            variant="primary"
                            onClick={handlePrint}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                height: '34px',
                                background: '#1e3a8a',
                                borderColor: '#1e3a8a'
                            }}
                        >
                            <i className="bx bx-printer" style={{ fontSize: '18px' }}></i> Print / Save PDF
                        </Button>

                        {/* Close Action */}
                        <Button
                            variant="ghost"
                            onClick={onClose}
                            style={{ display: 'inline-flex', alignItems: 'center', height: '34px', padding: '0 10px' }}
                        >
                            <i className="bx bx-x" style={{ fontSize: '20px' }}></i>
                        </Button>
                    </div>
                </div>

                {/* Printable Document Body */}
                <div
                    style={{
                        flex: 1,
                        overflow: 'auto',
                        padding: '24px',
                        backgroundColor: '#ffffff'
                    }}
                >
                    <div className="fast-costing-print-document">
                        {/* Company Header & Document Banner */}
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'flex-start',
                                borderBottom: '2.5px solid #1e3a8a',
                                paddingBottom: '14px',
                                marginBottom: '16px'
                            }}
                        >
                            <div>
                                <h1
                                    style={{
                                        margin: '0 0 4px 0',
                                        fontSize: '22px',
                                        fontWeight: 800,
                                        color: '#1e3a8a',
                                        letterSpacing: '-0.3px',
                                        textTransform: 'uppercase'
                                    }}
                                >
                                    {companyName}
                                </h1>
                                <div style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>
                                    Security Operations, CRM Commercial Costing & Billing Engine
                                </div>
                                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                                    Statutory Costing & Invoicing Schedule • Rate Breakdown & Strength Matrix
                                </div>
                            </div>

                            <div style={{ textAlign: 'right' }}>
                                <div
                                    style={{
                                        display: 'inline-block',
                                        backgroundColor: isSingleCompany ? '#eff6ff' : '#f1f5f9',
                                        border: `1px solid ${isSingleCompany ? '#bfdbfe' : '#cbd5e1'}`,
                                        borderRadius: '6px',
                                        padding: '4px 10px',
                                        fontSize: '12px',
                                        fontWeight: 700,
                                        color: isSingleCompany ? '#1d4ed8' : '#334155',
                                        marginBottom: '4px'
                                    }}
                                >
                                    {isSingleCompany ? `CLIENT: ${selectedClient.toUpperCase()}` : 'FULL CLIENT PORTFOLIO'}
                                </div>
                                <div style={{ fontSize: '11px', color: '#64748b' }}>
                                    Report Date: <strong>{formattedDate}</strong>
                                </div>
                                <div style={{ fontSize: '11px', color: '#64748b' }}>
                                    Sites: <strong>{summary.totalLocations}</strong> | Total Force: <strong>{summary.totalGuards} Guards</strong>
                                </div>
                            </div>
                        </div>

                        {/* Title Bar */}
                        <div
                            style={{
                                backgroundColor: '#f8fafc',
                                border: '1px solid #e2e8f0',
                                borderRadius: '6px',
                                padding: '8px 14px',
                                marginBottom: '14px',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                            }}
                        >
                            <span style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>
                                {reportTitle}
                            </span>
                            <span style={{ fontSize: '11.5px', color: '#64748b' }}>
                                Currency: <strong>PKR (Pakistani Rupee)</strong>
                            </span>
                        </div>

                        {/* Executive KPI Summary Cards */}
                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(6, 1fr)',
                                gap: '8px',
                                marginBottom: '16px'
                            }}
                        >
                            <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '6px 10px', backgroundColor: '#fafafa' }}>
                                <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Sites / Guards</div>
                                <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>
                                    {summary.totalLocations} <span style={{ fontSize: '11px', fontWeight: 500, color: '#64748b' }}>({summary.totalGuards} Guards)</span>
                                </div>
                            </div>

                            <div style={{ border: '1px solid #bfdbfe', borderRadius: '6px', padding: '6px 10px', backgroundColor: '#f0fdf4' }}>
                                <div style={{ fontSize: '10px', color: '#166534', fontWeight: 600, textTransform: 'uppercase' }}>Monthly Billing Sale</div>
                                <div style={{ fontSize: '14px', fontWeight: 800, color: '#15803d' }}>
                                    ₨ {summary.totalSale.toLocaleString()}
                                </div>
                            </div>

                            <div style={{ border: '1px solid #fed7aa', borderRadius: '6px', padding: '6px 10px', backgroundColor: '#fff7ed' }}>
                                <div style={{ fontSize: '10px', color: '#9a3412', fontWeight: 600, textTransform: 'uppercase' }}>Direct Guard Salary</div>
                                <div style={{ fontSize: '14px', fontWeight: 800, color: '#c2410c' }}>
                                    ₨ {summary.totalSalary.toLocaleString()}
                                </div>
                            </div>

                            <div style={{ border: '1px solid #fde68a', borderRadius: '6px', padding: '6px 10px', backgroundColor: '#fefce8' }}>
                                <div style={{ fontSize: '10px', color: '#854d0e', fontWeight: 600, textTransform: 'uppercase' }}>Total Sales Tax (ST)</div>
                                <div style={{ fontSize: '14px', fontWeight: 800, color: '#a16207' }}>
                                    ₨ {Math.round(summary.totalSalesTax).toLocaleString()}
                                </div>
                            </div>

                            <div style={{ border: '1.5px solid #c084fc', borderRadius: '6px', padding: '6px 10px', backgroundColor: '#faf5ff' }}>
                                <div style={{ fontSize: '10px', color: '#6b21a8', fontWeight: 700, textTransform: 'uppercase' }}>Total Invoice Amount</div>
                                <div style={{ fontSize: '14px', fontWeight: 800, color: '#7e22ce' }}>
                                    ₨ {Math.round(summary.totalInvoice).toLocaleString()}
                                </div>
                            </div>

                            <div style={{ border: '1px solid #bbf7d0', borderRadius: '6px', padding: '6px 10px', backgroundColor: '#f0fdf4' }}>
                                <div style={{ fontSize: '10px', color: '#166534', fontWeight: 600, textTransform: 'uppercase' }}>Net Margin / Profit</div>
                                <div style={{ fontSize: '14px', fontWeight: 800, color: summary.totalProfit >= 0 ? '#15803d' : '#b91c1c' }}>
                                    ₨ {Math.round(summary.totalProfit).toLocaleString()}
                                </div>
                            </div>
                        </div>

                        {/* Full Data Matrix Table */}
                        <div style={{ overflowX: 'auto', marginBottom: '20px' }}>
                            <table
                                className="fast-costing-print-table"
                                style={{
                                    width: '100%',
                                    borderCollapse: 'collapse',
                                    fontSize: '10px',
                                    color: '#0f172a',
                                    fontFamily: 'inherit'
                                }}
                            >
                                <thead>
                                    {/* Level 1 Group Header Row */}
                                    <tr style={{ backgroundColor: '#1e293b', color: '#ffffff' }}>
                                        <th
                                            colSpan={3}
                                            style={{
                                                padding: '6px 8px',
                                                border: '1px solid #334155',
                                                textAlign: 'left',
                                                fontWeight: 700
                                            }}
                                        >
                                            Client & Deployment Location
                                        </th>

                                        {visibleRoles.map((role) => (
                                            <th
                                                key={role.key}
                                                colSpan={3}
                                                style={{
                                                    padding: '6px 4px',
                                                    border: '1px solid #334155',
                                                    textAlign: 'center',
                                                    fontWeight: 700,
                                                    fontSize: '9.5px'
                                                }}
                                            >
                                                {role.label}
                                            </th>
                                        ))}

                                        <th
                                            colSpan={13}
                                            style={{
                                                padding: '6px 8px',
                                                border: '1px solid #334155',
                                                textAlign: 'center',
                                                fontWeight: 700
                                            }}
                                        >
                                            Commercial Costing, Overhead & Statutory Taxes (PKR)
                                        </th>
                                    </tr>

                                    {/* Level 2 Sub-Column Header Row */}
                                    <tr style={{ backgroundColor: '#f1f5f9', color: '#1e293b' }}>
                                        <th style={{ padding: '5px 4px', border: '1px solid #cbd5e1', textAlign: 'center', width: '25px' }}>#</th>
                                        <th style={{ padding: '5px 6px', border: '1px solid #cbd5e1', textAlign: 'left', minWidth: '110px' }}>Client Name</th>
                                        <th style={{ padding: '5px 6px', border: '1px solid #cbd5e1', textAlign: 'left', minWidth: '100px' }}>Location / Site</th>

                                        {visibleRoles.map((role) => (
                                            <React.Fragment key={`${role.key}-sub`}>
                                                <th style={{ padding: '5px 2px', border: '1px solid #cbd5e1', textAlign: 'right', minWidth: '45px', fontSize: '9px' }}>Rate</th>
                                                <th style={{ padding: '5px 2px', border: '1px solid #cbd5e1', textAlign: 'right', minWidth: '45px', fontSize: '9px' }}>Sal</th>
                                                <th style={{ padding: '5px 2px', border: '1px solid #cbd5e1', textAlign: 'center', minWidth: '28px', fontSize: '9px', fontWeight: 700 }}>Qty</th>
                                            </React.Fragment>
                                        ))}

                                        <th style={{ padding: '5px 4px', border: '1px solid #cbd5e1', textAlign: 'right', minWidth: '65px', color: '#0369a1', fontWeight: 700 }}>Monthly Sale</th>
                                        <th style={{ padding: '5px 4px', border: '1px solid #cbd5e1', textAlign: 'right', minWidth: '65px', color: '#b45309', fontWeight: 700 }}>Direct Sal</th>
                                        <th style={{ padding: '5px 3px', border: '1px solid #cbd5e1', textAlign: 'center', minWidth: '35px', fontWeight: 700 }}>Total Force</th>
                                        <th style={{ padding: '5px 4px', border: '1px solid #cbd5e1', textAlign: 'right', minWidth: '55px' }}>Overhead</th>
                                        <th style={{ padding: '5px 4px', border: '1px solid #cbd5e1', textAlign: 'right', minWidth: '45px' }}>OT/Hr</th>
                                        <th style={{ padding: '5px 4px', border: '1px solid #cbd5e1', textAlign: 'right', minWidth: '55px' }}>Srv Chg</th>
                                        <th style={{ padding: '5px 4px', border: '1px solid #cbd5e1', textAlign: 'right', minWidth: '45px' }}>SESSI</th>
                                        <th style={{ padding: '5px 4px', border: '1px solid #cbd5e1', textAlign: 'right', minWidth: '45px' }}>EOBI</th>
                                        <th style={{ padding: '5px 4px', border: '1px solid #cbd5e1', textAlign: 'right', minWidth: '50px', color: '#7e22ce', fontWeight: 700 }}>WHT Tax</th>
                                        <th style={{ padding: '5px 4px', border: '1px solid #cbd5e1', textAlign: 'right', minWidth: '55px', color: '#a16207', fontWeight: 700 }}>Sales Tax</th>
                                        <th style={{ padding: '5px 6px', border: '1px solid #c084fc', textAlign: 'right', minWidth: '75px', backgroundColor: '#faf5ff', color: '#6b21a8', fontWeight: 800 }}>Total Invoice</th>
                                        <th style={{ padding: '5px 4px', border: '1px solid #cbd5e1', textAlign: 'right', minWidth: '60px', color: '#15803d', fontWeight: 700 }}>Gross Margin</th>
                                        <th style={{ padding: '5px 4px', border: '1px solid #cbd5e1', textAlign: 'right', minWidth: '60px', color: '#15803d', fontWeight: 700 }}>Net Profit</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {displayRows.length === 0 ? (
                                        <tr>
                                            <td colSpan={3 + (visibleRoles.length * 3) + 13} style={{ padding: '30px', textAlign: 'center', color: '#64748b' }}>
                                                No costing data found for the selected company/client.
                                            </td>
                                        </tr>
                                    ) : (
                                        displayRows.map((row, idx) => {
                                            const calc = computeRowTotals(row);
                                            const rowBg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';

                                            return (
                                                <tr key={row.id || idx} style={{ backgroundColor: rowBg }}>
                                                    <td style={{ padding: '4px 4px', border: '1px solid #e2e8f0', textAlign: 'center', color: '#64748b' }}>
                                                        {idx + 1}
                                                    </td>
                                                    <td style={{ padding: '4px 6px', border: '1px solid #e2e8f0', fontWeight: 600 }}>
                                                        {row.client_name || '-'}
                                                    </td>
                                                    <td style={{ padding: '4px 6px', border: '1px solid #e2e8f0', color: '#334155' }}>
                                                        {row.location_name || '-'}
                                                    </td>

                                                    {visibleRoles.map((role) => {
                                                        const rate = Number(row[role.rateKey]) || 0;
                                                        const sal = Number(row[role.salKey]) || 0;
                                                        const qty = Number(row[role.qtyKey]) || 0;

                                                        return (
                                                            <React.Fragment key={`${role.key}-${idx}`}>
                                                                <td style={{ padding: '4px 2px', border: '1px solid #e2e8f0', textAlign: 'right', color: rate > 0 ? '#0f172a' : '#94a3b8' }}>
                                                                    {rate > 0 ? rate.toLocaleString() : '-'}
                                                                </td>
                                                                <td style={{ padding: '4px 2px', border: '1px solid #e2e8f0', textAlign: 'right', color: sal > 0 ? '#0f172a' : '#94a3b8' }}>
                                                                    {sal > 0 ? sal.toLocaleString() : '-'}
                                                                </td>
                                                                <td style={{ padding: '4px 2px', border: '1px solid #e2e8f0', textAlign: 'center', fontWeight: qty > 0 ? 700 : 400, color: qty > 0 ? '#1d4ed8' : '#94a3b8' }}>
                                                                    {qty > 0 ? qty : '-'}
                                                                </td>
                                                            </React.Fragment>
                                                        );
                                                    })}

                                                    <td style={{ padding: '4px 4px', border: '1px solid #e2e8f0', textAlign: 'right', fontWeight: 600, color: '#0369a1' }}>
                                                        {Math.round(calc.monthlySale).toLocaleString()}
                                                    </td>
                                                    <td style={{ padding: '4px 4px', border: '1px solid #e2e8f0', textAlign: 'right', fontWeight: 600, color: '#b45309' }}>
                                                        {Math.round(calc.monthlySalary).toLocaleString()}
                                                    </td>
                                                    <td style={{ padding: '4px 3px', border: '1px solid #e2e8f0', textAlign: 'center', fontWeight: 700, color: '#1e3a8a' }}>
                                                        {calc.totalStrength}
                                                    </td>
                                                    <td style={{ padding: '4px 4px', border: '1px solid #e2e8f0', textAlign: 'right', color: '#475569' }}>
                                                        {Math.round(calc.expense).toLocaleString()}
                                                    </td>
                                                    <td style={{ padding: '4px 4px', border: '1px solid #e2e8f0', textAlign: 'right', color: '#475569' }}>
                                                        {row.ot_rate ? Number(row.ot_rate).toLocaleString() : (calc.totalStrength > 0 ? Math.round((calc.monthlySalary / calc.totalStrength) / 30) : '-')}
                                                    </td>
                                                    <td style={{ padding: '4px 4px', border: '1px solid #e2e8f0', textAlign: 'right', color: '#475569' }}>
                                                        {Math.round(calc.totalStrength * calc.serviceCharges).toLocaleString()}
                                                    </td>
                                                    <td style={{ padding: '4px 4px', border: '1px solid #e2e8f0', textAlign: 'right', color: '#475569' }}>
                                                        {Math.round(calc.sessi).toLocaleString()}
                                                    </td>
                                                    <td style={{ padding: '4px 4px', border: '1px solid #e2e8f0', textAlign: 'right', color: '#475569' }}>
                                                        {Math.round(calc.eobi).toLocaleString()}
                                                    </td>
                                                    <td style={{ padding: '4px 4px', border: '1px solid #e2e8f0', textAlign: 'right', fontWeight: 600, color: '#7e22ce' }}>
                                                        {Math.round(calc.wht).toLocaleString()}
                                                    </td>
                                                    <td style={{ padding: '4px 4px', border: '1px solid #e2e8f0', textAlign: 'right', fontWeight: 600, color: '#a16207' }}>
                                                        {Math.round(calc.salesTax).toLocaleString()}
                                                    </td>
                                                    <td style={{ padding: '4px 6px', border: '1px solid #c084fc', textAlign: 'right', fontWeight: 800, color: '#6b21a8', backgroundColor: '#faf5ff' }}>
                                                        {Math.round(calc.invoiceAmount).toLocaleString()}
                                                    </td>
                                                    <td style={{ padding: '4px 4px', border: '1px solid #e2e8f0', textAlign: 'right', fontWeight: 600, color: calc.difference >= 0 ? '#15803d' : '#b91c1c' }}>
                                                        {Math.round(calc.difference).toLocaleString()}
                                                    </td>
                                                    <td style={{ padding: '4px 4px', border: '1px solid #e2e8f0', textAlign: 'right', fontWeight: 600, color: calc.profitLoss >= 0 ? '#15803d' : '#b91c1c' }}>
                                                        {Math.round(calc.profitLoss).toLocaleString()}
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>

                                {/* Summary Totals Footer */}
                                {displayRows.length > 0 && (
                                    <tfoot>
                                        <tr style={{ backgroundColor: '#f1f5f9', fontWeight: 800, borderTop: '2px solid #0f172a', borderBottom: '2px solid #0f172a' }}>
                                            <td colSpan={3} style={{ padding: '8px 6px', border: '1px solid #cbd5e1', textAlign: 'left', color: '#0f172a' }}>
                                                {isSingleCompany ? `${selectedClient.toUpperCase()} TOTALS (${displayRows.length} Sites)` : `PORTFOLIO TOTALS (${displayRows.length} Sites)`}
                                            </td>

                                            {visibleRoles.map(role => {
                                                let roleTotalQty = 0;
                                                displayRows.forEach(r => {
                                                    roleTotalQty += Number(r[role.qtyKey]) || 0;
                                                });

                                                return (
                                                    <React.Fragment key={`${role.key}-foot`}>
                                                        <td style={{ padding: '8px 2px', border: '1px solid #cbd5e1', textAlign: 'center', color: '#94a3b8' }}>-</td>
                                                        <td style={{ padding: '8px 2px', border: '1px solid #cbd5e1', textAlign: 'center', color: '#94a3b8' }}>-</td>
                                                        <td style={{ padding: '8px 2px', border: '1px solid #cbd5e1', textAlign: 'center', color: '#1d4ed8', fontWeight: 800 }}>
                                                            {roleTotalQty > 0 ? roleTotalQty : '-'}
                                                        </td>
                                                    </React.Fragment>
                                                );
                                            })}

                                            <td style={{ padding: '8px 4px', border: '1px solid #cbd5e1', textAlign: 'right', color: '#0369a1', fontWeight: 800 }}>
                                                {Math.round(summary.totalSale).toLocaleString()}
                                            </td>
                                            <td style={{ padding: '8px 4px', border: '1px solid #cbd5e1', textAlign: 'right', color: '#b45309', fontWeight: 800 }}>
                                                {Math.round(summary.totalSalary).toLocaleString()}
                                            </td>
                                            <td style={{ padding: '8px 3px', border: '1px solid #cbd5e1', textAlign: 'center', color: '#1e3a8a', fontWeight: 800 }}>
                                                {summary.totalGuards}
                                            </td>
                                            <td style={{ padding: '8px 4px', border: '1px solid #cbd5e1', textAlign: 'right', color: '#475569' }}>
                                                {Math.round(summary.totalExpense).toLocaleString()}
                                            </td>
                                            <td style={{ padding: '8px 4px', border: '1px solid #cbd5e1', textAlign: 'center', color: '#94a3b8' }}>
                                                -
                                            </td>
                                            <td style={{ padding: '8px 4px', border: '1px solid #cbd5e1', textAlign: 'right', color: '#475569' }}>
                                                {Math.round(summary.totalServiceCharges).toLocaleString()}
                                            </td>
                                            <td style={{ padding: '8px 4px', border: '1px solid #cbd5e1', textAlign: 'right', color: '#475569' }}>
                                                {Math.round(summary.totalSessi).toLocaleString()}
                                            </td>
                                            <td style={{ padding: '8px 4px', border: '1px solid #cbd5e1', textAlign: 'right', color: '#475569' }}>
                                                {Math.round(summary.totalEobi).toLocaleString()}
                                            </td>
                                            <td style={{ padding: '8px 4px', border: '1px solid #cbd5e1', textAlign: 'right', color: '#7e22ce', fontWeight: 800 }}>
                                                {Math.round(summary.totalWht).toLocaleString()}
                                            </td>
                                            <td style={{ padding: '8px 4px', border: '1px solid #cbd5e1', textAlign: 'right', color: '#a16207', fontWeight: 800 }}>
                                                {Math.round(summary.totalSalesTax).toLocaleString()}
                                            </td>
                                            <td style={{ padding: '8px 6px', border: '1px solid #c084fc', textAlign: 'right', color: '#6b21a8', fontWeight: 900, backgroundColor: '#faf5ff' }}>
                                                {Math.round(summary.totalInvoice).toLocaleString()}
                                            </td>
                                            <td style={{ padding: '8px 4px', border: '1px solid #cbd5e1', textAlign: 'right', color: summary.totalDifference >= 0 ? '#15803d' : '#b91c1c', fontWeight: 800 }}>
                                                {Math.round(summary.totalDifference).toLocaleString()}
                                            </td>
                                            <td style={{ padding: '8px 4px', border: '1px solid #cbd5e1', textAlign: 'right', color: summary.totalProfit >= 0 ? '#15803d' : '#b91c1c', fontWeight: 800 }}>
                                                {Math.round(summary.totalProfit).toLocaleString()}
                                            </td>
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        </div>

                        {/* Statutory Notes & Immutability */}
                        <div
                            style={{
                                border: '1px solid #e2e8f0',
                                backgroundColor: '#f8fafc',
                                borderRadius: '6px',
                                padding: '10px 14px',
                                marginBottom: '24px',
                                fontSize: '11px',
                                color: '#475569',
                                lineHeight: '1.5'
                            }}
                        >
                            <strong>Statutory & Commercial Compliance Note:</strong> Direct salaries, statutory schemes (SESSI/PESSI, EOBI), and taxation (Withholding Income Tax & Provincial Sales Tax) are strictly calculated in accordance with applicable provincial regulations and corporate commercial agreements. Overtime and additional strength deployments are billed based on approved hourly shift multiples.
                        </div>

                        {/* Formal Sign-off & Verification Block */}
                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(3, 1fr)',
                                gap: '30px',
                                paddingTop: '20px',
                                borderTop: '1px solid #cbd5e1',
                                fontSize: '11px',
                                color: '#64748b'
                            }}
                        >
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ borderBottom: '1px solid #94a3b8', height: '35px', marginBottom: '6px' }}></div>
                                <div style={{ fontWeight: 600, color: '#334155' }}>Prepared By (Operations / Commercial)</div>
                                <div style={{ fontSize: '10px' }}>Fast Costing Matrix Specialist</div>
                            </div>

                            <div style={{ textAlign: 'center' }}>
                                <div style={{ borderBottom: '1px solid #94a3b8', height: '35px', marginBottom: '6px' }}></div>
                                <div style={{ fontWeight: 600, color: '#334155' }}>Checked & Audited (Accounts & Finance)</div>
                                <div style={{ fontSize: '10px' }}>Tax & Statutory Verification</div>
                            </div>

                            <div style={{ textAlign: 'center' }}>
                                <div style={{ borderBottom: '1px solid #94a3b8', height: '35px', marginBottom: '6px' }}></div>
                                <div style={{ fontWeight: 600, color: '#334155' }}>Authorized Signature / Client Approval</div>
                                <div style={{ fontSize: '10px' }}>Managing Director / Client Representative</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Print CSS Isolation Styles */}
            <style
                dangerouslySetInnerHTML={{
                    __html: `
                @media print {
                    @page {
                        size: landscape;
                        margin: 6mm;
                    }
                    html, body {
                        background: #ffffff !important;
                        color: #000000 !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        width: 100% !important;
                        height: auto !important;
                    }
                    body * {
                        visibility: hidden !important;
                    }
                    .fast-costing-print-modal-overlay {
                        position: static !important;
                        background: none !important;
                        padding: 0 !important;
                        margin: 0 !important;
                        width: 100% !important;
                        height: auto !important;
                        overflow: visible !important;
                        backdrop-filter: none !important;
                    }
                    .fast-costing-print-modal-content {
                        box-shadow: none !important;
                        border: none !important;
                        max-width: 100% !important;
                        width: 100% !important;
                        height: auto !important;
                        overflow: visible !important;
                        border-radius: 0 !important;
                    }
                    .fast-costing-print-document,
                    .fast-costing-print-document * {
                        visibility: visible !important;
                    }
                    .fast-costing-print-document {
                        position: absolute !important;
                        left: 0 !important;
                        top: 0 !important;
                        width: 100% !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        background: #ffffff !important;
                        color: #0f172a !important;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    .no-print {
                        display: none !important;
                    }
                    table.fast-costing-print-table {
                        width: 100% !important;
                        page-break-inside: auto !important;
                        border-collapse: collapse !important;
                    }
                    tr {
                        page-break-inside: avoid !important;
                        page-break-after: auto !important;
                    }
                    thead {
                        display: table-header-group !important;
                    }
                    tfoot {
                        display: table-footer-group !important;
                    }
                }
            `
                }}
            />
        </div>
    );
};
