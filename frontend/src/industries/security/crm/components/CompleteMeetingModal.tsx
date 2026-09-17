import React, { useState, useEffect } from 'react';
import { Modal } from '../../../../components/ui/Modal';
import { Button } from '../../../../components/ui/Button';
import { useToastStore } from '../../../../stores/toastStore';
import { 
    completeProposalMeeting, 
    getCompanyUsers,
    type SecurityProposalMeeting 
} from '../api';

interface Props {
    meeting: SecurityProposalMeeting;
    onClose: () => void;
    onCompleted: () => void;
}

export const CompleteMeetingModal: React.FC<Props> = ({ meeting, onClose, onCompleted }) => {
    const [outcome, setOutcome] = useState(meeting.outcome || 'PROCEED_TO_SITE_ASSESSMENT');
    const [outcomeNotes, setOutcomeNotes] = useState(meeting.outcome_notes || '');
    const [discussionNotes, setDiscussionNotes] = useState(meeting.discussion_notes || '');
    const [clientRequirements, setClientRequirements] = useState(meeting.client_requirements || '');
    const [commercialConcerns, setCommercialConcerns] = useState(meeting.commercial_concerns || '');
    const [operationalConcerns, setOperationalConcerns] = useState(meeting.operational_concerns || '');
    const [agreedPoints, setAgreedPoints] = useState(meeting.agreed_points || '');
    const [pendingItems, setPendingItems] = useState(meeting.pending_items || '');

    // Follow-up creation
    const [createFollowUp, setCreateFollowUp] = useState(false);
    const [followUpTitle, setFollowUpTitle] = useState('');
    const [followUpDueAt, setFollowUpDueAt] = useState('');
    const [followUpPriority, setFollowUpPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'>('MEDIUM');
    const [followUpAssignedTo, setFollowUpAssignedTo] = useState('');

    const [companyUsers, setCompanyUsers] = useState<any[]>([]);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        getCompanyUsers().then(users => {
            setCompanyUsers(users || []);
            if (users && users.length > 0) {
                setFollowUpAssignedTo(users[0].id);
            }
        }).catch(console.error);

        // Default follow up due in 2 days
        const inTwoDays = new Date();
        inTwoDays.setDate(inTwoDays.getDate() + 2);
        inTwoDays.setHours(17, 0, 0, 0);
        setFollowUpDueAt(inTwoDays.toISOString().slice(0, 16));
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!outcome) {
            useToastStore.getState().error('Please select a meeting outcome.');
            return;
        }

        setIsSaving(true);
        try {
            const payload: any = {
                outcome,
                outcome_notes: outcomeNotes,
                discussion_notes: discussionNotes,
                client_requirements: clientRequirements,
                commercial_concerns: commercialConcerns,
                operational_concerns: operationalConcerns,
                agreed_points: agreedPoints,
                pending_items: pendingItems
            };

            if (createFollowUp && followUpTitle.trim()) {
                payload.follow_up_title = followUpTitle.trim();
                payload.follow_up_due_at = followUpDueAt ? new Date(followUpDueAt).toISOString() : null;
                payload.follow_up_priority = followUpPriority;
                payload.follow_up_assigned_to = followUpAssignedTo || null;
            }

            await completeProposalMeeting(meeting.id, payload);
            useToastStore.getState().success('Meeting completed and outcome recorded.');
            onCompleted();
            onClose();
        } catch (err: any) {
            const msg = err.response?.data?.error || err.response?.data?.detail || 'Failed to complete meeting.';
            useToastStore.getState().error(msg);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal title={`Record Meeting Outcome: ${meeting.subject}`} onClose={onClose} width="700px">
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                        Meeting Outcome *
                    </label>
                    <select 
                        className="input" 
                        value={outcome} 
                        onChange={e => setOutcome(e.target.value)}
                        required
                        style={{ width: '100%', fontWeight: 500 }}
                    >
                        <option value="PROCEED_TO_SITE_ASSESSMENT">Proceed to Site Assessment</option>
                        <option value="NEED_ANOTHER_MEETING">Need Another Meeting / Clarification</option>
                        <option value="REVISE_PROPOSAL">Client Requested Revised Commercial Proposal</option>
                        <option value="ON_HOLD">Put On Hold (Client Deliberation)</option>
                        <option value="REJECTED">Client Rejected Proposal</option>
                        <option value="NO_ACTION">No Immediate Action</option>
                        <option value="OTHER">Other Outcome</option>
                    </select>
                </div>

                <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
                        Outcome Summary & Key Decisions
                    </label>
                    <textarea 
                        className="input" 
                        rows={2}
                        placeholder="Brief summary of decision reached with the client..."
                        value={outcomeNotes} 
                        onChange={e => setOutcomeNotes(e.target.value)} 
                        style={{ width: '100%', resize: 'vertical' }}
                    />
                </div>

                <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
                        Discussion Notes / Minutes
                    </label>
                    <textarea 
                        className="input" 
                        rows={3}
                        placeholder="Overall discussion notes and context..."
                        value={discussionNotes} 
                        onChange={e => setDiscussionNotes(e.target.value)} 
                        style={{ width: '100%', resize: 'vertical' }}
                    />
                </div>

                {/* Structured Notes Collapsible / Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px', color: 'var(--color-text-muted)' }}>
                            Client Requirements / Scope Adjustments
                        </label>
                        <textarea 
                            className="input" 
                            rows={2}
                            placeholder="e.g. 2 additional night guards, CCTV monitoring..."
                            value={clientRequirements} 
                            onChange={e => setClientRequirements(e.target.value)} 
                            style={{ width: '100%', fontSize: '13px', resize: 'vertical' }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px', color: 'var(--color-text-muted)' }}>
                            Commercial Concerns
                        </label>
                        <textarea 
                            className="input" 
                            rows={2}
                            placeholder="e.g. Budget ceiling, payment terms negotiation..."
                            value={commercialConcerns} 
                            onChange={e => setCommercialConcerns(e.target.value)} 
                            style={{ width: '100%', fontSize: '13px', resize: 'vertical' }}
                        />
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px', color: 'var(--color-text-muted)' }}>
                            Operational Concerns
                        </label>
                        <textarea 
                            className="input" 
                            rows={2}
                            placeholder="e.g. Patrol route timing, weapon authorization..."
                            value={operationalConcerns} 
                            onChange={e => setOperationalConcerns(e.target.value)} 
                            style={{ width: '100%', fontSize: '13px', resize: 'vertical' }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px', color: 'var(--color-text-muted)' }}>
                            Agreed Points
                        </label>
                        <textarea 
                            className="input" 
                            rows={2}
                            placeholder="e.g. Site survey scheduled for next Tuesday..."
                            value={agreedPoints} 
                            onChange={e => setAgreedPoints(e.target.value)} 
                            style={{ width: '100%', fontSize: '13px', resize: 'vertical' }}
                        />
                    </div>
                </div>

                <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px', color: 'var(--color-text-muted)' }}>
                        Pending Items
                    </label>
                    <textarea 
                        className="input" 
                        rows={2}
                        placeholder="e.g. Awaiting client layout drawings..."
                        value={pendingItems} 
                        onChange={e => setPendingItems(e.target.value)} 
                        style={{ width: '100%', fontSize: '13px', resize: 'vertical' }}
                    />
                </div>

                {/* Follow-Up Action Box */}
                <div style={{ background: 'var(--color-surface)', padding: '14px', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                        <input 
                            type="checkbox" 
                            checked={createFollowUp} 
                            onChange={e => setCreateFollowUp(e.target.checked)} 
                        />
                        <span>Create Immediate Follow-Up / Next Action</span>
                    </label>

                    {createFollowUp && (
                        <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>
                                    Follow-Up Title *
                                </label>
                                <input 
                                    type="text" 
                                    className="input"
                                    placeholder="e.g. Send updated rates / Coordinate Site Survey"
                                    value={followUpTitle} 
                                    onChange={e => setFollowUpTitle(e.target.value)} 
                                    required={createFollowUp}
                                    style={{ width: '100%' }}
                                />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>
                                        Due Date & Time
                                    </label>
                                    <input 
                                        type="datetime-local" 
                                        className="input"
                                        value={followUpDueAt} 
                                        onChange={e => setFollowUpDueAt(e.target.value)} 
                                        style={{ width: '100%' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>
                                        Priority
                                    </label>
                                    <select 
                                        className="input" 
                                        value={followUpPriority} 
                                        onChange={e => setFollowUpPriority(e.target.value as any)}
                                        style={{ width: '100%' }}
                                    >
                                        <option value="LOW">Low</option>
                                        <option value="MEDIUM">Medium</option>
                                        <option value="HIGH">High</option>
                                        <option value="URGENT">Urgent</option>
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>
                                        Assigned To
                                    </label>
                                    <select 
                                        className="input" 
                                        value={followUpAssignedTo} 
                                        onChange={e => setFollowUpAssignedTo(e.target.value)}
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
                            </div>
                        </div>
                    )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                    <Button variant="secondary" onClick={onClose} disabled={isSaving}>
                        Cancel
                    </Button>
                    <Button variant="primary" type="submit" disabled={isSaving}>
                        {isSaving ? 'Recording...' : 'Complete Meeting & Save Outcome'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
};
