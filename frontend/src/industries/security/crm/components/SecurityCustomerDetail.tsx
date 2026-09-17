import React, { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '../../../../layouts/PageLayout';
import { Button } from '../../../../components/ui/Button';
import { Modal } from '../../../../components/ui/Modal';
import { Input } from '../../../../components/ui/Input';
import { DataTable } from '../../../../components/tables/DataTable';
import type { Column } from '../../../../components/tables/DataTable';
import { useToastStore } from '../../../../stores/toastStore';
import { getEntity, getContacts, deleteContact } from '../../../../modules/crm/api';
import { ContactModal } from '../../../../modules/crm/components/ContactModal';
import type { CRMEntity, CRMContact } from '../../../../modules/crm/types';
import { getSecurityProposals, getClientLocations, createSecurityProposal, createClientLocation } from '../api';
import type { SecurityProposal, ClientLocation } from '../api';

interface Props {
    customerId: string;
    onBack: () => void;
    onOpenProposal: (proposalId: string) => void;
}

export const SecurityCustomerDetail: React.FC<Props> = ({ customerId, onBack, onOpenProposal }) => {
    const [customer, setCustomer] = useState<CRMEntity | null>(null);
    const [contacts, setContacts] = useState<CRMContact[]>([]);
    const [locations, setLocations] = useState<ClientLocation[]>([]);
    const [proposals, setProposals] = useState<SecurityProposal[]>([]);
    
    const [activeTab, setActiveTab] = useState<'overview' | 'contacts' | 'locations' | 'proposals'>('contacts');
    const [isLoading, setIsLoading] = useState(true);

    // Contact Modal State
    const [isContactModalOpen, setIsContactModalOpen] = useState(false);
    const [editingContact, setEditingContact] = useState<CRMContact | null>(null);

    // Location Modal State
    const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
    const [locationName, setLocationName] = useState('');
    const [locationAddress, setLocationAddress] = useState('');
    const [isSubmittingLocation, setIsSubmittingLocation] = useState(false);

    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [cust, conts, locs, props] = await Promise.all([
                getEntity(customerId),
                getContacts(customerId),
                getClientLocations(customerId),
                getSecurityProposals({ customer: customerId })
            ]);
            setCustomer(cust);
            const loadedContacts = conts?.results || (Array.isArray(conts) ? conts : []);
            const rawLocs = locs?.results || (Array.isArray(locs) ? locs : []);
            const rawProps = props?.results || (Array.isArray(props) ? props : []);

            // Defense-in-depth: Ensure strict client isolation in component state
            const loadedLocations = rawLocs.filter(
                (l: any) => String(l.customer) === String(customerId) || String(l.customer?.id) === String(customerId)
            );
            const loadedProposals = rawProps.filter(
                (p: any) => String(p.customer) === String(customerId) || String(p.customer?.id) === String(customerId)
            );

            setContacts(loadedContacts);
            setLocations(loadedLocations);
            setProposals(loadedProposals);
        } catch (error) {
            useToastStore.getState().error('Failed to load customer details');
        } finally {
            setIsLoading(false);
        }
    }, [customerId]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleCreateProposal = async () => {
        try {
            const payload = {
                customer: customerId,
                title: `${customer?.name} - Initial Proposal`,
            };
            const newProp = await createSecurityProposal(payload);
            useToastStore.getState().success('Proposal created successfully');
            onOpenProposal(newProp.id);
        } catch (error) {
            useToastStore.getState().error('Failed to create proposal');
        }
    };

    const handleOpenAddContact = () => {
        setEditingContact(null);
        setIsContactModalOpen(true);
    };

    const handleOpenEditContact = (contact: CRMContact) => {
        setEditingContact(contact);
        setIsContactModalOpen(true);
    };

    const handleDeleteContact = async (contactId: string, name: string) => {
        if (!window.confirm(`Are you sure you want to delete contact "${name}"?`)) {
            return;
        }
        try {
            await deleteContact(contactId);
            useToastStore.getState().success('Contact deleted successfully');
            loadData();
        } catch (error) {
            useToastStore.getState().error('Failed to delete contact');
        }
    };

    const handleOpenAddLocation = () => {
        setLocationName('');
        setLocationAddress('');
        setIsLocationModalOpen(true);
    };

    const handleSaveLocation = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!locationName.trim()) {
            useToastStore.getState().error('Please enter a location name');
            return;
        }
        setIsSubmittingLocation(true);
        try {
            await createClientLocation({
                customer: customerId,
                name: locationName.trim(),
                address: locationAddress.trim() || null,
                is_active: true
            });
            useToastStore.getState().success('Location added successfully');
            setIsLocationModalOpen(false);
            loadData();
        } catch (error) {
            useToastStore.getState().error('Failed to add location');
        } finally {
            setIsSubmittingLocation(false);
        }
    };

    if (isLoading) return <div style={{ padding: '20px' }}>Loading...</div>;
    if (!customer) return <div style={{ padding: '20px' }}>Customer not found</div>;

    const locColumns: Column<ClientLocation>[] = [
        { key: 'name', header: 'Location Name', render: (loc) => <strong>{loc.name}</strong> },
        { key: 'address', header: 'Address', render: (loc) => loc.address || <span style={{color: 'var(--color-text-muted)'}}>No address</span> },
        { key: 'is_active', header: 'Status', render: (loc) => loc.is_active ? <span style={{ color: 'var(--color-success, #10b981)', fontWeight: 600 }}>Active</span> : <span style={{ color: 'var(--color-text-muted)' }}>Inactive</span> }
    ];

    const propColumns: Column<SecurityProposal>[] = [
        { key: 'proposal_number', header: 'Proposal #', render: (p) => <strong>{p.proposal_number}</strong> },
        { key: 'title', header: 'Title', render: (p) => p.title },
        { key: 'status', header: 'Status', render: (p) => p.status },
        { 
            key: 'actions', 
            header: 'Actions', 
            render: (p) => (
                <Button variant="ghost" onClick={() => onOpenProposal(p.id)}>
                    Open
                </Button>
            )
        }
    ];

    const contactColumns: Column<CRMContact>[] = [
        { 
            key: 'name', 
            header: 'Name', 
            render: (c) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <strong>{c.first_name} {c.last_name || ''}</strong>
                    {c.is_primary && (
                        <span style={{ 
                            fontSize: '11px', 
                            padding: '2px 6px', 
                            borderRadius: '4px', 
                            background: 'rgba(56, 189, 248, 0.15)', 
                            color: '#38bdf8', 
                            fontWeight: 600 
                        }}>
                            Primary
                        </span>
                    )}
                </div>
            )
        },
        { key: 'job_title', header: 'Title', render: (c) => c.job_title || '-' },
        { key: 'phone', header: 'Phone', render: (c) => c.phone || c.mobile || '-' },
        { key: 'email', header: 'Email', render: (c) => c.email || '-' },
        {
            key: 'actions',
            header: 'Actions',
            render: (c) => (
                <div style={{ display: 'flex', gap: '8px' }}>
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        title="Edit Contact"
                        onClick={() => handleOpenEditContact(c)}
                    >
                        <i className='bx bx-edit'></i> Edit
                    </Button>
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        title="Delete Contact"
                        style={{ color: 'var(--color-danger, #ef4444)' }}
                        onClick={() => handleDeleteContact(c.id, `${c.first_name} ${c.last_name || ''}`)}
                    >
                        <i className='bx bx-trash'></i>
                    </Button>
                </div>
            )
        }
    ];

    return (
        <div>
            <PageHeader 
                title={customer.name}
                subtitle="Client Details"
                onBack={onBack}
                actions={
                    <Button variant="primary" onClick={handleCreateProposal}>
                        <i className='bx bx-file'></i> Create Proposal
                    </Button>
                }
            />

            <div className="crm-tabs" style={{ display: 'flex', gap: '10px', borderBottom: '1px solid var(--color-border)', paddingBottom: '16px', marginBottom: '16px' }}>
                {['overview', 'contacts', 'locations', 'proposals'].map(tab => (
                    <button
                        key={tab}
                        style={{
                            padding: '8px 16px',
                            background: activeTab === tab ? 'var(--color-primary)' : 'var(--color-background)',
                            border: `1px solid ${activeTab === tab ? 'var(--color-primary)' : 'var(--color-border)'}`,
                            borderRadius: '20px',
                            color: activeTab === tab ? 'white' : 'var(--color-text-muted)',
                            fontWeight: 500,
                            fontSize: '13.5px',
                            cursor: 'pointer',
                            textTransform: 'capitalize'
                        }}
                        onClick={() => setActiveTab(tab as any)}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            <div style={{ background: 'var(--color-background)', padding: '24px', borderRadius: '12px', border: '1px solid var(--color-border)' }}>
                {activeTab === 'overview' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                        <div>
                            <h3 style={{ fontSize: '16px', marginBottom: '12px' }}>Company Information</h3>
                            <p style={{ marginBottom: '8px' }}><strong>Name:</strong> {customer.name}</p>
                            <p style={{ marginBottom: '8px' }}><strong>Status:</strong> {customer.status || 'Active'}</p>
                            <p style={{ marginBottom: '8px' }}><strong>Contacts:</strong> {contacts.length}</p>
                            <p style={{ marginBottom: '8px' }}><strong>Locations:</strong> {locations.length}</p>
                            <p style={{ marginBottom: '8px' }}><strong>Proposals:</strong> {proposals.length}</p>
                        </div>
                    </div>
                )}

                {activeTab === 'contacts' && (
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <div style={{ color: 'var(--color-text-muted)', fontSize: '13.5px' }}>
                                Manage key decision-makers and contacts for this client.
                            </div>
                            <Button variant="primary" onClick={handleOpenAddContact}>
                                <i className='bx bx-plus'></i> Add Contact
                            </Button>
                        </div>
                        <DataTable 
                            data={contacts}
                            columns={contactColumns}
                            keyExtractor={(row) => row.id}
                            emptyMessage="No contacts found. Click 'Add Contact' to add a client contact person."
                        />
                    </div>
                )}

                {activeTab === 'locations' && (
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <div style={{ color: 'var(--color-text-muted)', fontSize: '13.5px' }}>
                                Manage deployment sites, headquarters, and branch locations.
                            </div>
                            <Button variant="primary" onClick={handleOpenAddLocation}>
                                <i className='bx bx-plus'></i> Add Location
                            </Button>
                        </div>
                        <DataTable 
                            data={locations}
                            columns={locColumns}
                            keyExtractor={(row) => row.id}
                            emptyMessage="No locations found. Click 'Add Location' to register a client site."
                        />
                    </div>
                )}

                {activeTab === 'proposals' && (
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <div style={{ color: 'var(--color-text-muted)', fontSize: '13.5px' }}>
                                Commercial offers, proposals, and contracts for this client.
                            </div>
                            <Button variant="primary" onClick={handleCreateProposal}>
                                <i className='bx bx-plus'></i> Create Proposal
                            </Button>
                        </div>
                        <DataTable 
                            data={proposals}
                            columns={propColumns}
                            keyExtractor={(row) => row.id}
                            emptyMessage="No proposals found."
                        />
                    </div>
                )}
            </div>

            {/* Reusable Contact Modal */}
            <ContactModal 
                isOpen={isContactModalOpen}
                onClose={() => setIsContactModalOpen(false)}
                onSaved={loadData}
                entityId={customerId}
                contact={editingContact}
            />

            {/* Clean Add Location Modal */}
            <Modal
                isOpen={isLocationModalOpen}
                onClose={() => setIsLocationModalOpen(false)}
                title="Add Client Location / Site"
                footer={
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                        <Button variant="ghost" onClick={() => setIsLocationModalOpen(false)}>
                            Cancel
                        </Button>
                        <Button 
                            variant="primary" 
                            disabled={isSubmittingLocation || !locationName.trim()}
                            onClick={handleSaveLocation}
                        >
                            {isSubmittingLocation ? 'Saving...' : 'Save Location'}
                        </Button>
                    </div>
                }
            >
                <form onSubmit={handleSaveLocation}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <Input 
                            label="Location / Site Name *"
                            placeholder="e.g. Head Office, West Factory, Site Alpha"
                            value={locationName}
                            onChange={(e) => setLocationName(e.target.value)}
                            required
                            autoFocus
                        />
                        <Input 
                            label="Site Address"
                            placeholder="e.g. Plot 45, Sector 12, Industrial Area, Karachi"
                            value={locationAddress}
                            onChange={(e) => setLocationAddress(e.target.value)}
                        />
                    </div>
                </form>
            </Modal>
        </div>
    );
};

