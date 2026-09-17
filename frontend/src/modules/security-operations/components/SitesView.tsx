import React, { useEffect, useState, useCallback } from 'react';
import { getOperationalSites } from '../api';
import type { OperationalSite, PaginatedResponse } from '../types';
import { DataTable } from '../../../components/tables/DataTable';
import type { Column } from '../../../components/tables/DataTable';
import { Badge } from '../../../components/ui/Badge';
import { Input } from '../../../components/ui/Input';
import { ErrorState } from '../../../components/ui/ErrorState';
import { Button } from '../../../components/ui/Button';
import { SiteModal } from './SiteModal';
import { SiteManpowerModal } from './SiteManpowerModal';

export const SitesView: React.FC = () => {
    const [page, setPage] = useState(1);
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    
    const [data, setData] = useState<PaginatedResponse<OperationalSite> | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);
    
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedSite, setSelectedSite] = useState<OperationalSite | null>(null);

    const [isManpowerModalOpen, setIsManpowerModalOpen] = useState(false);
    const [manpowerSite, setManpowerSite] = useState<OperationalSite | null>(null);

    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedSearch(searchQuery);
            setPage(1);
        }, 400);
        return () => clearTimeout(handler);
    }, [searchQuery]);

    const fetchSites = useCallback(async () => {
        setIsLoading(true);
        setHasError(false);
        try {
            const response = await getOperationalSites({ page, search: debouncedSearch });
            setData(response);
        } catch (err) {
            setHasError(true);
        } finally {
            setIsLoading(false);
        }
    }, [page, debouncedSearch]);

    useEffect(() => {
        fetchSites();
    }, [fetchSites]);

    const columns: Column<OperationalSite>[] = [
        { key: 'name', header: 'Site Name' },
        { key: 'customer_name', header: 'Customer', render: (row: OperationalSite) => row.customer_name || 'N/A' },
        { key: 'address', header: 'Address' },
        { 
            key: 'is_active', 
            header: 'Status',
            render: (row: OperationalSite) => row.is_active ? <Badge variant="success">Active</Badge> : <Badge variant="danger">Inactive</Badge>
        },
        {
            key: 'actions',
            header: 'Actions',
            render: (row: OperationalSite) => (
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button 
                        onClick={() => { setManpowerSite(row); setIsManpowerModalOpen(true); }}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--color-primary)',
                            fontWeight: 600,
                            cursor: 'pointer',
                            fontSize: '13px'
                        }}
                    >
                        <i className="bx bx-group" style={{ marginRight: '4px' }}></i>
                        Posts & Manpower
                    </button>
                    <button 
                        onClick={() => { setSelectedSite(row); setIsModalOpen(true); }}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--color-text-muted)',
                            cursor: 'pointer',
                            fontSize: '13px'
                        }}
                    >
                        Edit
                    </button>
                </div>
            )
        }
    ];

    if (hasError && !data) {
        return <ErrorState message="Failed to load sites." onRetry={fetchSites} />;
    }

    return (
        <div className="view-container">
            <div className="view-toolbar flex justify-between items-center mb-4">
                <Input 
                    placeholder="Search sites..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ width: '300px' }}
                />
                <Button variant="primary" onClick={() => { setSelectedSite(null); setIsModalOpen(true); }}>
                    New Site
                </Button>
            </div>

            <div className="view-table-container">
                <DataTable<OperationalSite>
                    data={data?.results || []}
                    columns={columns}
                    isLoading={isLoading}
                    keyExtractor={(row) => row.id}
                    emptyMessage={searchQuery ? "No sites match your search." : "No operational sites yet. Create your first site to begin managing deployments."}
                    pagination={data ? {
                        page: page,
                        pageSize: 10,
                        totalItems: data.count,
                        onPageChange: (newPage) => setPage(newPage)
                    } : undefined}
                />
            </div>

            <SiteModal 
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={fetchSites}
                site={selectedSite}
            />

            <SiteManpowerModal
                isOpen={isManpowerModalOpen}
                onClose={() => setIsManpowerModalOpen(false)}
                site={manpowerSite}
                onRefresh={fetchSites}
            />
        </div>
    );
};
