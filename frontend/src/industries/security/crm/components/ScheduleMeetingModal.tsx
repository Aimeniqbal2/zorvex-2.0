import React, { useState, useEffect } from 'react';
import { Modal } from '../../../../components/ui/Modal';
import { Button } from '../../../../components/ui/Button';
import { useToastStore } from '../../../../stores/toastStore';
import { 
    createProposalMeeting, 
    getCustomerContacts, 
    getCompanyUsers,
    type SecurityProposal
} from '../api';

interface Props {
    proposal: SecurityProposal;
    onClose: () => void;
    onScheduled: () => void;
}

export const ScheduleMeetingModal: React.FC<Props> = ({ proposal, onClose, onScheduled }) => {
    const [subject, setSubject] = useState(`Discussion regarding Proposal ${proposal.proposal_number}`);
    const [meetingType, setMeetingType] = useState<'FACE_TO_FACE' | 'ONLINE' | 'PHONE' | 'OTHER'>('FACE_TO_FACE');
    const [scheduledAt, setScheduledAt] = useState('');
    const [location, setLocation] = useState('');
    const [meetingLink, setMeetingLink] = useState('');
    const [agenda, setAgenda] = useState('');
    
    // Participants selection
    const [customerContacts, setCustomerContacts] = useState<any[]>([]);
    const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
    
    const [companyUsers, setCompanyUsers] = useState<any[]>([]);
    const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);

    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        // Set default scheduled time to tomorrow 10:00 AM
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(10, 0, 0, 0);
        setScheduledAt(tomorrow.toISOString().slice(0, 16));

        // Load customer contacts (isolated to proposal customer)
        if (proposal.customer) {
            getCustomerContacts(proposal.customer).then(contacts => {
                setCustomerContacts(contacts || []);
                if (contacts && contacts.length > 0) {
                    setSelectedContactIds([contacts[0].id]);
                }
            }).catch(console.error);
        }

        // Load company internal users
        getCompanyUsers().then(users => {
            setCompanyUsers(users || []);
        }).catch(console.error);
    }, [proposal]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!subject.trim()) {
            useToastStore.getState().error('Please enter a meeting subject.');
            return;
        }
        if (!scheduledAt) {
            useToastStore.getState().error('Please select a scheduled date and time.');
            return;
        }

        setIsSaving(true);
        try {
            const participants: any[] = [];

            // Add selected customer contacts
            selectedContactIds.forEach(contactId => {
                const contact = customerContacts.find(c => c.id === contactId);
                participants.push({
                    participant_type: 'CUSTOMER_CONTACT',
                    crm_contact: contactId,
                    role: contact?.job_title || 'Client Representative'
                });
            });

            // Add selected internal staff
            selectedUserIds.forEach(userId => {
                const u = companyUsers.find(user => user.id === userId);
                participants.push({
                    participant_type: 'INTERNAL_USER',
                    user: userId,
                    role: u?.role || 'Staff'
                });
            });

            await createProposalMeeting({
                proposal: proposal.id,
                subject,
                meeting_type: meetingType,
                scheduled_at: new Date(scheduledAt).toISOString(),
                location: meetingType === 'FACE_TO_FACE' ? location : '',
                meeting_link: meetingType === 'ONLINE' ? meetingLink : '',
                agenda,
                participants
            });

            useToastStore.getState().success('Meeting scheduled successfully.');
            onScheduled();
            onClose();
        } catch (err: any) {
            const msg = err.response?.data?.error || err.response?.data?.detail || 'Failed to schedule meeting.';
            useToastStore.getState().error(msg);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal title={`Schedule Meeting - ${proposal.proposal_number}`} onClose={onClose} width="650px">
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
                        Meeting Subject *
                    </label>
                    <input 
                        type="text" 
                        className="input"
                        value={subject} 
                        onChange={e => setSubject(e.target.value)} 
                        required 
                        style={{ width: '100%' }}
                    />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
                            Meeting Type *
                        </label>
                        <select 
                            className="input" 
                            value={meetingType} 
                            onChange={e => setMeetingType(e.target.value as any)}
                            style={{ width: '100%' }}
                        >
                            <option value="FACE_TO_FACE">Face-to-Face (On-Site / Office)</option>
                            <option value="ONLINE">Online / Video Call (Zoom, Teams, Meet)</option>
                            <option value="PHONE">Phone Call</option>
                            <option value="OTHER">Other</option>
                        </select>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
                            Scheduled Date & Time *
                        </label>
                        <input 
                            type="datetime-local" 
                            className="input"
                            value={scheduledAt} 
                            onChange={e => setScheduledAt(e.target.value)} 
                            required 
                            style={{ width: '100%' }}
                        />
                    </div>
                </div>

                {meetingType === 'FACE_TO_FACE' && (
                    <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
                            Meeting Location / Address
                        </label>
                        <input 
                            type="text" 
                            className="input"
                            placeholder="e.g. Client Head Office, 4th Floor Conference Room"
                            value={location} 
                            onChange={e => setLocation(e.target.value)} 
                            style={{ width: '100%' }}
                        />
                    </div>
                )}

                {meetingType === 'ONLINE' && (
                    <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
                            Online Meeting Link / Instructions
                        </label>
                        <input 
                            type="url" 
                            className="input"
                            placeholder="https://meet.google.com/... or https://zoom.us/j/..."
                            value={meetingLink} 
                            onChange={e => setMeetingLink(e.target.value)} 
                            style={{ width: '100%' }}
                        />
                    </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    {/* Customer Contacts Selection */}
                    <div style={{ background: 'var(--color-surface)', padding: '12px', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>
                            Client Attendees ({proposal.customer_name || 'Client'})
                        </label>
                        {customerContacts.length === 0 ? (
                            <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', margin: 0 }}>
                                No contacts found for this client.
                            </p>
                        ) : (
                            <div style={{ maxHeight: '120px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {customerContacts.map(c => (
                                    <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                                        <input 
                                            type="checkbox"
                                            checked={selectedContactIds.includes(c.id)}
                                            onChange={() => {
                                                setSelectedContactIds(prev => 
                                                    prev.includes(c.id) ? prev.filter(id => id !== c.id) : [...prev, c.id]
                                                );
                                            }}
                                        />
                                        <span>{c.first_name} {c.last_name} {c.job_title ? `(${c.job_title})` : ''}</span>
                                    </label>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Internal Users Selection */}
                    <div style={{ background: 'var(--color-surface)', padding: '12px', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>
                            Internal Staff
                        </label>
                        {companyUsers.length === 0 ? (
                            <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', margin: 0 }}>
                                Loading team members...
                            </p>
                        ) : (
                            <div style={{ maxHeight: '120px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {companyUsers.map(u => (
                                    <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                                        <input 
                                            type="checkbox"
                                            checked={selectedUserIds.includes(u.id)}
                                            onChange={() => {
                                                setSelectedUserIds(prev => 
                                                    prev.includes(u.id) ? prev.filter(id => id !== u.id) : [...prev, u.id]
                                                );
                                            }}
                                        />
                                        <span>{u.first_name || u.username} {u.last_name || ''} ({u.role})</span>
                                    </label>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
                        Meeting Agenda & Preparation Notes
                    </label>
                    <textarea 
                        className="input" 
                        rows={3}
                        placeholder="Key points to discuss, client concerns to address, guard deployment scope..."
                        value={agenda}
                        onChange={e => setAgenda(e.target.value)}
                        style={{ width: '100%', resize: 'vertical' }}
                    />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                    <Button variant="secondary" onClick={onClose} disabled={isSaving}>
                        Cancel
                    </Button>
                    <Button variant="primary" type="submit" disabled={isSaving}>
                        {isSaving ? 'Scheduling...' : 'Schedule Meeting'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
};
