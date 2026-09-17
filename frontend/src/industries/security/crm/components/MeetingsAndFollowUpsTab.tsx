import React, { useState } from 'react';
import { Button } from '../../../../components/ui/Button';
import { useToastStore } from '../../../../stores/toastStore';
import { 
    type SecurityProposal, 
    type SecurityProposalMeeting, 
    type ProposalFollowUp,
    completeProposalFollowUp,
    cancelProposalFollowUp,
    cancelProposalMeeting,
    noShowProposalMeeting,
    startMeetingStage,
    advanceToSiteAssessment
} from '../api';
import { ScheduleMeetingModal } from './ScheduleMeetingModal';
import { CompleteMeetingModal } from './CompleteMeetingModal';
import { AddFollowUpModal } from './AddFollowUpModal';

interface Props {
    proposal: SecurityProposal;
    meetings: SecurityProposalMeeting[];
    followUps: ProposalFollowUp[];
    onRefresh: () => void;
}

export const MeetingsAndFollowUpsTab: React.FC<Props> = ({ 
    proposal, 
    meetings, 
    followUps, 
    onRefresh 
}) => {
    const [showScheduleModal, setShowScheduleModal] = useState(false);
    const [showFollowUpModal, setShowFollowUpModal] = useState(false);
    const [completingMeeting, setCompletingMeeting] = useState<SecurityProposalMeeting | null>(null);
    const [selectedMeetingForFollowUp, setSelectedMeetingForFollowUp] = useState<string | null>(null);

    const [isTransitioning, setIsTransitioning] = useState(false);

    // Group meetings
    const upcomingMeetings = meetings.filter(m => m.status === 'SCHEDULED');
    const pastMeetings = meetings.filter(m => m.status !== 'SCHEDULED');

    // Group follow-ups
    const openFollowUps = followUps.filter(f => f.status === 'OPEN');

    const handleStartMeetingStage = async () => {
        setIsTransitioning(true);
        try {
            await startMeetingStage(proposal.id);
            useToastStore.getState().success('Proposal transitioned to MEETING stage.');
            onRefresh();
        } catch (err: any) {
            useToastStore.getState().error(err.response?.data?.error || 'Failed to transition to meeting stage.');
        } finally {
            setIsTransitioning(false);
        }
    };

    const handleAdvanceToSiteAssessment = async () => {
        if (!window.confirm('Are you sure you want to advance this proposal to Site Assessment?')) {
            return;
        }
        setIsTransitioning(true);
        try {
            await advanceToSiteAssessment(proposal.id);
            useToastStore.getState().success('Proposal advanced to SITE_ASSESSMENT stage.');
            onRefresh();
        } catch (err: any) {
            useToastStore.getState().error(err.response?.data?.error || 'Failed to advance to Site Assessment.');
        } finally {
            setIsTransitioning(false);
        }
    };

    const handleCompleteFollowUp = async (id: string) => {
        try {
            await completeProposalFollowUp(id);
            useToastStore.getState().success('Follow-up marked as completed.');
            onRefresh();
        } catch (err: any) {
            useToastStore.getState().error('Failed to complete follow-up.');
        }
    };

    const handleCancelFollowUp = async (id: string) => {
        try {
            await cancelProposalFollowUp(id);
            useToastStore.getState().success('Follow-up cancelled.');
            onRefresh();
        } catch (err: any) {
            useToastStore.getState().error('Failed to cancel follow-up.');
        }
    };

    const handleCancelMeeting = async (id: string) => {
        if (!window.confirm('Cancel this scheduled meeting?')) return;
        try {
            await cancelProposalMeeting(id);
            useToastStore.getState().success('Meeting cancelled.');
            onRefresh();
        } catch (err: any) {
            useToastStore.getState().error('Failed to cancel meeting.');
        }
    };

    const handleNoShowMeeting = async (id: string) => {
        if (!window.confirm('Mark this meeting as No-Show?')) return;
        try {
            await noShowProposalMeeting(id);
            useToastStore.getState().success('Meeting marked as No-Show.');
            onRefresh();
        } catch (err: any) {
            useToastStore.getState().error('Failed to update meeting.');
        }
    };

    const getPriorityColor = (priority: string) => {
        switch (priority) {
            case 'URGENT': return '#ef4444';
            case 'HIGH': return '#f97316';
            case 'MEDIUM': return '#3b82f6';
            default: return '#6b7280';
        }
    };

    const getOutcomeBadge = (outcome: string) => {
        switch (outcome) {
            case 'PROCEED_TO_SITE_ASSESSMENT':
                return <span style={{ background: '#dcfce7', color: '#15803d', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 600 }}>Proceed to Site Assessment</span>;
            case 'NEED_ANOTHER_MEETING':
                return <span style={{ background: '#dbeafe', color: '#1d4ed8', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 600 }}>Need Another Meeting</span>;
            case 'REVISE_PROPOSAL':
                return <span style={{ background: '#fef3c7', color: '#b45309', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 600 }}>Revise Proposal</span>;
            case 'ON_HOLD':
                return <span style={{ background: '#f3f4f6', color: '#4b5563', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 600 }}>On Hold</span>;
            case 'REJECTED':
                return <span style={{ background: '#fee2e2', color: '#b91c1c', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 600 }}>Rejected</span>;
            default:
                return outcome ? <span style={{ background: '#f3f4f6', color: '#374151', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 500 }}>{outcome}</span> : null;
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Top Action / Stage Header */}
            <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                padding: '16px 20px', 
                background: 'var(--color-surface)', 
                borderRadius: '10px', 
                border: '1px solid var(--color-border)' 
            }}>
                <div>
                    <h3 style={{ margin: '0 0 4px 0', fontSize: '16px', fontWeight: 600 }}>
                        Meeting & Next-Action Workflow
                    </h3>
                    <p style={{ margin: 0, fontSize: '13px', color: 'var(--color-text-muted)' }}>
                        Stage: <strong style={{ color: 'var(--color-text-primary)' }}>{proposal.status}</strong> 
                        &nbsp;•&nbsp; {upcomingMeetings.length} Upcoming Meeting(s) &nbsp;•&nbsp; {openFollowUps.length} Open Follow-Up(s)
                    </p>
                </div>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    {proposal.status === 'SENT' && (
                        <Button 
                            variant="secondary" 
                            onClick={handleStartMeetingStage}
                            disabled={isTransitioning}
                        >
                            <i className='bx bx-play-circle'></i> Start Meeting Stage
                        </Button>
                    )}

                    {proposal.status === 'MEETING' && (
                        <Button 
                            variant="primary" 
                            onClick={handleAdvanceToSiteAssessment}
                            disabled={isTransitioning}
                            style={{ background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)', border: 'none', color: '#fff' }}
                        >
                            <i className='bx bx-check-double'></i> Advance to Site Assessment
                        </Button>
                    )}

                    <Button variant="secondary" onClick={() => setShowFollowUpModal(true)}>
                        <i className='bx bx-check-square'></i> Add Follow-Up
                    </Button>

                    <Button variant="primary" onClick={() => setShowScheduleModal(true)}>
                        <i className='bx bx-calendar-plus'></i> Schedule Meeting
                    </Button>
                </div>
            </div>

            {/* Next Action Banner */}
            {proposal.next_action && (
                <div style={{ 
                    padding: '14px 18px', 
                    borderRadius: '8px', 
                    background: proposal.next_action.is_overdue ? '#fef2f2' : '#eff6ff', 
                    border: `1px solid ${proposal.next_action.is_overdue ? '#fca5a5' : '#bfdbfe'}`,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <i className={proposal.next_action.type === 'meeting' ? 'bx bx-calendar-event' : 'bx bx-task'} 
                           style={{ fontSize: '24px', color: proposal.next_action.is_overdue ? '#dc2626' : '#2563eb' }} 
                        />
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: proposal.next_action.is_overdue ? '#dc2626' : '#2563eb' }}>
                                    {proposal.next_action.type === 'meeting' ? 'Upcoming Meeting' : 'Next Action'}
                                </span>
                                {proposal.next_action.is_overdue && (
                                    <span style={{ fontSize: '11px', background: '#dc2626', color: '#fff', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>OVERDUE</span>
                                )}
                            </div>
                            <p style={{ margin: '2px 0 0 0', fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                                {proposal.next_action.title}
                            </p>
                        </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <p style={{ margin: 0, fontSize: '13px', fontWeight: 500 }}>
                            Due: {proposal.next_action.due_at ? new Date(proposal.next_action.due_at).toLocaleString() : 'No date'}
                        </p>
                        <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                            Assigned to: <strong>{proposal.next_action.assigned_to}</strong>
                        </p>
                    </div>
                </div>
            )}

            {/* UPCOMING MEETINGS SECTION */}
            <div style={{ background: 'var(--color-background)', borderRadius: '10px', border: '1px solid var(--color-border)', padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>
                        <i className='bx bx-calendar'></i> Upcoming & Scheduled Meetings ({upcomingMeetings.length})
                    </h4>
                </div>

                {upcomingMeetings.length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '14px' }}>
                        No upcoming meetings scheduled. Click "Schedule Meeting" to coordinate with the client.
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        {upcomingMeetings.map(m => (
                            <div key={m.id} style={{ 
                                padding: '16px', 
                                borderRadius: '8px', 
                                border: '1px solid var(--color-border)', 
                                background: 'var(--color-surface)',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '10px'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                            <span style={{ 
                                                fontSize: '11px', 
                                                fontWeight: 700, 
                                                padding: '2px 8px', 
                                                borderRadius: '4px', 
                                                background: '#dbeafe', 
                                                color: '#1d4ed8' 
                                            }}>
                                                {m.meeting_type.replace(/_/g, ' ')}
                                            </span>
                                            <h5 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>{m.subject}</h5>
                                        </div>
                                        <p style={{ margin: 0, fontSize: '13px', color: 'var(--color-text-muted)' }}>
                                            <i className='bx bx-time'></i> <strong>{new Date(m.scheduled_at).toLocaleString()}</strong>
                                            {m.location && <> &nbsp;•&nbsp; <i className='bx bx-map-pin'></i> {m.location}</>}
                                            {m.meeting_link && (
                                                <> &nbsp;•&nbsp; <a href={m.meeting_link} target="_blank" rel="noreferrer" style={{ color: 'var(--color-primary)' }}>
                                                    <i className='bx bx-link-external'></i> Join Meeting Link
                                                </a></>
                                            )}
                                        </p>
                                    </div>

                                    <div style={{ display: 'flex', gap: '6px' }}>
                                        <Button 
                                            variant="primary" 
                                            size="small"
                                            onClick={() => setCompletingMeeting(m)}
                                        >
                                            <i className='bx bx-check'></i> Record Outcome
                                        </Button>
                                        <Button 
                                            variant="secondary" 
                                            size="small"
                                            onClick={() => {
                                                setSelectedMeetingForFollowUp(m.id);
                                                setShowFollowUpModal(true);
                                            }}
                                        >
                                            <i className='bx bx-plus'></i> Follow-Up
                                        </Button>
                                        <Button 
                                            variant="secondary" 
                                            size="small"
                                            onClick={() => handleNoShowMeeting(m.id)}
                                        >
                                            No-Show
                                        </Button>
                                        <Button 
                                            variant="secondary" 
                                            size="small"
                                            onClick={() => handleCancelMeeting(m.id)}
                                        >
                                            Cancel
                                        </Button>
                                    </div>
                                </div>

                                {m.agenda && (
                                    <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', background: 'var(--color-background)', padding: '10px', borderRadius: '6px' }}>
                                        <strong>Agenda:</strong> {m.agenda}
                                    </div>
                                )}

                                {m.participants && m.participants.length > 0 && (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                                        <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontWeight: 600 }}>Attendees:</span>
                                        {m.participants.map(p => (
                                            <span key={p.id} style={{ 
                                                fontSize: '12px', 
                                                padding: '2px 8px', 
                                                borderRadius: '12px', 
                                                background: p.participant_type === 'CUSTOMER_CONTACT' ? '#f0fdf4' : '#f8fafc',
                                                border: '1px solid var(--color-border)',
                                                color: 'var(--color-text-primary)'
                                            }}>
                                                {p.participant_type === 'CUSTOMER_CONTACT' ? '🏢 ' : '👤 '}
                                                {p.contact_name || p.user_name || p.external_name} {p.role ? `(${p.role})` : ''}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* OPEN FOLLOW-UPS SECTION */}
            <div style={{ background: 'var(--color-background)', borderRadius: '10px', border: '1px solid var(--color-border)', padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>
                        <i className='bx bx-check-square'></i> Action Items & Follow-Ups ({openFollowUps.length} Open)
                    </h4>
                    <Button variant="secondary" size="small" onClick={() => setShowFollowUpModal(true)}>
                        <i className='bx bx-plus'></i> Add Follow-Up
                    </Button>
                </div>

                {openFollowUps.length === 0 ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '14px' }}>
                        No pending follow-ups. Everything is up to date.
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {openFollowUps.map(f => (
                            <div key={f.id} style={{ 
                                padding: '12px 16px', 
                                borderRadius: '8px', 
                                border: '1px solid var(--color-border)', 
                                background: f.is_overdue ? '#fff5f5' : 'var(--color-surface)',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                                    <input 
                                        type="checkbox" 
                                        style={{ marginTop: '4px', cursor: 'pointer' }}
                                        title="Mark as Completed"
                                        onChange={() => handleCompleteFollowUp(f.id)}
                                    />
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ 
                                                fontSize: '11px', 
                                                fontWeight: 700, 
                                                padding: '2px 6px', 
                                                borderRadius: '4px', 
                                                color: '#fff',
                                                background: getPriorityColor(f.priority)
                                            }}>
                                                {f.priority}
                                            </span>
                                            <strong style={{ fontSize: '14px' }}>{f.title}</strong>
                                            {f.is_overdue && (
                                                <span style={{ fontSize: '11px', color: '#dc2626', fontWeight: 700 }}>OVERDUE</span>
                                            )}
                                        </div>
                                        {f.description && (
                                            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                                                {f.description}
                                            </p>
                                        )}
                                        <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                                            Assigned to: <strong>{f.assigned_to_name || 'Unassigned'}</strong> 
                                            {f.due_at && <> &nbsp;•&nbsp; Due: {new Date(f.due_at).toLocaleString()}</>}
                                            {f.related_meeting_subject && <> &nbsp;•&nbsp; Meeting: {f.related_meeting_subject}</>}
                                        </p>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: '6px' }}>
                                    <Button variant="secondary" size="small" onClick={() => handleCompleteFollowUp(f.id)}>
                                        <i className='bx bx-check'></i> Done
                                    </Button>
                                    <Button variant="secondary" size="small" onClick={() => handleCancelFollowUp(f.id)}>
                                        Cancel
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* COMPLETED MEETING HISTORY */}
            <div style={{ background: 'var(--color-background)', borderRadius: '10px', border: '1px solid var(--color-border)', padding: '20px' }}>
                <h4 style={{ margin: '0 0 16px 0', fontSize: '15px', fontWeight: 600 }}>
                    <i className='bx bx-history'></i> Meeting History & Outcomes ({pastMeetings.length})
                </h4>

                {pastMeetings.length === 0 ? (
                    <p style={{ color: 'var(--color-text-muted)', fontSize: '14px', margin: 0 }}>
                        No completed or past meeting records yet.
                    </p>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {pastMeetings.map(m => (
                            <div key={m.id} style={{ 
                                padding: '16px', 
                                borderRadius: '8px', 
                                border: '1px solid var(--color-border)', 
                                background: 'var(--color-surface)' 
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                    <div>
                                        <h5 style={{ margin: '0 0 4px 0', fontSize: '15px', fontWeight: 600 }}>{m.subject}</h5>
                                        <p style={{ margin: 0, fontSize: '12px', color: 'var(--color-text-muted)' }}>
                                            Held on: {new Date(m.scheduled_at).toLocaleString()} • Type: {m.meeting_type} • Status: <strong>{m.status}</strong>
                                        </p>
                                    </div>
                                    <div>
                                        {getOutcomeBadge(m.outcome)}
                                    </div>
                                </div>

                                {m.outcome_notes && (
                                    <p style={{ margin: '8px 0', fontSize: '13px', fontWeight: 500 }}>
                                        <strong>Outcome Notes:</strong> {m.outcome_notes}
                                    </p>
                                )}

                                {m.discussion_notes && (
                                    <p style={{ margin: '8px 0', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                                        <strong>Discussion:</strong> {m.discussion_notes}
                                    </p>
                                )}

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '10px', fontSize: '12px' }}>
                                    {m.client_requirements && (
                                        <div style={{ padding: '8px', background: 'var(--color-background)', borderRadius: '4px' }}>
                                            <strong>Client Scope:</strong> {m.client_requirements}
                                        </div>
                                    )}
                                    {m.commercial_concerns && (
                                        <div style={{ padding: '8px', background: 'var(--color-background)', borderRadius: '4px' }}>
                                            <strong>Commercial Concerns:</strong> {m.commercial_concerns}
                                        </div>
                                    )}
                                    {m.agreed_points && (
                                        <div style={{ padding: '8px', background: 'var(--color-background)', borderRadius: '4px' }}>
                                            <strong>Agreed Points:</strong> {m.agreed_points}
                                        </div>
                                    )}
                                    {m.pending_items && (
                                        <div style={{ padding: '8px', background: 'var(--color-background)', borderRadius: '4px' }}>
                                            <strong>Pending Items:</strong> {m.pending_items}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Modals */}
            {showScheduleModal && (
                <ScheduleMeetingModal 
                    proposal={proposal} 
                    onClose={() => setShowScheduleModal(false)} 
                    onScheduled={onRefresh} 
                />
            )}

            {completingMeeting && (
                <CompleteMeetingModal 
                    meeting={completingMeeting} 
                    onClose={() => setCompletingMeeting(null)} 
                    onCompleted={onRefresh} 
                />
            )}

            {showFollowUpModal && (
                <AddFollowUpModal 
                    proposal={proposal} 
                    meetings={meetings} 
                    defaultMeetingId={selectedMeetingForFollowUp}
                    onClose={() => {
                        setShowFollowUpModal(false);
                        setSelectedMeetingForFollowUp(null);
                    }} 
                    onAdded={onRefresh} 
                />
            )}
        </div>
    );
};
