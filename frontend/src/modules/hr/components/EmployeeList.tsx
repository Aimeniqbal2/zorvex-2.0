import React, { useState, useEffect } from 'react';
import { apiClient } from '../api';
import type { Employee } from '../types';
import { Button } from '../../../components/ui/Button';
import { DataTable, type Column } from '../../../components/tables/DataTable';
import { LoadingState } from '../../../components/ui/LoadingState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { Modal } from '../../../components/ui/Modal';
import { EmployeeModal } from './EmployeeModal';
import { useIndustry, useAppStore } from '../../../stores/appStore';

interface EmployeeListProps {
    isSecurity?: boolean;
}

const EmployeePhotoAvatar: React.FC<{ employee: Employee }> = ({ employee }) => {
    const [imgFailed, setImgFailed] = useState(false);

    const photoUrl = React.useMemo(() => {
        const photo = employee.photograph;
        if (!photo || photo === 'null' || photo === 'undefined' || photo === 'None' || photo === '1') return null;
        if (photo.startsWith('http://') || photo.startsWith('https://') || photo.startsWith('data:')) return photo;
        if (photo.startsWith('/')) return photo;
        return `/media/${photo}`;
    }, [employee.photograph]);

    const initial = (employee.full_name || employee.first_name || employee.last_name || 'G').trim().charAt(0).toUpperCase();

    if (photoUrl && !imgFailed) {
        return (
            <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                overflow: 'hidden',
                border: '1.5px solid var(--color-border)',
                background: 'var(--color-surface-hover, #f1f5f9)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
            }}>
                <img
                    src={photoUrl}
                    alt={employee.first_name || 'Guard'}
                    onError={() => setImgFailed(true)}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
            </div>
        );
    }

    return (
        <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            background: employee.classification === 'DIRECT' ? 'rgba(37, 99, 235, 0.12)' : 'rgba(100, 116, 139, 0.12)',
            color: employee.classification === 'DIRECT' ? 'var(--color-primary, #2563eb)' : 'var(--color-text-muted, #64748b)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: '13px',
            border: '1.5px solid var(--color-border)',
            flexShrink: 0
        }}>
            {initial}
        </div>
    );
};

export const EmployeeList: React.FC<EmployeeListProps> = ({ isSecurity: propIsSecurity }) => {
    const { isSecurity: storeIsSecurity } = useIndustry();
    const isSecurity = propIsSecurity !== undefined ? propIsSecurity : storeIsSecurity;
    const { company } = useAppStore();

    const [employees, setEmployees] = useState<Employee[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
    const [filterTab, setFilterTab] = useState<string>('ALL');
    const [searchField, setSearchField] = useState<string>('ALL');
    const [searchQuery, setSearchQuery] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

    const [totalCount, setTotalCount] = useState<number>(0);
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [pageSize, setPageSize] = useState<number>(100);

    // Import Modal State
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [importFile, setImportFile] = useState<File | null>(null);
    const [importPreview, setImportPreview] = useState<any | null>(null);
    const [importLoading, setImportLoading] = useState(false);
    const [importError, setImportError] = useState<string | null>(null);
    const [importSuccess, setImportSuccess] = useState<any | null>(null);
    const [updateExisting, setUpdateExisting] = useState(false);

    const fetchEmployees = async (page = currentPage, size = pageSize) => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (filterTab === 'DIRECT') params.append('classification', 'DIRECT');
            if (filterTab === 'INDIRECT') params.append('classification', 'INDIRECT');
            if (filterTab === 'JUMP') params.append('employment_status', 'JUMP');
            if (filterTab === 'ACTIVE') params.append('is_active', 'true');
            if (filterTab === 'INACTIVE') params.append('is_active', 'false');
            if (searchQuery.trim()) {
                params.append('search', searchQuery.trim());
                if (searchField !== 'ALL') {
                    params.append('search_field', searchField);
                }
            }
            if (dateFrom) params.append('joining_date_from', dateFrom);
            if (dateTo) params.append('joining_date_to', dateTo);
            params.append('page', String(page));
            params.append('page_size', String(size));

            const res = await apiClient.get(`/api/hrm/employees/?${params.toString()}`);
            if (res.data && res.data.results !== undefined) {
                setEmployees(res.data.results || []);
                setTotalCount(res.data.count || 0);
            } else if (Array.isArray(res.data)) {
                setEmployees(res.data);
                setTotalCount(res.data.length);
            } else {
                setEmployees([]);
                setTotalCount(0);
            }
            setError(null);
        } catch (err: any) {
            setError(err.response?.data?.detail || err.message || 'Failed to load workforce directory');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        setEmployees([]);
        setSelectedEmployee(null);
        setIsModalOpen(false);
        setFilterTab('ALL');
        setSearchQuery('');
        setDateFrom('');
        setDateTo('');
        setCurrentPage(1);
        fetchEmployees(1, pageSize);
    }, [company?.id, isSecurity]);

    const handleTabChange = (tab: string) => {
        setFilterTab(tab);
        setCurrentPage(1);
    };

    useEffect(() => {
        fetchEmployees(1, pageSize);
    }, [filterTab]);

    const handleSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setCurrentPage(1);
        fetchEmployees(1, pageSize);
    };

    const handlePageChange = (newPage: number) => {
        setCurrentPage(newPage);
        fetchEmployees(newPage, pageSize);
    };

    const handlePageSizeChange = (newSize: number) => {
        setPageSize(newSize);
        setCurrentPage(1);
        fetchEmployees(1, newSize);
    };

    const handleExportCSV = () => {
        const params = new URLSearchParams();
        if (filterTab === 'DIRECT') params.append('classification', 'DIRECT');
        if (filterTab === 'INDIRECT') params.append('classification', 'INDIRECT');
        if (filterTab === 'JUMP') params.append('employment_status', 'JUMP');
        if (filterTab === 'ACTIVE') params.append('is_active', 'true');
        if (filterTab === 'INACTIVE') params.append('is_active', 'false');
        if (searchQuery.trim()) {
            params.append('search', searchQuery.trim());
            if (searchField !== 'ALL') {
                params.append('search_field', searchField);
            }
        }
        if (dateFrom) params.append('joining_date_from', dateFrom);
        if (dateTo) params.append('joining_date_to', dateTo);

        window.open(`/api/hrm/employees/export-register/?${params.toString()}`, '_blank');
    };

    // Import Handlers
    const handleDownloadTemplate = () => {
        window.open('/api/hrm/employees/import-template/', '_blank');
    };

    const handlePreviewImport = async () => {
        if (!importFile) {
            alert('Please select a CSV file first');
            return;
        }
        setImportLoading(true);
        setImportError(null);
        setImportSuccess(null);
        try {
            const fd = new FormData();
            fd.append('file', importFile);
            const res = await apiClient.post('/api/hrm/employees/import-preview/', fd, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            setImportPreview(res.data);
        } catch (e: any) {
            setImportError(e.response?.data?.error || 'Failed to parse import preview');
        } finally {
            setImportLoading(false);
        }
    };

    const handleExecuteImport = async () => {
        if (!importFile) return;
        setImportLoading(true);
        setImportError(null);
        try {
            const fd = new FormData();
            fd.append('file', importFile);
            fd.append('update_existing', String(updateExisting));
            const res = await apiClient.post('/api/hrm/employees/import-execute/', fd, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            setImportSuccess(res.data);
            setImportPreview(null);
            setCurrentPage(1);
            fetchEmployees(1, pageSize);
        } catch (e: any) {
            setImportError(e.response?.data?.error || 'Failed to execute import');
        } finally {
            setImportLoading(false);
        }
    };

    const columns: Column<Employee>[] = [
        {
            key: 'photo',
            header: 'Photo',
            width: '56px',
            align: 'center',
            render: (e: Employee) => <EmployeePhotoAvatar employee={e} />
        },
        { 
            key: 'employee_code', 
            header: 'Code', 
            width: '85px',
            render: (e: Employee) => (
                <strong style={{ color: 'var(--color-primary)', fontFamily: 'monospace', fontSize: '13px' }}>
                    {e.previous_employee_code || e.employee_code || '—'}
                </strong>
            ) 
        },
        { 
            key: 'joining_date', 
            header: 'Enrolled', 
            width: '95px',
            render: (e: Employee) => (
                <span style={{ fontSize: '12px' }}>
                    {e.joining_date || e.hire_date || '—'}
                </span>
            ) 
        },
        { 
            key: 'Name', 
            header: 'Full Name',  
            minWidth: '150px',
            render: (e: Employee) => (
                <div>
                    <div style={{ fontWeight: 600 }}>{e.full_name || `${e.first_name} ${e.last_name}`}</div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{e.cnic_number || 'No CNIC'}</div>
                </div>
            ) 
        },
        { 
            key: 'father_name', 
            header: 'Father / Husband', 
            minWidth: '135px',
            render: (e: Employee) => e.father_name || '—' 
        },
        { 
            key: 'Classification', 
            header: 'Type',  
            width: '105px',
            render: (e: Employee) => (
                <span className={`badge ${e.classification === 'DIRECT' ? 'badge-primary' : 'badge-secondary'}`} style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '4px' }}>
                    {e.classification === 'DIRECT' ? 'Direct (Guard)' : 'Indirect (Staff)'}
                </span>
            ) 
        },
        { key: 'Designation', header: 'Designation', minWidth: '110px', render: (e: Employee) => e.designation_name || '—' },
        { key: 'Department', header: 'Department / Site', minWidth: '130px', render: (e: Employee) => e.department_name || '—' },
        { key: 'Phone', header: 'Contact', width: '115px', render: (e: Employee) => e.phone || e.telephone_number || '—' },
        { 
            key: 'Status', 
            header: 'Status',  
            width: '85px',
            align: 'center',
            render: (e: Employee) => {
                let badgeClass = 'badge-success';
                if (e.employment_status === 'SUSPENDED' || e.employment_status === 'JUMP') badgeClass = 'badge-warning';
                if (e.employment_status === 'TERMINATED' || e.employment_status === 'RESIGNED') badgeClass = 'badge-danger';
                return (
                    <span className={`badge ${badgeClass}`} style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '4px' }}>
                        {e.employment_status || (e.is_active ? 'ACTIVE' : 'INACTIVE')}
                    </span>
                );
            } 
        },
        { 
            key: 'actions', 
            header: 'Action',
            width: '115px',
            align: 'center',
            sticky: 'right',
            render: (e: Employee) => (
                <button 
                    type="button"
                    className="btn-action-edit"
                    onClick={(evt) => { 
                        evt.stopPropagation(); 
                        setSelectedEmployee(e); 
                        setIsModalOpen(true); 
                    }}
                    title="View & Edit Employee Profile"
                >
                    <i className="bx bx-edit-alt" style={{ fontSize: '13.5px' }}></i>
                    <span>View / Edit</span>
                </button>
            )
        }
    ];

    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const startIndex = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
    const endIndex = Math.min(totalCount, currentPage * pageSize);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Header with Search, Filter & Actions */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>
                        {isSecurity ? 'One Security Workforce Register' : 'Employee Register'}
                    </h2>
                    <p style={{ margin: '2px 0 0', fontSize: '12.5px', color: 'var(--color-text-muted)' }}>
                        {totalCount > 0 ? `Showing ${startIndex}–${endIndex} of ${totalCount} employees` : '0 employees found'} • Preserves legacy codes with leading zeros (e.g. 000014)
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <Button variant="secondary" size="sm" onClick={() => fetchEmployees(currentPage, pageSize)}>
                        <i className="bx bx-refresh"></i> Refresh
                    </Button>
                    <Button variant="secondary" size="sm" onClick={handleExportCSV}>
                        <i className="bx bx-download"></i> Export CSV
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => setIsImportModalOpen(true)}>
                        <i className="bx bx-import"></i> Import Legacy Data
                    </Button>
                    <Button variant="primary" size="sm" onClick={() => { setSelectedEmployee(null); setIsModalOpen(true); }}>
                        <i className="bx bx-user-plus"></i> {isSecurity ? 'Register Guard / Staff' : 'Add Employee'}
                    </Button>
                </div>
            </div>

            {/* Filter Bar */}
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', background: 'var(--color-surface)', padding: '10px 14px', borderRadius: '6px', border: '1px solid var(--color-border)' }}>
                {/* Tabs */}
                <div style={{ display: 'flex', gap: '4px' }}>
                    {['ALL', 'DIRECT', 'INDIRECT', 'ACTIVE', 'INACTIVE', ...(isSecurity ? ['JUMP'] : [])].map(t => (
                        <button
                            key={t}
                            onClick={() => handleTabChange(t)}
                            style={{
                                padding: '5px 10px',
                                borderRadius: '4px',
                                border: 'none',
                                cursor: 'pointer',
                                fontSize: '12px',
                                fontWeight: filterTab === t ? 600 : 400,
                                background: filterTab === t ? 'var(--color-primary)' : 'transparent',
                                color: filterTab === t ? '#fff' : 'var(--color-text)'
                            }}
                        >
                            {t}
                        </button>
                    ))}
                </div>

                <div style={{ width: '1px', height: '24px', background: 'var(--color-border)', margin: '0 4px' }}></div>

                {/* Search Form */}
                <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '8px', flex: 1, minWidth: '260px' }}>
                    <select
                        value={searchField}
                        onChange={(e) => setSearchField(e.target.value)}
                        style={{ padding: '0 8px', height: '32px', borderRadius: '4px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', fontSize: '12px' }}
                    >
                        <option value="ALL">All Fields</option>
                        <option value="NAME">Name</option>
                        <option value="CODE">Employee Code</option>
                        <option value="CNIC">CNIC</option>
                        <option value="PHONE">Phone</option>
                    </select>
                    <input
                        type="text"
                        placeholder="Search by name, code, CNIC, caste..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{ flex: 1, padding: '0 10px', height: '32px', borderRadius: '4px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', fontSize: '12.5px' }}
                    />
                    <Button type="submit" variant="secondary" size="sm">Search</Button>
                </form>

                {/* Enrollment Date Range */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                    <span style={{ color: 'var(--color-text-muted)' }}>Enrolled:</span>
                    <input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        style={{ height: '32px', padding: '0 6px', borderRadius: '4px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', fontSize: '11.5px' }}
                    />
                    <span style={{ color: 'var(--color-text-muted)' }}>to</span>
                    <input
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        style={{ height: '32px', padding: '0 6px', borderRadius: '4px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', fontSize: '11.5px' }}
                    />
                    {(dateFrom || dateTo) && (
                        <button type="button" onClick={() => { setDateFrom(''); setDateTo(''); setCurrentPage(1); fetchEmployees(1, pageSize); }} style={{ background: 'none', border: 'none', color: 'var(--color-danger)', cursor: 'pointer', fontSize: '14px' }}>✕</button>
                    )}
                </div>
            </div>

            {/* Employee Table */}
            {loading ? (
                <LoadingState message="Loading workforce records..." />
            ) : error ? (
                <ErrorState message={error} onRetry={() => fetchEmployees(currentPage, pageSize)} />
            ) : (
                <>
                    <DataTable<Employee>
                        columns={columns}
                        data={employees}
                        keyExtractor={(e) => e.id}
                        emptyMessage="No employees found matching the current filters."
                        onRowClick={(e) => {
                            setSelectedEmployee(e);
                            setIsModalOpen(true);
                        }}
                    />

                    {/* Pagination Controls */}
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '12px',
                        padding: '12px 16px',
                        background: 'var(--color-surface)',
                        borderRadius: '6px',
                        border: '1px solid var(--color-border)',
                        fontSize: '12.5px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span>Rows per page:</span>
                            <select
                                value={pageSize}
                                onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                                style={{
                                    height: '30px',
                                    padding: '0 8px',
                                    borderRadius: '4px',
                                    border: '1px solid var(--color-border)',
                                    background: 'var(--color-surface)',
                                    color: 'var(--color-text)',
                                    fontSize: '12px',
                                    fontWeight: 500
                                }}
                            >
                                <option value={25}>25</option>
                                <option value={50}>50</option>
                                <option value={100}>100</option>
                                <option value={250}>250</option>
                                <option value={500}>500</option>
                                <option value={1000}>1000 (All)</option>
                            </select>
                            <span style={{ color: 'var(--color-text-muted)', marginLeft: '6px' }}>
                                {totalCount > 0 ? `Showing ${startIndex}–${endIndex} of ${totalCount} records` : 'No records'}
                            </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Button
                                variant="secondary"
                                size="sm"
                                disabled={currentPage <= 1 || loading}
                                onClick={() => handlePageChange(1)}
                                title="First Page"
                            >
                                <i className="bx bx-chevrons-left"></i>
                            </Button>
                            <Button
                                variant="secondary"
                                size="sm"
                                disabled={currentPage <= 1 || loading}
                                onClick={() => handlePageChange(currentPage - 1)}
                                title="Previous Page"
                            >
                                <i className="bx bx-chevron-left"></i> Prev
                            </Button>

                            <span style={{ padding: '0 10px', fontWeight: 600, color: 'var(--color-text)' }}>
                                Page {currentPage} of {totalPages}
                            </span>

                            <Button
                                variant="secondary"
                                size="sm"
                                disabled={currentPage >= totalPages || loading}
                                onClick={() => handlePageChange(currentPage + 1)}
                                title="Next Page"
                            >
                                Next <i className="bx bx-chevron-right"></i>
                            </Button>
                            <Button
                                variant="secondary"
                                size="sm"
                                disabled={currentPage >= totalPages || loading}
                                onClick={() => handlePageChange(totalPages)}
                                title="Last Page"
                            >
                                <i className="bx bx-chevrons-right"></i>
                            </Button>
                        </div>
                    </div>
                </>
            )}

            {/* Employee Registration / Edit Modal */}
            <EmployeeModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                employee={selectedEmployee}
                onSave={() => fetchEmployees(currentPage, pageSize)}
                isSecurity={isSecurity}
            />

            {/* Legacy Data Migration Modal */}
            <Modal
                isOpen={isImportModalOpen}
                onClose={() => setIsImportModalOpen(false)}
                width="840px"
                title="Legacy HRIS Data Migration — One Security Importer"
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ padding: '12px', background: 'var(--color-surface-hover, #f8fafc)', borderRadius: '6px', fontSize: '13px', lineHeight: 1.5 }}>
                        <strong>Safe Multi-Tenant Importer:</strong> Import legacy employee records from CSV.
                        Leading zeros in codes (e.g. <code>000014</code>) are preserved. Duplicate checks prevent double-creation.
                    </div>

                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <Button variant="secondary" size="sm" onClick={handleDownloadTemplate}>
                            <i className="bx bx-download"></i> Download CSV Template
                        </Button>
                        <input
                            type="file"
                            accept=".csv"
                            onChange={(e) => {
                                if (e.target.files && e.target.files[0]) {
                                    setImportFile(e.target.files[0]);
                                }
                            }}
                            style={{ fontSize: '12.5px' }}
                        />
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={handlePreviewImport}
                            disabled={!importFile || importLoading}
                            loading={importLoading}
                        >
                            Preview & Validate
                        </Button>
                    </div>

                    {importError && (
                        <div style={{ color: 'var(--color-danger)', padding: '10px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '4px', fontSize: '13px' }}>
                            {importError}
                        </div>
                    )}

                    {importSuccess && (
                        <div style={{ color: '#10b981', padding: '12px', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '4px', fontSize: '13px' }}>
                            <strong>Import Complete!</strong> Processed: {importSuccess.total_processed} | Created: {importSuccess.created} | Updated: {importSuccess.updated} | Skipped: {importSuccess.skipped}
                        </div>
                    )}

                    {/* Preview Table */}
                    {importPreview && (
                        <div>
                            <div style={{ display: 'flex', gap: '16px', padding: '10px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '6px', fontSize: '12.5px', marginBottom: '10px' }}>
                                <div>Total Rows: <strong>{importPreview.total_rows}</strong></div>
                                <div>Valid: <strong style={{ color: '#10b981' }}>{importPreview.valid_rows}</strong></div>
                                <div>Existing: <strong style={{ color: '#f59e0b' }}>{importPreview.existing_rows}</strong></div>
                                <div>Invalid: <strong style={{ color: '#ef4444' }}>{importPreview.invalid_rows}</strong></div>
                            </div>

                            <div style={{ maxHeight: '280px', overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: '4px' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                    <thead>
                                        <tr style={{ background: 'var(--color-surface-hover, #f1f5f9)', borderBottom: '1px solid var(--color-border)', textAlign: 'left' }}>
                                            <th style={{ padding: '6px 8px' }}>#</th>
                                            <th style={{ padding: '6px 8px' }}>Legacy Code</th>
                                            <th style={{ padding: '6px 8px' }}>Full Name</th>
                                            <th style={{ padding: '6px 8px' }}>CNIC</th>
                                            <th style={{ padding: '6px 8px' }}>Status</th>
                                            <th style={{ padding: '6px 8px' }}>Notes</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {importPreview.preview?.map((p: any) => (
                                            <tr key={p.row_number} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                                <td style={{ padding: '6px 8px' }}>{p.row_number}</td>
                                                <td style={{ padding: '6px 8px', fontWeight: 600, color: 'var(--color-primary)' }}>{p.legacy_code}</td>
                                                <td style={{ padding: '6px 8px' }}>{p.full_name}</td>
                                                <td style={{ padding: '6px 8px' }}>{p.cnic || '—'}</td>
                                                <td style={{ padding: '6px 8px' }}>
                                                    <span style={{
                                                        padding: '2px 6px',
                                                        borderRadius: '3px',
                                                        fontSize: '10.5px',
                                                        fontWeight: 600,
                                                        background: p.status === 'VALID' ? 'rgba(16, 185, 129, 0.15)' : p.status === 'EXISTING' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                                        color: p.status === 'VALID' ? '#10b981' : p.status === 'EXISTING' ? '#f59e0b' : '#ef4444'
                                                    }}>
                                                        {p.status}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '6px 8px', color: p.errors?.length ? '#ef4444' : 'var(--color-text-muted)' }}>
                                                    {p.errors?.join(', ') || 'OK'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={updateExisting}
                                        onChange={(e) => setUpdateExisting(e.target.checked)}
                                    />
                                    Update existing employee records if code or CNIC matches
                                </label>
                                <Button
                                    variant="primary"
                                    onClick={handleExecuteImport}
                                    loading={importLoading}
                                    disabled={importPreview.valid_rows === 0 && !updateExisting}
                                >
                                    Execute Import ({importPreview.valid_rows} records)
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </Modal>
        </div>
    );
};
