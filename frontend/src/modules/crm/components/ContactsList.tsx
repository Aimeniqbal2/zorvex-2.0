import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '../../../components/ui/Button';
import { DataTable } from '../../../components/tables/DataTable';
import type { Column } from '../../../components/tables/DataTable';
import { ErrorState } from '../../../components/ui/ErrorState';
import { useToastStore } from '../../../stores/toastStore';
import { getContacts, deleteContact } from '../api';
import type { CRMContact } from '../types';
import { ContactModal } from './ContactModal';

interface ContactsListProps {
    entityId: string;
}

export const ContactsList: React.FC<ContactsListProps> = ({ entityId }) => {
    const [contacts, setContacts] = useState<CRMContact[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);
    
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [contactToEdit, setContactToEdit] = useState<CRMContact | null>(null);

    const fetchContacts = useCallback(async () => {
        setIsLoading(true);
        setHasError(false);
        try {
            const data = await getContacts(entityId);
            setContacts(data.results);
        } catch (error) {
            setHasError(true);
            useToastStore.getState().error('Failed to load contacts.');
        } finally {
            setIsLoading(false);
        }
    }, [entityId]);

    useEffect(() => {
        fetchContacts();
    }, [fetchContacts]);

    const handleAdd = () => {
        setContactToEdit(null);
        setIsModalOpen(true);
    };

    const handleEdit = (contact: CRMContact) => {
        setContactToEdit(contact);
        setIsModalOpen(true);
    };

    const handleDelete = async (contact: CRMContact) => {
        if (!window.confirm('Are you sure you want to delete this contact?')) return;
        try {
            await deleteContact(contact.id);
            useToastStore.getState().success('Contact deleted successfully');
            fetchContacts();
        } catch (error) {
            useToastStore.getState().error('Failed to delete contact');
        }
    };

    const columns: Column<CRMContact>[] = [
        {
            key: 'name',
            header: 'Name',
            render: (c) => (
                <div>
                    <div style={{ fontWeight: 500 }}>
                        {c.first_name} {c.last_name}
                        {c.is_primary && <span style={{ marginLeft: '8px', fontSize: '10px', backgroundColor: 'var(--color-primary)', color: 'white', padding: '2px 6px', borderRadius: '4px' }}>PRIMARY</span>}
                    </div>
                    {c.job_title && <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{c.job_title} {c.department ? `- ${c.department}` : ''}</div>}
                </div>
            )
        },
        {
            key: 'contact',
            header: 'Contact Info',
            render: (c) => (
                <div style={{ fontSize: '13px' }}>
                    {c.email && <div><i className='bx bx-envelope'></i> {c.email}</div>}
                    {c.phone && <div><i className='bx bx-phone'></i> {c.phone}</div>}
                    {c.mobile && <div><i className='bx bx-mobile'></i> {c.mobile}</div>}
                    {c.whatsapp && <div><i className='bx bxl-whatsapp'></i> {c.whatsapp}</div>}
                </div>
            )
        },
        {
            key: 'preferences',
            header: 'Preferences',
            render: (c) => (
                <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                    {c.receives_invoices && <div>Invoices</div>}
                    {c.receives_quotes && <div>Quotes</div>}
                    {c.receives_notifications && <div>Notifications</div>}
                </div>
            )
        },
        {
            key: 'actions',
            header: 'Actions',
            render: (c) => (
                <div style={{ display: 'flex', gap: '4px' }}>
                    <Button variant="ghost" onClick={() => handleEdit(c)}>
                        <i className='bx bx-edit-alt'></i>
                    </Button>
                    <Button variant="ghost" onClick={() => handleDelete(c)} style={{ color: 'var(--color-error)' }}>
                        <i className='bx bx-trash'></i>
                    </Button>
                </div>
            )
        }
    ];

    if (hasError) {
        return <ErrorState title="Error" message="Failed to load contacts" onRetry={fetchContacts} />;
    }

    return (
        <div style={{ backgroundColor: 'var(--color-surface)', padding: '20px', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h2 style={{ fontSize: '16px', margin: 0 }}>Contacts</h2>
                <Button variant="primary" onClick={handleAdd}>
                    <i className='bx bx-plus'></i> Add Contact
                </Button>
            </div>
            
            <DataTable 
                data={contacts} 
                columns={columns} 
                isLoading={isLoading} 
                keyExtractor={(row) => row.id} 
                emptyMessage="No contacts found."
            />

            <ContactModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSaved={fetchContacts}
                entityId={entityId}
                contact={contactToEdit}
            />
        </div>
    );
};
