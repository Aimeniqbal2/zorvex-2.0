import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { PageHeader } from '../../../layouts/PageLayout';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { DataTable } from '../../../components/tables/DataTable';
import type { Column } from '../../../components/tables/DataTable';
import { useToastStore } from '../../../stores/toastStore';
import { 
    getTemporaryServices, 
    actionTemporaryService, 
    deleteTemporaryService,
    generateTemporaryInvoice 
} from '../api';
import type { TemporaryServiceRequest, PaginatedResponse } from '../types';
import { TemporaryServiceModal } from './TemporaryServiceModal';

interface TemporaryServicesViewProps {
    onNavigateToMuster?: () => void;
}

export const TemporaryServicesView: React.FC<TemporaryServicesViewProps> = ({ onNavigateToMuster }) => {
    const [data, setData] = useState<PaginatedResponse<TemporaryServiceRequest> | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedService, setSelectedService] = useState<TemporaryServiceRequest | null>(null);
    const [page, setPage] = useState(1);
    const [statusFilter, setStatusFilter] = useState<string>('ALL');
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [isDeleting, setIsDeleting] = useState<string | null>(null);
    const [isGeneratingInvoice, setIsGeneratingInvoice] = useState<string | null>(null);

    const loadData = useCallback(async () => {
        try {
            const params: Record<string, any> = { page };
            if (statusFilter !== 'ALL') {
                params.status = statusFilter;
            }
            const res = await getTemporaryServices(params);
            setData(res);
        } catch (error) {
            useToastStore.getState().error('Failed to load temporary services');
        }
    }, [page, statusFilter]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleAction = async (id: string, action: string) => {
        try {
            await actionTemporaryService(id, action);
            useToastStore.getState().success(`Status changed: ${action.replace('_', ' ').toUpperCase()}`);
            loadData();
        } catch (error: any) {
            useToastStore.getState().error(`Failed: ${error.response?.data?.error || error.message}`);
        }
    };

    const handleDelete = async (service: TemporaryServiceRequest) => {
        if (!window.confirm(`Are you sure you want to delete temporary service "${service.reference_number}"? This will also remove associated temporary muster allocations.`)) {
            return;
        }
        setIsDeleting(service.id);
        try {
            await deleteTemporaryService(service.id);
            useToastStore.getState().success(`Service ${service.reference_number} deleted successfully.`);
            loadData();
        } catch (error: any) {
            useToastStore.getState().error(`Failed to delete: ${error.response?.data?.error || error.message}`);
        } finally {
            setIsDeleting(null);
        }
    };

    const handleGenerateInvoice = async (service: TemporaryServiceRequest) => {
        setIsGeneratingInvoice(service.id);
        try {
            const res = await generateTemporaryInvoice(service.id);
            useToastStore.getState().success(`Invoice ${res.invoice_number || 'created'} generated! Total: ₨ ${Number(res.total_amount || 0).toLocaleString()}`);
            loadData();
        } catch (error: any) {
            useToastStore.getState().error(`Invoice generation failed: ${error.response?.data?.error || error.message}`);
        } finally {
            setIsGeneratingInvoice(null);
        }
    };

    const handleEdit = (service: TemporaryServiceRequest) => {
        setSelectedService(service);
        setIsModalOpen(true);
    };

    const handleNew = () => {
        setSelectedService(null);
        setIsModalOpen(true);
    };

    // Filter results locally by search query if needed
    const filteredResults = useMemo(() => {
        if (!data?.results) return [];
        if (!searchQuery.trim()) return data.results;
        const q = searchQuery.toLowerCase();
        return data.results.filter(s => 
            (s.reference_number || '').toLowerCase().includes(q) ||
            (s.title || '').toLowerCase().includes(q) ||
            (s.crm_entity_name || '').toLowerCase().includes(q) ||
            (s.site_name || '').toLowerCase().includes(q) ||
            (s.operational_site_name || '').toLowerCase().includes(q)
        );
    }, [data, searchQuery]);

    // KPI Summary
    const kpiSummary = useMemo(() => {
        const list = data?.results || [];
        const totalGrand = list.reduce((sum, s) => sum + (Number(s.grand_total) || 0), 0);
        const totalManpower = list.reduce((sum, s) => sum + (Number(s.total_manpower_cost) || 0), 0);
        const totalEquip = list.reduce((sum, s) => sum + (Number(s.total_equipment_cost) || 0), 0);
        const activeCount = list.filter(s => ['APPROVED', 'CONFIRMED', 'IN_PROGRESS'].includes(s.status)).length;
        return {
            count: data?.count || list.length,
            activeCount,
            totalGrand,
            totalManpower,
            totalEquip
        };
    }, [data]);

    const getStatusVariant = (st: string): 'default' | 'success' | 'warning' | 'primary' | 'danger' => {
        switch (st) {
            case 'CONFIRMED':
            case 'COMPLETED':
                return 'success';
            case 'APPROVED':
            case 'IN_PROGRESS':
                return 'primary';
            case 'REQUESTED':
                return 'warning';
            case 'CANCELLED':
                return 'danger';
            default:
                return 'default';
        }
    };

    const columns: Column<TemporaryServiceRequest>[] = [
        {
            key: 'reference_number',
            header: 'Service Ref',
            render: (row: TemporaryServiceRequest) => (
                <div>
                    <div style={{ fontWeight: 600, color: 'var(--color-primary, #2563eb)' }}>
                        {row.reference_number}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted, #64748b)' }}>
                        {row.title || 'Temporary Service'}
                    </div>
                </div>
            )
        },
        {
            key: 'customer',
            header: 'Client / Entity',
            render: (row: TemporaryServiceRequest) => (
                <div>
                    <div style={{ fontWeight: 500 }}>{row.crm_entity_name || 'Client'}</div>
                    <span style={{
                        fontSize: '10px',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        backgroundColor: row.billing_type === 'STANDALONE' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                        color: row.billing_type === 'STANDALONE' ? '#2563eb' : '#059669',
                        fontWeight: 600
                    }}>
                        {row.billing_type === 'STANDALONE' ? '⚡ Standalone Event Bill' : '📑 Consolidated Monthly Bill'}
                    </span>
                </div>
            )
        },
        {
            key: 'site',
            header: 'Venue / Site',
            render: (row: TemporaryServiceRequest) => (
                <div>
                    <div style={{ fontWeight: 500 }}>
                        {row.site_name || row.operational_site_name || 'Event Venue'}
                    </div>
                    {row.is_temporary_site && (
                        <span style={{ fontSize: '10px', color: '#b45309', fontWeight: 600 }}>
                            • Temporary Event Site
                        </span>
                    )}
                </div>
            )
        },
        {
            key: 'dates',
            header: 'Service Dates',
            render: (row: TemporaryServiceRequest) => {
                const sDate = row.start_datetime ? new Date(row.start_datetime).toLocaleDateString() : 'N/A';
                const eDate = row.end_datetime ? new Date(row.end_datetime).toLocaleDateString() : 'N/A';
                return (
                    <div style={{ fontSize: '12px' }}>
                        <div>{sDate} - {eDate}</div>
                        <span style={{ fontSize: '11px', color: 'var(--color-text-muted, #64748b)' }}>
                            Active Service Span
                        </span>
                    </div>
                );
            }
        },
        {
            key: 'financials',
            header: 'Commercial Value',
            render: (row: TemporaryServiceRequest) => (
                <div style={{ fontSize: '12px' }}>
                    <div style={{ fontWeight: 700, color: 'var(--color-text, #1e293b)' }}>
                        ₨ {Number(row.grand_total || 0).toLocaleString()}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--color-text-muted, #64748b)' }}>
                        Guards: ₨ {Number(row.total_manpower_cost || 0).toLocaleString()} | Assets: ₨ {Number(row.total_equipment_cost || 0).toLocaleString()}
                    </div>
                </div>
            )
        },
        {
            key: 'status',
            header: 'Status',
            render: (row: TemporaryServiceRequest) => (
                <Badge variant={getStatusVariant(row.status)}>{row.status}</Badge>
            )
        },
        {
            key: 'actions',
            header: 'Actions',
            render: (row: TemporaryServiceRequest) => (
                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                    <Button 
                        variant="ghost" 
                        onClick={() => handleEdit(row)} 
                        title="Edit Details, Requirements & Guard Allocations"
                        style={{ padding: '6px' }}
                    >
                        <i className="bx bx-edit" style={{ fontSize: '16px' }} />
                    </Button>

                    {(row.status === 'DRAFT' || row.status === 'REQUESTED') && (
                        <Button 
                            variant="ghost" 
                            onClick={() => handleAction(row.id, 'approve')} 
                            title="Approve Service Request"
                            style={{ padding: '6px', color: '#16a34a' }}
                        >
                            <i className="bx bx-check" style={{ fontSize: '18px' }} />
                        </Button>
                    )}

                    {row.status === 'APPROVED' && (
                        <Button 
                            variant="ghost" 
                            onClick={() => handleAction(row.id, 'confirm')} 
                            title="Confirm Deployment"
                            style={{ padding: '6px', color: '#2563eb' }}
                        >
                            <i className="bx bx-check-double" style={{ fontSize: '18px' }} />
                        </Button>
                    )}

                    {(row.status === 'CONFIRMED' || row.status === 'IN_PROGRESS') && (
                        <Button 
                            variant="ghost" 
                            onClick={() => handleAction(row.id, 'complete')} 
                            title="Mark Completed"
                            style={{ padding: '6px', color: '#059669' }}
                        >
                            <i className="bx bx-flag" style={{ fontSize: '16px' }} />
                        </Button>
                    )}

                    {['APPROVED', 'CONFIRMED', 'COMPLETED'].includes(row.status) && (
                        <Button 
                            variant="ghost" 
                            onClick={() => handleGenerateInvoice(row)} 
                            title="Generate Client Invoice"
                            disabled={isGeneratingInvoice === row.id}
                            style={{ padding: '6px', color: '#d97706' }}
                        >
                            <i className="bx bx-receipt" style={{ fontSize: '16px' }} />
                        </Button>
                    )}

                    <Button 
                        variant="ghost" 
                        onClick={() => handleDelete(row)} 
                        title="Delete Service"
                        disabled={isDeleting === row.id}
                        style={{ padding: '6px', color: '#ef4444' }}
                    >
                        <i className="bx bx-trash" style={{ fontSize: '16px' }} />
                    </Button>
                </div>
            )
        }
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <PageHeader 
                title="Temporary Security Services"
                subtitle="Specialized short-term security operations, event venue protection, and protocol/equipment deployments."
                actions={
                    <div style={{ display: 'flex', gap: '8px' }}>
                        {onNavigateToMuster && (
                            <Button variant="secondary" onClick={onNavigateToMuster}>
                                <i className="bx bx-spreadsheet" style={{ marginRight: '6px' }} />
                                View in Duty Muster
                            </Button>
                        )}
                        <Button variant="primary" onClick={handleNew}>
                            <i className="bx bx-plus" style={{ marginRight: '6px' }} />
                            Request Service
                        </Button>
                    </div>
                }
            />

            {/* Top Metric Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                <div style={{
                    padding: '14px',
                    borderRadius: '8px',
                    backgroundColor: 'var(--color-surface, #ffffff)',
                    border: '1px solid var(--color-border, #e2e8f0)',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                }}>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted, #64748b)' }}>Active / Confirmed Events</div>
                    <div style={{ fontSize: '20px', fontWeight: 700, marginTop: '4px', color: 'var(--color-primary, #2563eb)' }}>
                        {kpiSummary.activeCount} <span style={{ fontSize: '13px', fontWeight: 400, color: '#64748b' }}>of {kpiSummary.count} total</span>
                    </div>
                </div>

                <div style={{
                    padding: '14px',
                    borderRadius: '8px',
                    backgroundColor: 'var(--color-surface, #ffffff)',
                    border: '1px solid var(--color-border, #e2e8f0)',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                }}>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted, #64748b)' }}>Wing A: Manpower Value</div>
                    <div style={{ fontSize: '20px', fontWeight: 700, marginTop: '4px' }}>
                        ₨ {kpiSummary.totalManpower.toLocaleString()}
                    </div>
                </div>

                <div style={{
                    padding: '14px',
                    borderRadius: '8px',
                    backgroundColor: 'var(--color-surface, #ffffff)',
                    border: '1px solid var(--color-border, #e2e8f0)',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                }}>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted, #64748b)' }}>Wing B: Assets & Protocol</div>
                    <div style={{ fontSize: '20px', fontWeight: 700, marginTop: '4px' }}>
                        ₨ {kpiSummary.totalEquip.toLocaleString()}
                    </div>
                </div>

                <div style={{
                    padding: '14px',
                    borderRadius: '8px',
                    backgroundColor: 'var(--color-surface, #ffffff)',
                    border: '1px solid var(--color-border, #e2e8f0)',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                }}>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted, #64748b)' }}>Grand Commercial Value</div>
                    <div style={{ fontSize: '20px', fontWeight: 800, marginTop: '4px', color: '#16a34a' }}>
                        ₨ {kpiSummary.totalGrand.toLocaleString()}
                    </div>
                </div>
            </div>

            {/* Filter Bar */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '12px',
                padding: '12px',
                borderRadius: '8px',
                backgroundColor: 'var(--color-surface, #ffffff)',
                border: '1px solid var(--color-border, #e2e8f0)'
            }}>
                <div style={{ display: 'flex', gap: '8px', flex: 1 }}>
                    <div style={{ position: 'relative', flex: 1, maxWidth: '350px' }}>
                        <i className="bx bx-search" style={{ position: 'absolute', left: '10px', top: '10px', color: '#94a3b8' }} />
                        <input
                            type="text"
                            placeholder="Search by reference, client, venue..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="input-base"
                            style={{ paddingLeft: '32px', fontSize: '13px' }}
                        />
                    </div>
                    <select
                        value={statusFilter}
                        onChange={e => {
                            setStatusFilter(e.target.value);
                            setPage(1);
                        }}
                        className="input-base"
                        style={{ width: '180px', fontSize: '13px' }}
                    >
                        <option value="ALL">All Statuses</option>
                        <option value="DRAFT">Draft</option>
                        <option value="REQUESTED">Requested</option>
                        <option value="APPROVED">Approved</option>
                        <option value="CONFIRMED">Confirmed</option>
                        <option value="IN_PROGRESS">In Progress</option>
                        <option value="COMPLETED">Completed</option>
                        <option value="CANCELLED">Cancelled</option>
                    </select>
                </div>

                <div style={{ fontSize: '12px', color: 'var(--color-text-muted, #64748b)' }}>
                    Showing <strong>{filteredResults.length}</strong> services
                </div>
            </div>

            {/* Table */}
            <DataTable 
                data={filteredResults}
                columns={columns}
                keyExtractor={(row: TemporaryServiceRequest) => row.id}
                emptyMessage="No temporary services found matching your criteria."
            />

            {data && data.count > (data.results?.length || 0) && (
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: '16px', gap: '8px' }}>
                    <Button 
                        variant="secondary" 
                        disabled={!data.previous} 
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                    >
                        Previous
                    </Button>
                    <span style={{ display: 'flex', alignItems: 'center', fontSize: '13px', padding: '0 8px' }}>
                        Page {page}
                    </span>
                    <Button 
                        variant="secondary" 
                        disabled={!data.next} 
                        onClick={() => setPage(p => p + 1)}
                    >
                        Next
                    </Button>
                </div>
            )}

            {isModalOpen && (
                <TemporaryServiceModal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    onSaved={loadData}
                    service={selectedService}
                />
            )}
        </div>
    );
};
