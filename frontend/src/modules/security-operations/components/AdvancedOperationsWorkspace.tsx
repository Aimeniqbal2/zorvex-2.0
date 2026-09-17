import React, { useState, useEffect } from 'react';
import {
    getControlRoomQueue, getAdvancedOpsDashboard, getDailyOccurrenceLogs,
    createDailyOccurrenceLog, getSiteCheckpoints, createSiteCheckpoint,
    getPatrolPlans, getPatrolRuns, schedulePatrolRun,
    completePatrolRun, getGuardTours, startGuardTour, verifyCheckpoint,
    completeGuardTour, getEmergencyEvents, triggerEmergency,
    acknowledgeEmergency, resolveEmergency, getSupervisorInspections,
    createSupervisorInspection, getOperationsEscalations, acknowledgeEscalation,
    resolveEscalation, getOperationalSites
} from '../api';
import type {
    ControlRoomQueueResponse, AdvancedOpsDashboardResponse, DailyOccurrenceLog,
    SiteCheckpoint, PatrolPlan, PatrolRun, GuardTour, EmergencyEvent,
    SupervisorInspection, OperationsEscalation, OperationalSite, OccurrenceEntryType,
    InspectionRating
} from '../types';

interface AdvancedOperationsWorkspaceProps {
    onNavigateTab?: (tab: string) => void;
}

export const AdvancedOperationsWorkspace: React.FC<AdvancedOperationsWorkspaceProps> = ({ onNavigateTab: _onNavigateTab }) => {
    // Top Tabs
    type WorkspaceTab =
        | 'control_room'
        | 'dob'
        | 'patrols'
        | 'guard_tours'
        | 'emergencies'
        | 'inspections'
        | 'escalations'
        | 'site_risk';

    const [activeTab, setActiveTab] = useState<WorkspaceTab>('control_room');
    const [_loading, setLoading] = useState(true);
    const [sites, setSites] = useState<OperationalSite[]>([]);
    const [selectedSiteId, setSelectedSiteId] = useState<string>('ALL');

    // Dashboard & Queue Data
    const [dashboard, setDashboard] = useState<AdvancedOpsDashboardResponse | null>(null);
    const [queue, setQueue] = useState<ControlRoomQueueResponse | null>(null);

    // Tab Specific Lists
    const [dobLogs, setDobLogs] = useState<DailyOccurrenceLog[]>([]);
    const [checkpoints, setCheckpoints] = useState<SiteCheckpoint[]>([]);
    const [patrolPlans, setPatrolPlans] = useState<PatrolPlan[]>([]);
    const [patrolRuns, setPatrolRuns] = useState<PatrolRun[]>([]);
    const [guardTours, setGuardTours] = useState<GuardTour[]>([]);
    const [emergencies, setEmergencies] = useState<EmergencyEvent[]>([]);
    const [inspections, setInspections] = useState<SupervisorInspection[]>([]);
    const [escalations, setEscalations] = useState<OperationsEscalation[]>([]);

    // Filter states
    const [dobEntryTypeFilter, setDobEntryTypeFilter] = useState<string>('ALL');

    // Modals
    const [showDobModal, setShowDobModal] = useState(false);
    const [showSosModal, setShowSosModal] = useState(false);
    const [showAckSosModal, setShowAckSosModal] = useState<EmergencyEvent | null>(null);
    const [showResolveSosModal, setShowResolveSosModal] = useState<EmergencyEvent | null>(null);
    const [showCheckpointModal, setShowCheckpointModal] = useState(false);
    const [showSchedulePatrolModal, setShowSchedulePatrolModal] = useState(false);
    const [showStartTourModal, setShowStartTourModal] = useState(false);
    const [showVerifyModal, setShowVerifyModal] = useState<{ tour: GuardTour; checkpoint: SiteCheckpoint } | null>(null);
    const [showInspectionModal, setShowInspectionModal] = useState(false);
    const [showResolveEscalationModal, setShowResolveEscalationModal] = useState<OperationsEscalation | null>(null);

    // Feedback
    const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

    const showNotification = (text: string, type: 'success' | 'error' = 'success') => {
        setStatusMessage({ text, type });
        setTimeout(() => setStatusMessage(null), 4000);
    };

    // Initial Load
    const loadCommonData = async () => {
        try {
            setLoading(true);
            const [dashRes, queueRes, sitesRes] = await Promise.all([
                getAdvancedOpsDashboard(),
                getControlRoomQueue(),
                getOperationalSites()
            ]);
            setDashboard(dashRes);
            setQueue(queueRes);
            setSites(sitesRes.results || (Array.isArray(sitesRes) ? sitesRes : []));
        } catch (err: any) {
            console.error("Failed to load operations dashboard:", err);
            showNotification(err.message || 'Error loading dashboard data', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadCommonData();
    }, []);

    // Load active tab data
    const loadTabData = async () => {
        const siteParam = selectedSiteId !== 'ALL' ? selectedSiteId : undefined;
        try {
            if (activeTab === 'control_room') {
                const [q, d] = await Promise.all([getControlRoomQueue(), getAdvancedOpsDashboard()]);
                setQueue(q);
                setDashboard(d);
            } else if (activeTab === 'dob') {
                const entryType = dobEntryTypeFilter !== 'ALL' ? dobEntryTypeFilter : undefined;
                const data = await getDailyOccurrenceLogs({ site: siteParam, entry_type: entryType });
                setDobLogs(data);
            } else if (activeTab === 'patrols') {
                const [cps, plans, runs] = await Promise.all([
                    getSiteCheckpoints({ site: siteParam }),
                    getPatrolPlans({ site: siteParam }),
                    getPatrolRuns({ site: siteParam })
                ]);
                setCheckpoints(cps);
                setPatrolPlans(plans);
                setPatrolRuns(runs);
            } else if (activeTab === 'guard_tours') {
                const [tours, cps] = await Promise.all([
                    getGuardTours({ site: siteParam }),
                    getSiteCheckpoints({ site: siteParam })
                ]);
                setGuardTours(tours);
                setCheckpoints(cps);
            } else if (activeTab === 'emergencies') {
                const data = await getEmergencyEvents({ site: siteParam });
                setEmergencies(data);
            } else if (activeTab === 'inspections') {
                const data = await getSupervisorInspections({ site: siteParam });
                setInspections(data);
            } else if (activeTab === 'escalations') {
                const data = await getOperationsEscalations({ site: siteParam });
                setEscalations(data);
            } else if (activeTab === 'site_risk') {
                const d = await getAdvancedOpsDashboard();
                setDashboard(d);
            }
        } catch (err: any) {
            console.error("Tab data load failed:", err);
        }
    };

    useEffect(() => {
        loadTabData();
    }, [activeTab, selectedSiteId, dobEntryTypeFilter]);

    // Modal Form States
    const [dobForm, setDobForm] = useState({
        site: '',
        title: '',
        details: '',
        entry_type: 'GENERAL' as OccurrenceEntryType,
        is_flagged: false
    });

    const [sosForm, setSosForm] = useState({
        site_id: '',
        event_type: 'PANIC_BUTTON',
        severity: 'CRITICAL',
        description: '',
        latitude: '',
        longitude: ''
    });

    const [ackSosForm, setAckSosForm] = useState({ response_notes: '' });
    const [resolveSosForm, setResolveSosForm] = useState({ resolution_summary: '', is_false_alarm: false });

    const [checkpointForm, setCheckpointForm] = useState({
        site: '',
        name: '',
        code: '',
        sequence_order: 1,
        location_description: '',
        latitude: '',
        longitude: '',
        qr_code_tag: ''
    });

    const [patrolRunForm, setPatrolRunForm] = useState({
        site: '',
        plan: '',
        scheduled_start: new Date().toISOString().slice(0, 16),
        notes: ''
    });

    const [guardTourForm, setGuardTourForm] = useState({
        site: '',
        tour_name: 'Perimeter Inspection Tour',
        notes: ''
    });

    const [verifyForm, setVerifyForm] = useState({
        verification_source: 'MANUAL',
        latitude: '',
        longitude: '',
        notes: ''
    });

    const [inspectionForm, setInspectionForm] = useState({
        site: '',
        guard_presence_verified: true,
        uniform_condition: 'SATISFACTORY' as InspectionRating,
        equipment_condition: 'SATISFACTORY' as InspectionRating,
        post_cleanliness_condition: 'SATISFACTORY' as InspectionRating,
        documentation_in_order: true,
        turnout_and_bearing: 'SATISFACTORY' as InspectionRating,
        deficiencies_observed: '',
        corrective_action_required: '',
        notes: ''
    });

    const [escalationResolveForm, setEscalationResolveForm] = useState({ resolution_notes: '' });

    // Submit Handlers
    const handleCreateDob = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!dobForm.site || !dobForm.title) {
            showNotification('Site and Title are required', 'error');
            return;
        }
        try {
            await createDailyOccurrenceLog(dobForm);
            showNotification('Daily Occurrence logged successfully');
            setShowDobModal(false);
            setDobForm({ site: '', title: '', details: '', entry_type: 'GENERAL', is_flagged: false });
            loadTabData();
        } catch (err: any) {
            showNotification(err.message || 'Failed to log occurrence', 'error');
        }
    };

    const handleTriggerSos = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!sosForm.site_id) {
            showNotification('Site is required for SOS trigger', 'error');
            return;
        }
        try {
            await triggerEmergency({
                site_id: sosForm.site_id,
                event_type: sosForm.event_type,
                severity: sosForm.severity,
                description: sosForm.description,
                latitude: sosForm.latitude ? parseFloat(sosForm.latitude) : null,
                longitude: sosForm.longitude ? parseFloat(sosForm.longitude) : null
            });
            showNotification('CRITICAL SOS ALERT BROADCASTED TO CONTROL ROOM', 'success');
            setShowSosModal(false);
            setSosForm({ site_id: '', event_type: 'PANIC_BUTTON', severity: 'CRITICAL', description: '', latitude: '', longitude: '' });
            loadCommonData();
            loadTabData();
        } catch (err: any) {
            showNotification(err.message || 'Failed to trigger SOS', 'error');
        }
    };

    const handleAcknowledgeSos = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!showAckSosModal) return;
        try {
            await acknowledgeEmergency(showAckSosModal.id, ackSosForm);
            showNotification('Emergency acknowledged and responder dispatched.');
            setShowAckSosModal(null);
            setAckSosForm({ response_notes: '' });
            loadCommonData();
            loadTabData();
        } catch (err: any) {
            showNotification(err.message || 'Failed to acknowledge emergency', 'error');
        }
    };

    const handleResolveSos = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!showResolveSosModal) return;
        try {
            await resolveEmergency(showResolveSosModal.id, resolveSosForm);
            showNotification('Emergency successfully resolved.');
            setShowResolveSosModal(null);
            setResolveSosForm({ resolution_summary: '', is_false_alarm: false });
            loadCommonData();
            loadTabData();
        } catch (err: any) {
            showNotification(err.message || 'Failed to resolve emergency', 'error');
        }
    };

    const handleCreateCheckpoint = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!checkpointForm.site || !checkpointForm.name || !checkpointForm.code) {
            showNotification('Site, Name, and Code are required', 'error');
            return;
        }
        try {
            await createSiteCheckpoint({
                ...checkpointForm,
                sequence_order: Number(checkpointForm.sequence_order)
            });
            showNotification('Site Checkpoint created.');
            setShowCheckpointModal(false);
            setCheckpointForm({
                site: '', name: '', code: '', sequence_order: 1,
                location_description: '', latitude: '', longitude: '', qr_code_tag: ''
            });
            loadTabData();
        } catch (err: any) {
            showNotification(err.message || 'Failed to create checkpoint', 'error');
        }
    };

    const handleSchedulePatrol = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!patrolRunForm.site) {
            showNotification('Site is required', 'error');
            return;
        }
        try {
            await schedulePatrolRun({
                site: patrolRunForm.site,
                plan: patrolRunForm.plan || undefined,
                scheduled_start: new Date(patrolRunForm.scheduled_start).toISOString(),
                notes: patrolRunForm.notes
            });
            showNotification('Patrol Run scheduled.');
            setShowSchedulePatrolModal(false);
            setPatrolRunForm({ site: '', plan: '', scheduled_start: new Date().toISOString().slice(0, 16), notes: '' });
            loadTabData();
        } catch (err: any) {
            showNotification(err.message || 'Failed to schedule patrol', 'error');
        }
    };

    const handleCompleteRun = async (runId: string) => {
        try {
            await completePatrolRun(runId, { status: 'COMPLETED', completion_notes: 'Verified by control room operator.' });
            showNotification('Patrol Run marked Completed.');
            loadTabData();
            loadCommonData();
        } catch (err: any) {
            showNotification(err.message || 'Failed to complete run', 'error');
        }
    };

    const handleStartTour = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!guardTourForm.site || !guardTourForm.tour_name) {
            showNotification('Site and Tour Name are required', 'error');
            return;
        }
        try {
            await startGuardTour(guardTourForm);
            showNotification('Guard Tour started. Checkpoints loaded.');
            setShowStartTourModal(false);
            setGuardTourForm({ site: '', tour_name: 'Perimeter Inspection Tour', notes: '' });
            loadTabData();
        } catch (err: any) {
            showNotification(err.message || 'Failed to start guard tour', 'error');
        }
    };

    const handleVerifyCheckpoint = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!showVerifyModal) return;
        try {
            await verifyCheckpoint(showVerifyModal.tour.id, {
                checkpoint_id: showVerifyModal.checkpoint.id,
                verification_source: verifyForm.verification_source,
                latitude: verifyForm.latitude ? parseFloat(verifyForm.latitude) : null,
                longitude: verifyForm.longitude ? parseFloat(verifyForm.longitude) : null,
                notes: verifyForm.notes
            });
            showNotification(`Checkpoint ${showVerifyModal.checkpoint.code} verified!`);
            setShowVerifyModal(null);
            setVerifyForm({ verification_source: 'MANUAL', latitude: '', longitude: '', notes: '' });
            loadTabData();
            loadCommonData();
        } catch (err: any) {
            showNotification(err.message || 'Failed to verify checkpoint', 'error');
        }
    };

    const handleCompleteTour = async (tourId: string) => {
        try {
            await completeGuardTour(tourId, { notes: 'Completed by officer inspection.' });
            showNotification('Guard Tour completed.');
            loadTabData();
            loadCommonData();
        } catch (err: any) {
            showNotification(err.message || 'Failed to complete tour', 'error');
        }
    };

    const handleCreateInspection = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!inspectionForm.site) {
            showNotification('Site is required', 'error');
            return;
        }
        try {
            await createSupervisorInspection(inspectionForm);
            showNotification('Supervisor Field Inspection recorded.');
            setShowInspectionModal(false);
            setInspectionForm({
                site: '',
                guard_presence_verified: true,
                uniform_condition: 'SATISFACTORY',
                equipment_condition: 'SATISFACTORY',
                post_cleanliness_condition: 'SATISFACTORY',
                documentation_in_order: true,
                turnout_and_bearing: 'SATISFACTORY',
                deficiencies_observed: '',
                corrective_action_required: '',
                notes: ''
            });
            loadTabData();
            loadCommonData();
        } catch (err: any) {
            showNotification(err.message || 'Failed to record inspection', 'error');
        }
    };

    const handleAcknowledgeEscalation = async (id: string) => {
        try {
            await acknowledgeEscalation(id);
            showNotification('Escalation acknowledged.');
            loadTabData();
            loadCommonData();
        } catch (err: any) {
            showNotification(err.message || 'Failed to acknowledge escalation', 'error');
        }
    };

    const handleResolveEscalation = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!showResolveEscalationModal) return;
        try {
            await resolveEscalation(showResolveEscalationModal.id, escalationResolveForm);
            showNotification('Escalation marked Resolved.');
            setShowResolveEscalationModal(null);
            setEscalationResolveForm({ resolution_notes: '' });
            loadTabData();
            loadCommonData();
        } catch (err: any) {
            showNotification(err.message || 'Failed to resolve escalation', 'error');
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', fontFamily: 'inherit' }}>
            {/* Status Alert Banner */}
            {statusMessage && (
                <div
                    style={{
                        padding: '12px 20px',
                        borderRadius: '8px',
                        background: statusMessage.type === 'error' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                        border: `1px solid ${statusMessage.type === 'error' ? '#ef4444' : '#10b981'}`,
                        color: statusMessage.type === 'error' ? '#f87171' : '#34d399',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontWeight: 500
                    }}
                >
                    <span>{statusMessage.text}</span>
                    <button
                        onClick={() => setStatusMessage(null)}
                        style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '16px' }}
                    >
                        ✕
                    </button>
                </div>
            )}

            {/* Top Operational KPI Header */}
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
                    gap: '14px',
                    padding: '4px 0'
                }}
            >
                <div style={kpiCardStyle}>
                    <span style={kpiLabelStyle}>Open Incidents</span>
                    <span style={{ ...kpiValueStyle, color: (dashboard?.open_incidents || 0) > 0 ? '#f59e0b' : 'inherit' }}>
                        {dashboard?.open_incidents ?? 0}
                    </span>
                    <span style={kpiSubtextStyle}>{dashboard?.critical_incidents ?? 0} Critical Priority</span>
                </div>

                <div
                    style={{
                        ...kpiCardStyle,
                        borderColor: (dashboard?.active_emergencies || 0) > 0 ? '#ef4444' : 'var(--color-border)',
                        background: (dashboard?.active_emergencies || 0) > 0 ? 'rgba(239, 68, 68, 0.08)' : 'var(--color-surface)'
                    }}
                >
                    <span style={kpiLabelStyle}>Active SOS Alerts</span>
                    <span style={{ ...kpiValueStyle, color: (dashboard?.active_emergencies || 0) > 0 ? '#ef4444' : '#10b981' }}>
                        {(dashboard?.active_emergencies || 0) > 0 ? `🚨 ${dashboard?.active_emergencies}` : '0 Normal'}
                    </span>
                    <span style={kpiSubtextStyle}>Emergency Response Live</span>
                </div>

                <div style={kpiCardStyle}>
                    <span style={kpiLabelStyle}>7D Patrol Completion</span>
                    <span style={{ ...kpiValueStyle, color: '#3b82f6' }}>
                        {dashboard ? `${dashboard.patrol_completion_rate}%` : '100%'}
                    </span>
                    <span style={kpiSubtextStyle}>
                        {dashboard ? `${dashboard.completed_patrol_runs_7d}/${dashboard.total_patrol_runs_7d} Runs` : '0 Runs'}
                    </span>
                </div>

                <div style={kpiCardStyle}>
                    <span style={kpiLabelStyle}>Missed Checkpoints (7D)</span>
                    <span style={{ ...kpiValueStyle, color: (dashboard?.missed_checkpoints_7d || 0) > 0 ? '#f97316' : '#10b981' }}>
                        {dashboard?.missed_checkpoints_7d ?? 0}
                    </span>
                    <span style={kpiSubtextStyle}>Tour Compliance</span>
                </div>

                <div style={kpiCardStyle}>
                    <span style={kpiLabelStyle}>Open Escalations</span>
                    <span style={{ ...kpiValueStyle, color: (queue?.open_escalations_count || 0) > 0 ? '#eab308' : 'inherit' }}>
                        {queue?.open_escalations_count ?? 0}
                    </span>
                    <span style={kpiSubtextStyle}>{dashboard?.overdue_escalations ?? 0} Overdue Target</span>
                </div>

                <div style={kpiCardStyle}>
                    <span style={kpiLabelStyle}>Inspection Issues</span>
                    <span style={{ ...kpiValueStyle, color: (dashboard?.inspection_issues || 0) > 0 ? '#f43f5e' : 'inherit' }}>
                        {dashboard?.inspection_issues ?? 0}
                    </span>
                    <span style={kpiSubtextStyle}>Action Required</span>
                </div>

                <div style={kpiCardStyle}>
                    <span style={kpiLabelStyle}>Control Room Queue</span>
                    <span style={{ ...kpiValueStyle, color: 'var(--color-primary)' }}>
                        {queue?.total_queue_items ?? 0}
                    </span>
                    <span style={kpiSubtextStyle}>{queue?.critical_count ?? 0} Critical / {queue?.high_count ?? 0} High</span>
                </div>
            </div>

            {/* Navigation & Controls Toolbar */}
            <div
                style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    padding: '12px 18px',
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '10px'
                }}
            >
                {/* Tab selector */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    <TabButton active={activeTab === 'control_room'} onClick={() => setActiveTab('control_room')}>
                        🚨 Live Control Room ({queue?.total_queue_items ?? 0})
                    </TabButton>
                    <TabButton active={activeTab === 'dob'} onClick={() => setActiveTab('dob')}>
                        📖 Daily Occurrence Book (DOB)
                    </TabButton>
                    <TabButton active={activeTab === 'patrols'} onClick={() => setActiveTab('patrols')}>
                        🚶‍♂️ Patrols & Checkpoints
                    </TabButton>
                    <TabButton active={activeTab === 'guard_tours'} onClick={() => setActiveTab('guard_tours')}>
                        🛡️ Guard Tours & Verification
                    </TabButton>
                    <TabButton active={activeTab === 'emergencies'} onClick={() => setActiveTab('emergencies')}>
                        🆘 Emergency SOS Console
                    </TabButton>
                    <TabButton active={activeTab === 'inspections'} onClick={() => setActiveTab('inspections')}>
                        📋 Field Inspections
                    </TabButton>
                    <TabButton active={activeTab === 'escalations'} onClick={() => setActiveTab('escalations')}>
                        ⚠️ Escalations Queue
                    </TabButton>
                    <TabButton active={activeTab === 'site_risk'} onClick={() => setActiveTab('site_risk')}>
                        🗺️ Site Risk Matrix
                    </TabButton>
                </div>

                {/* Filter and Action Buttons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <select
                        value={selectedSiteId}
                        onChange={(e) => setSelectedSiteId(e.target.value)}
                        style={selectStyle}
                    >
                        <option value="ALL">All Operational Sites</option>
                        {sites.map((s) => (
                            <option key={s.id} value={s.id}>
                                {s.name}
                            </option>
                        ))}
                    </select>

                    {activeTab === 'dob' && (
                        <button onClick={() => setShowDobModal(true)} style={primaryButtonStyle}>
                            + Log Occurrence
                        </button>
                    )}
                    {activeTab === 'patrols' && (
                        <>
                            <button onClick={() => setShowCheckpointModal(true)} style={secondaryButtonStyle}>
                                + New Checkpoint
                            </button>
                            <button onClick={() => setShowSchedulePatrolModal(true)} style={primaryButtonStyle}>
                                + Schedule Patrol
                            </button>
                        </>
                    )}
                    {activeTab === 'guard_tours' && (
                        <button onClick={() => setShowStartTourModal(true)} style={primaryButtonStyle}>
                            + Start Guard Tour
                        </button>
                    )}
                    {activeTab === 'emergencies' && (
                        <button onClick={() => setShowSosModal(true)} style={{ ...primaryButtonStyle, background: '#dc2626' }}>
                            🚨 Trigger Emergency SOS
                        </button>
                    )}
                    {activeTab === 'inspections' && (
                        <button onClick={() => setShowInspectionModal(true)} style={primaryButtonStyle}>
                            + New Site Inspection
                        </button>
                    )}
                    <button onClick={() => { loadCommonData(); loadTabData(); }} style={secondaryButtonStyle}>
                        🔄 Refresh
                    </button>
                </div>
            </div>

            {/* TAB CONTENT 1: CONTROL ROOM LIVE QUEUE */}
            {activeTab === 'control_room' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>
                                Central Operations Exception Queue
                            </h3>
                            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                                Real-time dispatch console combining SOS events, open incidents, missed tours, and operational escalations.
                            </p>
                        </div>
                        <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                            Showing {queue?.queue.length ?? 0} operational exceptions
                        </span>
                    </div>

                    {(!queue || queue.queue.length === 0) ? (
                        <div style={emptyStateStyle}>
                            <p style={{ fontSize: '16px', margin: 0 }}>🛡️ All Operations Normal</p>
                            <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', margin: '6px 0 0 0' }}>
                                No active emergencies, unresolved incidents, or missed patrol runs in the queue.
                            </p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {queue.queue.map((item) => (
                                <div
                                    key={item.id}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '14px 18px',
                                        background: 'var(--color-surface)',
                                        border: `1px solid ${item.priority === 'CRITICAL' ? '#ef4444' : item.priority === 'HIGH' ? '#f97316' : 'var(--color-border)'}`,
                                        borderRadius: '8px',
                                        borderLeft: `5px solid ${item.priority === 'CRITICAL' ? '#ef4444' : item.priority === 'HIGH' ? '#f97316' : '#3b82f6'}`
                                    }}
                                >
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxWidth: '75%' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={getPriorityBadgeStyle(item.priority)}>{item.priority}</span>
                                            <span style={getTypeBadgeStyle(item.type)}>{item.type}</span>
                                            <span style={{ fontWeight: 600, fontSize: '15px' }}>{item.title}</span>
                                        </div>
                                        <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                                            <span>Site: <strong>{item.site_name}</strong></span> •{' '}
                                            <span>Time: {new Date(item.occurred_at).toLocaleTimeString()}</span> •{' '}
                                            <span>Status: <strong style={{ color: 'inherit' }}>{item.status}</strong></span>
                                            {item.assigned_to && (
                                                <span> • Assigned: <strong>{item.assigned_to}</strong></span>
                                            )}
                                        </div>
                                        <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--color-text)' }}>
                                            {item.details}
                                        </p>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        {item.type === 'EMERGENCY_SOS' && (
                                            <>
                                                <button
                                                    onClick={() => setShowAckSosModal(emergencies.find(e => e.id === item.id) || null)}
                                                    style={{ ...secondaryButtonStyle, padding: '6px 12px' }}
                                                >
                                                    Acknowledge / Dispatch
                                                </button>
                                                <button
                                                    onClick={() => setShowResolveSosModal(emergencies.find(e => e.id === item.id) || null)}
                                                    style={{ ...primaryButtonStyle, background: '#10b981', padding: '6px 12px' }}
                                                >
                                                    Resolve
                                                </button>
                                            </>
                                        )}
                                        {item.type.startsWith('ESCALATION') && (
                                            <button
                                                onClick={() => {
                                                    const esc = escalations.find(e => e.id === item.id);
                                                    if (esc) setShowResolveEscalationModal(esc);
                                                }}
                                                style={{ ...primaryButtonStyle, padding: '6px 12px' }}
                                            >
                                                Resolve Escalation
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* TAB CONTENT 2: DAILY OCCURRENCE BOOK (DOB) */}
            {activeTab === 'dob' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>
                                Daily Occurrence Book (DOB) & Site Log
                            </h3>
                            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                                Immutable, chronological site log capturing shift handovers, visitor observations, supervisor instructions, and security occurrences.
                            </p>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <select
                                value={dobEntryTypeFilter}
                                onChange={(e) => setDobEntryTypeFilter(e.target.value)}
                                style={selectStyle}
                            >
                                <option value="ALL">All Entry Types</option>
                                <option value="SHIFT_HANDOVER">Shift Handover</option>
                                <option value="OBSERVATION">Observation</option>
                                <option value="VISITOR">Visitor</option>
                                <option value="INCIDENT">Incident</option>
                                <option value="PATROL">Patrol</option>
                                <option value="EQUIPMENT">Equipment</option>
                                <option value="SUPERVISOR_INSTRUCTION">Supervisor Instruction</option>
                                <option value="GENERAL">General</option>
                            </select>
                        </div>
                    </div>

                    <div style={tableContainerStyle}>
                        <table style={tableStyle}>
                            <thead>
                                <tr>
                                    <th style={thStyle}>Timestamp</th>
                                    <th style={thStyle}>Site & Post</th>
                                    <th style={thStyle}>Entry Type</th>
                                    <th style={thStyle}>Title & Occurrence Details</th>
                                    <th style={thStyle}>Logged By / Guard</th>
                                    <th style={thStyle}>Flagged</th>
                                </tr>
                            </thead>
                            <tbody>
                                {dobLogs.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} style={{ ...tdStyle, textAlign: 'center', padding: '30px' }}>
                                            No occurrence logs recorded for selected site filter.
                                        </td>
                                    </tr>
                                ) : (
                                    dobLogs.map((log) => (
                                        <tr key={log.id}>
                                            <td style={{ ...tdStyle, whiteSpace: 'nowrap', fontSize: '12px' }}>
                                                {new Date(log.timestamp).toLocaleString()}
                                            </td>
                                            <td style={tdStyle}>
                                                <div style={{ fontWeight: 600 }}>{log.site_name || 'Direct Site'}</div>
                                                {log.post_name && (
                                                    <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                                                        {log.post_name}
                                                    </div>
                                                )}
                                            </td>
                                            <td style={tdStyle}>
                                                <span style={getEntryTypeBadgeStyle(log.entry_type)}>
                                                    {log.entry_type_label || log.entry_type}
                                                </span>
                                            </td>
                                            <td style={{ ...tdStyle, maxWidth: '380px' }}>
                                                <div style={{ fontWeight: 600, fontSize: '14px' }}>{log.title}</div>
                                                <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                                                    {log.details}
                                                </div>
                                            </td>
                                            <td style={tdStyle}>
                                                <div>{log.logged_by_name || 'System Operator'}</div>
                                                {log.employee_name && (
                                                    <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                                                        Guard: {log.employee_name}
                                                    </div>
                                                )}
                                            </td>
                                            <td style={tdStyle}>
                                                {log.is_flagged ? (
                                                    <span style={{ color: '#ef4444', fontWeight: 600 }}>🚩 Yes</span>
                                                ) : (
                                                    <span style={{ color: 'var(--color-text-secondary)' }}>No</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* TAB CONTENT 3: PATROLS & CHECKPOINT MANAGEMENT */}
            {activeTab === 'patrols' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {/* Checkpoints Section */}
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                            <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>
                                Configured Site Checkpoints
                            </h4>
                            <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                                {checkpoints.length} Checkpoints active
                            </span>
                        </div>

                        <div style={tableContainerStyle}>
                            <table style={tableStyle}>
                                <thead>
                                    <tr>
                                        <th style={thStyle}>Seq</th>
                                        <th style={thStyle}>Code</th>
                                        <th style={thStyle}>Checkpoint Name</th>
                                        <th style={thStyle}>Site Location</th>
                                        <th style={thStyle}>Coordinates (Lat, Lon)</th>
                                        <th style={thStyle}>Tag Type</th>
                                        <th style={thStyle}>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {checkpoints.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} style={{ ...tdStyle, textAlign: 'center', padding: '24px' }}>
                                                No checkpoints defined. Click "+ New Checkpoint" to define site patrol route points.
                                            </td>
                                        </tr>
                                    ) : (
                                        checkpoints.map((cp) => (
                                            <tr key={cp.id}>
                                                <td style={{ ...tdStyle, fontWeight: 700 }}>{cp.sequence_order}</td>
                                                <td style={{ ...tdStyle, fontFamily: 'monospace', fontWeight: 600 }}>{cp.code}</td>
                                                <td style={tdStyle}>
                                                    <div style={{ fontWeight: 600 }}>{cp.name}</div>
                                                    <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                                                        {cp.location_description}
                                                    </div>
                                                </td>
                                                <td style={tdStyle}>{cp.site_name}</td>
                                                <td style={{ ...tdStyle, fontSize: '12px', fontFamily: 'monospace' }}>
                                                    {cp.latitude && cp.longitude ? `${cp.latitude}, ${cp.longitude}` : 'Not Geocoded'}
                                                </td>
                                                <td style={tdStyle}>
                                                    {cp.qr_code_tag ? '📱 QR Code' : cp.nfc_tag_id ? '📡 NFC Tag' : '📝 Manual'}
                                                </td>
                                                <td style={tdStyle}>
                                                    <span style={cp.is_active ? activeBadgeStyle : inactiveBadgeStyle}>
                                                        {cp.is_active ? 'Active' : 'Inactive'}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Patrol Runs Section */}
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                            <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>
                                Patrol Runs & Schedules
                            </h4>
                            <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                                {patrolRuns.length} Runs logged
                            </span>
                        </div>

                        <div style={tableContainerStyle}>
                            <table style={tableStyle}>
                                <thead>
                                    <tr>
                                        <th style={thStyle}>Run Code</th>
                                        <th style={thStyle}>Site & Plan</th>
                                        <th style={thStyle}>Scheduled Time</th>
                                        <th style={thStyle}>Assigned Guard</th>
                                        <th style={thStyle}>Status</th>
                                        <th style={thStyle}>Completion Notes</th>
                                        <th style={thStyle}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {patrolRuns.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} style={{ ...tdStyle, textAlign: 'center', padding: '24px' }}>
                                                No scheduled patrol runs. Click "+ Schedule Patrol" to dispatch runs.
                                            </td>
                                        </tr>
                                    ) : (
                                        patrolRuns.map((run) => (
                                            <tr key={run.id}>
                                                <td style={{ ...tdStyle, fontWeight: 600, fontFamily: 'monospace' }}>
                                                    {run.run_code}
                                                </td>
                                                <td style={tdStyle}>
                                                    <div style={{ fontWeight: 600 }}>{run.site_name}</div>
                                                    <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                                                        {run.plan_name || 'Ad-hoc Patrol'}
                                                    </div>
                                                </td>
                                                <td style={{ ...tdStyle, fontSize: '13px' }}>
                                                    {new Date(run.scheduled_start).toLocaleString()}
                                                </td>
                                                <td style={tdStyle}>{run.assigned_employee_name || 'Duty Guard'}</td>
                                                <td style={tdStyle}>
                                                    <span style={getPatrolStatusBadgeStyle(run.status)}>
                                                        {run.status_label || run.status}
                                                    </span>
                                                </td>
                                                <td style={{ ...tdStyle, fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                                                    {run.completion_notes || run.notes || '-'}
                                                </td>
                                                <td style={tdStyle}>
                                                    {run.status === 'PLANNED' && (
                                                        <button
                                                            onClick={() => handleCompleteRun(run.id)}
                                                            style={{ ...primaryButtonStyle, padding: '4px 10px', fontSize: '12px' }}
                                                        >
                                                            Mark Completed
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB CONTENT 4: GUARD TOURS & VERIFICATION */}
            {activeTab === 'guard_tours' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>
                                Guard Tour Execution & Checkpoint Verification
                            </h3>
                            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                                Live tracking of patrol rounds across sequenced checkpoints, capturing GPS geofence compliance and verification evidence.
                            </p>
                        </div>
                        <button onClick={() => setShowStartTourModal(true)} style={primaryButtonStyle}>
                            + Start Guard Tour
                        </button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '14px' }}>
                        {guardTours.length === 0 ? (
                            <div style={{ ...emptyStateStyle, gridColumn: '1 / -1' }}>
                                <p style={{ fontSize: '16px', margin: 0 }}>No active guard tours.</p>
                                <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', margin: '6px 0 0 0' }}>
                                    Start a guard tour to initiate sequential checkpoint verification for on-duty guards.
                                </p>
                            </div>
                        ) : (
                            guardTours.map((tour) => (
                                <div
                                    key={tour.id}
                                    style={{
                                        background: 'var(--color-surface)',
                                        border: '1px solid var(--color-border)',
                                        borderRadius: '10px',
                                        padding: '16px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '12px'
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div>
                                            <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>{tour.tour_name}</h4>
                                            <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                                                Site: <strong>{tour.site_name}</strong> • Guard: <strong>{tour.assigned_employee_name || 'Assigned'}</strong>
                                            </span>
                                        </div>
                                        <span style={getPatrolStatusBadgeStyle(tour.status)}>{tour.status}</span>
                                    </div>

                                    {/* Tour Progress Bar */}
                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                                            <span>Progress: {tour.completed_checkpoints}/{tour.total_checkpoints} Checkpoints</span>
                                            <span style={{ fontWeight: 600 }}>{tour.completion_rate}%</span>
                                        </div>
                                        <div style={{ width: '100%', height: '8px', background: 'var(--color-border)', borderRadius: '4px', overflow: 'hidden' }}>
                                            <div
                                                style={{
                                                    width: `${Math.min(100, Number(tour.completion_rate))}%`,
                                                    height: '100%',
                                                    background: '#10b981',
                                                    borderRadius: '4px',
                                                    transition: 'width 0.3s ease'
                                                }}
                                            />
                                        </div>
                                    </div>

                                    {/* Action row */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                                        {tour.status === 'IN_PROGRESS' ? (
                                            <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
                                                <select
                                                    style={{ ...selectStyle, flex: 1 }}
                                                    onChange={(e) => {
                                                        const cp = checkpoints.find(c => c.id === e.target.value);
                                                        if (cp) setShowVerifyModal({ tour, checkpoint: cp });
                                                    }}
                                                    defaultValue=""
                                                >
                                                    <option value="" disabled>Scan / Verify Checkpoint...</option>
                                                    {checkpoints
                                                        .filter(cp => cp.site === tour.site)
                                                        .map(cp => (
                                                            <option key={cp.id} value={cp.id}>
                                                                {cp.sequence_order}. {cp.code} - {cp.name}
                                                            </option>
                                                        ))
                                                    }
                                                </select>
                                                <button
                                                    onClick={() => handleCompleteTour(tour.id)}
                                                    style={{ ...primaryButtonStyle, padding: '6px 12px', fontSize: '13px' }}
                                                >
                                                    Complete Tour
                                                </button>
                                            </div>
                                        ) : (
                                            <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                                                Ended: {tour.end_time ? new Date(tour.end_time).toLocaleTimeString() : 'N/A'} • Missed: {tour.missed_checkpoints}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            {/* TAB CONTENT 5: EMERGENCY SOS LIVE CONSOLE */}
            {activeTab === 'emergencies' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#ef4444' }}>
                                🆘 Live Emergency & Panic Distress Console
                            </h3>
                            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                                High-priority distress alerts triggered by guards, panic buttons, or perimeter intrusion sensors with real-time GPS geofence tracking.
                            </p>
                        </div>
                        <button
                            onClick={() => setShowSosModal(true)}
                            style={{ ...primaryButtonStyle, background: '#dc2626', padding: '10px 18px', fontWeight: 700 }}
                        >
                            🚨 Trigger Emergency SOS
                        </button>
                    </div>

                    <div style={tableContainerStyle}>
                        <table style={tableStyle}>
                            <thead>
                                <tr>
                                    <th style={thStyle}>Alert Time</th>
                                    <th style={thStyle}>Site Location</th>
                                    <th style={thStyle}>Alert Type & Severity</th>
                                    <th style={thStyle}>Geofence Status</th>
                                    <th style={thStyle}>Guard / Reporter</th>
                                    <th style={thStyle}>Status</th>
                                    <th style={thStyle}>Assigned Responder</th>
                                    <th style={thStyle}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {emergencies.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} style={{ ...tdStyle, textAlign: 'center', padding: '30px' }}>
                                            No active emergency alerts. All sites are secure.
                                        </td>
                                    </tr>
                                ) : (
                                    emergencies.map((em) => (
                                        <tr
                                            key={em.id}
                                            style={{
                                                background: em.status === 'TRIGGERED' ? 'rgba(239, 68, 68, 0.08)' : 'inherit'
                                            }}
                                        >
                                            <td style={{ ...tdStyle, whiteSpace: 'nowrap', fontWeight: 600 }}>
                                                {new Date(em.occurred_at).toLocaleTimeString()}
                                            </td>
                                            <td style={tdStyle}>
                                                <div style={{ fontWeight: 600 }}>{em.site_name}</div>
                                                {em.post_name && (
                                                    <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                                                        {em.post_name}
                                                    </div>
                                                )}
                                            </td>
                                            <td style={tdStyle}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <span style={getPriorityBadgeStyle(em.severity)}>{em.severity}</span>
                                                    <span style={{ fontWeight: 600 }}>{em.event_type_label || em.event_type}</span>
                                                </div>
                                                {em.description && (
                                                    <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                                                        {em.description}
                                                    </div>
                                                )}
                                            </td>
                                            <td style={tdStyle}>
                                                <span style={getGeofenceBadgeStyle(em.geofence_status)}>
                                                    {em.geofence_status}
                                                </span>
                                            </td>
                                            <td style={tdStyle}>{em.employee_name || em.reported_by_name || 'Fixed Sensor'}</td>
                                            <td style={tdStyle}>
                                                <span style={getEmergencyStatusBadgeStyle(em.status)}>{em.status}</span>
                                            </td>
                                            <td style={tdStyle}>{em.assigned_responder_name || 'Unassigned'}</td>
                                            <td style={tdStyle}>
                                                <div style={{ display: 'flex', gap: '6px' }}>
                                                    {em.status === 'TRIGGERED' && (
                                                        <button
                                                            onClick={() => setShowAckSosModal(em)}
                                                            style={{ ...secondaryButtonStyle, padding: '4px 8px', fontSize: '12px' }}
                                                        >
                                                            Acknowledge
                                                        </button>
                                                    )}
                                                    {em.status !== 'RESOLVED' && em.status !== 'FALSE_ALARM' && (
                                                        <button
                                                            onClick={() => setShowResolveSosModal(em)}
                                                            style={{ ...primaryButtonStyle, background: '#10b981', padding: '4px 8px', fontSize: '12px' }}
                                                        >
                                                            Resolve
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* TAB CONTENT 6: FIELD SUPERVISOR INSPECTIONS */}
            {activeTab === 'inspections' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>
                                Field Supervisor Inspections & Quality Audits
                            </h3>
                            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                                Structured turnout, equipment, uniform, and post readiness checklist with automated scoring and deficiency escalation.
                            </p>
                        </div>
                        <button onClick={() => setShowInspectionModal(true)} style={primaryButtonStyle}>
                            + New Site Inspection
                        </button>
                    </div>

                    <div style={tableContainerStyle}>
                        <table style={tableStyle}>
                            <thead>
                                <tr>
                                    <th style={thStyle}>Date & Time</th>
                                    <th style={thStyle}>Site Location</th>
                                    <th style={thStyle}>Inspector</th>
                                    <th style={thStyle}>Overall Score</th>
                                    <th style={thStyle}>Status</th>
                                    <th style={thStyle}>Key Deficiencies Observed</th>
                                    <th style={thStyle}>Corrective Action Required</th>
                                </tr>
                            </thead>
                            <tbody>
                                {inspections.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} style={{ ...tdStyle, textAlign: 'center', padding: '30px' }}>
                                            No supervisor field inspections recorded.
                                        </td>
                                    </tr>
                                ) : (
                                    inspections.map((insp) => (
                                        <tr key={insp.id}>
                                            <td style={{ ...tdStyle, whiteSpace: 'nowrap', fontSize: '13px' }}>
                                                {new Date(insp.inspection_datetime).toLocaleString()}
                                            </td>
                                            <td style={tdStyle}>
                                                <div style={{ fontWeight: 600 }}>{insp.site_name}</div>
                                                {insp.post_name && (
                                                    <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                                                        {insp.post_name}
                                                    </div>
                                                )}
                                            </td>
                                            <td style={tdStyle}>{insp.inspector_name || 'Field Supervisor'}</td>
                                            <td style={tdStyle}>
                                                <span
                                                    style={{
                                                        fontSize: '15px',
                                                        fontWeight: 700,
                                                        color: Number(insp.overall_score || 100) < 80 ? '#ef4444' : '#10b981'
                                                    }}
                                                >
                                                    {insp.overall_score ?? '100'}%
                                                </span>
                                            </td>
                                            <td style={tdStyle}>
                                                <span style={insp.status === 'ACTION_REQUIRED' ? dangerBadgeStyle : activeBadgeStyle}>
                                                    {insp.status}
                                                </span>
                                            </td>
                                            <td style={{ ...tdStyle, maxWidth: '280px', fontSize: '13px' }}>
                                                {insp.deficiencies_observed || 'None. All items satisfactory.'}
                                            </td>
                                            <td style={{ ...tdStyle, maxWidth: '280px', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                                                {insp.corrective_action_required || 'No corrective action required.'}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* TAB CONTENT 7: OPERATIONS ESCALATION QUEUE */}
            {activeTab === 'escalations' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>
                                Operations Escalations & Critical Exceptions
                            </h3>
                            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                                Track high-priority operational exceptions automatically generated from missed tours, incidents, emergency alerts, or failed inspections.
                            </p>
                        </div>
                    </div>

                    <div style={tableContainerStyle}>
                        <table style={tableStyle}>
                            <thead>
                                <tr>
                                    <th style={thStyle}>Priority</th>
                                    <th style={thStyle}>Source</th>
                                    <th style={thStyle}>Site</th>
                                    <th style={thStyle}>Title & Exception Details</th>
                                    <th style={thStyle}>Status</th>
                                    <th style={thStyle}>Assigned Operator</th>
                                    <th style={thStyle}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {escalations.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} style={{ ...tdStyle, textAlign: 'center', padding: '30px' }}>
                                            No open escalations in the queue.
                                        </td>
                                    </tr>
                                ) : (
                                    escalations.map((esc) => (
                                        <tr key={esc.id}>
                                            <td style={tdStyle}>
                                                <span style={getPriorityBadgeStyle(esc.priority)}>{esc.priority}</span>
                                            </td>
                                            <td style={tdStyle}>
                                                <span style={getTypeBadgeStyle(esc.source_type)}>{esc.source_type}</span>
                                            </td>
                                            <td style={{ ...tdStyle, fontWeight: 600 }}>{esc.site_name}</td>
                                            <td style={{ ...tdStyle, maxWidth: '340px' }}>
                                                <div style={{ fontWeight: 600 }}>{esc.title}</div>
                                                <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                                                    {esc.description}
                                                </div>
                                            </td>
                                            <td style={tdStyle}>
                                                <span style={esc.status === 'RESOLVED' ? activeBadgeStyle : warningBadgeStyle}>
                                                    {esc.status}
                                                </span>
                                            </td>
                                            <td style={tdStyle}>{esc.assigned_to_name || 'Unassigned'}</td>
                                            <td style={tdStyle}>
                                                <div style={{ display: 'flex', gap: '6px' }}>
                                                    {esc.status === 'OPEN' && (
                                                        <button
                                                            onClick={() => handleAcknowledgeEscalation(esc.id)}
                                                            style={{ ...secondaryButtonStyle, padding: '4px 8px', fontSize: '12px' }}
                                                        >
                                                            Acknowledge
                                                        </button>
                                                    )}
                                                    {esc.status !== 'RESOLVED' && (
                                                        <button
                                                            onClick={() => setShowResolveEscalationModal(esc)}
                                                            style={{ ...primaryButtonStyle, padding: '4px 8px', fontSize: '12px' }}
                                                        >
                                                            Resolve
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* TAB CONTENT 8: SITE OPERATIONAL RISK MATRIX */}
            {activeTab === 'site_risk' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>
                                Operational Site Risk & Compliance Matrix
                            </h3>
                            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                                Consolidated operational risk ranking computed from live distress alarms, unresolved incidents, inspection scores, and patrol compliance.
                            </p>
                        </div>
                    </div>

                    <div style={tableContainerStyle}>
                        <table style={tableStyle}>
                            <thead>
                                <tr>
                                    <th style={thStyle}>Risk Level</th>
                                    <th style={thStyle}>Site Name</th>
                                    <th style={thStyle}>Client</th>
                                    <th style={thStyle}>Active Incidents</th>
                                    <th style={thStyle}>Active Emergencies</th>
                                    <th style={thStyle}>Inspection Deficiencies</th>
                                    <th style={thStyle}>Missed Patrols (7D)</th>
                                    <th style={thStyle}>Geofence Perimeter</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(!dashboard || dashboard.site_risk_summary.length === 0) ? (
                                    <tr>
                                        <td colSpan={8} style={{ ...tdStyle, textAlign: 'center', padding: '30px' }}>
                                            No active operational sites found.
                                        </td>
                                    </tr>
                                ) : (
                                    dashboard.site_risk_summary.map((sr) => (
                                        <tr key={sr.site_id}>
                                            <td style={tdStyle}>
                                                <span style={getRiskLevelBadgeStyle(sr.risk_level)}>
                                                    {sr.risk_level === 'HIGH' ? '🔴 HIGH RISK' : sr.risk_level === 'MEDIUM' ? '🟡 MEDIUM' : '🟢 LOW RISK'}
                                                </span>
                                            </td>
                                            <td style={{ ...tdStyle, fontWeight: 600, fontSize: '14px' }}>{sr.site_name}</td>
                                            <td style={tdStyle}>{sr.client_name}</td>
                                            <td style={tdStyle}>
                                                <span style={{ fontWeight: 600, color: sr.active_incidents > 0 ? '#f59e0b' : 'inherit' }}>
                                                    {sr.active_incidents}
                                                </span>
                                            </td>
                                            <td style={tdStyle}>
                                                <span style={{ fontWeight: 600, color: sr.active_emergencies > 0 ? '#ef4444' : 'inherit' }}>
                                                    {sr.active_emergencies}
                                                </span>
                                            </td>
                                            <td style={tdStyle}>
                                                <span style={{ fontWeight: 600, color: sr.inspection_deficiencies > 0 ? '#f43f5e' : 'inherit' }}>
                                                    {sr.inspection_deficiencies}
                                                </span>
                                            </td>
                                            <td style={tdStyle}>
                                                <span style={{ fontWeight: 600, color: sr.missed_patrols > 0 ? '#f97316' : 'inherit' }}>
                                                    {sr.missed_patrols}
                                                </span>
                                            </td>
                                            <td style={tdStyle}>
                                                {sr.geofence_configured ? (
                                                    <span style={activeBadgeStyle}>
                                                        📍 {sr.geofence_radius_meters}m Radius
                                                    </span>
                                                ) : (
                                                    <span style={inactiveBadgeStyle}>No GPS Configured</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* MODALS */}
            {/* ========================================================================= */}

            {/* 1. Modal: Log DOB Entry */}
            {showDobModal && (
                <div style={modalOverlayStyle}>
                    <div style={modalContentStyle}>
                        <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: 600 }}>Log Daily Occurrence Entry</h3>
                        <form onSubmit={handleCreateDob} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div>
                                <label style={labelStyle}>Operational Site *</label>
                                <select
                                    value={dobForm.site}
                                    onChange={(e) => setDobForm({ ...dobForm, site: e.target.value })}
                                    style={inputStyle}
                                    required
                                >
                                    <option value="">Select Operational Site...</option>
                                    {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label style={labelStyle}>Occurrence Entry Type *</label>
                                <select
                                    value={dobForm.entry_type}
                                    onChange={(e) => setDobForm({ ...dobForm, entry_type: e.target.value as OccurrenceEntryType })}
                                    style={inputStyle}
                                    required
                                >
                                    <option value="GENERAL">General Occurrence</option>
                                    <option value="SHIFT_HANDOVER">Shift Handover</option>
                                    <option value="OBSERVATION">Security Observation</option>
                                    <option value="VISITOR">Visitor / Contractor Entry</option>
                                    <option value="INCIDENT">Incident Reference</option>
                                    <option value="PATROL">Patrol Record</option>
                                    <option value="EQUIPMENT">Equipment Check</option>
                                    <option value="SUPERVISOR_INSTRUCTION">Supervisor Instruction</option>
                                </select>
                            </div>
                            <div>
                                <label style={labelStyle}>Title / Summary *</label>
                                <input
                                    type="text"
                                    value={dobForm.title}
                                    onChange={(e) => setDobForm({ ...dobForm, title: e.target.value })}
                                    style={inputStyle}
                                    placeholder="e.g., Perimeter Gate Lock Replaced"
                                    required
                                />
                            </div>
                            <div>
                                <label style={labelStyle}>Occurrence Details *</label>
                                <textarea
                                    value={dobForm.details}
                                    onChange={(e) => setDobForm({ ...dobForm, details: e.target.value })}
                                    style={{ ...inputStyle, minHeight: '80px' }}
                                    placeholder="Provide detailed chronological report..."
                                    required
                                />
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <input
                                    type="checkbox"
                                    id="flagged-check"
                                    checked={dobForm.is_flagged}
                                    onChange={(e) => setDobForm({ ...dobForm, is_flagged: e.target.checked })}
                                />
                                <label htmlFor="flagged-check" style={{ fontSize: '13px', cursor: 'pointer' }}>
                                    Flag for supervisor review
                                </label>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                                <button type="button" onClick={() => setShowDobModal(false)} style={secondaryButtonStyle}>Cancel</button>
                                <button type="submit" style={primaryButtonStyle}>Submit Entry</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* 2. Modal: Trigger Emergency SOS */}
            {showSosModal && (
                <div style={modalOverlayStyle}>
                    <div style={{ ...modalContentStyle, borderColor: '#ef4444' }}>
                        <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: 600, color: '#ef4444' }}>
                            🚨 Broadcast Emergency Distress Alert
                        </h3>
                        <form onSubmit={handleTriggerSos} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div>
                                <label style={labelStyle}>Operational Site *</label>
                                <select
                                    value={sosForm.site_id}
                                    onChange={(e) => setSosForm({ ...sosForm, site_id: e.target.value })}
                                    style={inputStyle}
                                    required
                                >
                                    <option value="">Select Target Site...</option>
                                    {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label style={labelStyle}>Emergency Distress Type *</label>
                                <select
                                    value={sosForm.event_type}
                                    onChange={(e) => setSosForm({ ...sosForm, event_type: e.target.value })}
                                    style={inputStyle}
                                    required
                                >
                                    <option value="PANIC_BUTTON">Fixed / Mobile Panic Button</option>
                                    <option value="ARMED_ASSAULT">Armed Robbery / Assault</option>
                                    <option value="FIRE_EMERGENCY">Fire / Smoke Detected</option>
                                    <option value="MEDICAL_EMERGENCY">Medical Emergency</option>
                                    <option value="INTRUSION">Perimeter Intrusion Breach</option>
                                    <option value="UNRESPONSIVE_GUARD">Unresponsive Guard / Missing Check-in</option>
                                    <option value="OTHER">Other Distress</option>
                                </select>
                            </div>
                            <div>
                                <label style={labelStyle}>Severity Level</label>
                                <select
                                    value={sosForm.severity}
                                    onChange={(e) => setSosForm({ ...sosForm, severity: e.target.value })}
                                    style={inputStyle}
                                >
                                    <option value="CRITICAL">CRITICAL (Immediate Dispatch)</option>
                                    <option value="HIGH">HIGH (Immediate Attention)</option>
                                </select>
                            </div>
                            <div>
                                <label style={labelStyle}>Distress Description / Situation</label>
                                <textarea
                                    value={sosForm.description}
                                    onChange={(e) => setSosForm({ ...sosForm, description: e.target.value })}
                                    style={{ ...inputStyle, minHeight: '60px' }}
                                    placeholder="Describe current threat, location in building, guard status..."
                                />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                <div>
                                    <label style={labelStyle}>GPS Latitude (Optional)</label>
                                    <input
                                        type="number"
                                        step="any"
                                        value={sosForm.latitude}
                                        onChange={(e) => setSosForm({ ...sosForm, latitude: e.target.value })}
                                        style={inputStyle}
                                        placeholder="24.8607"
                                    />
                                </div>
                                <div>
                                    <label style={labelStyle}>GPS Longitude (Optional)</label>
                                    <input
                                        type="number"
                                        step="any"
                                        value={sosForm.longitude}
                                        onChange={(e) => setSosForm({ ...sosForm, longitude: e.target.value })}
                                        style={inputStyle}
                                        placeholder="67.0011"
                                    />
                                </div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                                <button type="button" onClick={() => setShowSosModal(false)} style={secondaryButtonStyle}>Cancel</button>
                                <button type="submit" style={{ ...primaryButtonStyle, background: '#dc2626' }}>
                                    BROADCAST SOS ALERT
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* 3. Modal: Acknowledge SOS */}
            {showAckSosModal && (
                <div style={modalOverlayStyle}>
                    <div style={modalContentStyle}>
                        <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: 600 }}>
                            Acknowledge Distress Alert: {showAckSosModal.event_type}
                        </h3>
                        <form onSubmit={handleAcknowledgeSos} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div>
                                <label style={labelStyle}>Dispatch / Response Notes</label>
                                <textarea
                                    value={ackSosForm.response_notes}
                                    onChange={(e) => setAckSosForm({ response_notes: e.target.value })}
                                    style={{ ...inputStyle, minHeight: '70px' }}
                                    placeholder="e.g. Mobile patrol team 4 dispatched. Local authorities notified."
                                    required
                                />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                                <button type="button" onClick={() => setShowAckSosModal(null)} style={secondaryButtonStyle}>Cancel</button>
                                <button type="submit" style={primaryButtonStyle}>Confirm Dispatch</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* 4. Modal: Resolve SOS */}
            {showResolveSosModal && (
                <div style={modalOverlayStyle}>
                    <div style={modalContentStyle}>
                        <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: 600 }}>
                            Resolve Emergency Alert
                        </h3>
                        <form onSubmit={handleResolveSos} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div>
                                <label style={labelStyle}>Resolution Summary *</label>
                                <textarea
                                    value={resolveSosForm.resolution_summary}
                                    onChange={(e) => setResolveSosForm({ ...resolveSosForm, resolution_summary: e.target.value })}
                                    style={{ ...inputStyle, minHeight: '80px' }}
                                    placeholder="Summarize investigation, outcome, and all clear confirmation..."
                                    required
                                />
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <input
                                    type="checkbox"
                                    id="false-alarm-check"
                                    checked={resolveSosForm.is_false_alarm}
                                    onChange={(e) => setResolveSosForm({ ...resolveSosForm, is_false_alarm: e.target.checked })}
                                />
                                <label htmlFor="false-alarm-check" style={{ fontSize: '13px', cursor: 'pointer' }}>
                                    Mark as False Alarm (e.g. Accidental trigger)
                                </label>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                                <button type="button" onClick={() => setShowResolveSosModal(null)} style={secondaryButtonStyle}>Cancel</button>
                                <button type="submit" style={{ ...primaryButtonStyle, background: '#10b981' }}>Mark Resolved</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* 5. Modal: Create Checkpoint */}
            {showCheckpointModal && (
                <div style={modalOverlayStyle}>
                    <div style={modalContentStyle}>
                        <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: 600 }}>Create Site Checkpoint</h3>
                        <form onSubmit={handleCreateCheckpoint} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div>
                                <label style={labelStyle}>Operational Site *</label>
                                <select
                                    value={checkpointForm.site}
                                    onChange={(e) => setCheckpointForm({ ...checkpointForm, site: e.target.value })}
                                    style={inputStyle}
                                    required
                                >
                                    <option value="">Select Operational Site...</option>
                                    {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '10px' }}>
                                <div>
                                    <label style={labelStyle}>Code *</label>
                                    <input
                                        type="text"
                                        value={checkpointForm.code}
                                        onChange={(e) => setCheckpointForm({ ...checkpointForm, code: e.target.value })}
                                        style={inputStyle}
                                        placeholder="CP-01"
                                        required
                                    />
                                </div>
                                <div>
                                    <label style={labelStyle}>Checkpoint Name *</label>
                                    <input
                                        type="text"
                                        value={checkpointForm.name}
                                        onChange={(e) => setCheckpointForm({ ...checkpointForm, name: e.target.value })}
                                        style={inputStyle}
                                        placeholder="North Perimeter Gate"
                                        required
                                    />
                                </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                <div>
                                    <label style={labelStyle}>Sequence Order</label>
                                    <input
                                        type="number"
                                        value={checkpointForm.sequence_order}
                                        onChange={(e) => setCheckpointForm({ ...checkpointForm, sequence_order: parseInt(e.target.value) || 1 })}
                                        style={inputStyle}
                                        min={1}
                                        required
                                    />
                                </div>
                                <div>
                                    <label style={labelStyle}>QR Code / Tag String</label>
                                    <input
                                        type="text"
                                        value={checkpointForm.qr_code_tag}
                                        onChange={(e) => setCheckpointForm({ ...checkpointForm, qr_code_tag: e.target.value })}
                                        style={inputStyle}
                                        placeholder="QR-NPG-001"
                                    />
                                </div>
                            </div>
                            <div>
                                <label style={labelStyle}>Location Description</label>
                                <input
                                    type="text"
                                    value={checkpointForm.location_description}
                                    onChange={(e) => setCheckpointForm({ ...checkpointForm, location_description: e.target.value })}
                                    style={inputStyle}
                                    placeholder="Near generator room south corner"
                                />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                                <button type="button" onClick={() => setShowCheckpointModal(false)} style={secondaryButtonStyle}>Cancel</button>
                                <button type="submit" style={primaryButtonStyle}>Save Checkpoint</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* 6. Modal: Schedule Patrol */}
            {showSchedulePatrolModal && (
                <div style={modalOverlayStyle}>
                    <div style={modalContentStyle}>
                        <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: 600 }}>Schedule Patrol Run</h3>
                        <form onSubmit={handleSchedulePatrol} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div>
                                <label style={labelStyle}>Operational Site *</label>
                                <select
                                    value={patrolRunForm.site}
                                    onChange={(e) => setPatrolRunForm({ ...patrolRunForm, site: e.target.value })}
                                    style={inputStyle}
                                    required
                                >
                                    <option value="">Select Operational Site...</option>
                                    {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label style={labelStyle}>Patrol Plan (Optional)</label>
                                <select
                                    value={patrolRunForm.plan}
                                    onChange={(e) => setPatrolRunForm({ ...patrolRunForm, plan: e.target.value })}
                                    style={inputStyle}
                                >
                                    <option value="">Ad-hoc Patrol (No Plan)</option>
                                    {patrolPlans.filter(p => !patrolRunForm.site || p.site === patrolRunForm.site).map(p => (
                                        <option key={p.id} value={p.id}>{p.name} ({p.frequency})</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label style={labelStyle}>Scheduled Start Date & Time *</label>
                                <input
                                    type="datetime-local"
                                    value={patrolRunForm.scheduled_start}
                                    onChange={(e) => setPatrolRunForm({ ...patrolRunForm, scheduled_start: e.target.value })}
                                    style={inputStyle}
                                    required
                                />
                            </div>
                            <div>
                                <label style={labelStyle}>Patrol Instructions / Notes</label>
                                <input
                                    type="text"
                                    value={patrolRunForm.notes}
                                    onChange={(e) => setPatrolRunForm({ ...patrolRunForm, notes: e.target.value })}
                                    style={inputStyle}
                                    placeholder="Inspect all outer perimeter fences and storage gates."
                                />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                                <button type="button" onClick={() => setShowSchedulePatrolModal(false)} style={secondaryButtonStyle}>Cancel</button>
                                <button type="submit" style={primaryButtonStyle}>Dispatch Schedule</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* 7. Modal: Start Guard Tour */}
            {showStartTourModal && (
                <div style={modalOverlayStyle}>
                    <div style={modalContentStyle}>
                        <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: 600 }}>Start Guard Tour</h3>
                        <form onSubmit={handleStartTour} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div>
                                <label style={labelStyle}>Operational Site *</label>
                                <select
                                    value={guardTourForm.site}
                                    onChange={(e) => setGuardTourForm({ ...guardTourForm, site: e.target.value })}
                                    style={inputStyle}
                                    required
                                >
                                    <option value="">Select Operational Site...</option>
                                    {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label style={labelStyle}>Tour Name *</label>
                                <input
                                    type="text"
                                    value={guardTourForm.tour_name}
                                    onChange={(e) => setGuardTourForm({ ...guardTourForm, tour_name: e.target.value })}
                                    style={inputStyle}
                                    required
                                />
                            </div>
                            <div>
                                <label style={labelStyle}>Notes / Special Orders</label>
                                <input
                                    type="text"
                                    value={guardTourForm.notes}
                                    onChange={(e) => setGuardTourForm({ ...guardTourForm, notes: e.target.value })}
                                    style={inputStyle}
                                    placeholder="Ensure all emergency exits checked."
                                />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                                <button type="button" onClick={() => setShowStartTourModal(false)} style={secondaryButtonStyle}>Cancel</button>
                                <button type="submit" style={primaryButtonStyle}>Initiate Tour</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* 8. Modal: Verify Checkpoint */}
            {showVerifyModal && (
                <div style={modalOverlayStyle}>
                    <div style={modalContentStyle}>
                        <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: 600 }}>
                            Verify Checkpoint: {showVerifyModal.checkpoint.code} ({showVerifyModal.checkpoint.name})
                        </h3>
                        <form onSubmit={handleVerifyCheckpoint} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div>
                                <label style={labelStyle}>Verification Source</label>
                                <select
                                    value={verifyForm.verification_source}
                                    onChange={(e) => setVerifyForm({ ...verifyForm, verification_source: e.target.value })}
                                    style={inputStyle}
                                >
                                    <option value="MANUAL">Manual Officer Sign-in</option>
                                    <option value="QR_CODE">QR Code Scan</option>
                                    <option value="NFC">NFC RFID Tag Tap</option>
                                    <option value="GPS">GPS Coordinates Match</option>
                                </select>
                            </div>
                            <div>
                                <label style={labelStyle}>Checkpoint Condition Notes</label>
                                <input
                                    type="text"
                                    value={verifyForm.notes}
                                    onChange={(e) => setVerifyForm({ ...verifyForm, notes: e.target.value })}
                                    style={inputStyle}
                                    placeholder="Secure, lock verified, no vandalism"
                                />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                                <button type="button" onClick={() => setShowVerifyModal(null)} style={secondaryButtonStyle}>Cancel</button>
                                <button type="submit" style={primaryButtonStyle}>Record Checkpoint Verification</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* 9. Modal: Record Supervisor Field Inspection */}
            {showInspectionModal && (
                <div style={modalOverlayStyle}>
                    <div style={{ ...modalContentStyle, maxWidth: '640px' }}>
                        <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: 600 }}>
                            Record Supervisor Field Inspection
                        </h3>
                        <form onSubmit={handleCreateInspection} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div>
                                <label style={labelStyle}>Operational Site *</label>
                                <select
                                    value={inspectionForm.site}
                                    onChange={(e) => setInspectionForm({ ...inspectionForm, site: e.target.value })}
                                    style={inputStyle}
                                    required
                                >
                                    <option value="">Select Operational Site...</option>
                                    {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                <div>
                                    <label style={labelStyle}>Uniform Condition</label>
                                    <select
                                        value={inspectionForm.uniform_condition}
                                        onChange={(e) => setInspectionForm({ ...inspectionForm, uniform_condition: e.target.value as InspectionRating })}
                                        style={inputStyle}
                                    >
                                        <option value="EXCELLENT">Excellent</option>
                                        <option value="SATISFACTORY">Satisfactory</option>
                                        <option value="DEFICIENT">Deficient</option>
                                    </select>
                                </div>
                                <div>
                                    <label style={labelStyle}>Equipment Condition</label>
                                    <select
                                        value={inspectionForm.equipment_condition}
                                        onChange={(e) => setInspectionForm({ ...inspectionForm, equipment_condition: e.target.value as InspectionRating })}
                                        style={inputStyle}
                                    >
                                        <option value="EXCELLENT">Excellent</option>
                                        <option value="SATISFACTORY">Satisfactory</option>
                                        <option value="DEFICIENT">Deficient</option>
                                    </select>
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                <div>
                                    <label style={labelStyle}>Post Cleanliness</label>
                                    <select
                                        value={inspectionForm.post_cleanliness_condition}
                                        onChange={(e) => setInspectionForm({ ...inspectionForm, post_cleanliness_condition: e.target.value as InspectionRating })}
                                        style={inputStyle}
                                    >
                                        <option value="EXCELLENT">Excellent</option>
                                        <option value="SATISFACTORY">Satisfactory</option>
                                        <option value="DEFICIENT">Deficient</option>
                                    </select>
                                </div>
                                <div>
                                    <label style={labelStyle}>Turnout & Bearing</label>
                                    <select
                                        value={inspectionForm.turnout_and_bearing}
                                        onChange={(e) => setInspectionForm({ ...inspectionForm, turnout_and_bearing: e.target.value as InspectionRating })}
                                        style={inputStyle}
                                    >
                                        <option value="EXCELLENT">Excellent</option>
                                        <option value="SATISFACTORY">Satisfactory</option>
                                        <option value="DEFICIENT">Deficient</option>
                                    </select>
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '20px', padding: '6px 0' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={inspectionForm.guard_presence_verified}
                                        onChange={(e) => setInspectionForm({ ...inspectionForm, guard_presence_verified: e.target.checked })}
                                    />
                                    Guard Presence Verified (30 pts)
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={inspectionForm.documentation_in_order}
                                        onChange={(e) => setInspectionForm({ ...inspectionForm, documentation_in_order: e.target.checked })}
                                    />
                                    Log Documentation In Order (15 pts)
                                </label>
                            </div>

                            <div>
                                <label style={labelStyle}>Deficiencies Observed</label>
                                <input
                                    type="text"
                                    value={inspectionForm.deficiencies_observed}
                                    onChange={(e) => setInspectionForm({ ...inspectionForm, deficiencies_observed: e.target.value })}
                                    style={inputStyle}
                                    placeholder="Missing name badge, flashlight uncharged..."
                                />
                            </div>

                            <div>
                                <label style={labelStyle}>Corrective Action Required</label>
                                <input
                                    type="text"
                                    value={inspectionForm.corrective_action_required}
                                    onChange={(e) => setInspectionForm({ ...inspectionForm, corrective_action_required: e.target.value })}
                                    style={inputStyle}
                                    placeholder="Re-issue flashlight battery from store by 14:00."
                                />
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                                <button type="button" onClick={() => setShowInspectionModal(false)} style={secondaryButtonStyle}>Cancel</button>
                                <button type="submit" style={primaryButtonStyle}>Submit Inspection</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* 10. Modal: Resolve Escalation */}
            {showResolveEscalationModal && (
                <div style={modalOverlayStyle}>
                    <div style={modalContentStyle}>
                        <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: 600 }}>
                            Resolve Escalation: {showResolveEscalationModal.title}
                        </h3>
                        <form onSubmit={handleResolveEscalation} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div>
                                <label style={labelStyle}>Resolution Notes *</label>
                                <textarea
                                    value={escalationResolveForm.resolution_notes}
                                    onChange={(e) => setEscalationResolveForm({ resolution_notes: e.target.value })}
                                    style={{ ...inputStyle, minHeight: '80px' }}
                                    placeholder="Detail actions taken to resolve this operational escalation..."
                                    required
                                />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                                <button type="button" onClick={() => setShowResolveEscalationModal(null)} style={secondaryButtonStyle}>Cancel</button>
                                <button type="submit" style={primaryButtonStyle}>Mark Escalation Resolved</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

// ==============================================================================
// Sub-components & Styles
// ==============================================================================

const TabButton: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
    <button
        onClick={onClick}
        style={{
            padding: '8px 14px',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: active ? 600 : 500,
            border: 'none',
            cursor: 'pointer',
            background: active ? 'var(--color-primary)' : 'transparent',
            color: active ? '#ffffff' : 'var(--color-text-secondary)',
            transition: 'all 0.15s ease'
        }}
    >
        {children}
    </button>
);

const kpiCardStyle: React.CSSProperties = {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: '10px',
    padding: '14px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px'
};

const kpiLabelStyle: React.CSSProperties = {
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    fontWeight: 500,
    textTransform: 'uppercase',
    letterSpacing: '0.04em'
};

const kpiValueStyle: React.CSSProperties = {
    fontSize: '24px',
    fontWeight: 700,
    lineHeight: 1.2
};

const kpiSubtextStyle: React.CSSProperties = {
    fontSize: '12px',
    color: 'var(--color-text-secondary)'
};

const selectStyle: React.CSSProperties = {
    padding: '7px 12px',
    borderRadius: '6px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-surface)',
    color: 'var(--color-text)',
    fontSize: '13px',
    cursor: 'pointer'
};

const primaryButtonStyle: React.CSSProperties = {
    padding: '7px 14px',
    borderRadius: '6px',
    border: 'none',
    background: 'var(--color-primary)',
    color: '#ffffff',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer'
};

const secondaryButtonStyle: React.CSSProperties = {
    padding: '7px 14px',
    borderRadius: '6px',
    border: '1px solid var(--color-border)',
    background: 'transparent',
    color: 'var(--color-text)',
    fontSize: '13px',
    cursor: 'pointer'
};

const tableContainerStyle: React.CSSProperties = {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: '10px',
    overflowX: 'auto'
};

const tableStyle: React.CSSProperties = {
    width: '100%',
    borderCollapse: 'collapse',
    textAlign: 'left'
};

const thStyle: React.CSSProperties = {
    padding: '12px 16px',
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    borderBottom: '1px solid var(--color-border)',
    background: 'rgba(0, 0, 0, 0.02)',
    textTransform: 'uppercase',
    letterSpacing: '0.04em'
};

const tdStyle: React.CSSProperties = {
    padding: '12px 16px',
    fontSize: '13px',
    borderBottom: '1px solid var(--color-border)'
};

const emptyStateStyle: React.CSSProperties = {
    background: 'var(--color-surface)',
    border: '1px dashed var(--color-border)',
    borderRadius: '10px',
    padding: '40px 20px',
    textAlign: 'center'
};

const modalOverlayStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.65)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    padding: '20px'
};

const modalContentStyle: React.CSSProperties = {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: '12px',
    width: '100%',
    maxWidth: '520px',
    padding: '24px',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.25)'
};

const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '12px',
    fontWeight: 600,
    marginBottom: '6px',
    color: 'var(--color-text-secondary)'
};

const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    borderRadius: '6px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-surface)',
    color: 'var(--color-text)',
    fontSize: '13px',
    boxSizing: 'border-box'
};

// Badges
const activeBadgeStyle: React.CSSProperties = {
    padding: '3px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 600,
    background: 'rgba(16, 185, 129, 0.15)',
    color: '#10b981'
};

const inactiveBadgeStyle: React.CSSProperties = {
    padding: '3px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 600,
    background: 'rgba(107, 114, 128, 0.15)',
    color: '#9ca3af'
};

const warningBadgeStyle: React.CSSProperties = {
    padding: '3px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 600,
    background: 'rgba(245, 158, 11, 0.15)',
    color: '#f59e0b'
};

const dangerBadgeStyle: React.CSSProperties = {
    padding: '3px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 600,
    background: 'rgba(239, 68, 68, 0.15)',
    color: '#ef4444'
};

const getPriorityBadgeStyle = (priority: string): React.CSSProperties => {
    switch (priority) {
        case 'CRITICAL':
            return { padding: '2px 7px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, background: '#ef4444', color: '#ffffff' };
        case 'HIGH':
            return { padding: '2px 7px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, background: 'rgba(249, 115, 22, 0.2)', color: '#f97316' };
        case 'MEDIUM':
            return { padding: '2px 7px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, background: 'rgba(234, 179, 8, 0.2)', color: '#eab308' };
        default:
            return { padding: '2px 7px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, background: 'rgba(107, 114, 128, 0.15)', color: '#9ca3af' };
    }
};

const getTypeBadgeStyle = (_type: string): React.CSSProperties => ({
    padding: '2px 6px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 600,
    background: 'rgba(59, 130, 246, 0.15)',
    color: '#3b82f6'
});

const getEntryTypeBadgeStyle = (type: string): React.CSSProperties => {
    switch (type) {
        case 'SHIFT_HANDOVER':
            return { padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6' };
        case 'INCIDENT':
            return { padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' };
        case 'SUPERVISOR_INSTRUCTION':
            return { padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, background: 'rgba(168, 85, 247, 0.15)', color: '#a855f7' };
        case 'VISITOR':
            return { padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, background: 'rgba(16, 185, 129, 0.15)', color: '#10b981' };
        default:
            return { padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, background: 'rgba(107, 114, 128, 0.15)', color: '#9ca3af' };
    }
};

const getPatrolStatusBadgeStyle = (status: string): React.CSSProperties => {
    switch (status) {
        case 'COMPLETED':
            return activeBadgeStyle;
        case 'IN_PROGRESS':
            return { padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6' };
        case 'MISSED':
            return dangerBadgeStyle;
        case 'PLANNED':
        case 'SCHEDULED':
            return warningBadgeStyle;
        default:
            return inactiveBadgeStyle;
    }
};

const getEmergencyStatusBadgeStyle = (status: string): React.CSSProperties => {
    switch (status) {
        case 'TRIGGERED':
            return { padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, background: '#ef4444', color: '#ffffff' };
        case 'ACKNOWLEDGED':
        case 'RESPONDING':
            return { padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, background: 'rgba(249, 115, 22, 0.2)', color: '#f97316' };
        case 'RESOLVED':
            return activeBadgeStyle;
        case 'FALSE_ALARM':
            return inactiveBadgeStyle;
        default:
            return inactiveBadgeStyle;
    }
};

const getGeofenceBadgeStyle = (status: string): React.CSSProperties => {
    switch (status) {
        case 'INSIDE_GEOFENCE':
            return { padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, background: 'rgba(16, 185, 129, 0.15)', color: '#10b981' };
        case 'OUTSIDE_GEOFENCE':
            return { padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' };
        default:
            return { padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 500, background: 'rgba(107, 114, 128, 0.15)', color: '#9ca3af' };
    }
};

const getRiskLevelBadgeStyle = (level: string): React.CSSProperties => {
    switch (level) {
        case 'HIGH':
            return { padding: '4px 10px', borderRadius: '4px', fontSize: '12px', fontWeight: 700, background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' };
        case 'MEDIUM':
            return { padding: '4px 10px', borderRadius: '4px', fontSize: '12px', fontWeight: 700, background: 'rgba(245, 158, 11, 0.2)', color: '#f59e0b' };
        default:
            return { padding: '4px 10px', borderRadius: '4px', fontSize: '12px', fontWeight: 700, background: 'rgba(16, 185, 129, 0.2)', color: '#10b981' };
    }
};
