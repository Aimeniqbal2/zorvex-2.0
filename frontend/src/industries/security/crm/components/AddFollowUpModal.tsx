import React, { useState, useEffect } from 'react';
import { Modal } from '../../../../components/ui/Modal';
import { Button } from '../../../../components/ui/Button';
import { useToastStore } from '../../../../stores/toastStore';
import { 
    createProposalFollowUp, 
    getCompanyUsers, 
    type SecurityProposal, 
    type SecurityProposalMeeting 
} from '../api';

interface Props {
    proposal: SecurityProposal;
    meetings: SecurityProposalMeeting[];
    defaultMeetingId?: string | null;
    onClose: () => void;
    onAdded: () => void;
}

export const AddFollowUpModal: React.FC<Props> = ({ 
    proposal, 
    meetings, 
    defaultMeetingId, 
    onClose, 
    onAdded 
}) => {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [dueAt, setDueAt] = useState('');
    const [priority, setPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'>('MEDIUM');
    const [assignedTo, setAssignedTo] = useState('');
    const [relatedMeetingId, setRelatedMeetingId] = useState(defaultMeetingId || '');

    const [companyUsers, setCompanyUsers] = useState<any[]>([]);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        getCompanyUsers().then(users => {
            setCompanyUsers(users || []);
            if (users && users.length > 0 && !assignedTo) {
                setAssignedTo(users[0].id);
            }
        }).catch(console.error);

        // Default due tomorrow at 5 PM
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(17, 0, 0, 0);
        setDueAt(tomorrow.toISOString().slice(0, 16));
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim()) {
            useToastStore.getState().error('Please enter a follow-up title.');
            return;
        }

        setIsSaving(true);
        try {
            await createProposalFollowUp({
                proposal: proposal.id,
                related_meeting: relatedMeetingId || null,
                title: title.trim(),
                description: description.trim(),
                due_at: dueAt ? new Date(dueAt).toISOString() : null,
                priority,
                assigned_to: assignedTo || null
            });

            useToastStore.getState().success('Follow-up task created successfully.');
            onAdded();
            onClose();
        } catch (err: any) {
            const msg = err.response?.data?.error || err.response?.data?.detail || 'Failed to create follow-up.';
            useToastStore.getState().error(msg);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal title={`Add Follow-Up / Action - ${proposal.proposal_number}`} onClose={onClose} width="580px">
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
                        Action Title *
                    </label>
                    <input 
                        type="text" 
                        className="input"
                        placeholder="e.g. Call procurement manager to finalize rates..."
                        value={title} 
                        onChange={e => setTitle(e.target.value)} 
                        required 
                        style={{ width: '100%' }}
                    />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
                            Due Date & Time
                        </label>
                        <input 
                            type="datetime-local" 
                            className="input"
                            value={dueAt} 
                            onChange={e => setDueAt(e.target.value)} 
                            style={{ width: '100%' }}
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
                            Priority
                        </label>
                        <select 
                            className="input" 
                            value={priority} 
                            onChange={e => setPriority(e.target.value as any)}
                            style={{ width: '100%' }}
                        >
                            <option value="LOW">Low</option>
                            <option value="MEDIUM">Medium</option>
                            <option value="HIGH">High</option>
                            <option value="URGENT">Urgent</option>
                        </select>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
                            Assigned To
                        </label>
                        <select 
                            className="input" 
                            value={assignedTo} 
                            onChange={e => setAssignedTo(e.target.value)}
                            style={{ width: '100%' }}
                        >
                            <option value="">Unassigned</option>
                            {companyUsers.map(u => (
                                <option key={u.id} value={u.id}>
                                    {u.first_name || u.username} {u.last_name || ''} ({u.role})
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
                            Related Meeting (Optional)
                        </label>
                        <select 
                            className="input" 
                            value={relatedMeetingId} 
                            onChange={e => setRelatedMeetingId(e.target.value)}
                            style={{ width: '100%' }}
                        >
                            <option value="">None (General Follow-Up)</option>
                            {meetings.map(m => (
                                <option key={m.id} value={m.id}>
                                    {m.subject} ({new Date(m.scheduled_at).toLocaleDateString()})
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
                        Description & Instructions
                    </label>
                    <textarea 
                        className="input" 
                        rows={3}
                        placeholder="Details of the action required, context, documents needed..."
                        value={description} 
                        onChange={e => setDescription(e.target.value)} 
                        style={{ width: '100%', resize: 'vertical' }}
                    />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                    <Button variant="secondary" onClick={onClose} disabled={isSaving}>
                        Cancel
                    </Button>
                    <Button variant="primary" type="submit" disabled={isSaving}>
                        {isSaving ? 'Creating...' : 'Save Follow-Up'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
};
