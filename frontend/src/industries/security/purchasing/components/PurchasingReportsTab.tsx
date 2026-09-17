import React, { useState, useEffect } from 'react';
import { Card } from '../../../../components/ui/Card';
import { getPurchasingReportData, getVendors, type PurchasingReportResult, type Vendor } from '../api';

const REPORT_DEFINITIONS = [
    { id: 'purchases_by_vendor', label: 'Purchases by Vendor', icon: 'bx-buildings', description: 'Total spend, order counts, and invoiced amounts per supplier' },
    { id: 'purchases_by_item', label: 'Purchases by Item', icon: 'bx-box', description: 'Total volume ordered, received quantity, and average unit costs per item' },
    { id: 'po_status', label: 'PO Status Report', icon: 'bx-cart', description: 'Complete PO status lifecycle from Draft to Billed & Closed' },
    { id: 'pending_deliveries', label: 'Pending Deliveries', icon: 'bx-time-five', description: 'Open PO lines awaiting delivery with overdue tracking' },
    { id: 'grn_receiving_history', label: 'GRN Receiving History', icon: 'bx-package', description: 'Warehouse receipt logs with QC accepted vs rejected items' },
    { id: 'vendor_bills', label: 'Vendor Bills & Invoices', icon: 'bx-receipt', description: 'Posted supplier invoices, match status, and outstanding balances' },
    { id: 'three_way_match_exceptions', label: '3-Way Match Exceptions', icon: 'bx-git-compare', description: 'Invoices flagged for price or quantity variance against PO/GRN' },
    { id: 'payments', label: 'Payments Disbursed', icon: 'bx-check-double', description: 'Payment vouchers, payment methods, bank/cash accounts, and references' },
    { id: 'purchase_returns', label: 'Purchase Returns', icon: 'bx-undo', description: 'Returned goods, defect reasons, RMA numbers, and return credits' },
    { id: 'vendor_credits', label: 'Vendor Credit Notes', icon: 'bx-credit-card', description: 'Credit note adjustments, allocated credits, and unallocated pool' }
];

export const PurchasingReportsTab: React.FC = () => {
    const [selectedReport, setSelectedReport] = useState<string>('purchases_by_vendor');
    const [reportData, setReportData] = useState<PurchasingReportResult | null>(null);
    const [vendors, setVendors] = useState<Vendor[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    // Filters
    const [startDate, setStartDate] = useState<string>('');
    const [endDate, setEndDate] = useState<string>('');
    const [selectedVendor, setSelectedVendor] = useState<string>('ALL');
    const [statusFilter, setStatusFilter] = useState<string>('ALL');
    const [searchTerm, setSearchTerm] = useState<string>('');

    useEffect(() => {
        const loadVendors = async () => {
            try {
                const res = await getVendors({ status: 'ACTIVE' });
                setVendors(res);
            } catch (err) {
                console.error('Failed to load vendors for filter dropdown:', err);
            }
        };
        loadVendors();
    }, []);

    const fetchReport = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await getPurchasingReportData({
                report_type: selectedReport,
                start_date: startDate || undefined,
                end_date: endDate || undefined,
                vendor: selectedVendor !== 'ALL' ? selectedVendor : undefined,
                status: statusFilter !== 'ALL' ? statusFilter : undefined,
                search: searchTerm || undefined
            });
            setReportData(data);
        } catch (err: any) {
            console.error('Failed to fetch purchasing report:', err);
            setError(err.response?.data?.detail || 'Failed to load report data.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchReport();
    }, [selectedReport, startDate, endDate, selectedVendor, statusFilter]);

    const exportToCSV = () => {
        if (!reportData || !reportData.rows || reportData.rows.length === 0) return;

        const rows = reportData.rows;
        const headers = Object.keys(rows[0]);
        const csvContent = [
            headers.join(','),
            ...rows.map(row => headers.map(header => {
                const val = row[header] === null || row[header] === undefined ? '' : String(row[header]);
                return `"${val.replace(/"/g, '""')}"`;
            }).join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `zorvex_report_${selectedReport}_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const currentDef = REPORT_DEFINITIONS.find(r => r.id === selectedReport) || REPORT_DEFINITIONS[0];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Report Selector Pills */}
            <div style={{
                display: 'flex',
                gap: '8px',
                overflowX: 'auto',
                paddingBottom: '8px',
                borderBottom: '1px solid var(--color-border)'
            }}>
                {REPORT_DEFINITIONS.map(rep => {
                    const isSelected = selectedReport === rep.id;
                    return (
                        <button
                            key={rep.id}
                            onClick={() => {
                                setSelectedReport(rep.id);
                                setSearchTerm('');
                            }}
                            style={{
                                padding: '8px 14px',
                                borderRadius: '8px',
                                border: '1px solid',
                                borderColor: isSelected ? 'var(--color-primary)' : 'var(--color-border)',
                                background: isSelected ? 'rgba(99, 102, 241, 0.15)' : 'var(--color-surface)',
                                color: isSelected ? 'var(--color-primary)' : 'var(--color-text)',
                                fontWeight: isSelected ? 700 : 500,
                                fontSize: '12px',
                                cursor: 'pointer',
                                whiteSpace: 'nowrap',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                            }}
                        >
                            <i className={`bx ${rep.icon}`}></i>
                            {rep.label}
                        </button>
                    );
                })}
            </div>

            {/* Filter & Action Toolbar */}
            <Card style={{ padding: '16px 20px', background: 'var(--color-surface)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <i className={`bx ${currentDef.icon}`} style={{ color: 'var(--color-primary)' }}></i>
                            {currentDef.label}
                        </h3>
                        <p style={{ margin: 0, fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                            {currentDef.description}
                        </p>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        {/* Search Input */}
                        <div style={{ position: 'relative' }}>
                            <i className='bx bx-search' style={{ position: 'absolute', left: '10px', top: '9px', color: 'var(--color-text-muted)' }}></i>
                            <input
                                type="text"
                                placeholder="Search rows..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && fetchReport()}
                                style={{
                                    padding: '7px 12px 7px 30px',
                                    borderRadius: '6px',
                                    border: '1px solid var(--color-border)',
                                    background: 'var(--color-surface)',
                                    color: 'var(--color-text)',
                                    fontSize: '12px',
                                    width: '160px'
                                }}
                            />
                        </div>

                        {/* Vendor Filter */}
                        <select
                            value={selectedVendor}
                            onChange={(e) => setSelectedVendor(e.target.value)}
                            style={{
                                padding: '7px 10px',
                                borderRadius: '6px',
                                border: '1px solid var(--color-border)',
                                background: 'var(--color-surface)',
                                color: 'var(--color-text)',
                                fontSize: '12px'
                            }}
                        >
                            <option value="ALL">All Vendors</option>
                            {vendors.map(v => (
                                <option key={v.id} value={v.id}>{v.name}</option>
                            ))}
                        </select>

                        {/* Status Filter */}
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            style={{
                                padding: '7px 10px',
                                borderRadius: '6px',
                                border: '1px solid var(--color-border)',
                                background: 'var(--color-surface)',
                                color: 'var(--color-text)',
                                fontSize: '12px'
                            }}
                        >
                            <option value="ALL">All Statuses</option>
                            <option value="DRAFT">Draft</option>
                            <option value="PENDING_APPROVAL">Pending Approval</option>
                            <option value="APPROVED">Approved</option>
                            <option value="ISSUED">Issued</option>
                            <option value="POSTED">Posted</option>
                            <option value="PARTIALLY_RECEIVED">Partially Received</option>
                        </select>

                        {/* Date Range Filters */}
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            style={{
                                padding: '6px 8px',
                                borderRadius: '6px',
                                border: '1px solid var(--color-border)',
                                background: 'var(--color-surface)',
                                color: 'var(--color-text)',
                                fontSize: '12px'
                            }}
                            title="From Date"
                        />
                        <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>to</span>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            style={{
                                padding: '6px 8px',
                                borderRadius: '6px',
                                border: '1px solid var(--color-border)',
                                background: 'var(--color-surface)',
                                color: 'var(--color-text)',
                                fontSize: '12px'
                            }}
                            title="To Date"
                        />

                        {/* Clear Filters */}
                        {(startDate || endDate || selectedVendor !== 'ALL' || searchTerm) && (
                            <button
                                onClick={() => {
                                    setStartDate('');
                                    setEndDate('');
                                    setSelectedVendor('ALL');
                                    setSearchTerm('');
                                }}
                                style={{
                                    padding: '7px 10px',
                                    borderRadius: '6px',
                                    border: '1px solid var(--color-border)',
                                    background: 'var(--color-surface-hover)',
                                    color: 'var(--color-text-muted)',
                                    fontSize: '12px',
                                    cursor: 'pointer'
                                }}
                            >
                                Clear
                            </button>
                        )}

                        {/* Export CSV */}
                        <button
                            onClick={exportToCSV}
                            disabled={!reportData || reportData.rows.length === 0}
                            style={{
                                padding: '7px 14px',
                                borderRadius: '6px',
                                border: 'none',
                                background: '#10b981',
                                color: '#fff',
                                fontWeight: 700,
                                fontSize: '12px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                opacity: (!reportData || reportData.rows.length === 0) ? 0.5 : 1
                            }}
                        >
                            <i className='bx bx-download'></i> Export CSV
                        </button>
                    </div>
                </div>
            </Card>

            {/* Error Display */}
            {error && (
                <div style={{ padding: '12px 16px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', fontSize: '13px' }}>
                    <i className='bx bx-error-circle'></i> {error}
                </div>
            )}

            {/* Report Data Table */}
            <Card style={{ padding: '0px', overflow: 'hidden', background: 'var(--color-surface)' }}>
                {loading ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                        <i className='bx bx-loader-alt bx-spin' style={{ fontSize: '28px', color: 'var(--color-primary)' }}></i>
                        <div style={{ marginTop: '8px', fontSize: '13px', fontWeight: 600 }}>Loading report data...</div>
                    </div>
                ) : !reportData || reportData.rows.length === 0 ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                        <i className='bx bx-file-blank' style={{ fontSize: '36px', color: 'var(--color-border)' }}></i>
                        <div style={{ marginTop: '8px', fontSize: '14px', fontWeight: 600 }}>No records found for the selected filters.</div>
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                            <thead>
                                <tr style={{ background: 'var(--color-surface-hover)', borderBottom: '1px solid var(--color-border)', textAlign: 'left', color: 'var(--color-text-muted)' }}>
                                    {Object.keys(reportData.rows[0]).map((col) => (
                                        <th key={col} style={{ padding: '10px 14px', textTransform: 'capitalize', fontWeight: 700 }}>
                                            {col.replace(/_/g, ' ')}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {reportData.rows.map((row, idx) => (
                                    <tr key={idx} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                        {Object.keys(row).map((col) => {
                                            const val = row[col];
                                            const isAmount = col.includes('amount') || col.includes('spend') || col.includes('price') || col.includes('payable') || col.includes('cost') || col.includes('value');
                                            return (
                                                <td key={col} style={{ padding: '10px 14px', color: 'var(--color-text)', fontWeight: isAmount ? 600 : 400 }}>
                                                    {val === null || val === undefined ? '-' : String(val)}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <div style={{ padding: '10px 16px', background: 'var(--color-surface)', borderTop: '1px solid var(--color-border)', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                            Showing {reportData.count} entries.
                        </div>
                    </div>
                )}
            </Card>
        </div>
    );
};
