import React, { useState, useEffect } from 'react';
import { Modal } from '../../../../components/ui/Modal';
import { Button } from '../../../../components/ui/Button';
import { Input } from '../../../../components/ui/Input';
import { useToastStore } from '../../../../stores/toastStore';
import { 
    createAssessment, 
    getClientLocations, 
    getCompanyUsers 
} from '../api';
import type { 
    SecurityProposal, 
    ClientLocation, 
    SecurityAssessment 
} from '../api';

interface Props {
    isOpen: boolean;
    proposal: SecurityProposal;
    existingLocationIds: string[];
    onClose: () => void;
    onCreated: (assessment: SecurityAssessment) => void;
}

export const CreateAssessmentModal: React.FC<Props> = ({
    isOpen,
    proposal,
    existingLocationIds,
    onClose,
    onCreated
}) => {
    const [locations, setLocations] = useState<ClientLocation[]>([]);
    const [users, setUsers] = useState<any[]>([]);
    const [locationId, setLocationId] = useState('');
    const [assessedById, setAssessedById] = useState('');
    const [assessmentDate, setAssessmentDate] = useState(new Date().toISOString().split('T')[0]);
    const [operatingHours, setOperatingHours] = useState('24/7 (3 Shifts)');
    const [siteOverview, setSiteOverview] = useState('');
    const [notes, setNotes] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isLoadingData, setIsLoadingData] = useState(true);

    useEffect(() => {
        if (isOpen) {
            const fetchData = async () => {
                setIsLoadingData(true);
                try {
                    const [locsRes, usersRes] = await Promise.all([
                        getClientLocations(proposal.customer),
                        getCompanyUsers()
                    ]);
                    const availableLocs = (locsRes.results || []).filter(
                        loc => !existingLocationIds.includes(loc.id)
                    );
                    setLocations(availableLocs);
                    if (availableLocs.length > 0) {
                        setLocationId(availableLocs[0].id);
                    }
                    setUsers(usersRes || []);
                } catch (err) {
                    console.error('Failed to load initial data for assessment creation', err);
                } finally {
                    setIsLoadingData(false);
                }
            };
            fetchData();
        }
    }, [isOpen, proposal.customer, existingLocationIds]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!locationId) {
            useToastStore.getState().error('Please select a client location.');
            return;
        }

        setIsSubmitting(true);
        try {
            const newAssessment = await createAssessment({
                proposal: proposal.id,
                client_location: locationId,
                assessed_by: assessedById || undefined,
                assessment_date: assessmentDate || null,
                operating_hours: operatingHours,
                site_overview: siteOverview,
                notes: notes,
                status: 'IN_PROGRESS'
            });

            useToastStore.getState().success('Site Assessment created successfully.');
            onCreated(newAssessment);
            onClose();
        } catch (err: any) {
            const errorMsg = err.response?.data?.client_location || err.response?.data?.error || err.message || 'Failed to create assessment.';
            useToastStore.getState().error(Array.isArray(errorMsg) ? errorMsg.join(', ') : errorMsg);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Initiate Site Security Assessment" width="600px">
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {isLoadingData ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                        <i className='bx bx-loader-alt bx-spin' style={{ fontSize: '24px' }}></i>
                        <p style={{ marginTop: '8px' }}>Loading client locations...</p>
                    </div>
                ) : locations.length === 0 ? (
                    <div style={{ padding: '20px', background: 'var(--color-surface-secondary)', borderRadius: '6px', textAlign: 'center' }}>
                        <i className='bx bx-info-circle' style={{ fontSize: '28px', color: 'var(--color-primary)' }}></i>
                        <p style={{ marginTop: '8px', fontWeight: 500 }}>All locations already have assessments.</p>
                        <p style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
                            Add more locations under the customer profile if needed.
                        </p>
                    </div>
                ) : (
                    <>
                        <div>
                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
                                Client Location *
                            </label>
                            <select 
                                value={locationId} 
                                onChange={e => setLocationId(e.target.value)}
                                required
                                style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: '6px', background: 'var(--color-surface)', color: 'var(--color-text)' }}
                            >
                                {locations.map(loc => (
                                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                                ))}
                            </select>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
                                    Assessed By (Staff)
                                </label>
                                <select 
                                    value={assessedById} 
                                    onChange={e => setAssessedById(e.target.value)}
                                    style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: '6px', background: 'var(--color-surface)', color: 'var(--color-text)' }}
                                >
                                    <option value="">Current User / Unassigned</option>
                                    {users.map(u => (
                                        <option key={u.id} value={u.id}>{u.first_name ? `${u.first_name} ${u.last_name}` : u.username}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
                                    Assessment Date
                                </label>
                                <Input 
                                    type="date"
                                    value={assessmentDate}
                                    onChange={e => setAssessmentDate(e.target.value)}
                                />
                            </div>
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
                                Operating Hours
                            </label>
                            <Input 
                                placeholder="e.g. 24/7, Mon-Fri 08:00-18:00, 2 Shifts"
                                value={operatingHours}
                                onChange={e => setOperatingHours(e.target.value)}
                            />
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
                                Initial Site Overview
                            </label>
                            <textarea 
                                rows={3}
                                placeholder="Brief description of the facility layout, perimeter, and access..."
                                value={siteOverview}
                                onChange={e => setSiteOverview(e.target.value)}
                                style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: '6px', background: 'var(--color-surface)', color: 'var(--color-text)', resize: 'vertical' }}
                            />
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
                                General Notes
                            </label>
                            <textarea 
                                rows={2}
                                placeholder="Any special survey coordination notes..."
                                value={notes}
                                onChange={e => setNotes(e.target.value)}
                                style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: '6px', background: 'var(--color-surface)', color: 'var(--color-text)', resize: 'vertical' }}
                            />
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                            <Button type="button" variant="secondary" onClick={onClose}>
                                Cancel
                            </Button>
                            <Button type="submit" variant="primary" loading={isSubmitting}>
                                <i className='bx bx-check-circle'></i> Create Assessment
                            </Button>
                        </div>
                    </>
                )}
            </form>
        </Modal>
    );
};
