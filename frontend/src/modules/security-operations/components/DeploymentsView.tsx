import React, { useEffect, useState, useCallback } from 'react';
import { getDeployments, getUndeployedGuards, getSecurityPosts } from '../api';
import type { Deployment, PaginatedResponse, UndeployedGuard, SecurityPost } from '../types';
import { DataTable } from '../../../components/tables/DataTable';
import type { Column } from '../../../components/tables/DataTable';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { ErrorState } from '../../../components/ui/ErrorState';
import { DeploymentModal } from './DeploymentModal';
import { DeploymentTransferModal } from './DeploymentTransferModal';
import { DeploymentRelieveModal } from './DeploymentRelieveModal';
import { DeploymentHistoryModal } from './DeploymentHistoryModal';

const STATUS_VARIANT: Record<string, 'success' | 'danger' | 'default' | 'primary'> = {
    DRAFT: 'default',
    PLANNED: 'primary',
    ACTIVE: 'success',
    COMPLETED: 'default',
    RELIEVED: 'default',
    CANCELLED: 'danger',
};

export const DeploymentsView: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'deployments' | 'undeployed' | 'requirements'>('deployments');

    // Deployments State
    const [page, setPage] = useState(1);
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [data, setData] = useState<PaginatedResponse<Deployment> | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);

    // Undeployed Guards Pool State
    const [undeployedList, setUndeployedList] = useState<UndeployedGuard[]>([]);
    const [undeployedLoading, setUndeployedLoading] = useState(false);
    const [undeployedSearch, setUndeployedSearch] = useState('');
    const [undeployedBgFilter, setUndeployedBgFilter] = useState('');

    // Post Requirements State
    const [postsList, setPostsList] = useState<SecurityPost[]>([]);
    const [postsLoading, setPostsLoading] = useState(false);
    const [postSearch, setPostSearch] = useState('');

    // Modal States
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedDeployment, setSelectedDeployment] = useState<Deployment | null>(null);
    const [modalInitial, setModalInitial] = useState<{ siteId?: string; postId?: string; employeeId?: string }>({});

    // Transfer Modal
    const [isTransferOpen, setIsTransferOpen] = useState(false);
    const [transferId, setTransferId] = useState<string | null>(null);
    const [transferEmpName, setTransferEmpName] = useState<string>('');

    // Relieve Modal
    const [isRelieveOpen, setIsRelieveOpen] = useState(false);
    const [relieveId, setRelieveId] = useState<string | null>(null);
    const [relieveEmpName, setRelieveEmpName] = useState<string>('');

    // History Modal
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [historyEmpId, setHistoryEmpId] = useState<string | null>(null);
    const [historyEmpName, setHistoryEmpName] = useState<string>('');

    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedSearch(searchQuery);
            setPage(1);
        }, 400);
        return () => clearTimeout(handler);
    }, [searchQuery]);

    const fetchDeployments = useCallback(async () => {
        setIsLoading(true);
        setHasError(false);
        try {
            const response = await getDeployments({ page, search: debouncedSearch, status: statusFilter });
            setData(response);
        } catch {
            setHasError(true);
        } finally {
            setIsLoading(false);
        }
    }, [page, debouncedSearch, statusFilter]);

    const fetchUndeployed = useCallback(async () => {
        setUndeployedLoading(true);
        try {
            const res = await getUndeployedGuards({
                search: undeployedSearch,
                background_type: undeployedBgFilter || undefined
            });
            setUndeployedList(res.results || []);
        } catch (err) {
            console.error('Failed to fetch undeployed guards', err);
        } finally {
            setUndeployedLoading(false);
        }
    }, [undeployedSearch, undeployedBgFilter]);

    const fetchPosts = useCallback(async () => {
        setPostsLoading(true);
        try {
            const res = await getSecurityPosts({ is_active: true, page_size: 1000 });
            setPostsList(res.results || (Array.isArray(res) ? res : []));
        } catch (err) {
            console.error('Failed to fetch posts', err);
        } finally {
            setPostsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (activeTab === 'deployments') {
            fetchDeployments();
        } else if (activeTab === 'undeployed') {
            fetchUndeployed();
        } else if (activeTab === 'requirements') {
            fetchPosts();
        }
    }, [activeTab, fetchDeployments, fetchUndeployed, fetchPosts]);

    const handleOpenDeployModal = (opts?: { siteId?: string; postId?: string; employeeId?: string }) => {
        setSelectedDeployment(null);
        setModalInitial(opts || {});
        setIsModalOpen(true);
    };

    const handleRefreshAll = () => {
        if (activeTab === 'deployments') fetchDeployments();
        if (activeTab === 'undeployed') fetchUndeployed();
        if (activeTab === 'requirements') fetchPosts();
    };

    const columns: Column<Deployment>[] = [
        { 
            key: 'employee_name', 
            header: 'Employee', 
            render: (row) => (
                <div>
                    <div style={{ fontWeight: 600 }}>{row.employee_name || '—'}</div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                        {row.employee_code ? `${row.employee_code} • ` : ''}{row.employee_classification || 'DIRECT'}
                    </div>
                </div>
            ) 
        },
        { 
            key: 'site_name', 
            header: 'Site & Post', 
            render: (row) => (
                <div>
                    <div>{row.site_name || '—'}</div>
                    {row.post_name && <div style={{ fontSize: '11px', color: 'var(--color-primary)' }}>Post: {row.post_name}</div>}
                </div>
            ) 
        },
        { key: 'designation_name', header: 'Designation', render: (row) => row.designation_name || '—' },
        { 
            key: 'location_monthly_salary', 
            header: 'Location Salary', 
            render: (row) => row.location_monthly_salary ? (
                <div style={{ fontWeight: 600, color: 'var(--color-text)' }}>
                    PKR {Number(row.location_monthly_salary).toLocaleString()}
                    <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', fontWeight: 400 }}>Monthly base</div>
                </div>
            ) : <span style={{ color: 'var(--color-text-muted)' }}>—</span>
        },
        { 
            key: 'assignment_type', 
            header: 'Type', 
            render: (row) => (
                <Badge variant={row.assignment_type === 'PERMANENT' ? 'primary' : 'default'}>
                    {row.assignment_type || 'PERMANENT'}
                </Badge>
            ) 
        },
        { 
            key: 'start_date', 
            header: 'Period', 
            render: (row) => (
                <div style={{ fontSize: '12px' }}>
                    <div>From: {row.start_date}</div>
                    <div style={{ color: 'var(--color-text-muted)' }}>To: {row.end_date || 'Ongoing'}</div>
                </div>
            ) 
        },
        {
            key: 'status',
            header: 'Status',
            render: (row) => (
                <Badge variant={STATUS_VARIANT[row.status] || 'default'}>
                    {row.status.charAt(0) + row.status.slice(1).toLowerCase()}
                </Badge>
            )
        },
        {
            key: 'actions',
            header: 'Actions',
            render: (row) => (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {row.status === 'ACTIVE' && (
                        <>
                            <button
                                style={{ background: 'none', border: 'none', color: 'var(--color-primary)', fontWeight: 600, cursor: 'pointer', fontSize: '12px' }}
                                onClick={() => {
                                    setTransferId(row.id);
                                    setTransferEmpName(row.employee_name || 'Guard');
                                    setIsTransferOpen(true);
                                }}
                            >
                                Transfer
                            </button>
                            <button
                                style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '12px' }}
                                onClick={() => {
                                    setRelieveId(row.id);
                                    setRelieveEmpName(row.employee_name || 'Guard');
                                    setIsRelieveOpen(true);
                                }}
                            >
                                Relieve
                            </button>
                        </>
                    )}
                    <button
                        style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: '12px' }}
                        onClick={() => {
                            setHistoryEmpId(row.employee);
                            setHistoryEmpName(row.employee_name || 'Employee');
                            setIsHistoryOpen(true);
                        }}
                    >
                        History
                    </button>
                    <button
                        style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: '12px' }}
                        onClick={() => { setSelectedDeployment(row); setModalInitial({}); setIsModalOpen(true); }}
                    >
                        Edit
                    </button>
                </div>
            )
        }
    ];

    if (hasError && !data && activeTab === 'deployments') {
        return <ErrorState message="Failed to load deployments." onRetry={fetchDeployments} />;
    }

    return (
        <div className="view-container">
            {/* Top Navigation Tabs */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid var(--color-border)',
                marginBottom: '16px',
                paddingBottom: '8px',
                flexWrap: 'wrap',
                gap: '12px'
            }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                        onClick={() => setActiveTab('deployments')}
                        style={{
                            padding: '8px 16px',
                            borderRadius: '6px',
                            fontWeight: 600,
                            fontSize: '13px',
                            cursor: 'pointer',
                            border: 'none',
                            backgroundColor: activeTab === 'deployments' ? 'var(--color-primary)' : 'transparent',
                            color: activeTab === 'deployments' ? '#fff' : 'var(--color-text-muted)',
                            transition: 'all 0.2s ease',
                        }}
                    >
                        🛡️ Active Deployments {data ? `(${data.count})` : ''}
                    </button>

                    <button
                        onClick={() => setActiveTab('undeployed')}
                        style={{
                            padding: '8px 16px',
                            borderRadius: '6px',
                            fontWeight: 600,
                            fontSize: '13px',
                            cursor: 'pointer',
                            border: 'none',
                            backgroundColor: activeTab === 'undeployed' ? 'var(--color-primary)' : 'transparent',
                            color: activeTab === 'undeployed' ? '#fff' : 'var(--color-text-muted)',
                            transition: 'all 0.2s ease',
                        }}
                    >
                        👥 Undeployed Guards Pool {undeployedList.length > 0 ? `(${undeployedList.length})` : ''}
                    </button>

                    <button
                        onClick={() => setActiveTab('requirements')}
                        style={{
                            padding: '8px 16px',
                            borderRadius: '6px',
                            fontWeight: 600,
                            fontSize: '13px',
                            cursor: 'pointer',
                            border: 'none',
                            backgroundColor: activeTab === 'requirements' ? 'var(--color-primary)' : 'transparent',
                            color: activeTab === 'requirements' ? '#fff' : 'var(--color-text-muted)',
                            transition: 'all 0.2s ease',
                        }}
                    >
                        📋 Location Posts & Requirements {postsList.length > 0 ? `(${postsList.length})` : ''}
                    </button>
                </div>

                <Button variant="primary" icon="bx-plus" onClick={() => handleOpenDeployModal()}>
                    Deploy Workforce
                </Button>
            </div>

            {/* TAB 1: ACTIVE DEPLOYMENTS */}
            {activeTab === 'deployments' && (
                <>
                    <div className="view-toolbar flex flex-wrap justify-between items-center gap-2 mb-4">
                        <div className="flex gap-2 items-center">
                            <Input
                                placeholder="Search deployments..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                style={{ width: '240px' }}
                            />
                            <select
                                value={statusFilter}
                                onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
                                className="input-base"
                                style={{ width: '150px' }}
                            >
                                <option value="">All Statuses</option>
                                <option value="ACTIVE">Active</option>
                                <option value="RELIEVED">Relieved</option>
                                <option value="PLANNED">Planned</option>
                                <option value="DRAFT">Draft</option>
                                <option value="COMPLETED">Completed</option>
                                <option value="CANCELLED">Cancelled</option>
                            </select>
                        </div>
                    </div>

                    <div className="view-table-container">
                        <DataTable<Deployment>
                            data={data?.results || []}
                            columns={columns}
                            isLoading={isLoading}
                            keyExtractor={(row) => row.id}
                            emptyMessage={searchQuery ? "No deployments match your search." : "No deployments recorded yet."}
                            pagination={data ? {
                                page: page,
                                pageSize: 10,
                                totalItems: data.count,
                                onPageChange: (newPage) => setPage(newPage)
                            } : undefined}
                        />
                    </div>
                </>
            )}

            {/* TAB 2: UNDEPLOYED GUARDS POOL */}
            {activeTab === 'undeployed' && (
                <div>
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '12px',
                        marginBottom: '16px'
                    }}>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <Input
                                placeholder="Search undeployed guard..."
                                value={undeployedSearch}
                                onChange={(e) => setUndeployedSearch(e.target.value)}
                                style={{ width: '240px' }}
                            />
                            <select
                                value={undeployedBgFilter}
                                onChange={e => setUndeployedBgFilter(e.target.value)}
                                className="input-base"
                                style={{ width: '180px' }}
                            >
                                <option value="">All Backgrounds</option>
                                <option value="CIVILIAN">Civil Only</option>
                                <option value="EX_ARMY">Ex-Army Only</option>
                            </select>
                        </div>

                        <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
                            Showing <strong>{undeployedList.length}</strong> active guards ready for deployment
                        </div>
                    </div>

                    <div className="view-table-container" style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid var(--color-border)', textAlign: 'left' }}>
                                    <th style={{ padding: '12px 14px', fontWeight: 600 }}>Guard / Name</th>
                                    <th style={{ padding: '12px 14px', fontWeight: 600 }}>Service Background</th>
                                    <th style={{ padding: '12px 14px', fontWeight: 600 }}>Designation</th>
                                    <th style={{ padding: '12px 14px', fontWeight: 600 }}>Gender</th>
                                    <th style={{ padding: '12px 14px', fontWeight: 600 }}>Status</th>
                                    <th style={{ padding: '12px 14px', fontWeight: 600, textAlign: 'right' }}>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {undeployedLoading && (
                                    <tr>
                                        <td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                                            Loading undeployed pool...
                                        </td>
                                    </tr>
                                )}
                                {!undeployedLoading && undeployedList.length === 0 && (
                                    <tr>
                                        <td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                                            No undeployed guards found matching current filters.
                                        </td>
                                    </tr>
                                )}
                                {!undeployedLoading && undeployedList.map(g => {
                                    const isForces = ['EX_ARMY', 'EX_RANGERS', 'EX_MUJAHID', 'EX_POLICE'].includes(g.background_type);
                                    return (
                                        <tr key={g.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                            <td style={{ padding: '12px 14px' }}>
                                                <div style={{ fontWeight: 600 }}>{g.full_name}</div>
                                                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{g.employee_code}</div>
                                            </td>
                                            <td style={{ padding: '12px 14px' }}>
                                                <span style={{
                                                    display: 'inline-block',
                                                    padding: '2px 8px',
                                                    borderRadius: '4px',
                                                    fontSize: '11px',
                                                    fontWeight: 600,
                                                    backgroundColor: isForces ? 'rgba(59, 130, 246, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                                                    color: isForces ? '#2563eb' : '#059669',
                                                }}>
                                                    {isForces ? '🎖️ Ex-Army' : '🏢 Civil'}
                                                </span>
                                            </td>
                                            <td style={{ padding: '12px 14px' }}>{g.designation_name || 'Security Guard'}</td>
                                            <td style={{ padding: '12px 14px' }}>
                                                {g.gender === 'FEMALE' ? '👩 Female' : '👨 Male'}
                                            </td>
                                            <td style={{ padding: '12px 14px' }}>
                                                <span style={{
                                                    display: 'inline-block',
                                                    padding: '2px 8px',
                                                    borderRadius: '4px',
                                                    fontSize: '11px',
                                                    backgroundColor: 'rgba(16, 185, 129, 0.15)',
                                                    color: '#059669',
                                                    fontWeight: 600
                                                }}>
                                                    Available
                                                </span>
                                            </td>
                                            <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                                                <Button
                                                    variant="secondary"
                                                    size="sm"
                                                    onClick={() => handleOpenDeployModal({ employeeId: g.id })}
                                                >
                                                    🚀 Deploy Guard
                                                </Button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* TAB 3: LOCATION POSTS & REQUIREMENTS */}
            {activeTab === 'requirements' && (
                <div>
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '12px',
                        marginBottom: '16px'
                    }}>
                        <Input
                            placeholder="Filter by post or location name..."
                            value={postSearch}
                            onChange={(e) => setPostSearch(e.target.value)}
                            style={{ width: '280px' }}
                        />
                        <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
                            Posts are automatically synced from CRM Client Locations and Costing Grid.
                        </div>
                    </div>

                    <div className="view-table-container" style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid var(--color-border)', textAlign: 'left' }}>
                                    <th style={{ padding: '12px 14px', fontWeight: 600 }}>Location / Site</th>
                                    <th style={{ padding: '12px 14px', fontWeight: 600 }}>Post Name</th>
                                    <th style={{ padding: '12px 14px', fontWeight: 600 }}>Required Role</th>
                                    <th style={{ padding: '12px 14px', fontWeight: 600 }}>Headcount</th>
                                    <th style={{ padding: '12px 14px', fontWeight: 600 }}>Monthly Pay Rate</th>
                                    <th style={{ padding: '12px 14px', fontWeight: 600, textAlign: 'right' }}>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {postsLoading && (
                                    <tr>
                                        <td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                                            Loading location posts...
                                        </td>
                                    </tr>
                                )}
                                {!postsLoading && postsList.filter(p => {
                                    if (!postSearch) return true;
                                    const q = postSearch.toLowerCase();
                                    return (p.post_name && p.post_name.toLowerCase().includes(q)) ||
                                           (p.site_name && p.site_name.toLowerCase().includes(q)) ||
                                           (p.required_designation_name && p.required_designation_name.toLowerCase().includes(q));
                                }).map(p => {
                                    const deployed = p.deployed_count || 0;
                                    const req = p.required_headcount || 1;
                                    const vacant = p.vacant_count !== undefined ? p.vacant_count : Math.max(0, req - deployed);
                                    const isFilled = deployed >= req;

                                    return (
                                        <tr key={p.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                            <td style={{ padding: '12px 14px' }}>
                                                <div style={{ fontWeight: 600 }}>{p.site_name || 'Operational Site'}</div>
                                            </td>
                                            <td style={{ padding: '12px 14px' }}>
                                                <div style={{ fontWeight: 600 }}>{p.post_name}</div>
                                                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{p.post_code}</div>
                                            </td>
                                            <td style={{ padding: '12px 14px' }}>
                                                <span style={{ fontWeight: 500 }}>{p.required_designation_name || 'Security Guard'}</span>
                                            </td>
                                            <td style={{ padding: '12px 14px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span style={{ fontWeight: 600 }}>{deployed} / {req}</span>
                                                    <span style={{
                                                        padding: '2px 8px',
                                                        borderRadius: '4px',
                                                        fontSize: '11px',
                                                        fontWeight: 600,
                                                        backgroundColor: isFilled ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                                        color: isFilled ? '#059669' : '#dc2626',
                                                    }}>
                                                        {isFilled ? 'Fulfilled' : `${vacant} Vacant`}
                                                    </span>
                                                </div>
                                            </td>
                                            <td style={{ padding: '12px 14px' }}>
                                                {p.monthly_pay_rate ? (
                                                    <div style={{ fontWeight: 600 }}>
                                                        PKR {Number(p.monthly_pay_rate).toLocaleString()}
                                                        <span style={{ fontSize: '11px', fontWeight: 400, color: 'var(--color-text-muted)' }}> /mo</span>
                                                    </div>
                                                ) : <span style={{ color: 'var(--color-text-muted)' }}>—</span>}
                                            </td>
                                            <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                                                <Button
                                                    variant={isFilled ? "secondary" : "primary"}
                                                    size="sm"
                                                    onClick={() => handleOpenDeployModal({ siteId: p.site, postId: p.id })}
                                                >
                                                    {isFilled ? 'Deploy Extra' : '🎯 Deploy to Post'}
                                                </Button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Edit / Create Modal */}
            <DeploymentModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleRefreshAll}
                deployment={selectedDeployment}
                initialSiteId={modalInitial.siteId}
                initialPostId={modalInitial.postId}
                initialEmployeeId={modalInitial.employeeId}
            />

            {/* Transfer Modal */}
            <DeploymentTransferModal
                isOpen={isTransferOpen}
                onClose={() => setIsTransferOpen(false)}
                deploymentId={transferId}
                employeeName={transferEmpName}
                onTransferred={fetchDeployments}
            />

            {/* Relieve Modal */}
            <DeploymentRelieveModal
                isOpen={isRelieveOpen}
                onClose={() => setIsRelieveOpen(false)}
                deploymentId={relieveId}
                employeeName={relieveEmpName}
                onRelieved={fetchDeployments}
            />

            {/* History Modal */}
            <DeploymentHistoryModal
                isOpen={isHistoryOpen}
                onClose={() => setIsHistoryOpen(false)}
                employeeId={historyEmpId}
                employeeName={historyEmpName}
            />
        </div>
    );
};
