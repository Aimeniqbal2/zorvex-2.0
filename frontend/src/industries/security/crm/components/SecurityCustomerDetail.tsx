import React, { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '../../../../layouts/PageLayout';
import { Button } from '../../../../components/ui/Button';
import { Modal } from '../../../../components/ui/Modal';
import { Input } from '../../../../components/ui/Input';
import { DataTable } from '../../../../components/tables/DataTable';
import type { Column } from '../../../../components/tables/DataTable';
import { useToastStore } from '../../../../stores/toastStore';
import { getEntity, getContacts, deleteContact, getAddresses } from '../../../../modules/crm/api';
import { ContactModal } from '../../../../modules/crm/components/ContactModal';
import EmailComposer from '../../../../components/communications/EmailComposer';
import type { CRMEntity, CRMContact, CRMAddress } from '../../../../modules/crm/types';
import { 
    getSecurityProposals, 
    getClientLocations, 
    createSecurityProposal, 
    updateClientLocation, 
    deleteClientLocation, 
    deleteSecurityProposal,
    getProposalVersions,
    getServiceLines
} from '../api';
import type { SecurityProposal, ClientLocation, ProposalVersion, ProposalServiceLine } from '../api';

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
    const [addresses, setAddresses] = useState<CRMAddress[]>([]);
    
    // Overview Data
    const [serviceLines, setServiceLines] = useState<ProposalServiceLine[]>([]);
    const [activeVersion, setActiveVersion] = useState<ProposalVersion | null>(null);

    const [activeTab, setActiveTab] = useState<'overview' | 'contacts' | 'locations' | 'requirements'>('overview');
    const [isLoading, setIsLoading] = useState(true);
    const [showEmailComposer, setShowEmailComposer] = useState(false);

    // Contact Modal State
    const [isContactModalOpen, setIsContactModalOpen] = useState(false);
    const [editingContact, setEditingContact] = useState<CRMContact | null>(null);

    // Location Modal State (Edit only)
    const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
    const [editingLocation, setEditingLocation] = useState<ClientLocation | null>(null);
    const [locationName, setLocationName] = useState('');
    const [locationAddress, setLocationAddress] = useState('');
    const [isSubmittingLocation, setIsSubmittingLocation] = useState(false);

    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [cust, conts, locs, props, addrs] = await Promise.all([
                getEntity(customerId),
                getContacts(customerId),
                getClientLocations(customerId),
                getSecurityProposals({ customer: customerId }),
                getAddresses(customerId).catch(() => ({ results: [] }))
            ]);
            setCustomer(cust);
            const loadedContacts = conts?.results || (Array.isArray(conts) ? conts : []);
            const rawLocs = locs?.results || (Array.isArray(locs) ? locs : []);
            const rawProps = props?.results || (Array.isArray(props) ? props : []);
            const loadedAddrs = addrs?.results || (Array.isArray(addrs) ? addrs : []);

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
            setAddresses(loadedAddrs);

            // Load active proposal version & service lines for overview dashboard
            if (loadedProposals.length > 0) {
                try {
                    const primaryProp = loadedProposals.find(p => p.status === 'ACTIVE') || loadedProposals[0];
                    const vers = await getProposalVersions(primaryProp.id);
                    const versList = Array.isArray(vers) ? vers : ((vers as any)?.results || []);
                    const actVer = versList.find((v: any) => v.status === 'APPROVED' || v.status === 'ACTIVE') || versList[0];
                    
                    if (actVer) {
                        setActiveVersion(actVer);
                        const linesRes = await getServiceLines(actVer.id);
                        const lines = linesRes.results || (Array.isArray(linesRes) ? linesRes : []);
                        setServiceLines(lines);
                    } else {
                        setActiveVersion(null);
                        setServiceLines([]);
                    }
                } catch (vErr) {
                    console.error("Error loading proposal details for overview:", vErr);
                    setActiveVersion(null);
                    setServiceLines([]);
                }
            } else {
                setActiveVersion(null);
                setServiceLines([]);
            }
        } catch (error) {
            useToastStore.getState().error('Failed to load customer details');
        } finally {
            setIsLoading(false);
        }
    }, [customerId]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleCreateRequirement = async () => {
        try {
            const payload = {
                customer: customerId,
                title: `${customer?.name} - Final Requirements`,
            };
            const newProp = await createSecurityProposal(payload);
            useToastStore.getState().success('Requirement sheet created and linked to Operations');
            onOpenProposal(newProp.id);
        } catch (error) {
            useToastStore.getState().error('Failed to create requirement sheet');
        }
    };

    const handleDeleteProposal = async (proposalId: string, proposalNumber: string) => {
        if (!window.confirm(`Are you sure you want to delete requirement sheet "${proposalNumber}"?`)) {
            return;
        }
        try {
            await deleteSecurityProposal(proposalId);
            useToastStore.getState().success('Requirement sheet deleted successfully');
            loadData();
        } catch (error) {
            useToastStore.getState().error('Failed to delete requirement sheet');
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

    const handleOpenEditLocation = (loc: ClientLocation) => {
        setEditingLocation(loc);
        setLocationName(loc.name);
        setLocationAddress(loc.address || '');
        setIsLocationModalOpen(true);
    };

    const handleDeleteLocation = async (locId: string, name: string) => {
        if (!window.confirm(`Are you sure you want to delete location "${name}"?`)) {
            return;
        }
        try {
            await deleteClientLocation(locId);
            useToastStore.getState().success('Location deleted successfully');
            loadData();
        } catch (error) {
            useToastStore.getState().error('Failed to delete location');
        }
    };

    const handleSaveLocation = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!locationName.trim()) {
            useToastStore.getState().error('Please enter a location name');
            return;
        }
        setIsSubmittingLocation(true);
        try {
            if (editingLocation) {
                await updateClientLocation(editingLocation.id, {
                    name: locationName.trim(),
                    address: locationAddress.trim() || null
                });
                useToastStore.getState().success('Location updated successfully');
            }
            setIsLocationModalOpen(false);
            setEditingLocation(null);
            loadData();
        } catch (error) {
            useToastStore.getState().error('Failed to update location');
        } finally {
            setIsSubmittingLocation(false);
        }
    };

    const formatPKR = (amount: number | string | undefined | null) => {
        const num = Number(amount) || 0;
        return `PKR ${num.toLocaleString('en-PK', { maximumFractionDigits: 0 })}`;
    };

    if (isLoading) return <div style={{ padding: '24px', color: 'var(--color-text-muted)' }}>Loading client details...</div>;
    if (!customer) return <div style={{ padding: '24px', color: 'var(--color-danger)' }}>Client not found</div>;

    // Derived Financial & Force Metrics for Overview
    const totalGuards = serviceLines.reduce((sum, line) => sum + (Number(line.quantity) || 0), 0);
    const totalMonthlySale = serviceLines.reduce((sum, line) => {
        const sale = Number(line.line_sale) || ((Number(line.quantity) || 0) * (Number(line.client_rate) || 0));
        return sum + sale;
    }, 0);
    const totalMonthlySalary = serviceLines.reduce((sum, line) => {
        const sal = Number(line.line_salary) || ((Number(line.quantity) || 0) * (Number(line.guard_salary) || 0));
        return sum + sal;
    }, 0);
    const grossMargin = totalMonthlySale - totalMonthlySalary;

    const overheadExpense = activeVersion?.total_monthly_expense 
        ? Number(activeVersion.total_monthly_expense) 
        : (totalGuards * (Number(activeVersion?.overhead_per_guard) || 0));
    const serviceCharges = activeVersion?.total_service_charges 
        ? Number(activeVersion.total_service_charges) 
        : (totalGuards * (Number(activeVersion?.service_charges_per_guard) || 0));
    const salesTax = activeVersion?.sales_tax_amount ? Number(activeVersion.sales_tax_amount) : 0;
    const withholdingTax = activeVersion?.withholding_tax_amount ? Number(activeVersion.withholding_tax_amount) : 0;
    const sessi = activeVersion?.total_sessi ? Number(activeVersion.total_sessi) : 0;
    const eobi = activeVersion?.total_eobi ? Number(activeVersion.total_eobi) : 0;
    const invoiceTotal = activeVersion?.total_invoice_amount 
        ? Number(activeVersion.total_invoice_amount) 
        : (totalMonthlySale + salesTax);
    const netProfit = activeVersion?.net_profit_loss 
        ? Number(activeVersion.net_profit_loss) 
        : (grossMargin - overheadExpense);

    // Primary Head Office Address
    const primaryAddress = addresses.find(a => a.is_default || a.address_type === 'Office') || addresses[0];
    const addressDisplay = primaryAddress 
        ? `${primaryAddress.line1}${primaryAddress.city ? `, ${primaryAddress.city}` : ''}${primaryAddress.state ? `, ${primaryAddress.state}` : ''}${primaryAddress.country ? `, ${primaryAddress.country}` : ''}`
        : null;

    // Group service lines by location
    const locationLineGroups = locations.map(loc => {
        const linesForLoc = serviceLines.filter(
            sl => String(sl.location) === String(loc.id) || String(sl.location_name).toLowerCase() === loc.name.toLowerCase()
        );
        const locGuards = linesForLoc.reduce((acc, l) => acc + (Number(l.quantity) || 0), 0);
        const locSale = linesForLoc.reduce((acc, l) => acc + (Number(l.line_sale) || ((Number(l.quantity) || 0) * (Number(l.client_rate) || 0))), 0);
        const locSalary = linesForLoc.reduce((acc, l) => acc + (Number(l.line_salary) || ((Number(l.quantity) || 0) * (Number(l.guard_salary) || 0))), 0);

        return {
            location: loc,
            lines: linesForLoc,
            totalGuards: locGuards,
            totalSale: locSale,
            totalSalary: locSalary
        };
    });

    const locColumns: Column<ClientLocation>[] = [
        { key: 'name', header: 'Location Name', render: (loc) => <strong>{loc.name}</strong> },
        { key: 'address', header: 'Address', render: (loc) => loc.address || <span style={{color: 'var(--color-text-muted)'}}>No address</span> },
        { key: 'is_active', header: 'Status', render: (loc) => loc.is_active ? <span style={{ color: 'var(--color-success, #10b981)', fontWeight: 600 }}>Active</span> : <span style={{ color: 'var(--color-text-muted)' }}>Inactive</span> },
        {
            key: 'actions',
            header: 'Actions',
            render: (loc) => (
                <div style={{ display: 'flex', gap: '8px' }}>
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        title="Edit Location"
                        onClick={() => handleOpenEditLocation(loc)}
                    >
                        <i className='bx bx-edit'></i> Edit
                    </Button>
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        title="Delete Location"
                        style={{ color: 'var(--color-danger, #ef4444)' }}
                        onClick={() => handleDeleteLocation(loc.id, loc.name)}
                    >
                        <i className='bx bx-trash'></i>
                    </Button>
                </div>
            )
        }
    ];

    const propColumns: Column<SecurityProposal>[] = [
        { key: 'proposal_number', header: 'Req #', render: (p) => <strong style={{ fontFamily: 'monospace' }}>{p.proposal_number}</strong> },
        { key: 'title', header: 'Requirement Scope', render: (p) => <div>{p.title}</div> },
        { 
            key: 'status', 
            header: 'Operations Status', 
            render: (p) => (
                <span style={{ 
                    padding: '3px 8px', 
                    borderRadius: '12px', 
                    fontSize: '11.5px', 
                    fontWeight: 600,
                    background: p.status === 'ACTIVE' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(99, 102, 241, 0.15)',
                    color: p.status === 'ACTIVE' ? '#10b981' : '#6366f1',
                    border: `1px solid ${p.status === 'ACTIVE' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(99, 102, 241, 0.3)'}`
                }}>
                    <i className={p.status === 'ACTIVE' ? 'bx bx-check-shield' : 'bx bx-time'}></i> {p.status === 'ACTIVE' ? 'Live in Operations' : p.status}
                </span>
            )
        },
        { 
            key: 'actions', 
            header: 'Actions', 
            render: (p) => (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <Button variant="ghost" size="sm" onClick={() => onOpenProposal(p.id)}>
                        <i className='bx bx-edit-alt'></i> Open Requirements
                    </Button>
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        title="Delete Requirements"
                        style={{ color: 'var(--color-danger, #ef4444)' }}
                        onClick={() => handleDeleteProposal(p.id, p.proposal_number)}
                    >
                        <i className='bx bx-trash'></i>
                    </Button>
                </div>
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
        { key: 'whatsapp', header: 'WhatsApp', render: (c) => c.whatsapp || '-' },
        { key: 'email', header: 'Email', render: (c) => c.email || '-' },
        {
            key: 'actions',
            header: 'Actions',
            render: (c) => (
                <div style={{ display: 'flex', gap: '8px' }}>
                    <Button variant="ghost" size="sm" onClick={() => handleOpenEditContact(c)}>
                        <i className='bx bx-edit'></i> Edit
                    </Button>
                    <Button 
                        variant="ghost" 
                        size="sm" 
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
                subtitle="Client Details & Service Requirements"
                onBack={onBack}
                actions={
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <Button 
                            variant="secondary" 
                            onClick={() => setShowEmailComposer(true)}
                        >
                            <i className='bx bx-envelope'></i> Send Email
                        </Button>
                        <Button 
                            variant="primary" 
                            onClick={handleCreateRequirement}
                        >
                            <i className='bx bx-clipboard'></i> Set Final Requirements
                        </Button>
                    </div>
                }
            />

            {/* Navigation Tabs */}
            <div className="crm-tabs" style={{ display: 'flex', gap: '10px', borderBottom: '1px solid var(--color-border)', paddingBottom: '16px', marginBottom: '20px' }}>
                {[
                    { id: 'overview', label: 'Overview', icon: 'bx-tachometer' },
                    { id: 'contacts', label: `Contacts (${contacts.length})`, icon: 'bx-user-pin' },
                    { id: 'locations', label: `Locations (${locations.length})`, icon: 'bx-map-pin' },
                    { id: 'requirements', label: `Final Requirements (${proposals.length})`, icon: 'bx-list-check' }
                ].map(tab => (
                    <button
                        key={tab.id}
                        style={{
                            padding: '8px 18px',
                            background: activeTab === tab.id ? 'var(--color-primary)' : 'var(--color-background)',
                            border: `1px solid ${activeTab === tab.id ? 'var(--color-primary)' : 'var(--color-border)'}`,
                            borderRadius: '20px',
                            color: activeTab === tab.id ? 'white' : 'var(--color-text-muted)',
                            fontWeight: 500,
                            fontSize: '13.5px',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            transition: 'all 0.15s ease',
                            boxShadow: activeTab === tab.id ? '0 4px 10px rgba(var(--color-primary-rgb), 0.25)' : 'none'
                        }}
                        onClick={() => setActiveTab(tab.id as any)}
                    >
                        <i className={`bx ${tab.icon}`}></i>
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* TAB CONTENTS */}
            {activeTab === 'overview' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    
                    {/* Top Executive KPI Quick Stats */}
                    <div style={{ 
                        display: 'grid', 
                        gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', 
                        gap: '16px' 
                    }}>
                        <div style={{ background: 'var(--color-surface)', padding: '16px 20px', borderRadius: '10px', border: '1px solid var(--color-border)' }}>
                            <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Client Code</div>
                            <div style={{ fontSize: '18px', fontWeight: 700, marginTop: '4px', fontFamily: 'monospace' }}>{customer.code || 'Auto'}</div>
                            <div style={{ fontSize: '12px', color: 'var(--color-success)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <i className='bx bx-check-circle'></i> {customer.status || 'Active'}
                            </div>
                        </div>

                        <div style={{ background: 'var(--color-surface)', padding: '16px 20px', borderRadius: '10px', border: '1px solid var(--color-border)' }}>
                            <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Deployment Sites</div>
                            <div style={{ fontSize: '20px', fontWeight: 700, marginTop: '4px' }}>{locations.length} Locations</div>
                            <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                                {contacts.length} Contact Persons
                            </div>
                        </div>

                        <div style={{ background: 'var(--color-surface)', padding: '16px 20px', borderRadius: '10px', border: '1px solid var(--color-border)' }}>
                            <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Active Guard Force</div>
                            <div style={{ fontSize: '20px', fontWeight: 700, marginTop: '4px', color: 'var(--color-primary)' }}>
                                {totalGuards} Guards
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                                Across all active locations
                            </div>
                        </div>

                        <div style={{ background: 'var(--color-surface)', padding: '16px 20px', borderRadius: '10px', border: '1px solid var(--color-border)' }}>
                            <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Monthly Billing (Sale)</div>
                            <div style={{ fontSize: '20px', fontWeight: 700, marginTop: '4px', color: 'var(--color-success, #10b981)' }}>
                                {formatPKR(totalMonthlySale)}
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                                Invoice: {formatPKR(invoiceTotal)}
                            </div>
                        </div>
                    </div>

                    {/* Main Two-Column Grid: Left (Profile & Force Breakdown) & Right (Consolidated Financial Invoice) */}
                    <div style={{ 
                        display: 'grid', 
                        gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', 
                        gap: '20px',
                        alignItems: 'start'
                    }}>
                        
                        {/* LEFT COLUMN */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            
                            {/* Card 1: Company Profile */}
                            <div style={{ 
                                background: 'var(--color-surface)', 
                                padding: '20px', 
                                borderRadius: '12px', 
                                border: '1px solid var(--color-border)' 
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--color-border)', paddingBottom: '12px', marginBottom: '16px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <div style={{ 
                                            width: '36px', 
                                            height: '36px', 
                                            borderRadius: '8px', 
                                            background: 'rgba(var(--color-primary-rgb), 0.1)', 
                                            color: 'var(--color-primary)', 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            justifyContent: 'center',
                                            fontSize: '18px'
                                        }}>
                                            <i className='bx bx-building-house'></i>
                                        </div>
                                        <div>
                                            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>Company Information</h3>
                                            <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Corporate profile and tax identity</div>
                                        </div>
                                    </div>
                                    <span style={{ 
                                        padding: '4px 10px', 
                                        borderRadius: '12px', 
                                        fontSize: '12px', 
                                        fontWeight: 600,
                                        background: 'rgba(16, 185, 129, 0.12)', 
                                        color: '#10b981' 
                                    }}>
                                        {customer.status || 'Active'}
                                    </span>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', fontSize: '13px' }}>
                                    <div>
                                        <span style={{ color: 'var(--color-text-muted)', display: 'block', fontSize: '12px' }}>Client Legal Name</span>
                                        <strong style={{ fontSize: '14px' }}>{customer.name}</strong>
                                    </div>
                                    <div>
                                        <span style={{ color: 'var(--color-text-muted)', display: 'block', fontSize: '12px' }}>Client Code</span>
                                        <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{customer.code || '—'}</span>
                                    </div>
                                    <div>
                                        <span style={{ color: 'var(--color-text-muted)', display: 'block', fontSize: '12px' }}>Tax Number / NTN</span>
                                        <span>{customer.tax_number || '—'}</span>
                                    </div>
                                    <div>
                                        <span style={{ color: 'var(--color-text-muted)', display: 'block', fontSize: '12px' }}>SECP Registration #</span>
                                        <span>{customer.registration_number || '—'}</span>
                                    </div>
                                    <div>
                                        <span style={{ color: 'var(--color-text-muted)', display: 'block', fontSize: '12px' }}>Website</span>
                                        {customer.website ? (
                                            <a 
                                                href={customer.website.startsWith('http') ? customer.website : `https://${customer.website}`} 
                                                target="_blank" 
                                                rel="noopener noreferrer"
                                                style={{ color: 'var(--color-primary)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                            >
                                                {customer.website} <i className='bx bx-link-external' style={{ fontSize: '12px' }}></i>
                                            </a>
                                        ) : (
                                            <span style={{ color: 'var(--color-text-muted)' }}>—</span>
                                        )}
                                    </div>
                                    <div>
                                        <span style={{ color: 'var(--color-text-muted)', display: 'block', fontSize: '12px' }}>Head Office Address</span>
                                        <span style={{ lineHeight: '1.4' }}>
                                            {addressDisplay || <span style={{ color: 'var(--color-text-muted)' }}>No head office address registered</span>}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Card 2: Key Contacts List */}
                            <div style={{ 
                                background: 'var(--color-surface)', 
                                padding: '20px', 
                                borderRadius: '12px', 
                                border: '1px solid var(--color-border)' 
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--color-border)', paddingBottom: '12px', marginBottom: '16px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <div style={{ 
                                            width: '36px', 
                                            height: '36px', 
                                            borderRadius: '8px', 
                                            background: 'rgba(56, 189, 248, 0.1)', 
                                            color: '#0284c7', 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            justifyContent: 'center',
                                            fontSize: '18px'
                                        }}>
                                            <i className='bx bx-user-pin'></i>
                                        </div>
                                        <div>
                                            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>Key Contacts & Decision-Makers</h3>
                                            <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Direct contact channels for this account</div>
                                        </div>
                                    </div>
                                    <Button variant="ghost" size="sm" onClick={() => setActiveTab('contacts')}>
                                        Manage <i className='bx bx-chevron-right'></i>
                                    </Button>
                                </div>

                                {contacts.length === 0 ? (
                                    <div style={{ padding: '16px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '13px' }}>
                                        No contact persons recorded yet.
                                    </div>
                                ) : (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
                                        {contacts.map(c => (
                                            <div 
                                                key={c.id} 
                                                style={{ 
                                                    border: '1px solid var(--color-border)', 
                                                    borderRadius: '8px', 
                                                    padding: '12px', 
                                                    background: 'var(--color-background)',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    gap: '6px'
                                                }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                    <strong style={{ fontSize: '13.5px' }}>{c.first_name} {c.last_name || ''}</strong>
                                                    {c.is_primary && (
                                                        <span style={{ fontSize: '10.5px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(56, 189, 248, 0.15)', color: '#0284c7', fontWeight: 600 }}>
                                                            Primary
                                                        </span>
                                                    )}
                                                </div>
                                                <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                                                    {c.job_title || 'Designation not specified'}
                                                </div>
                                                
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '4px', fontSize: '12px' }}>
                                                    {(c.phone || c.mobile) && (
                                                        <a 
                                                            href={`tel:${c.phone || c.mobile}`} 
                                                            style={{ color: 'var(--color-text)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'var(--color-surface)', padding: '3px 8px', borderRadius: '4px', border: '1px solid var(--color-border)' }}
                                                        >
                                                            <i className='bx bx-phone' style={{ color: 'var(--color-primary)' }}></i> {c.phone || c.mobile}
                                                        </a>
                                                    )}
                                                    {c.whatsapp && (
                                                        <a 
                                                            href={`https://wa.me/${c.whatsapp.replace(/[^0-9]/g, '')}`} 
                                                            target="_blank" 
                                                            rel="noopener noreferrer"
                                                            style={{ color: '#16a34a', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(22, 163, 74, 0.08)', padding: '3px 8px', borderRadius: '4px', border: '1px solid rgba(22, 163, 74, 0.2)' }}
                                                        >
                                                            <i className='bx bxl-whatsapp'></i> {c.whatsapp}
                                                        </a>
                                                    )}
                                                    {c.email && (
                                                        <a 
                                                            href={`mailto:${c.email}`} 
                                                            style={{ color: 'var(--color-text)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'var(--color-surface)', padding: '3px 8px', borderRadius: '4px', border: '1px solid var(--color-border)' }}
                                                        >
                                                            <i className='bx bx-envelope' style={{ color: '#6366f1' }}></i> {c.email}
                                                        </a>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Card 3: Location-wise Deployment & Force Allocation Breakdown */}
                            <div style={{ 
                                background: 'var(--color-surface)', 
                                padding: '20px', 
                                borderRadius: '12px', 
                                border: '1px solid var(--color-border)' 
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--color-border)', paddingBottom: '12px', marginBottom: '16px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <div style={{ 
                                            width: '36px', 
                                            height: '36px', 
                                            borderRadius: '8px', 
                                            background: 'rgba(16, 185, 129, 0.1)', 
                                            color: '#10b981', 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            justifyContent: 'center',
                                            fontSize: '18px'
                                        }}>
                                            <i className='bx bx-map-pin'></i>
                                        </div>
                                        <div>
                                            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>Deployment Locations & Force Breakdown</h3>
                                            <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Location-wise security personnel allocations & monthly billing</div>
                                        </div>
                                    </div>
                                    <Button variant="ghost" size="sm" onClick={() => setActiveTab('locations')}>
                                        Manage Sites <i className='bx bx-chevron-right'></i>
                                    </Button>
                                </div>

                                {locations.length === 0 ? (
                                    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '13px' }}>
                                        No deployment sites registered yet. Locations are created automatically when building requirements in Fast Costing Grid.
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                        {locationLineGroups.map(grp => (
                                            <div 
                                                key={grp.location.id}
                                                style={{ 
                                                    border: '1px solid var(--color-border)', 
                                                    borderRadius: '8px', 
                                                    overflow: 'hidden',
                                                    background: 'var(--color-background)'
                                                }}
                                            >
                                                {/* Location Sub-Header */}
                                                <div style={{ 
                                                    padding: '10px 14px', 
                                                    background: 'var(--color-surface)', 
                                                    borderBottom: '1px solid var(--color-border)',
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center'
                                                }}>
                                                    <div>
                                                        <strong style={{ fontSize: '13.5px' }}>{grp.location.name}</strong>
                                                        {grp.location.address && (
                                                            <div style={{ fontSize: '11.5px', color: 'var(--color-text-muted)' }}>{grp.location.address}</div>
                                                        )}
                                                    </div>
                                                    <div style={{ textAlign: 'right' }}>
                                                        <span style={{ 
                                                            fontSize: '12px', 
                                                            padding: '2px 8px', 
                                                            borderRadius: '10px', 
                                                            background: grp.totalGuards > 0 ? 'rgba(var(--color-primary-rgb), 0.12)' : 'rgba(0,0,0,0.05)', 
                                                            color: grp.totalGuards > 0 ? 'var(--color-primary)' : 'var(--color-text-muted)',
                                                            fontWeight: 600 
                                                        }}>
                                                            {grp.totalGuards} Guards
                                                        </span>
                                                        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-success)', marginTop: '2px' }}>
                                                            {formatPKR(grp.totalSale)} / mo
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Inner Lines */}
                                                {grp.lines.length === 0 ? (
                                                    <div style={{ padding: '10px 14px', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                                                        No guard staffing lines allocated for this location yet.
                                                    </div>
                                                ) : (
                                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                                                        <thead>
                                                            <tr style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-muted)', fontSize: '11px', textAlign: 'left' }}>
                                                                <th style={{ padding: '6px 14px', fontWeight: 600 }}>ROLE / DESIGNATION</th>
                                                                <th style={{ padding: '6px 10px', fontWeight: 600, textAlign: 'center' }}>QTY</th>
                                                                <th style={{ padding: '6px 10px', fontWeight: 600, textAlign: 'right' }}>RATE / HEAD</th>
                                                                <th style={{ padding: '6px 14px', fontWeight: 600, textAlign: 'right' }}>LINE TOTAL</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {grp.lines.map((l, lIdx) => {
                                                                const lineSale = Number(l.line_sale) || ((Number(l.quantity) || 0) * (Number(l.client_rate) || 0));
                                                                return (
                                                                    <tr key={l.id || lIdx} style={{ borderBottom: lIdx < grp.lines.length - 1 ? '1px solid var(--color-border)' : 'none' }}>
                                                                        <td style={{ padding: '8px 14px' }}>
                                                                            <strong style={{ color: 'var(--color-text)' }}>{l.service_type_name || 'Security Personnel'}</strong>
                                                                            {l.shift_hours && <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginLeft: '6px' }}>({l.shift_hours})</span>}
                                                                        </td>
                                                                        <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 600 }}>{l.quantity}</td>
                                                                        <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'monospace' }}>{formatPKR(l.client_rate)}</td>
                                                                        <td style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 600, color: 'var(--color-text)', fontFamily: 'monospace' }}>
                                                                            {formatPKR(lineSale)}
                                                                        </td>
                                                                    </tr>
                                                                );
                                                            })}
                                                        </tbody>
                                                    </table>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                        </div>

                        {/* RIGHT COLUMN: EXECUTIVE INVOICE & COMMERCIAL SUMMARY (ALL LOCATIONS TOTAL) */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <div style={{ 
                                background: 'var(--color-surface)', 
                                borderRadius: '12px', 
                                border: '1px solid var(--color-border)',
                                overflow: 'hidden',
                                boxShadow: '0 4px 16px rgba(0,0,0,0.04)'
                            }}>
                                {/* Header */}
                                <div style={{ 
                                    padding: '16px 20px', 
                                    background: 'linear-gradient(135deg, var(--color-surface) 0%, rgba(var(--color-primary-rgb), 0.08) 100%)',
                                    borderBottom: '1px solid var(--color-border)',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                }}>
                                    <div>
                                        <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, color: 'var(--color-primary)' }}>
                                            Consolidated Financial Invoice
                                        </div>
                                        <h3 style={{ margin: '4px 0 0 0', fontSize: '16px', fontWeight: 700 }}>
                                            All Locations Summary
                                        </h3>
                                    </div>
                                    <i className='bx bx-receipt' style={{ fontSize: '28px', color: 'var(--color-primary)' }}></i>
                                </div>

                                {/* Body / Line by Line Breakdown */}
                                <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '13px' }}>
                                    
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ color: 'var(--color-text-muted)' }}>Total Guard Strength</span>
                                        <strong style={{ fontSize: '14px', color: 'var(--color-primary)' }}>{totalGuards} Guards</strong>
                                    </div>

                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ color: 'var(--color-text)' }}>Gross Monthly Billing (Sale)</span>
                                        <strong style={{ fontSize: '14px', fontFamily: 'monospace' }}>{formatPKR(totalMonthlySale)}</strong>
                                    </div>

                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ color: 'var(--color-text-muted)' }}>Direct Guard Salaries (Cost)</span>
                                        <span style={{ fontFamily: 'monospace', color: 'var(--color-text-muted)' }}>{formatPKR(totalMonthlySalary)}</span>
                                    </div>

                                    <div style={{ 
                                        display: 'flex', 
                                        justifyContent: 'space-between', 
                                        alignItems: 'center', 
                                        padding: '8px 10px', 
                                        background: 'var(--color-background)', 
                                        borderRadius: '6px' 
                                    }}>
                                        <span style={{ fontWeight: 600 }}>Direct Gross Margin</span>
                                        <strong style={{ color: grossMargin >= 0 ? '#10b981' : '#ef4444', fontFamily: 'monospace' }}>
                                            {formatPKR(grossMargin)}
                                        </strong>
                                    </div>

                                    <div style={{ height: '1px', background: 'var(--color-border)', margin: '4px 0' }} />

                                    {/* Operational & Service Charges */}
                                    <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)', fontWeight: 700 }}>
                                        Overheads & Commercial Charges
                                    </div>

                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ color: 'var(--color-text-muted)' }}>Operational Expenses (Overhead)</span>
                                        <span style={{ fontFamily: 'monospace' }}>{formatPKR(overheadExpense)}</span>
                                    </div>

                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ color: 'var(--color-text-muted)' }}>Management Service Charges</span>
                                        <span style={{ fontFamily: 'monospace' }}>{formatPKR(serviceCharges)}</span>
                                    </div>

                                    <div style={{ height: '1px', background: 'var(--color-border)', margin: '4px 0' }} />

                                    {/* Statutory Taxes & Contributions */}
                                    <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)', fontWeight: 700 }}>
                                        Statutory & Taxation Breakdown
                                    </div>

                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ color: 'var(--color-text-muted)' }}>SESSI Contribution</span>
                                        <span style={{ fontFamily: 'monospace' }}>{formatPKR(sessi)}</span>
                                    </div>

                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ color: 'var(--color-text-muted)' }}>EOBI Contribution</span>
                                        <span style={{ fontFamily: 'monospace' }}>{formatPKR(eobi)}</span>
                                    </div>

                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ color: 'var(--color-text-muted)' }}>Sales Tax (PRA / SRB / GST)</span>
                                        <span style={{ fontFamily: 'monospace', color: 'var(--color-text)' }}>{formatPKR(salesTax)}</span>
                                    </div>

                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ color: 'var(--color-text-muted)' }}>Withholding Tax (WHT)</span>
                                        <span style={{ fontFamily: 'monospace', color: 'var(--color-text-muted)' }}>{formatPKR(withholdingTax)}</span>
                                    </div>

                                    <div style={{ height: '1px', background: 'var(--color-border)', margin: '4px 0' }} />

                                    {/* Final Prominent Totals */}
                                    <div style={{ 
                                        padding: '14px', 
                                        borderRadius: '8px', 
                                        background: 'rgba(var(--color-primary-rgb), 0.08)',
                                        border: '1px solid rgba(var(--color-primary-rgb), 0.25)',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '8px'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontWeight: 700, fontSize: '14px' }}>Net Monthly Client Invoice</span>
                                            <strong style={{ fontSize: '18px', color: 'var(--color-primary)', fontFamily: 'monospace' }}>
                                                {formatPKR(invoiceTotal)}
                                            </strong>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                                            <span style={{ color: 'var(--color-text-muted)' }}>Projected Monthly Net Profit</span>
                                            <strong style={{ color: netProfit >= 0 ? '#10b981' : '#ef4444', fontFamily: 'monospace' }}>
                                                {formatPKR(netProfit)}
                                            </strong>
                                        </div>
                                    </div>

                                    {/* Action to Final Requirements */}
                                    <div style={{ marginTop: '8px' }}>
                                        {proposals.length > 0 ? (
                                            <Button 
                                                variant="primary" 
                                                style={{ width: '100%' }}
                                                onClick={() => onOpenProposal(proposals[0].id)}
                                            >
                                                <i className='bx bx-edit-alt'></i> Open Final Requirements Sheet
                                            </Button>
                                        ) : (
                                            <Button 
                                                variant="primary" 
                                                style={{ width: '100%' }}
                                                onClick={handleCreateRequirement}
                                            >
                                                <i className='bx bx-plus'></i> Set Final Requirements
                                            </Button>
                                        )}
                                    </div>

                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            )}

            {activeTab === 'contacts' && (
                <div style={{ background: 'var(--color-surface)', padding: '24px', borderRadius: '12px', border: '1px solid var(--color-border)' }}>
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
                <div style={{ background: 'var(--color-surface)', padding: '24px', borderRadius: '12px', border: '1px solid var(--color-border)' }}>
                    <div style={{ marginBottom: '16px' }}>
                        <div style={{ color: 'var(--color-text-muted)', fontSize: '13.5px', lineHeight: '1.5' }}>
                            Registered deployment sites, headquarters, and branch locations. 
                            <strong> Note:</strong> New locations and force allocations are created via the <strong>Fast Costing Grid</strong>. Existing sites can be reviewed, edited, or deleted below.
                        </div>
                    </div>
                    <DataTable 
                        data={locations}
                        columns={locColumns}
                        keyExtractor={(row) => row.id}
                        emptyMessage="No locations found. Locations are registered automatically when setting requirements in the Fast Costing Grid."
                    />
                </div>
            )}

            {activeTab === 'requirements' && (
                <div style={{ background: 'var(--color-surface)', padding: '24px', borderRadius: '12px', border: '1px solid var(--color-border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <div style={{ color: 'var(--color-text-muted)', fontSize: '13.5px' }}>
                            Commercial service requirements and guard staffing for this client.
                        </div>
                        <Button variant="primary" onClick={handleCreateRequirement}>
                            <i className='bx bx-plus'></i> Add Requirements
                        </Button>
                    </div>
                    <DataTable 
                        data={proposals}
                        columns={propColumns}
                        keyExtractor={(row) => row.id}
                        emptyMessage="No requirement sheets found. Click 'Add Requirements' to set guard staffing and rates."
                    />
                </div>
            )}

            {/* Direct Client Email Composer Modal */}
            {showEmailComposer && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
                    <div style={{ width: '800px', maxHeight: '90vh', overflowY: 'auto' }}>
                        <EmailComposer 
                            contextType="client"
                            contextId={customerId}
                            prefillTo={contacts.find(c => c.is_primary)?.email || contacts[0]?.email || ''}
                            prefillSubject={`Update regarding security services for ${customer.name}`}
                            onTriggerSend={async () => {
                                useToastStore.getState().success('Email sent successfully!');
                                setShowEmailComposer(false);
                            }}
                            onCancel={() => setShowEmailComposer(false)}
                        />
                    </div>
                </div>
            )}

            {/* Reusable Contact Modal */}
            <ContactModal 
                isOpen={isContactModalOpen}
                onClose={() => setIsContactModalOpen(false)}
                onSaved={loadData}
                entityId={customerId}
                contact={editingContact}
            />

            {/* Edit Location Modal */}
            <Modal
                isOpen={isLocationModalOpen}
                onClose={() => { setIsLocationModalOpen(false); setEditingLocation(null); }}
                title="Edit Client Location / Site"
                footer={
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                        <Button variant="ghost" onClick={() => { setIsLocationModalOpen(false); setEditingLocation(null); }}>
                            Cancel
                        </Button>
                        <Button 
                            variant="primary" 
                            disabled={isSubmittingLocation || !locationName.trim()}
                            onClick={handleSaveLocation}
                        >
                            {isSubmittingLocation ? 'Saving...' : 'Update Location'}
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
