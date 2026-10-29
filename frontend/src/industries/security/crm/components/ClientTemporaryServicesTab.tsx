import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '../../../../components/ui/Button';
import { Input } from '../../../../components/ui/Input';
import { Badge } from '../../../../components/ui/Badge';
import { Modal } from '../../../../components/ui/Modal';
import { useToastStore } from '../../../../stores/toastStore';
import { apiClient } from '../../../../api/client';
import { deleteTemporaryService, generateTemporaryInvoice } from '../../../../modules/security-operations/api';
import type { TemporaryServiceRequest, TemporaryServiceStatus } from '../../../../modules/security-operations/types';
import { TemporaryServiceModal } from '../../../../modules/security-operations/components/TemporaryServiceModal';
import type { ClientLocation } from '../api';

interface ClientTemporaryServicesTabProps {
    customerId: string;
    customerName: string;
    locations: ClientLocation[];
    initialLocationFilter?: string | null;
}

export const ClientTemporaryServicesTab: React.FC<ClientTemporaryServicesTabProps> = ({
    customerId,
    customerName,
    locations,
    initialLocationFilter
}) => {
    const { addToast } = useToastStore();

    const [services, setServices] = useState<TemporaryServiceRequest[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('ALL');
    const [selectedLocationId, setSelectedLocationId] = useState<string>(initialLocationFilter || 'ALL');

    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingService, setEditingService] = useState<TemporaryServiceRequest | null>(null);
    const [modalScenario, setModalScenario] = useState<'existing_site' | 'new_venue' | 'new_client'>('existing_site');

    // Generating invoice state
    const [generatingInvoiceId, setGeneratingInvoiceId] = useState<string | null>(null);

    // Delete confirmation state
    const [deletingService, setDeletingService] = useState<TemporaryServiceRequest | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const loadServices = useCallback(async () => {
        try {
            setIsLoading(true);
            let url = `/api/operations/temporary-services/?crm_entity=${customerId}`;
            if (selectedLocationId && selectedLocationId !== 'ALL') {
                url += `&operational_site=${selectedLocationId}`;
            }
            const res = await apiClient.get(url);
            setServices(res.data.results || res.data || []);
        } catch (err: any) {
            console.error('Failed to load temporary services', err);
            addToast('error', 'Failed to load temporary security services.');
        } finally {
            setIsLoading(false);
        }
    }, [customerId, selectedLocationId, addToast]);

    useEffect(() => {
        loadServices();
    }, [loadServices]);

    // Filtered services
    const filteredServices = useMemo(() => {
        return services.filter(svc => {
            const matchesStatus = statusFilter === 'ALL' || svc.status === statusFilter;
            const matchesSearch = !search || 
                (svc.reference_number && svc.reference_number.toLowerCase().includes(search.toLowerCase())) ||
                (svc.title && svc.title.toLowerCase().includes(search.toLowerCase())) ||
                (svc.site_name && svc.site_name.toLowerCase().includes(search.toLowerCase()));
            return matchesStatus && matchesSearch;
        });
    }, [services, statusFilter, search]);

    // KPI Rollup
    const kpis = useMemo(() => {
        let totalManpower = 0;
        let totalEquipment = 0;
        let grandTotal = 0;
        let activeCount = 0;

        services.forEach(svc => {
            if (svc.status !== 'CANCELLED') {
                totalManpower += Number(svc.total_manpower_cost || 0);
                totalEquipment += Number(svc.total_equipment_cost || 0);
                grandTotal += Number(svc.grand_total || 0);
                if (['REQUESTED', 'APPROVED', 'CONFIRMED', 'IN_PROGRESS'].includes(svc.status)) {
                    activeCount++;
                }
            }
        });

        return { totalManpower, totalEquipment, grandTotal, activeCount };
    }, [services]);

    const handleCreateNew = (scenario: 'existing_site' | 'new_venue' = 'existing_site') => {
        setEditingService(null);
        setModalScenario(scenario);
        setIsModalOpen(true);
    };

    const handleEdit = (svc: TemporaryServiceRequest) => {
        setEditingService(svc);
        setIsModalOpen(true);
    };

    const handleDeleteConfirm = async () => {
        if (!deletingService) return;
        setIsDeleting(true);
        try {
            await deleteTemporaryService(deletingService.id);
            addToast('success', `Temporary Service ${deletingService.reference_number} deleted successfully.`);
            setDeletingService(null);
            await loadServices();
        } catch (err: any) {
            addToast('error', err?.response?.data?.error || 'Failed to delete service.');
        } finally {
            setIsDeleting(false);
        }
    };

    const handleGenerateInvoice = async (svc: TemporaryServiceRequest) => {
        try {
            setGeneratingInvoiceId(svc.id);
            const res = await generateTemporaryInvoice(svc.id);
            addToast('success', `Invoice ${res.invoice_number} generated! Amount: ₨ ${Number(res.total_amount || 0).toLocaleString()}`);
            await loadServices();
        } catch (err: any) {
            addToast('error', err?.response?.data?.error || 'Failed to generate invoice.');
        } finally {
            setGeneratingInvoiceId(null);
        }
    };

    const getStatusBadge = (status: TemporaryServiceStatus) => {
        switch (status) {
            case 'APPROVED':
            case 'CONFIRMED':
                return <Badge variant="success">{status}</Badge>;
            case 'IN_PROGRESS':
                return <Badge variant="primary">IN PROGRESS</Badge>;
            case 'COMPLETED':
                return <Badge variant="default">COMPLETED</Badge>;
            case 'CANCELLED':
                return <Badge variant="danger">CANCELLED</Badge>;
            default:
                return <Badge variant="warning">{status}</Badge>;
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* 4-KPI Commercial Metric Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '14px' }}>
                <div style={{
                    background: 'var(--color-surface, #ffffff)',
                    padding: '16px 20px',
                    borderRadius: '10px',
                    border: '1px solid var(--color-border, #e2e8f0)',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                }}>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted, #64748b)', fontWeight: 600, textTransform: 'uppercase' }}>Active Events</div>
                    <div style={{ fontSize: '20px', fontWeight: 800, marginTop: '4px', color: 'var(--color-primary, #2563eb)' }}>
                        {kpis.activeCount} <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text-muted)' }}>/ {services.length} Total</span>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '4px' }}>Temporary events for {customerName}</div>
                </div>

                <div style={{
                    background: 'var(--color-surface, #ffffff)',
                    padding: '16px 20px',
                    borderRadius: '10px',
                    border: '1px solid var(--color-border, #e2e8f0)',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                }}>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted, #64748b)', fontWeight: 600, textTransform: 'uppercase' }}>Wing A: Manpower Billed</div>
                    <div style={{ fontSize: '20px', fontWeight: 800, marginTop: '4px' }}>
                        ₨ {kpis.totalManpower.toLocaleString()}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '4px' }}>Temporary guards & supervisors</div>
                </div>

                <div style={{
                    background: 'var(--color-surface, #ffffff)',
                    padding: '16px 20px',
                    borderRadius: '10px',
                    border: '1px solid var(--color-border, #e2e8f0)',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                }}>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted, #64748b)', fontWeight: 600, textTransform: 'uppercase' }}>Wing B: Assets & Fleet Billed</div>
                    <div style={{ fontSize: '20px', fontWeight: 800, marginTop: '4px' }}>
                        ₨ {kpis.totalEquipment.toLocaleString()}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '4px' }}>Scanners, gates & escort vehicles</div>
                </div>

                <div style={{
                    background: 'var(--color-surface, #ffffff)',
                    padding: '16px 20px',
                    borderRadius: '10px',
                    border: '1px solid var(--color-border, #e2e8f0)',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                }}>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted, #64748b)', fontWeight: 600, textTransform: 'uppercase' }}>Grand Commercial Total</div>
                    <div style={{ fontSize: '20px', fontWeight: 800, marginTop: '4px', color: '#16a34a' }}>
                        ₨ {kpis.grandTotal.toLocaleString()}
                    </div>
                    <div style={{ fontSize: '11px', color: '#16a34a', marginTop: '4px' }}>Combined billing across all events</div>
                </div>
            </div>

            {/* Main Action & Filter Toolbar */}
            <div style={{
                background: 'var(--color-surface, #ffffff)',
                padding: '16px 20px',
                borderRadius: '12px',
                border: '1px solid var(--color-border, #e2e8f0)',
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '14px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    <div style={{ width: '240px' }}>
                        <Input
                            placeholder="Search by ref, title, venue..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>

                    <select
                        value={selectedLocationId}
                        onChange={(e) => setSelectedLocationId(e.target.value)}
                        style={{
                            padding: '8px 12px',
                            borderRadius: '6px',
                            border: '1px solid var(--color-border, #cbd5e1)',
                            fontSize: '13px',
                            background: 'var(--color-background, #ffffff)',
                            color: 'var(--color-text, #0f172a)'
                        }}
                    >
                        <option value="ALL">All Deployment Locations</option>
                        {locations.map(loc => (
                            <option key={loc.id} value={loc.id}>{loc.name}</option>
                        ))}
                    </select>

                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        style={{
                            padding: '8px 12px',
                            borderRadius: '6px',
                            border: '1px solid var(--color-border, #cbd5e1)',
                            fontSize: '13px',
                            background: 'var(--color-background, #ffffff)',
                            color: 'var(--color-text, #0f172a)'
                        }}
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

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Button 
                        variant="secondary"
                        onClick={() => handleCreateNew('new_venue')}
                        style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                        <i className="bx bx-map-pin"></i> + Event at New Venue
                    </Button>
                    <Button 
                        variant="primary"
                        onClick={() => handleCreateNew('existing_site')}
                        style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                        <i className="bx bx-plus"></i> + Add Temporary Service
                    </Button>
                </div>
            </div>

            {/* Temporary Services Table */}
            <div style={{
                background: 'var(--color-surface, #ffffff)',
                borderRadius: '12px',
                border: '1px solid var(--color-border, #e2e8f0)',
                overflow: 'hidden'
            }}>
                <div style={{
                    padding: '14px 20px',
                    borderBottom: '1px solid var(--color-border, #e2e8f0)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                }}>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '14.5px', fontWeight: 700 }}>
                            Temporary Services & Event Bookings
                        </h3>
                        <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                            Commercial proposals, equipment rental, and guard requirements. Automatically synced to Operations Duty Muster.
                        </p>
                    </div>
                    <Badge variant="primary">{filteredServices.length} Records</Badge>
                </div>

                {isLoading ? (
                    <div style={{ padding: '40px', textAlign: 'center' }}>
                        <i className="bx bx-loader-alt bx-spin" style={{ fontSize: '28px', color: 'var(--color-primary)' }} />
                        <p style={{ marginTop: '8px', fontSize: '13px' }}>Loading temporary services...</p>
                    </div>
                ) : filteredServices.length === 0 ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                        <i className="bx bx-calendar-event" style={{ fontSize: '42px', color: '#94a3b8' }} />
                        <h4 style={{ margin: '8px 0 4px 0', fontWeight: 600 }}>No Temporary Services Found</h4>
                        <p style={{ fontSize: '12.5px', margin: '0 auto 14px auto', maxWidth: '400px' }}>
                            No temporary events recorded for {customerName} matching the filter. Click below to create a service.
                        </p>
                        <Button variant="primary" size="sm" onClick={() => handleCreateNew('existing_site')}>
                            <i className="bx bx-plus"></i> Create Temporary Service
                        </Button>
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                            <thead>
                                <tr style={{ background: 'var(--color-surface-subtle, #f8fafc)', borderBottom: '1px solid var(--color-border, #e2e8f0)', textAlign: 'left' }}>
                                    <th style={{ padding: '10px 14px', fontWeight: 700 }}>Reference</th>
                                    <th style={{ padding: '10px 14px', fontWeight: 700 }}>Event Title & Venue</th>
                                    <th style={{ padding: '10px 14px', fontWeight: 700 }}>Dates & Duration</th>
                                    <th style={{ padding: '10px 14px', fontWeight: 700 }}>Wing A: Manpower</th>
                                    <th style={{ padding: '10px 14px', fontWeight: 700 }}>Wing B: Assets</th>
                                    <th style={{ padding: '10px 14px', fontWeight: 700 }}>Billing Mode</th>
                                    <th style={{ padding: '10px 14px', fontWeight: 700, textAlign: 'right' }}>Total (₨)</th>
                                    <th style={{ padding: '10px 14px', fontWeight: 700 }}>Status</th>
                                    <th style={{ padding: '10px 14px', fontWeight: 700, textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredServices.map((svc, idx) => {
                                    const sDate = svc.start_datetime ? new Date(svc.start_datetime).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
                                    const eDate = svc.end_datetime ? new Date(svc.end_datetime).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
                                    
                                    const manpowerLines = svc.lines?.filter(l => l.line_type === 'MANPOWER') || [];
                                    const equipLines = svc.lines?.filter(l => l.line_type !== 'MANPOWER') || [];

                                    return (
                                        <tr key={svc.id} style={{ borderBottom: '1px solid var(--color-border, #e2e8f0)', backgroundColor: idx % 2 === 0 ? 'transparent' : 'var(--color-surface-subtle, #f8fafc)' }}>
                                            <td style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--color-primary, #2563eb)' }}>
                                                {svc.reference_number}
                                            </td>
                                            <td style={{ padding: '10px 14px' }}>
                                                <div style={{ fontWeight: 600 }}>{svc.title || 'Security Service'}</div>
                                                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                                                    <i className="bx bx-map-pin" style={{ color: '#0284c7' }} />
                                                    <span>{svc.site_name || 'Event Site'}</span>
                                                    {svc.is_temporary_site && (
                                                        <span style={{ color: '#d97706', fontWeight: 600 }}>(Temporary Venue)</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                                                <div>{sDate} – {eDate}</div>
                                                <span style={{ fontSize: '11px', color: '#16a34a', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                    <i className="bx bx-check-circle" /> Synced to Muster
                                                </span>
                                            </td>
                                            <td style={{ padding: '10px 14px' }}>
                                                {manpowerLines.length === 0 ? (
                                                    <span style={{ color: 'var(--color-text-muted)' }}>None</span>
                                                ) : (
                                                    <div>
                                                        <span style={{ fontWeight: 600 }}>{manpowerLines.reduce((acc, l) => acc + (l.required_headcount || 1), 0)} Guards</span>
                                                        <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>₨ {Number(svc.total_manpower_cost || 0).toLocaleString()}</div>
                                                    </div>
                                                )}
                                            </td>
                                            <td style={{ padding: '10px 14px' }}>
                                                {equipLines.length === 0 ? (
                                                    <span style={{ color: 'var(--color-text-muted)' }}>None</span>
                                                ) : (
                                                    <div>
                                                        <span style={{ fontWeight: 600 }}>{equipLines.length} Item(s)</span>
                                                        <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>₨ {Number(svc.total_equipment_cost || 0).toLocaleString()}</div>
                                                    </div>
                                                )}
                                            </td>
                                            <td style={{ padding: '10px 14px' }}>
                                                <span style={{
                                                    fontSize: '11px',
                                                    padding: '2px 8px',
                                                    borderRadius: '4px',
                                                    fontWeight: 600,
                                                    backgroundColor: svc.billing_type === 'STANDALONE' ? 'rgba(59, 130, 246, 0.12)' : 'rgba(16, 185, 129, 0.12)',
                                                    color: svc.billing_type === 'STANDALONE' ? '#1d4ed8' : '#047857'
                                                }}>
                                                    {svc.billing_type === 'STANDALONE' ? '⚡ Standalone' : '📑 Consolidated'}
                                                </span>
                                            </td>
                                            <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, color: 'var(--color-text)' }}>
                                                ₨ {Number(svc.grand_total || 0).toLocaleString()}
                                            </td>
                                            <td style={{ padding: '10px 14px' }}>
                                                {getStatusBadge(svc.status)}
                                            </td>
                                            <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                                                <div style={{ display: 'inline-flex', gap: '6px' }}>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        title="Generate Invoice"
                                                        style={{ color: '#b45309' }}
                                                        disabled={generatingInvoiceId === svc.id}
                                                        onClick={() => handleGenerateInvoice(svc)}
                                                    >
                                                        <i className="bx bx-receipt" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        title="Edit Service"
                                                        onClick={() => handleEdit(svc)}
                                                    >
                                                        <i className="bx bx-edit" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        title="Delete Service"
                                                        style={{ color: '#ef4444' }}
                                                        onClick={() => setDeletingService(svc)}
                                                    >
                                                        <i className="bx bx-trash" />
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Temporary Service Modal */}
            {(() => {
                const defaultPreselectedLocation = selectedLocationId && selectedLocationId !== 'ALL'
                    ? locations.find(l => String(l.id) === String(selectedLocationId))
                    : (locations && locations.length === 1 ? locations[0] : undefined);

                return (
                    <TemporaryServiceModal
                        isOpen={isModalOpen}
                        onClose={() => {
                            setIsModalOpen(false);
                            setEditingService(null);
                        }}
                        onSaved={async () => {
                            await loadServices();
                            addToast('success', 'Temporary security service saved successfully and synced to Operations!');
                        }}
                        service={editingService}
                        preselectedCrmEntityId={customerId}
                        preselectedCrmEntityName={customerName}
                        preselectedSiteId={defaultPreselectedLocation?.id}
                        preselectedSiteName={defaultPreselectedLocation?.name}
                        initialScenario={modalScenario}
                    />
                );
            })()}

            {/* Delete Confirmation Modal */}
            {deletingService && (
                <Modal
                    isOpen={true}
                    onClose={() => setDeletingService(null)}
                    title="Confirm Delete Temporary Service"
                >
                    <div style={{ padding: '16px' }}>
                        <p style={{ margin: 0, fontSize: '13.5px', lineHeight: '1.5' }}>
                            Are you sure you want to delete temporary service <strong>{deletingService.reference_number}</strong> ({deletingService.title})?
                        </p>
                        <p style={{ fontSize: '12px', color: '#ef4444', marginTop: '8px' }}>
                            This action will remove the service request, line requirements, and guard assignments.
                        </p>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
                            <Button variant="ghost" onClick={() => setDeletingService(null)}>
                                Cancel
                            </Button>
                            <Button 
                                variant="primary" 
                                style={{ backgroundColor: '#ef4444', borderColor: '#ef4444' }}
                                onClick={handleDeleteConfirm}
                                disabled={isDeleting}
                            >
                                {isDeleting ? 'Deleting...' : 'Delete Service'}
                            </Button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
};

