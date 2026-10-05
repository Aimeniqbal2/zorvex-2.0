import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '../../../../components/ui/Button';
import { useToastStore } from '../../../../stores/toastStore';
import EmailComposer from '../../../../components/communications/EmailComposer';
import { apiClient as api } from '../../../../api/client';
import { 
    getSecurityProposal, 
    getProposalVersions, 
    getServiceLines,
    getClientLocations,
    getSecurityServiceTypes,
    getProposalMeetings,
    getProposalFollowUps,
    getAssessments,
    syncProposalToOperations
} from '../api';
import type { 
    SecurityProposal, 
    ProposalVersion, 
    ProposalServiceLine,
    ClientLocation,
    SecurityServiceType,
    SecurityProposalMeeting,
    ProposalFollowUp,
    SecurityAssessment,
    CRMContact
} from '../api';
import { MeetingsAndFollowUpsTab } from './MeetingsAndFollowUpsTab';
import { SiteAssessmentTab } from './SiteAssessmentTab';
import { FinalProposalTab } from './FinalProposalTab';
import { SigningAndActiveWorkspaceTab } from './SigningAndActiveWorkspaceTab';
import { CrossModuleHandoffTab } from './CrossModuleHandoffTab';
import { ApproveProposalModal } from './ApproveProposalModal';
import { RejectProposalModal } from './RejectProposalModal';
import { PutOnHoldModal } from './PutOnHoldModal';

interface Props {
    proposalId: string;
    onBack: () => void;
}

export const SecurityProposalDetail: React.FC<Props> = ({ proposalId, onBack }) => {
    const [proposal, setProposal] = useState<SecurityProposal | null>(null);
    const [versions, setVersions] = useState<ProposalVersion[]>([]);
    const [activeVersion, setActiveVersion] = useState<ProposalVersion | null>(null);
    const [serviceLines, setServiceLines] = useState<ProposalServiceLine[]>([]);
    const [locations, setLocations] = useState<ClientLocation[]>([]);
    const [serviceTypes, setServiceTypes] = useState<SecurityServiceType[]>([]);
    const [emails, setEmails] = useState<any[]>([]);
    const [meetings, setMeetings] = useState<SecurityProposalMeeting[]>([]);
    const [followUps, setFollowUps] = useState<ProposalFollowUp[]>([]);
    const [assessments, setAssessments] = useState<SecurityAssessment[]>([]);
    const [contacts, setContacts] = useState<CRMContact[]>([]);
    
    // Tab state
    const [activeTab, setActiveTab] = useState<'final_proposal' | 'meetings' | 'assessments' | 'signing' | 'handoff' | 'communications'>('final_proposal');

    // S-2G Modal states
    const [showApproveModal, setShowApproveModal] = useState(false);
    const [showRejectModal, setShowRejectModal] = useState(false);
    const [showPutOnHoldModal, setShowPutOnHoldModal] = useState(false);

    // Communication / Composer state
    const [showComposer, setShowComposer] = useState(false);
    const [emailPrefill, setEmailPrefill] = useState({ subject: '', body: '', to: '' });

    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    const loadData = useCallback(async () => {
        setIsLoading(true);
        setLoadError(null);
        try {
            const [prop, versRes] = await Promise.all([
                getSecurityProposal(proposalId),
                getProposalVersions(proposalId).catch(err => {
                    console.error("Failed to load versions", err);
                    return [];
                })
            ]);

            setProposal(prop);
            
            const loadedVersions = Array.isArray(versRes) ? versRes : ((versRes as any)?.results || []);
            setVersions(loadedVersions);
            
            const currentActive = loadedVersions.length > 0 ? loadedVersions[0] : null;
            setActiveVersion(currentActive);

            const customerId = prop?.customer 
                ? (typeof prop.customer === 'object' ? (prop.customer as any).id : prop.customer) 
                : null;

            // Fetch all independent auxiliary data concurrently
            const parallelPromises: Promise<any>[] = [
                currentActive ? getServiceLines(currentActive.id).catch(() => ({ results: [] })) : Promise.resolve({ results: [] }),
                customerId ? getClientLocations(customerId).catch(() => ({ results: [] })) : Promise.resolve({ results: [] }),
                customerId ? api.get(`/api/crm/contacts/?entity=${customerId}`).catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
                getSecurityServiceTypes().catch(() => ({ results: [] })),
                api.get(`/api/communications/emails/?context_type=security_proposal&context_id=${proposalId}`).catch(() => ({ data: [] })),
                getProposalMeetings(proposalId).catch(() => []),
                getProposalFollowUps(proposalId).catch(() => []),
                getAssessments(proposalId).catch(() => [])
            ];

            const [
                linesRes,
                locsRes,
                contactsRes,
                typesRes,
                emailsRes,
                meetingsRes,
                followUpsRes,
                assessRes
            ] = await Promise.all(parallelPromises);

            setServiceLines(linesRes?.results || (Array.isArray(linesRes) ? linesRes : []));
            setLocations(locsRes?.results || (Array.isArray(locsRes) ? locsRes : []));
            setContacts(contactsRes?.data?.results || (Array.isArray(contactsRes?.data) ? contactsRes.data : []));
            setServiceTypes(typesRes?.results || (Array.isArray(typesRes) ? typesRes : []));
            setEmails(emailsRes?.data?.results || (Array.isArray(emailsRes?.data) ? emailsRes.data : []));
            setMeetings(Array.isArray(meetingsRes) ? meetingsRes : []);
            setFollowUps(Array.isArray(followUpsRes) ? followUpsRes : []);
            setAssessments(Array.isArray(assessRes) ? assessRes : []);

            // Auto-navigate to relevant tab based on stage if still on initial services tab
            if (['APPROVED', 'SIGNING', 'SIGNED', 'ACTIVE'].includes(prop.status)) {
                setActiveTab(prev => (prev === 'final_proposal' ? 'signing' : prev));
            } else if (prop.status === 'SITE_ASSESSMENT') {
                setActiveTab(prev => (prev === 'final_proposal' ? 'assessments' : prev));
            } else if (prop.status === 'MEETING') {
                setActiveTab(prev => (prev === 'final_proposal' ? 'meetings' : prev));
            }
            
        } catch (error: any) {
            console.error("Failed to load proposal", error);
            setLoadError(error?.response?.data?.detail || error.message || 'Failed to load proposal details');
            useToastStore.getState().error('Failed to load proposal details');
        } finally {
            setIsLoading(false);
        }
    }, [proposalId]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Calculate dynamic totals for the metrics
    const summary = useMemo(() => {
        const personnel = serviceLines.reduce((acc, curr) => acc + Number(curr.quantity), 0);
        const valueByUnit: { [key: string]: number } = {};
        serviceLines.forEach(l => {
            const lineVal = Number(l.quantity) * Number(l.client_rate);
            valueByUnit[l.billing_unit] = (valueByUnit[l.billing_unit] || 0) + lineVal;
        });
        return { personnel, valueByUnit };
    }, [serviceLines]);

    if (isLoading) {
        return (
            <div style={{ padding: '60px 24px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                <i className='bx bx-loader-alt bx-spin' style={{ fontSize: '36px', marginBottom: '12px', display: 'inline-block', color: 'var(--color-primary)' }}></i>
                <div style={{ fontSize: '15px', fontWeight: 500 }}>Loading proposal details...</div>
            </div>
        );
    }

    if (!proposal) {
        return (
            <div style={{ padding: '48px 24px', textAlign: 'center', maxWidth: '500px', margin: '0 auto' }}>
                <div style={{ 
                    width: '64px', 
                    height: '64px', 
                    borderRadius: '50%', 
                    backgroundColor: '#fee2e2', 
                    color: '#ef4444', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    fontSize: '32px', 
                    margin: '0 auto 16px' 
                }}>
                    <i className='bx bx-error-circle'></i>
                </div>
                <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--color-text)', marginBottom: '8px' }}>
                    Proposal Not Found
                </h3>
                <p style={{ color: 'var(--color-text-muted)', fontSize: '14px', marginBottom: '24px' }}>
                    {loadError || 'The proposal details could not be loaded from the server.'}
                </p>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
                    <Button variant="secondary" onClick={onBack}>
                        <i className='bx bx-arrow-back'></i> Back
                    </Button>
                    <Button variant="primary" onClick={loadData}>
                        <i className='bx bx-refresh'></i> Retry
                    </Button>
                </div>
            </div>
        );
    }

    const handleSendClick = async () => {
        try {
            const versionParam = activeVersion?.id ? `?version_id=${activeVersion.id}` : '';
            const res = await api.get(`/api/security/crm/securityproposal/${proposalId}/prepare_email/${versionParam}`);
            setEmailPrefill({
                subject: res.data.subject || `Regarding Security Services for ${proposal?.customer_name || 'Client'}`,
                body: res.data.body || '',
                to: res.data.to || ''
            });
            setShowComposer(true);
        } catch (error) {
            useToastStore.getState().error('Failed to prepare email context');
        }
    };

    const handleSyncToOps = async () => {
        try {
            const res = await syncProposalToOperations(proposalId);
            useToastStore.getState().success(res.message || 'Requirements successfully synced to Operations!');
            await loadData();
        } catch (err: any) {
            useToastStore.getState().error('Failed to sync to Operations');
        }
    };

    const handleEmailSent = async () => {
        useToastStore.getState().success('Email sent successfully!');
        setShowComposer(false);
        await loadData();
    };

    return (
        <div>
            {showComposer && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
                    <div style={{ width: '800px', maxHeight: '90vh', overflowY: 'auto' }}>
                        <EmailComposer 
                            contextType="security_proposal"
                            contextId={proposalId}
                            contextVersionId={activeVersion?.id}
                            prefillTo={emailPrefill.to}
                            prefillSubject={emailPrefill.subject}
                            prefillBodyHtml={emailPrefill.body}
                            onTriggerSend={async (emailId) => {
                                await api.post(`/api/security/crm/securityproposal/${proposalId}/send_proposal_email/`, {
                                    email_id: emailId,
                                    version_id: activeVersion?.id
                                });
                            }}
                            onSent={handleEmailSent}
                            onCancel={() => setShowComposer(false)}
                        />
                    </div>
                </div>
            )}
            {/* HERO CARD HEADER */}
            <div className="sec-hero-card">
                <div className="sec-hero-header">
                    <div className="sec-hero-title-area">
                        <div className="sec-hero-icon">
                            <i className='bx bx-shield-quarter'></i>
                        </div>
                        <div>
                            <div className="flex items-center gap-3">
                                <h1 className="sec-hero-title">
                                    Final Requirements — {proposal.proposal_number}
                                </h1>
                                <span className="sec-badge sec-badge-active" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                                    <i className='bx bx-check-shield'></i> Live in Operations
                                </span>
                            </div>
                            <div className="sec-hero-subtitle">
                                <span><i className='bx bx-building'></i> <strong>{proposal.customer_name || 'Client'}</strong></span>
                                <span>•</span>
                                <span><i className='bx bx-map-pin'></i> {locations.length} Site{locations.length !== 1 ? 's' : ''}</span>
                                {proposal.contract_code && (
                                    <>
                                        <span>•</span>
                                        <span className="text-emerald-400 font-semibold"><i className='bx bx-file-blank'></i> Contract: {proposal.contract_code}</span>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="sec-actions-bar">
                        {onBack && (
                            <Button variant="ghost" onClick={onBack}>
                                <i className='bx bx-arrow-back'></i> Back
                            </Button>
                        )}
                        <Button 
                            variant="primary" 
                            onClick={handleSyncToOps}
                            className="sec-btn-gradient-green"
                        >
                            <i className='bx bx-sync'></i> Sync to Operations
                        </Button>
                        <Button variant="secondary" onClick={handleSendClick}>
                            <i className='bx bx-envelope'></i> Send Email to Client
                        </Button>
                    </div>
                </div>

                {/* 4-KPI SUMMARY METRICS */}
                <div className="sec-kpi-grid">
                    <div className="sec-kpi-card">
                        <div className="sec-kpi-icon-box" style={{ background: 'var(--sec-indigo-bg)', color: 'var(--sec-indigo)' }}>
                            <i className='bx bx-navigation'></i>
                        </div>
                        <div>
                            <p className="sec-kpi-label">Current Stage</p>
                            <p className="sec-kpi-value" style={{ fontSize: '15px' }}>{proposal.status}</p>
                        </div>
                    </div>

                    <div className="sec-kpi-card">
                        <div className="sec-kpi-icon-box" style={{ background: 'var(--sec-success-bg)', color: 'var(--sec-success)' }}>
                            <i className='bx bx-user-check'></i>
                        </div>
                        <div>
                            <p className="sec-kpi-label">Guards / Personnel</p>
                            <p className="sec-kpi-value">{summary.personnel} Active</p>
                        </div>
                    </div>

                    <div className="sec-kpi-card">
                        <div className="sec-kpi-icon-box" style={{ background: 'rgba(245, 158, 11, 0.12)', color: '#f59e0b' }}>
                            <i className='bx bx-wallet'></i>
                        </div>
                        <div>
                            <p className="sec-kpi-label">Estimated Value</p>
                            {Object.keys(summary.valueByUnit).length === 0 ? (
                                <p className="sec-kpi-value">PKR 0</p>
                            ) : (
                                Object.entries(summary.valueByUnit).map(([unit, value]) => (
                                    <p key={unit} className="sec-kpi-value" style={{ fontSize: '15px' }}>
                                        PKR {value.toLocaleString()} <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--color-text-muted)' }}>/ {unit.toLowerCase()}</span>
                                    </p>
                                ))
                            )}
                        </div>
                    </div>

                    <div className="sec-kpi-card">
                        <div className="sec-kpi-icon-box" style={{ background: 'rgba(139, 92, 246, 0.12)', color: '#8b5cf6' }}>
                            <i className='bx bx-file-blank'></i>
                        </div>
                        <div>
                            <p className="sec-kpi-label">Contract & Signing</p>
                            <p className="sec-kpi-value" style={{ fontSize: '14px' }}>
                                {proposal.contract_code ? proposal.contract_code : `${proposal.signed_documents_count || 0} signed document(s)`}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* TAB NAVIGATION */}
            <div className="sec-tabs-nav">
                <button
                    onClick={() => setActiveTab('final_proposal')}
                    className={`sec-tab-btn ${activeTab === 'final_proposal' ? 'active' : ''}`}
                >
                    <i className='bx bx-calculator'></i> Service & Staffing Requirements
                </button>

                <button
                    onClick={() => setActiveTab('signing')}
                    className={`sec-tab-btn ${activeTab === 'signing' ? 'active' : ''}`}
                    style={activeTab === 'signing' ? { color: '#6366f1', borderBottomColor: '#6366f1' } : {}}
                >
                    <i className='bx bx-file-blank'></i> Contract & Signed Agreement
                </button>

                <button
                    onClick={() => setActiveTab('handoff')}
                    className={`sec-tab-btn ${activeTab === 'handoff' ? 'active' : ''}`}
                    style={activeTab === 'handoff' ? { color: '#059669', borderBottomColor: '#059669' } : {}}
                >
                    <i className='bx bx-git-merge'></i> Operations Handoff
                </button>

                <button
                    onClick={() => setActiveTab('communications')}
                    className={`sec-tab-btn ${activeTab === 'communications' ? 'active' : ''}`}
                >
                    <i className='bx bx-envelope'></i> Communications
                    <span className="sec-tab-badge">{emails.length}</span>
                </button>

                <button
                    onClick={() => setActiveTab('meetings')}
                    className={`sec-tab-btn ${activeTab === 'meetings' ? 'active' : ''}`}
                >
                    <i className='bx bx-calendar-event'></i> Client Meetings
                    <span className="sec-tab-badge">{meetings.length + followUps.filter(f => f.status === 'OPEN').length}</span>
                </button>
            </div>

            {/* TAB 1: FINAL PROPOSAL & COMMERCIALS */}
            {activeTab === 'final_proposal' && (
                <FinalProposalTab 
                    proposal={proposal}
                    assessments={assessments}
                    locations={locations}
                    serviceTypes={serviceTypes}
                    onRefresh={loadData}
                />
            )}

            {/* TAB 2: MEETINGS & FOLLOW-UPS */}
            {activeTab === 'meetings' && (
                <MeetingsAndFollowUpsTab 
                    proposal={proposal}
                    meetings={meetings}
                    followUps={followUps}
                    onRefresh={loadData}
                />
            )}

            {/* TAB 3: SITE ASSESSMENT */}
            {activeTab === 'assessments' && (
                <SiteAssessmentTab 
                    proposal={proposal}
                    onRefresh={loadData}
                />
            )}

            {/* TAB 5: SIGNING & ACTIVE WORKSPACE (PHASE S-2G) */}
            {activeTab === 'signing' && (
                <SigningAndActiveWorkspaceTab 
                    proposal={proposal}
                    versions={versions}
                    onRefresh={loadData}
                    onUpdateProposal={(updated) => {
                        setProposal(updated);
                        loadData();
                    }}
                />
            )}

            {/* TAB 6: CROSS-MODULE HANDOFF (PHASE S-2H) */}
            {activeTab === 'handoff' && (
                <CrossModuleHandoffTab 
                    proposal={proposal}
                    onRefresh={loadData}
                />
            )}

            {/* TAB 7: COMMUNICATIONS */}
            {activeTab === 'communications' && (
                <div style={{ background: 'var(--color-background)', padding: '24px', borderRadius: '12px', border: '1px solid var(--color-border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <h3 style={{ fontSize: '16px', margin: 0 }}>Communication History</h3>
                        <Button variant="primary" onClick={handleSendClick}>
                            <i className='bx bx-paper-plane'></i> Compose Email
                        </Button>
                    </div>

                    {emails.length === 0 ? (
                        <p style={{ color: 'var(--color-text-muted)', fontSize: '14px' }}>No communications sent yet.</p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {emails.map(email => (
                                <div key={email.id} style={{ padding: '16px', border: '1px solid var(--color-border)', borderRadius: '8px', background: 'var(--color-surface)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                        <h4 style={{ margin: 0, fontSize: '14px' }}>{email.subject}</h4>
                                        <span style={{ fontSize: '12px', fontWeight: 'bold', color: email.status === 'SENT' ? 'var(--color-success)' : email.status === 'FAILED' ? 'var(--color-error)' : 'var(--color-warning)' }}>
                                            {email.status}
                                        </span>
                                    </div>
                                    <p style={{ margin: '0 0 4px 0', fontSize: '13px', color: 'var(--color-text-muted)' }}>To: {email.to}</p>
                                    <p style={{ margin: '0 0 4px 0', fontSize: '13px', color: 'var(--color-text-muted)' }}>From: {email.sender_name} &lt;{email.sender_email}&gt;</p>
                                    <p style={{ margin: 0, fontSize: '12px', color: 'var(--color-text-muted)' }}>
                                        {email.sent_at ? new Date(email.sent_at).toLocaleString() : 'Not sent'}
                                    </p>
                                    {email.error_message && (
                                        <p style={{ margin: '8px 0 0 0', fontSize: '12px', color: 'var(--color-error)' }}>
                                            Error: {email.error_message}
                                        </p>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* S-2G Modals */}
            {showApproveModal && (
                <ApproveProposalModal
                    proposal={proposal}
                    versions={versions}
                    contacts={contacts}
                    onClose={() => setShowApproveModal(false)}
                    onSuccess={(updated) => {
                        setProposal(updated);
                        setActiveTab('signing');
                        loadData();
                    }}
                />
            )}

            {showRejectModal && (
                <RejectProposalModal
                    proposal={proposal}
                    onClose={() => setShowRejectModal(false)}
                    onSuccess={(updated) => {
                        setProposal(updated);
                        loadData();
                    }}
                />
            )}

            {showPutOnHoldModal && (
                <PutOnHoldModal
                    proposal={proposal}
                    onClose={() => setShowPutOnHoldModal(false)}
                    onSuccess={(updated) => {
                        setProposal(updated);
                        loadData();
                    }}
                />
            )}
        </div>
    );
};
