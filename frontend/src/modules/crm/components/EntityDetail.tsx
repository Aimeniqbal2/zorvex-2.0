import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { ErrorState } from '../../../components/ui/ErrorState';
import { useToastStore } from '../../../stores/toastStore';
import { getEntity, updateEntity } from '../api';
import type { CRMEntity } from '../types';
import { EntityModal } from './EntityModal';

// Child components
import { ContactsList } from './ContactsList';
import { AddressesList } from './AddressesList';
import { CommunicationsList } from './CommunicationsList';
import { NotesList } from './NotesList';
import { AttachmentsList } from './AttachmentsList';

interface EntityDetailProps {
    entityId: string;
    onBack: () => void;
}

type DetailTab = 'overview' | 'contacts' | 'addresses' | 'communications' | 'notes' | 'attachments';

export const EntityDetail: React.FC<EntityDetailProps> = ({ entityId, onBack }) => {
    const [entity, setEntity] = useState<CRMEntity | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);
    const [activeTab, setActiveTab] = useState<DetailTab>('overview');
    
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);

    const fetchEntity = useCallback(async () => {
        setIsLoading(true);
        setHasError(false);
        try {
            const data = await getEntity(entityId);
            setEntity(data);
        } catch (error) {
            setHasError(true);
            useToastStore.getState().error('Failed to load entity details.');
        } finally {
            setIsLoading(false);
        }
    }, [entityId]);

    useEffect(() => {
        fetchEntity();
    }, [fetchEntity]);

    const handleToggleActive = async () => {
        if (!entity) return;
        try {
            const updated = await updateEntity(entity.id, { active: !entity.active });
            setEntity(updated);
            useToastStore.getState().success(`Entity ${updated.active ? 'reactivated' : 'deactivated'} successfully`);
        } catch (error) {
            useToastStore.getState().error('Failed to update entity status');
        }
    };

    if (isLoading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '64px' }}>
                <i className='bx bx-loader-alt bx-spin' style={{ fontSize: '32px', color: 'var(--color-primary)' }}></i>
            </div>
        );
    }

    if (hasError || !entity) {
        return (
            <div style={{ padding: '24px' }}>
                <Button variant="ghost" onClick={onBack} style={{ marginBottom: '16px' }}>
                    <i className='bx bx-arrow-back'></i> Back to List
                </Button>
                <ErrorState 
                    title="Entity Not Found" 
                    message="The entity you are looking for does not exist or you do not have permission to view it." 
                    onRetry={fetchEntity} 
                />
            </div>
        );
    }

    const primaryContact = entity.contacts?.find(c => c.is_primary) || entity.contacts?.[0];

    const tabs: { id: DetailTab; label: string; icon: string }[] = [
        { id: 'overview', label: 'Overview', icon: 'bx-info-circle' },
        { id: 'contacts', label: 'Contacts', icon: 'bx-group' },
        { id: 'addresses', label: 'Addresses', icon: 'bx-map' },
        { id: 'communications', label: 'Communications', icon: 'bx-message-square-detail' },
        { id: 'notes', label: 'Notes', icon: 'bx-note' },
        { id: 'attachments', label: 'Attachments', icon: 'bx-paperclip' }
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
            <div style={{ padding: '0 24px', backgroundColor: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)' }}>
                <div style={{ padding: '16px 0' }}>
                    <Button variant="ghost" onClick={onBack} style={{ marginBottom: '16px', marginLeft: '-12px' }}>
                        <i className='bx bx-arrow-back'></i> Back to List
                    </Button>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                                <h1 style={{ fontSize: '24px', fontWeight: 600, margin: 0 }}>
                                    {entity.display_name || entity.name}
                                </h1>
                                {!entity.active && <Badge variant="danger">Inactive</Badge>}
                                <Badge variant="default">{entity.entity_type}</Badge>
                            </div>
                            <div style={{ color: 'var(--color-text-muted)', display: 'flex', gap: '16px', fontSize: '14px' }}>
                                <span><i className='bx bx-barcode' style={{ verticalAlign: 'middle', marginRight: '4px' }}></i>{entity.code}</span>
                                {primaryContact && (
                                    <>
                                        {primaryContact.email && <span><i className='bx bx-envelope' style={{ verticalAlign: 'middle', marginRight: '4px' }}></i>{primaryContact.email}</span>}
                                        {primaryContact.phone && <span><i className='bx bx-phone' style={{ verticalAlign: 'middle', marginRight: '4px' }}></i>{primaryContact.phone}</span>}
                                    </>
                                )}
                            </div>
                        </div>
                        
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <Button variant="secondary" onClick={() => setIsEditModalOpen(true)}>
                                <i className='bx bx-edit-alt'></i> Edit
                            </Button>
                            <Button variant={entity.active ? 'ghost' : 'primary'} onClick={handleToggleActive}>
                                <i className={entity.active ? 'bx bx-user-x' : 'bx bx-user-check'}></i> 
                                {entity.active ? 'Deactivate' : 'Reactivate'}
                            </Button>
                        </div>
                    </div>
                </div>

                <div className="crm-filters" style={{ marginBottom: 0, paddingBottom: 0 }}>
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            className={`crm-filter-btn ${activeTab === tab.id ? 'active' : ''}`}
                            onClick={() => setActiveTab(tab.id)}
                            style={{ 
                                borderRadius: '0', 
                                border: 'none', 
                                borderBottom: activeTab === tab.id ? '2px solid var(--color-primary)' : '2px solid transparent',
                                backgroundColor: 'transparent',
                                padding: '12px 16px',
                                boxShadow: 'none'
                            }}
                        >
                            <i className={`bx ${tab.icon}`} style={{ marginRight: '6px' }}></i>
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            <div style={{ padding: '24px', flex: 1, backgroundColor: 'var(--color-background)' }}>
                {activeTab === 'overview' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                        {/* Overview content */}
                        <div style={{ backgroundColor: 'var(--color-surface)', padding: '20px', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
                            <h3 style={{ fontSize: '14px', marginBottom: '16px', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Basic Information</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr' }}><span style={{ color: 'var(--color-text-muted)' }}>Name</span> <span>{entity.name}</span></div>
                                <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr' }}><span style={{ color: 'var(--color-text-muted)' }}>Display Name</span> <span>{entity.display_name || '—'}</span></div>
                                <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr' }}><span style={{ color: 'var(--color-text-muted)' }}>Code</span> <span>{entity.code}</span></div>
                                <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr' }}><span style={{ color: 'var(--color-text-muted)' }}>Status</span> <span>{entity.status}</span></div>
                            </div>
                        </div>

                        <div style={{ backgroundColor: 'var(--color-surface)', padding: '20px', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
                            <h3 style={{ fontSize: '14px', marginBottom: '16px', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Business Information</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr' }}><span style={{ color: 'var(--color-text-muted)' }}>Tax Number</span> <span>{entity.tax_number || '—'}</span></div>
                                <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr' }}><span style={{ color: 'var(--color-text-muted)' }}>Registration No.</span> <span>{entity.registration_number || '—'}</span></div>
                                <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr' }}><span style={{ color: 'var(--color-text-muted)' }}>Website</span> {entity.website ? <a href={entity.website} target="_blank" rel="noreferrer" style={{ color: 'var(--color-primary)' }}>{entity.website}</a> : <span>—</span>}</div>
                            </div>
                        </div>

                        <div style={{ backgroundColor: 'var(--color-surface)', padding: '20px', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
                            <h3 style={{ fontSize: '14px', marginBottom: '16px', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Commercial Details</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr' }}><span style={{ color: 'var(--color-text-muted)' }}>Credit Limit</span> <span>{entity.credit_limit ? `${entity.credit_limit} ${entity.preferred_currency}` : '—'}</span></div>
                                <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr' }}><span style={{ color: 'var(--color-text-muted)' }}>Payment Terms</span> <span>{entity.payment_terms || '—'}</span></div>
                                <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr' }}><span style={{ color: 'var(--color-text-muted)' }}>Pref. Currency</span> <span>{entity.preferred_currency || '—'}</span></div>
                                <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr' }}><span style={{ color: 'var(--color-text-muted)' }}>Pref. Language</span> <span>{entity.preferred_language || '—'}</span></div>
                            </div>
                        </div>
                        
                        {/* Tags can be placed here if needed */}
                        <div style={{ backgroundColor: 'var(--color-surface)', padding: '20px', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
                            <h3 style={{ fontSize: '14px', marginBottom: '16px', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Tags</h3>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                {entity.tags && entity.tags.length > 0 ? (
                                    entity.tags.map(tag => (
                                        <span key={tag.id} style={{ 
                                            backgroundColor: tag.color || 'var(--color-surface-secondary)', 
                                            padding: '4px 8px', 
                                            borderRadius: '4px',
                                            fontSize: '12px'
                                        }}>
                                            {tag.name}
                                        </span>
                                    ))
                                ) : (
                                    <span style={{ color: 'var(--color-text-muted)' }}>No tags attached.</span>
                                )}
                            </div>
                        </div>
                    </div>
                )}
                
                {activeTab === 'contacts' && <ContactsList entityId={entityId} />}
                {activeTab === 'addresses' && <AddressesList entityId={entityId} />}
                {activeTab === 'communications' && <CommunicationsList entityId={entityId} />}
                {activeTab === 'notes' && <NotesList entityId={entityId} />}
                {activeTab === 'attachments' && <AttachmentsList entityId={entityId} />}
                
            </div>

            <EntityModal 
                isOpen={isEditModalOpen} 
                onClose={() => setIsEditModalOpen(false)} 
                onSaved={fetchEntity}
                entity={entity}
            />
        </div>
    );
};
