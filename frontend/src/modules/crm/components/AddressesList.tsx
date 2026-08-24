import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '../../../components/ui/Button';
import { DataTable } from '../../../components/tables/DataTable';
import type { Column } from '../../../components/tables/DataTable';
import { ErrorState } from '../../../components/ui/ErrorState';
import { useToastStore } from '../../../stores/toastStore';
import { getAddresses, deleteAddress } from '../api';
import type { CRMAddress } from '../types';
import { AddressModal } from './AddressModal';

interface AddressesListProps {
    entityId: string;
}

export const AddressesList: React.FC<AddressesListProps> = ({ entityId }) => {
    const [addresses, setAddresses] = useState<CRMAddress[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);
    
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [addressToEdit, setAddressToEdit] = useState<CRMAddress | null>(null);

    const fetchAddresses = useCallback(async () => {
        setIsLoading(true);
        setHasError(false);
        try {
            const data = await getAddresses(entityId);
            setAddresses(data.results);
        } catch (error) {
            setHasError(true);
            useToastStore.getState().error('Failed to load addresses.');
        } finally {
            setIsLoading(false);
        }
    }, [entityId]);

    useEffect(() => {
        fetchAddresses();
    }, [fetchAddresses]);

    const handleAdd = () => {
        setAddressToEdit(null);
        setIsModalOpen(true);
    };

    const handleEdit = (address: CRMAddress) => {
        setAddressToEdit(address);
        setIsModalOpen(true);
    };

    const handleDelete = async (address: CRMAddress) => {
        if (!window.confirm('Are you sure you want to delete this address?')) return;
        try {
            await deleteAddress(address.id);
            useToastStore.getState().success('Address deleted successfully');
            fetchAddresses();
        } catch (error) {
            useToastStore.getState().error('Failed to delete address');
        }
    };

    const columns: Column<CRMAddress>[] = [
        {
            key: 'type',
            header: 'Type',
            render: (a) => (
                <div>
                    <span style={{ fontWeight: 500 }}>{a.address_type}</span>
                    {a.is_default && <span style={{ marginLeft: '8px', fontSize: '10px', backgroundColor: 'var(--color-primary)', color: 'white', padding: '2px 6px', borderRadius: '4px' }}>DEFAULT</span>}
                </div>
            )
        },
        {
            key: 'address',
            header: 'Address',
            render: (a) => (
                <div style={{ fontSize: '13px' }}>
                    <div>{a.line1}</div>
                    {a.line2 && <div>{a.line2}</div>}
                    <div>{a.city}{a.state ? `, ${a.state}` : ''} {a.postal_code}</div>
                    <div style={{ color: 'var(--color-text-muted)' }}>{a.country}</div>
                </div>
            )
        },
        {
            key: 'actions',
            header: 'Actions',
            render: (a) => (
                <div style={{ display: 'flex', gap: '4px' }}>
                    <Button variant="ghost" onClick={() => handleEdit(a)}>
                        <i className='bx bx-edit-alt'></i>
                    </Button>
                    <Button variant="ghost" onClick={() => handleDelete(a)} style={{ color: 'var(--color-error)' }}>
                        <i className='bx bx-trash'></i>
                    </Button>
                </div>
            )
        }
    ];

    if (hasError) {
        return <ErrorState title="Error" message="Failed to load addresses" onRetry={fetchAddresses} />;
    }

    return (
        <div style={{ backgroundColor: 'var(--color-surface)', padding: '20px', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h2 style={{ fontSize: '16px', margin: 0 }}>Addresses</h2>
                <Button variant="primary" onClick={handleAdd}>
                    <i className='bx bx-plus'></i> Add Address
                </Button>
            </div>
            
            <DataTable 
                data={addresses} 
                columns={columns} 
                isLoading={isLoading} 
                keyExtractor={(row) => row.id} 
                emptyMessage="No addresses found."
            />

            <AddressModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSaved={fetchAddresses}
                entityId={entityId}
                address={addressToEdit}
            />
        </div>
    );
};
