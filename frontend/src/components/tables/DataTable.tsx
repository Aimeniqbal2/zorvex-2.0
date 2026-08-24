import React from 'react';
import { Button } from '../ui/Button';

export interface Column<T> {
    key: keyof T | string;
    header: string;
    render?: (row: T) => React.ReactNode;
}

export interface DataTablePagination {
    page: number;
    pageSize: number;
    totalItems: number;
    onPageChange: (page: number) => void;
    onPageSizeChange?: (pageSize: number) => void;
}

export interface DataTableProps<T> {
    data: T[];
    columns: Column<T>[];
    isLoading?: boolean;
    emptyMessage?: string;
    keyExtractor: (row: T) => string;
    pagination?: DataTablePagination;
}

export function DataTable<T>({ 
    data, 
    columns, 
    isLoading, 
    emptyMessage = 'No data available', 
    keyExtractor,
    pagination
}: DataTableProps<T>) {
    return (
        <div className="data-table-container">
            <table className="data-table">
                <thead>
                    <tr>
                        {columns.map(col => (
                            <th key={col.key as string}>{col.header}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {isLoading ? (
                        <tr>
                            <td colSpan={columns.length} style={{ textAlign: 'center', padding: '32px' }}>
                                <i className='bx bx-loader-alt bx-spin' style={{ fontSize: '24px', color: 'var(--color-primary)' }}></i>
                                <div style={{ marginTop: '8px', color: 'var(--color-text-muted)' }}>Loading...</div>
                            </td>
                        </tr>
                    ) : data.length === 0 ? (
                        <tr>
                            <td colSpan={columns.length} style={{ textAlign: 'center', padding: '32px', color: 'var(--color-text-muted)' }}>
                                {emptyMessage}
                            </td>
                        </tr>
                    ) : (
                        data.map((row) => (
                            <tr key={keyExtractor(row)}>
                                {columns.map(col => (
                                    <td key={col.key as string}>
                                        {col.render ? col.render(row) : (row[col.key as keyof T] as React.ReactNode)}
                                    </td>
                                ))}
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
            
            {pagination && (
                <div className="data-table-pagination" style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '16px 24px',
                    borderTop: '1px solid var(--color-border)',
                    backgroundColor: 'var(--color-surface)'
                }}>
                    <div className="pagination-info" style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>
                        Total: {pagination.totalItems} items
                    </div>
                    <div className="pagination-controls" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <Button 
                            variant="ghost"
                            disabled={pagination.page <= 1} 
                            onClick={() => pagination.onPageChange(Math.max(1, pagination.page - 1))}
                        >
                            Previous
                        </Button>
                        <span style={{ padding: '0 12px' }}>Page {pagination.page}</span>
                        <Button 
                            variant="ghost"
                            disabled={pagination.page * pagination.pageSize >= pagination.totalItems} 
                            onClick={() => pagination.onPageChange(pagination.page + 1)}
                        >
                            Next
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
