import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '../../../../components/ui/Button';
import { Input } from '../../../../components/ui/Input';
import { useToastStore } from '../../../../stores/toastStore';
import { 
    getAssessments, 
    getAssessment, 
    updateAssessment, 
    completeAssessment, 
    reopenAssessment,
    deleteAssessment,
    deleteAssessmentRisk,
    deleteAssessmentStaffing,
    deleteAssessmentEquipment,
    deleteAssessmentAttachment,
    advanceToSiteAssessment,
    advanceToFinalProposal
} from '../api';
import type { 
    SecurityProposal, 
    SecurityAssessment, 
    RiskLevel
} from '../api';
import { CreateAssessmentModal } from './CreateAssessmentModal';
import { AddRiskModal } from './AddRiskModal';
import { AddStaffingModal } from './AddStaffingModal';
import { AddEquipmentModal } from './AddEquipmentModal';
import { AddAttachmentModal } from './AddAttachmentModal';

interface Props {
    proposal: SecurityProposal;
    onRefresh: () => void;
}

const RISK_BADGE_STYLES: Record<RiskLevel, { bg: string; color: string; label: string }> = {
    LOW: { bg: '#ecfdf5', color: '#059669', label: 'LOW' },
    MEDIUM: { bg: '#fffbeb', color: '#d97706', label: 'MEDIUM' },
    HIGH: { bg: '#fff7ed', color: '#ea580c', label: 'HIGH' },
    CRITICAL: { bg: '#fef2f2', color: '#dc2626', label: 'CRITICAL' }
};

const STATUS_BADGE_STYLES: Record<string, { bg: string; color: string }> = {
    DRAFT: { bg: 'rgba(100, 116, 139, 0.1)', color: '#64748b' },
    IN_PROGRESS: { bg: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' },
    COMPLETED: { bg: 'rgba(34, 197, 94, 0.1)', color: '#16a34a' },
    CANCELLED: { bg: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }
};

export const SiteAssessmentTab: React.FC<Props> = ({ proposal, onRefresh }) => {
    const [assessments, setAssessments] = useState<SecurityAssessment[]>([]);
    const [selectedAssessmentId, setSelectedAssessmentId] = useState<string | null>(null);
    const [activeAssessment, setActiveAssessment] = useState<SecurityAssessment | null>(null);
    const [workspaceTab, setWorkspaceTab] = useState<'survey' | 'risks' | 'staffing' | 'equipment' | 'evidence'>('survey');
    
    // Loading & Submitting states
    const [isLoadingList, setIsLoadingList] = useState(true);
    const [isLoadingDetail, setIsLoadingDetail] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isTransitioning, setIsTransitioning] = useState(false);

    // Modals
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isAddRiskOpen, setIsAddRiskOpen] = useState(false);
    const [isAddStaffingOpen, setIsAddStaffingOpen] = useState(false);
    const [isAddEquipmentOpen, setIsAddEquipmentOpen] = useState(false);
    const [isAddAttachmentOpen, setIsAddAttachmentOpen] = useState(false);

    // Form state for survey fields
    const [formData, setFormData] = useState<Partial<SecurityAssessment>>({});

    const loadAssessmentsList = useCallback(async () => {
        setIsLoadingList(true);
        try {
            const list = await getAssessments(proposal.id);
            setAssessments(list || []);
            if (list.length > 0 && !selectedAssessmentId) {
                // Keep selected if exists
            }
        } catch (err) {
            console.error('Failed to load assessments', err);
        } finally {
            setIsLoadingList(false);
        }
    }, [proposal.id, selectedAssessmentId]);

    const loadAssessmentDetail = useCallback(async (id: string) => {
        setIsLoadingDetail(true);
        try {
            const detail = await getAssessment(id);
            setActiveAssessment(detail);
            setFormData({
                site_overview: detail.site_overview || '',
                operating_hours: detail.operating_hours || '',
                entry_exit_points: detail.entry_exit_points || '',
                sensitive_areas: detail.sensitive_areas || '',
                existing_security_setup: detail.existing_security_setup || '',
                existing_guards: detail.existing_guards || '',
                existing_cctv: detail.existing_cctv || '',
                access_control: detail.access_control || '',
                visitor_management: detail.visitor_management || '',
                perimeter_security: detail.perimeter_security || '',
                lighting_conditions: detail.lighting_conditions || '',
                emergency_exits: detail.emergency_exits || '',
                fire_safety_concerns: detail.fire_safety_concerns || '',
                known_risks: detail.known_risks || '',
                client_concerns: detail.client_concerns || '',
                findings: detail.findings || '',
                recommendations: detail.recommendations || '',
                notes: detail.notes || '',
                assessment_date: detail.assessment_date || null
            });
        } catch (err) {
            useToastStore.getState().error('Failed to load assessment details.');
        } finally {
            setIsLoadingDetail(false);
        }
    }, []);

    useEffect(() => {
        loadAssessmentsList();
    }, [loadAssessmentsList]);

    useEffect(() => {
        if (selectedAssessmentId) {
            loadAssessmentDetail(selectedAssessmentId);
        } else {
            setActiveAssessment(null);
        }
    }, [selectedAssessmentId, loadAssessmentDetail]);

    const handleSaveSurvey = async () => {
        if (!activeAssessment) return;
        setIsSaving(true);
        try {
            const updated = await updateAssessment(activeAssessment.id, formData);
            setActiveAssessment(updated);
            useToastStore.getState().success('Site survey details saved.');
            loadAssessmentsList();
        } catch (err: any) {
            useToastStore.getState().error(err.response?.data?.detail || err.response?.data?.error || 'Failed to save changes.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleCompleteAssessment = async () => {
        if (!activeAssessment) return;
        try {
            // First save any unsaved survey details
            await updateAssessment(activeAssessment.id, formData);
            const completed = await completeAssessment(activeAssessment.id);
            setActiveAssessment(completed);
            useToastStore.getState().success(`Assessment for ${activeAssessment.client_location_name} marked as COMPLETED.`);
            loadAssessmentsList();
        } catch (err: any) {
            useToastStore.getState().error(err.response?.data?.detail || 'Failed to complete assessment.');
        }
    };

    const handleReopenAssessment = async () => {
        if (!activeAssessment) return;
        try {
            const reopened = await reopenAssessment(activeAssessment.id);
            setActiveAssessment(reopened);
            useToastStore.getState().success(`Assessment reopened for editing.`);
            loadAssessmentsList();
        } catch (err: any) {
            useToastStore.getState().error(err.response?.data?.detail || 'Failed to reopen assessment.');
        }
    };

    const handleDeleteAssessment = async (id: string, name?: string) => {
        if (!confirm(`Are you sure you want to delete the assessment for ${name || 'this location'}?`)) return;
        try {
            await deleteAssessment(id);
            useToastStore.getState().success('Assessment deleted.');
            if (selectedAssessmentId === id) {
                setSelectedAssessmentId(null);
            }
            loadAssessmentsList();
        } catch (err: any) {
            useToastStore.getState().error('Failed to delete assessment.');
        }
    };

    const handleDeleteRisk = async (riskId: string) => {
        if (!confirm('Remove this risk finding?')) return;
        try {
            await deleteAssessmentRisk(riskId);
            useToastStore.getState().success('Risk finding removed.');
            if (activeAssessment) loadAssessmentDetail(activeAssessment.id);
        } catch (err: any) {
            useToastStore.getState().error('Failed to delete risk finding.');
        }
    };

    const handleDeleteStaffing = async (staffingId: string) => {
        if (!confirm('Remove this staffing recommendation?')) return;
        try {
            await deleteAssessmentStaffing(staffingId);
            useToastStore.getState().success('Staffing recommendation removed.');
            if (activeAssessment) loadAssessmentDetail(activeAssessment.id);
        } catch (err: any) {
            useToastStore.getState().error('Failed to delete staffing recommendation.');
        }
    };

    const handleDeleteEquipment = async (equipmentId: string) => {
        if (!confirm('Remove this equipment recommendation?')) return;
        try {
            await deleteAssessmentEquipment(equipmentId);
            useToastStore.getState().success('Equipment recommendation removed.');
            if (activeAssessment) loadAssessmentDetail(activeAssessment.id);
        } catch (err: any) {
            useToastStore.getState().error('Failed to delete equipment recommendation.');
        }
    };

    const handleDeleteAttachment = async (attId: string) => {
        if (!confirm('Delete this attachment?')) return;
        try {
            await deleteAssessmentAttachment(attId);
            useToastStore.getState().success('Attachment deleted.');
            if (activeAssessment) loadAssessmentDetail(activeAssessment.id);
        } catch (err: any) {
            useToastStore.getState().error('Failed to delete attachment.');
        }
    };

    const handleAdvanceToSiteAssessment = async () => {
        setIsTransitioning(true);
        try {
            await advanceToSiteAssessment(proposal.id);
            useToastStore.getState().success('Proposal moved to SITE_ASSESSMENT stage.');
            onRefresh();
        } catch (err: any) {
            useToastStore.getState().error(err.response?.data?.error || 'Failed to move stage.');
        } finally {
            setIsTransitioning(false);
        }
    };

    const handleAdvanceToFinalProposal = async () => {
        if (!confirm('Are you sure you want to finalize site assessment work and proceed to Final Proposal (S-2F)?')) return;
        setIsTransitioning(true);
        try {
            await advanceToFinalProposal(proposal.id);
            useToastStore.getState().success('Proposal advanced to FINAL_PROPOSAL stage.');
            onRefresh();
        } catch (err: any) {
            useToastStore.getState().error(err.response?.data?.error || 'Failed to advance to Final Proposal.');
        } finally {
            setIsTransitioning(false);
        }
    };

    const isAssessmentLocked = activeAssessment?.status === 'COMPLETED';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Top Workflow Status & Actions Bar */}
            <div style={{ 
                background: 'var(--color-surface)', 
                border: '1px solid var(--color-border)', 
                borderRadius: '8px', 
                padding: '16px 20px', 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px'
            }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Site Security Assessment Stage</h3>
                        <span style={{ 
                            padding: '3px 8px', 
                            borderRadius: '12px', 
                            fontSize: '12px', 
                            fontWeight: 600,
                            background: STATUS_BADGE_STYLES[proposal.status]?.bg || 'rgba(100, 116, 139, 0.1)',
                            color: STATUS_BADGE_STYLES[proposal.status]?.color || '#64748b'
                        }}>
                            Proposal Stage: {proposal.status}
                        </span>
                    </div>
                    <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--color-text-muted)' }}>
                        Conduct location surveys, record risk findings, recommend staffing & equipment requirements before generating the final commercial proposal.
                    </p>
                </div>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {proposal.status === 'MEETING' && (
                        <Button 
                            variant="primary" 
                            loading={isTransitioning}
                            onClick={handleAdvanceToSiteAssessment}
                        >
                            <i className='bx bx-right-arrow-circle'></i> Move to Site Assessment Stage
                        </Button>
                    )}

                    {proposal.status === 'SITE_ASSESSMENT' && (
                        <Button 
                            variant="primary" 
                            loading={isTransitioning}
                            onClick={handleAdvanceToFinalProposal}
                        >
                            <i className='bx bx-check-double'></i> Proceed to Final Proposal (S-2F)
                        </Button>
                    )}
                </div>
            </div>

            {/* Main Area: Locations & Workspace */}
            <div style={{ display: 'grid', gridTemplateColumns: selectedAssessmentId ? '320px 1fr' : '1fr', gap: '20px', alignItems: 'start' }}>
                
                {/* Location Assessments Sidebar / Grid */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--color-text)' }}>
                            Site Locations ({assessments.length})
                        </h4>
                        <Button 
                            variant="secondary" 
                            size="small"
                            onClick={() => setIsCreateModalOpen(true)}
                        >
                            <i className='bx bx-plus'></i> Add Site Assessment
                        </Button>
                    </div>

                    {isLoadingList ? (
                        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-muted)', background: 'var(--color-surface)', borderRadius: '8px' }}>
                            <i className='bx bx-loader-alt bx-spin' style={{ fontSize: '20px' }}></i>
                            <p style={{ marginTop: '6px', fontSize: '13px' }}>Loading site assessments...</p>
                        </div>
                    ) : assessments.length === 0 ? (
                        <div style={{ padding: '32px 20px', textAlign: 'center', background: 'var(--color-surface)', borderRadius: '8px', border: '1px dashed var(--color-border)' }}>
                            <i className='bx bx-map-pin' style={{ fontSize: '36px', color: 'var(--color-text-muted)' }}></i>
                            <p style={{ marginTop: '8px', fontWeight: 600 }}>No site assessments initiated yet.</p>
                            <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '16px' }}>
                                Initiate assessments for client facilities to record risks and recommend security posts.
                            </p>
                            <Button variant="primary" onClick={() => setIsCreateModalOpen(true)}>
                                <i className='bx bx-plus'></i> Initiate First Site Assessment
                            </Button>
                        </div>
                    ) : (
                        <div style={{ 
                            display: selectedAssessmentId ? 'flex' : 'grid', 
                            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                            flexDirection: 'column',
                            gap: '12px' 
                        }}>
                            {assessments.map(ass => {
                                const isSelected = selectedAssessmentId === ass.id;
                                const statusStyle = STATUS_BADGE_STYLES[ass.status] || { bg: '#f1f5f9', color: '#475569' };

                                return (
                                    <div 
                                        key={ass.id}
                                        onClick={() => setSelectedAssessmentId(ass.id)}
                                        style={{
                                            background: 'var(--color-surface)',
                                            border: `1px solid ${isSelected ? 'var(--color-primary)' : 'var(--color-border)'}`,
                                            borderRadius: '8px',
                                            padding: '14px 16px',
                                            cursor: 'pointer',
                                            transition: 'all 0.15s ease',
                                            boxShadow: isSelected ? '0 0 0 2px rgba(9, 36, 83, 0.1)' : 'none'
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                            <div>
                                                <h5 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--color-text)' }}>
                                                    {ass.client_location_name || 'Location Survey'}
                                                </h5>
                                                {ass.client_location_address && (
                                                    <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                                                        {ass.client_location_address}
                                                    </p>
                                                )}
                                            </div>
                                            <span style={{ 
                                                padding: '2px 6px', 
                                                borderRadius: '4px', 
                                                fontSize: '11px', 
                                                fontWeight: 600,
                                                background: statusStyle.bg,
                                                color: statusStyle.color
                                            }}>
                                                {ass.status}
                                            </span>
                                        </div>

                                        <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: 'var(--color-text-muted)', margin: '10px 0' }}>
                                            <span><i className='bx bx-calendar'></i> {ass.assessment_date || 'No Date'}</span>
                                            <span><i className='bx bx-user'></i> {ass.assessed_by_name || 'Unassigned'}</span>
                                        </div>

                                        <div style={{ 
                                            display: 'grid', 
                                            gridTemplateColumns: 'repeat(4, 1fr)', 
                                            gap: '6px', 
                                            padding: '8px', 
                                            background: 'var(--color-surface-secondary)', 
                                            borderRadius: '6px', 
                                            textAlign: 'center',
                                            fontSize: '11px' 
                                        }}>
                                            <div>
                                                <span style={{ display: 'block', fontWeight: 700, fontSize: '13px', color: (ass.risk_count || 0) > 0 ? '#ef4444' : 'var(--color-text)' }}>
                                                    {ass.risk_count || 0}
                                                </span>
                                                <span style={{ color: 'var(--color-text-muted)' }}>Risks</span>
                                            </div>
                                            <div>
                                                <span style={{ display: 'block', fontWeight: 700, fontSize: '13px', color: 'var(--color-primary)' }}>
                                                    {ass.staffing_count || 0}
                                                </span>
                                                <span style={{ color: 'var(--color-text-muted)' }}>Staffing</span>
                                            </div>
                                            <div>
                                                <span style={{ display: 'block', fontWeight: 700, fontSize: '13px', color: 'var(--color-text)' }}>
                                                    {ass.equipment_count || 0}
                                                </span>
                                                <span style={{ color: 'var(--color-text-muted)' }}>Equip</span>
                                            </div>
                                            <div>
                                                <span style={{ display: 'block', fontWeight: 700, fontSize: '13px', color: 'var(--color-text)' }}>
                                                    {ass.attachment_count || 0}
                                                </span>
                                                <span style={{ color: 'var(--color-text-muted)' }}>Evidence</span>
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
                                            <span style={{ fontSize: '12px', color: 'var(--color-primary)', fontWeight: 500 }}>
                                                {isSelected ? 'Editing Workspace' : 'Open Workspace →'}
                                            </span>
                                            <button 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDeleteAssessment(ass.id, ass.client_location_name);
                                                }}
                                                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
                                                title="Delete Assessment"
                                            >
                                                <i className='bx bx-trash'></i>
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Workspace / Editor for Selected Assessment */}
                {selectedAssessmentId && (
                    <div style={{ 
                        background: 'var(--color-surface)', 
                        border: '1px solid var(--color-border)', 
                        borderRadius: '8px', 
                        padding: '20px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '16px'
                    }}>
                        {isLoadingDetail || !activeAssessment ? (
                            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                                <i className='bx bx-loader-alt bx-spin' style={{ fontSize: '28px' }}></i>
                                <p style={{ marginTop: '8px' }}>Loading assessment workspace...</p>
                            </div>
                        ) : (
                            <>
                                {/* Workspace Header */}
                                <div style={{ 
                                    display: 'flex', 
                                    justifyContent: 'space-between', 
                                    alignItems: 'flex-start', 
                                    borderBottom: '1px solid var(--color-border)', 
                                    paddingBottom: '16px',
                                    flexWrap: 'wrap',
                                    gap: '12px'
                                }}>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>
                                                {activeAssessment.client_location_name}
                                            </h3>
                                            <span style={{ 
                                                padding: '2px 8px', 
                                                borderRadius: '4px', 
                                                fontSize: '12px', 
                                                fontWeight: 600,
                                                background: STATUS_BADGE_STYLES[activeAssessment.status]?.bg || '#f1f5f9',
                                                color: STATUS_BADGE_STYLES[activeAssessment.status]?.color || '#475569'
                                            }}>
                                                {activeAssessment.status}
                                            </span>
                                        </div>
                                        <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--color-text-muted)' }}>
                                            Assessed by <strong>{activeAssessment.assessed_by_name || 'Staff'}</strong> on {activeAssessment.assessment_date || 'N/A'}
                                            {activeAssessment.completed_at && ` • Completed on ${new Date(activeAssessment.completed_at).toLocaleDateString()}`}
                                        </p>
                                    </div>

                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        {isAssessmentLocked ? (
                                            <Button variant="secondary" size="small" onClick={handleReopenAssessment}>
                                                <i className='bx bx-lock-open'></i> Reopen Assessment
                                            </Button>
                                        ) : (
                                            <>
                                                <Button 
                                                    variant="secondary" 
                                                    size="small" 
                                                    loading={isSaving} 
                                                    onClick={handleSaveSurvey}
                                                >
                                                    <i className='bx bx-save'></i> Save Survey Data
                                                </Button>
                                                <Button 
                                                    variant="primary" 
                                                    size="small" 
                                                    onClick={handleCompleteAssessment}
                                                >
                                                    <i className='bx bx-check'></i> Mark Completed
                                                </Button>
                                            </>
                                        )}
                                        <button 
                                            onClick={() => setSelectedAssessmentId(null)}
                                            style={{ 
                                                background: 'transparent', 
                                                border: '1px solid var(--color-border)', 
                                                borderRadius: '6px', 
                                                padding: '6px 10px', 
                                                cursor: 'pointer', 
                                                color: 'var(--color-text)' 
                                            }}
                                            title="Close Workspace"
                                        >
                                            <i className='bx bx-x' style={{ fontSize: '16px' }}></i>
                                        </button>
                                    </div>
                                </div>

                                {isAssessmentLocked && (
                                    <div style={{ padding: '10px 14px', background: 'rgba(34, 197, 94, 0.08)', border: '1px solid rgba(34, 197, 94, 0.2)', borderRadius: '6px', fontSize: '13px', color: '#16a34a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <i className='bx bx-check-shield' style={{ fontSize: '18px' }}></i>
                                        <span><strong>Assessment Completed:</strong> This assessment is finalized and locked against accidental editing. Click 'Reopen Assessment' if modifications are necessary.</span>
                                    </div>
                                )}

                                {/* Sub-Tabs for Assessment Sections */}
                                <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--color-border)', paddingBottom: '8px' }}>
                                    {[
                                        { id: 'survey', label: '1. Site Security Survey', icon: 'bx-file' },
                                        { id: 'risks', label: `2. Risk Findings (${activeAssessment.risk_findings?.length || 0})`, icon: 'bx-shield-quarter' },
                                        { id: 'staffing', label: `3. Staffing Recommendations (${activeAssessment.staffing_recommendations?.length || 0})`, icon: 'bx-user-check' },
                                        { id: 'equipment', label: `4. Equipment (${activeAssessment.equipment_recommendations?.length || 0})`, icon: 'bx-cctv' },
                                        { id: 'evidence', label: `5. Evidence & Photos (${activeAssessment.attachments?.length || 0})`, icon: 'bx-image' }
                                    ].map(tab => (
                                        <button
                                            key={tab.id}
                                            onClick={() => setWorkspaceTab(tab.id as any)}
                                            style={{
                                                padding: '8px 14px',
                                                borderRadius: '6px',
                                                border: 'none',
                                                background: workspaceTab === tab.id ? 'var(--color-primary)' : 'transparent',
                                                color: workspaceTab === tab.id ? '#ffffff' : 'var(--color-text)',
                                                fontSize: '13px',
                                                fontWeight: workspaceTab === tab.id ? 600 : 500,
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px'
                                            }}
                                        >
                                            <i className={`bx ${tab.icon}`}></i> {tab.label}
                                        </button>
                                    ))}
                                </div>

                                {/* Section 1: Site Security Survey */}
                                {workspaceTab === 'survey' && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
                                                    Operating Hours / Facility Schedule
                                                </label>
                                                <Input 
                                                    disabled={isAssessmentLocked}
                                                    value={formData.operating_hours || ''}
                                                    onChange={e => setFormData({ ...formData, operating_hours: e.target.value })}
                                                    placeholder="e.g. 24/7 (3 Shifts), 08:00 - 18:00 (Mon-Sat)"
                                                />
                                            </div>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
                                                    Assessment Date
                                                </label>
                                                <Input 
                                                    type="date"
                                                    disabled={isAssessmentLocked}
                                                    value={formData.assessment_date || ''}
                                                    onChange={e => setFormData({ ...formData, assessment_date: e.target.value })}
                                                />
                                            </div>
                                        </div>

                                        <div>
                                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
                                                Site Overview & Facility Description
                                            </label>
                                            <textarea 
                                                rows={3}
                                                disabled={isAssessmentLocked}
                                                value={formData.site_overview || ''}
                                                onChange={e => setFormData({ ...formData, site_overview: e.target.value })}
                                                placeholder="Facility type, layout structure, neighborhood risk context, main access roads..."
                                                style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: '6px', background: 'var(--color-surface)', color: 'var(--color-text)', resize: 'vertical' }}
                                            />
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
                                                    Entry / Exit Points
                                                </label>
                                                <textarea 
                                                    rows={2}
                                                    disabled={isAssessmentLocked}
                                                    value={formData.entry_exit_points || ''}
                                                    onChange={e => setFormData({ ...formData, entry_exit_points: e.target.value })}
                                                    placeholder="Main gate, employee turnstiles, loading dock gates..."
                                                    style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: '6px', background: 'var(--color-surface)', color: 'var(--color-text)', resize: 'vertical' }}
                                                />
                                            </div>

                                            <div>
                                                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
                                                    Sensitive Areas / High-Value Assets
                                                </label>
                                                <textarea 
                                                    rows={2}
                                                    disabled={isAssessmentLocked}
                                                    value={formData.sensitive_areas || ''}
                                                    onChange={e => setFormData({ ...formData, sensitive_areas: e.target.value })}
                                                    placeholder="Server rooms, cash vaults, executive offices, raw material storage..."
                                                    style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: '6px', background: 'var(--color-surface)', color: 'var(--color-text)', resize: 'vertical' }}
                                                />
                                            </div>
                                        </div>

                                        {/* Physical & Technical Security Evaluation */}
                                        <div style={{ 
                                            background: 'var(--color-surface-secondary)', 
                                            border: '1px solid var(--color-border)', 
                                            borderRadius: '8px', 
                                            padding: '16px' 
                                        }}>
                                            <h5 style={{ margin: '0 0 12px 0', fontSize: '13px', fontWeight: 600, color: 'var(--color-primary)' }}>
                                                Existing Physical & Technical Security Setup
                                            </h5>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                                                <div>
                                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>
                                                        Existing Guards & Post Setup
                                                    </label>
                                                    <Input 
                                                        disabled={isAssessmentLocked}
                                                        value={formData.existing_guards || ''}
                                                        onChange={e => setFormData({ ...formData, existing_guards: e.target.value })}
                                                        placeholder="Current vendor, number of guards, shifts..."
                                                    />
                                                </div>
                                                <div>
                                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>
                                                        Existing CCTV & Surveillance
                                                    </label>
                                                    <Input 
                                                        disabled={isAssessmentLocked}
                                                        value={formData.existing_cctv || ''}
                                                        onChange={e => setFormData({ ...formData, existing_cctv: e.target.value })}
                                                        placeholder="Camera count, DVR/NVR status, blind spots..."
                                                    />
                                                </div>
                                                <div>
                                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>
                                                        Access Control & Visitor Screening
                                                    </label>
                                                    <Input 
                                                        disabled={isAssessmentLocked}
                                                        value={formData.access_control || ''}
                                                        onChange={e => setFormData({ ...formData, access_control: e.target.value })}
                                                        placeholder="Biometric, RFID cards, visitor logbook..."
                                                    />
                                                </div>
                                                <div>
                                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>
                                                        Perimeter Security & Lighting
                                                    </label>
                                                    <Input 
                                                        disabled={isAssessmentLocked}
                                                        value={formData.perimeter_security || ''}
                                                        onChange={e => setFormData({ ...formData, perimeter_security: e.target.value })}
                                                        placeholder="Boundary wall height, razor wire, night lighting..."
                                                    />
                                                </div>
                                                <div>
                                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>
                                                        Emergency Exits & Evacuation Routes
                                                    </label>
                                                    <Input 
                                                        disabled={isAssessmentLocked}
                                                        value={formData.emergency_exits || ''}
                                                        onChange={e => setFormData({ ...formData, emergency_exits: e.target.value })}
                                                        placeholder="Clear routes, marked exits, assembly point..."
                                                    />
                                                </div>
                                                <div>
                                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>
                                                        Fire Safety Concerns
                                                    </label>
                                                    <Input 
                                                        disabled={isAssessmentLocked}
                                                        value={formData.fire_safety_concerns || ''}
                                                        onChange={e => setFormData({ ...formData, fire_safety_concerns: e.target.value })}
                                                        placeholder="Extinguishers, smoke detectors, hydrants..."
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
                                                    Assessor Findings Summary
                                                </label>
                                                <textarea 
                                                    rows={3}
                                                    disabled={isAssessmentLocked}
                                                    value={formData.findings || ''}
                                                    onChange={e => setFormData({ ...formData, findings: e.target.value })}
                                                    placeholder="Overall survey observations and vulnerabilities discovered..."
                                                    style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: '6px', background: 'var(--color-surface)', color: 'var(--color-text)', resize: 'vertical' }}
                                                />
                                            </div>

                                            <div>
                                                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
                                                    Assessor Recommendations
                                                </label>
                                                <textarea 
                                                    rows={3}
                                                    disabled={isAssessmentLocked}
                                                    value={formData.recommendations || ''}
                                                    onChange={e => setFormData({ ...formData, recommendations: e.target.value })}
                                                    placeholder="Recommended security measures, patrols, gate controls..."
                                                    style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: '6px', background: 'var(--color-surface)', color: 'var(--color-text)', resize: 'vertical' }}
                                                />
                                            </div>
                                        </div>

                                        {!isAssessmentLocked && (
                                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                                                <Button variant="primary" loading={isSaving} onClick={handleSaveSurvey}>
                                                    <i className='bx bx-save'></i> Save Survey Details
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Section 2: Risk Findings */}
                                {workspaceTab === 'risks' && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div>
                                                <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>
                                                    Identified Security Vulnerabilities & Threat Findings
                                                </h4>
                                                <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                                                    Categorized threat observations that justify proposed staffing and security controls.
                                                </p>
                                            </div>
                                            {!isAssessmentLocked && (
                                                <Button variant="primary" size="small" onClick={() => setIsAddRiskOpen(true)}>
                                                    <i className='bx bx-plus'></i> Record Risk Finding
                                                </Button>
                                            )}
                                        </div>

                                        {(!activeAssessment.risk_findings || activeAssessment.risk_findings.length === 0) ? (
                                            <div style={{ padding: '30px', textAlign: 'center', background: 'var(--color-surface-secondary)', borderRadius: '6px' }}>
                                                <i className='bx bx-shield-quarter' style={{ fontSize: '32px', color: 'var(--color-text-muted)' }}></i>
                                                <p style={{ marginTop: '8px', fontSize: '13px' }}>No risk findings recorded for this location yet.</p>
                                                {!isAssessmentLocked && (
                                                    <Button variant="secondary" size="small" onClick={() => setIsAddRiskOpen(true)}>
                                                        <i className='bx bx-plus'></i> Add First Risk Finding
                                                    </Button>
                                                )}
                                            </div>
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                {activeAssessment.risk_findings.map(risk => {
                                                    const badge = RISK_BADGE_STYLES[risk.risk_level] || RISK_BADGE_STYLES.MEDIUM;
                                                    return (
                                                        <div 
                                                            key={risk.id}
                                                            style={{
                                                                border: '1px solid var(--color-border)',
                                                                borderRadius: '6px',
                                                                padding: '14px',
                                                                background: 'var(--color-surface)'
                                                            }}
                                                        >
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                    <span style={{ 
                                                                        padding: '2px 8px', 
                                                                        borderRadius: '4px', 
                                                                        fontSize: '11px', 
                                                                        fontWeight: 700,
                                                                        background: badge.bg,
                                                                        color: badge.color,
                                                                        border: `1px solid ${badge.color}`
                                                                    }}>
                                                                        {badge.label}
                                                                    </span>
                                                                    <h5 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>{risk.title}</h5>
                                                                    <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>• Category: {risk.category}</span>
                                                                </div>
                                                                {!isAssessmentLocked && (
                                                                    <button 
                                                                        onClick={() => handleDeleteRisk(risk.id)}
                                                                        style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer' }}
                                                                        title="Delete Risk"
                                                                    >
                                                                        <i className='bx bx-trash'></i>
                                                                    </button>
                                                                )}
                                                            </div>

                                                            {risk.location_area && (
                                                                <p style={{ margin: '0 0 6px 0', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                                                                    <i className='bx bx-map-pin'></i> Area: {risk.location_area}
                                                                </p>
                                                            )}

                                                            {risk.description && (
                                                                <p style={{ margin: '0 0 8px 0', fontSize: '13px', color: 'var(--color-text)' }}>
                                                                    {risk.description}
                                                                </p>
                                                            )}

                                                            {risk.recommendation && (
                                                                <div style={{ padding: '8px 12px', background: 'var(--color-surface-secondary)', borderRadius: '4px', fontSize: '12px' }}>
                                                                    <strong>Mitigation:</strong> {risk.recommendation}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Section 3: Staffing Recommendations */}
                                {workspaceTab === 'staffing' && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div>
                                                <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>
                                                    Recommended Guard Staffing & Posts
                                                </h4>
                                                <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                                                    Security personnel required for this location to feed into Proposal Service Lines (S-2F).
                                                </p>
                                            </div>
                                            {!isAssessmentLocked && (
                                                <Button variant="primary" size="small" onClick={() => setIsAddStaffingOpen(true)}>
                                                    <i className='bx bx-plus'></i> Add Staffing Requirement
                                                </Button>
                                            )}
                                        </div>

                                        {(!activeAssessment.staffing_recommendations || activeAssessment.staffing_recommendations.length === 0) ? (
                                            <div style={{ padding: '30px', textAlign: 'center', background: 'var(--color-surface-secondary)', borderRadius: '6px' }}>
                                                <i className='bx bx-user-check' style={{ fontSize: '32px', color: 'var(--color-text-muted)' }}></i>
                                                <p style={{ marginTop: '8px', fontSize: '13px' }}>No staffing recommendations added for this location yet.</p>
                                                {!isAssessmentLocked && (
                                                    <Button variant="secondary" size="small" onClick={() => setIsAddStaffingOpen(true)}>
                                                        <i className='bx bx-plus'></i> Add First Staffing Post
                                                    </Button>
                                                )}
                                            </div>
                                        ) : (
                                            <div style={{ border: '1px solid var(--color-border)', borderRadius: '6px', overflow: 'hidden' }}>
                                                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                                                    <thead>
                                                        <tr style={{ background: 'var(--color-surface-secondary)', borderBottom: '1px solid var(--color-border)' }}>
                                                            <th style={{ padding: '10px 14px' }}>Service Type</th>
                                                            <th style={{ padding: '10px 14px' }}>Post / Area</th>
                                                            <th style={{ padding: '10px 14px', textAlign: 'center' }}>Qty</th>
                                                            <th style={{ padding: '10px 14px' }}>Shift & Coverage</th>
                                                            <th style={{ padding: '10px 14px' }}>Remarks</th>
                                                            {!isAssessmentLocked && <th style={{ padding: '10px 14px', width: '50px' }}></th>}
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {activeAssessment.staffing_recommendations.map(staff => (
                                                            <tr key={staff.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                                                <td style={{ padding: '12px 14px', fontWeight: 600 }}>
                                                                    {staff.service_type_name || 'Guard Service'}
                                                                </td>
                                                                <td style={{ padding: '12px 14px' }}>
                                                                    {staff.post_area || activeAssessment.client_location_name}
                                                                </td>
                                                                <td style={{ padding: '12px 14px', textAlign: 'center', fontWeight: 700, color: 'var(--color-primary)' }}>
                                                                    {staff.quantity}
                                                                </td>
                                                                <td style={{ padding: '12px 14px', color: 'var(--color-text-muted)' }}>
                                                                    {staff.shift_coverage_notes || 'Standard'}
                                                                </td>
                                                                <td style={{ padding: '12px 14px', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                                                                    {staff.remarks || '—'}
                                                                </td>
                                                                {!isAssessmentLocked && (
                                                                    <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                                                                        <button 
                                                                            onClick={() => handleDeleteStaffing(staff.id)}
                                                                            style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer' }}
                                                                            title="Delete Staffing Requirement"
                                                                        >
                                                                            <i className='bx bx-trash'></i>
                                                                        </button>
                                                                    </td>
                                                                )}
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Section 4: Equipment Recommendations */}
                                {workspaceTab === 'equipment' && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div>
                                                <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>
                                                    Recommended Security Hardware & Equipment
                                                </h4>
                                                <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                                                    Hardware and security tools required at this facility for contract scoping.
                                                </p>
                                            </div>
                                            {!isAssessmentLocked && (
                                                <Button variant="primary" size="small" onClick={() => setIsAddEquipmentOpen(true)}>
                                                    <i className='bx bx-plus'></i> Add Equipment Requirement
                                                </Button>
                                            )}
                                        </div>

                                        {(!activeAssessment.equipment_recommendations || activeAssessment.equipment_recommendations.length === 0) ? (
                                            <div style={{ padding: '30px', textAlign: 'center', background: 'var(--color-surface-secondary)', borderRadius: '6px' }}>
                                                <i className='bx bx-cctv' style={{ fontSize: '32px', color: 'var(--color-text-muted)' }}></i>
                                                <p style={{ marginTop: '8px', fontSize: '13px' }}>No equipment recommendations recorded yet.</p>
                                                {!isAssessmentLocked && (
                                                    <Button variant="secondary" size="small" onClick={() => setIsAddEquipmentOpen(true)}>
                                                        <i className='bx bx-plus'></i> Add First Equipment Item
                                                    </Button>
                                                )}
                                            </div>
                                        ) : (
                                            <div style={{ border: '1px solid var(--color-border)', borderRadius: '6px', overflow: 'hidden' }}>
                                                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                                                    <thead>
                                                        <tr style={{ background: 'var(--color-surface-secondary)', borderBottom: '1px solid var(--color-border)' }}>
                                                            <th style={{ padding: '10px 14px' }}>Equipment Item</th>
                                                            <th style={{ padding: '10px 14px', textAlign: 'center' }}>Qty</th>
                                                            <th style={{ padding: '10px 14px' }}>Location / Post</th>
                                                            <th style={{ padding: '10px 14px' }}>Purpose</th>
                                                            <th style={{ padding: '10px 14px' }}>Notes</th>
                                                            {!isAssessmentLocked && <th style={{ padding: '10px 14px', width: '50px' }}></th>}
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {activeAssessment.equipment_recommendations.map(eq => (
                                                            <tr key={eq.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                                                <td style={{ padding: '12px 14px', fontWeight: 600 }}>
                                                                    {eq.equipment_name}
                                                                </td>
                                                                <td style={{ padding: '12px 14px', textAlign: 'center', fontWeight: 700, color: 'var(--color-primary)' }}>
                                                                    {eq.quantity}
                                                                </td>
                                                                <td style={{ padding: '12px 14px' }}>
                                                                    {eq.location_area || activeAssessment.client_location_name}
                                                                </td>
                                                                <td style={{ padding: '12px 14px', color: 'var(--color-text-muted)' }}>
                                                                    {eq.purpose || '—'}
                                                                </td>
                                                                <td style={{ padding: '12px 14px', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                                                                    {eq.notes || '—'}
                                                                </td>
                                                                {!isAssessmentLocked && (
                                                                    <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                                                                        <button 
                                                                            onClick={() => handleDeleteEquipment(eq.id)}
                                                                            style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer' }}
                                                                            title="Delete Equipment Requirement"
                                                                        >
                                                                            <i className='bx bx-trash'></i>
                                                                        </button>
                                                                    </td>
                                                                )}
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Section 5: Evidence & Attachments */}
                                {workspaceTab === 'evidence' && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div>
                                                <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>
                                                    Site Survey Photos, Floor Plans & Documents
                                                </h4>
                                                <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                                                    Evidence uploaded during physical site inspection.
                                                </p>
                                            </div>
                                            {!isAssessmentLocked && (
                                                <Button variant="primary" size="small" onClick={() => setIsAddAttachmentOpen(true)}>
                                                    <i className='bx bx-upload'></i> Upload Evidence
                                                </Button>
                                            )}
                                        </div>

                                        {(!activeAssessment.attachments || activeAssessment.attachments.length === 0) ? (
                                            <div style={{ padding: '30px', textAlign: 'center', background: 'var(--color-surface-secondary)', borderRadius: '6px' }}>
                                                <i className='bx bx-image' style={{ fontSize: '32px', color: 'var(--color-text-muted)' }}></i>
                                                <p style={{ marginTop: '8px', fontSize: '13px' }}>No site photos or layout documents uploaded yet.</p>
                                                {!isAssessmentLocked && (
                                                    <Button variant="secondary" size="small" onClick={() => setIsAddAttachmentOpen(true)}>
                                                        <i className='bx bx-upload'></i> Upload First Attachment
                                                    </Button>
                                                )}
                                            </div>
                                        ) : (
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px' }}>
                                                {activeAssessment.attachments.map(att => (
                                                    <div 
                                                        key={att.id}
                                                        style={{
                                                            border: '1px solid var(--color-border)',
                                                            borderRadius: '6px',
                                                            padding: '12px',
                                                            background: 'var(--color-surface)',
                                                            display: 'flex',
                                                            flexDirection: 'column',
                                                            justifyContent: 'space-between'
                                                        }}
                                                    >
                                                        <div>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                                                                <span style={{ 
                                                                    padding: '2px 6px', 
                                                                    borderRadius: '4px', 
                                                                    fontSize: '11px', 
                                                                    fontWeight: 600,
                                                                    background: 'rgba(59, 130, 246, 0.1)',
                                                                    color: '#3b82f6'
                                                                }}>
                                                                    {att.category_display || att.category}
                                                                </span>
                                                                {!isAssessmentLocked && (
                                                                    <button 
                                                                        onClick={() => handleDeleteAttachment(att.id)}
                                                                        style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer' }}
                                                                        title="Delete Attachment"
                                                                    >
                                                                        <i className='bx bx-trash'></i>
                                                                    </button>
                                                                )}
                                                            </div>
                                                            <h5 style={{ margin: '4px 0 2px 0', fontSize: '13px', fontWeight: 600 }}>{att.title}</h5>
                                                            {att.notes && (
                                                                <p style={{ margin: '4px 0 8px 0', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                                                                    {att.notes}
                                                                </p>
                                                            )}
                                                        </div>

                                                        <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '8px', marginTop: '8px', fontSize: '11px', color: 'var(--color-text-muted)' }}>
                                                            {att.file_url ? (
                                                                <a 
                                                                    href={att.file_url} 
                                                                    target="_blank" 
                                                                    rel="noreferrer"
                                                                    style={{ color: 'var(--color-primary)', textDecoration: 'none', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                                                >
                                                                    <i className='bx bx-link-external'></i> View Document
                                                                </a>
                                                            ) : (
                                                                <span><i className='bx bx-paperclip'></i> Attached File</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* Modals */}
            <CreateAssessmentModal 
                isOpen={isCreateModalOpen}
                proposal={proposal}
                existingLocationIds={assessments.map(a => a.client_location)}
                onClose={() => setIsCreateModalOpen(false)}
                onCreated={(newAssessment) => {
                    loadAssessmentsList();
                    setSelectedAssessmentId(newAssessment.id);
                }}
            />

            {activeAssessment && (
                <>
                    <AddRiskModal 
                        isOpen={isAddRiskOpen}
                        assessmentId={activeAssessment.id}
                        locationName={activeAssessment.client_location_name}
                        onClose={() => setIsAddRiskOpen(false)}
                        onAdded={() => loadAssessmentDetail(activeAssessment.id)}
                    />

                    <AddStaffingModal 
                        isOpen={isAddStaffingOpen}
                        assessmentId={activeAssessment.id}
                        locationId={activeAssessment.client_location}
                        onClose={() => setIsAddStaffingOpen(false)}
                        onAdded={() => loadAssessmentDetail(activeAssessment.id)}
                    />

                    <AddEquipmentModal 
                        isOpen={isAddEquipmentOpen}
                        assessmentId={activeAssessment.id}
                        locationName={activeAssessment.client_location_name}
                        onClose={() => setIsAddEquipmentOpen(false)}
                        onAdded={() => loadAssessmentDetail(activeAssessment.id)}
                    />

                    <AddAttachmentModal 
                        isOpen={isAddAttachmentOpen}
                        assessmentId={activeAssessment.id}
                        onClose={() => setIsAddAttachmentOpen(false)}
                        onAdded={() => loadAssessmentDetail(activeAssessment.id)}
                    />
                </>
            )}
        </div>
    );
};
