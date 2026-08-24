import React, { useState, useEffect, useCallback } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { LoadingState } from '../../../components/ui/LoadingState';
import { usePosStore } from '../store/usePosStore';
import { getCustomers } from '../api';
import type { Customer } from '../types';

interface CustomerModalProps {
    isOpen: boolean;
    onClose: () => void;
}

// ─── Debounce hook ──────────────────────────────────────────────────────────
function useDebounce<T>(value: T, delay: number): T {
    const [debouncedValue, setDebouncedValue] = useState<T>(value);
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedValue(value), delay);
        return () => clearTimeout(timer);
    }, [value, delay]);
    return debouncedValue;
}

export const CustomerModal: React.FC<CustomerModalProps> = ({ isOpen, onClose }) => {
    const { selectedCustomer, setCustomer, clearCustomer } = usePosStore();
    
    const [searchQuery, setSearchQuery] = useState('');
    const debouncedQuery = useDebounce(searchQuery, 300);
    
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchCustomers = useCallback(async (query: string) => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await getCustomers({
                search: query || undefined,
                limit: 15
            });
            setCustomers(response.results);
        } catch (err: any) {
            console.error('Customer search error:', err);
            setError('Failed to load customers.');
            setCustomers([]);
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Load initial list or search results
    useEffect(() => {
        if (isOpen) {
            fetchCustomers(debouncedQuery);
        }
    }, [isOpen, debouncedQuery, fetchCustomers]);

    // Clear search query when modal is closed
    useEffect(() => {
        if (!isOpen) {
            setSearchQuery('');
        }
    }, [isOpen]);

    const handleSelect = (customer: Customer) => {
        setCustomer(customer);
        onClose();
    };

    const handleRemove = () => {
        clearCustomer();
        onClose();
    };

    return (
        <Modal 
            isOpen={isOpen} 
            onClose={onClose} 
            title="Select Customer"
            footer={
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                    <Button variant="danger" onClick={handleRemove} disabled={!selectedCustomer}>
                        Remove Customer
                    </Button>
                    <Button variant="secondary" onClick={onClose}>Close</Button>
                </div>
            }
        >
            <div style={{ display: 'flex', flexDirection: 'column', height: '400px', gap: 'var(--spacing-3)' }}>
                {/* Search Input */}
                <div style={{ position: 'relative' }}>
                    <i className="bx bx-search" style={{
                        position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)',
                        color: 'var(--color-text-muted)', fontSize: '16px'
                    }} />
                    <Input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search by name, phone, email..."
                        style={{ paddingLeft: '34px', width: '100%' }}
                        autoFocus
                    />
                </div>

                {/* Results Area */}
                <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
                    {isLoading ? (
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                            <LoadingState message="Searching customers..." />
                        </div>
                    ) : error ? (
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: 'var(--color-danger)' }}>
                            {error}
                        </div>
                    ) : customers.length === 0 ? (
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: 'var(--color-text-muted)' }}>
                            No customers found.
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            {customers.map((customer) => (
                                <div 
                                    key={customer.id}
                                    onClick={() => handleSelect(customer)}
                                    style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        padding: 'var(--spacing-3)',
                                        borderBottom: '1px solid var(--color-border)',
                                        backgroundColor: selectedCustomer?.id === customer.id ? 'var(--color-surface-elevated)' : 'transparent',
                                        cursor: 'pointer',
                                    }}
                                    onMouseEnter={(e) => {
                                        (e.currentTarget as HTMLDivElement).style.backgroundColor = 'var(--color-surface-elevated)';
                                    }}
                                    onMouseLeave={(e) => {
                                        if (selectedCustomer?.id !== customer.id) {
                                            (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent';
                                        }
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontWeight: 600, color: 'var(--color-text)' }}>
                                            {customer.name}
                                        </span>
                                        {selectedCustomer?.id === customer.id && (
                                            <i className='bx bx-check' style={{ color: 'var(--color-primary)', fontSize: '20px' }}></i>
                                        )}
                                    </div>
                                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', display: 'flex', gap: 'var(--spacing-3)', marginTop: 'var(--spacing-1)' }}>
                                        {customer.phone && <span><i className='bx bx-phone'></i> {customer.phone}</span>}
                                        {customer.email && <span><i className='bx bx-envelope'></i> {customer.email}</span>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </Modal>
    );
};
