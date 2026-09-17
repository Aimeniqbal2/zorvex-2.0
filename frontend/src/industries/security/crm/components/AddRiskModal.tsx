import React, { useState } from 'react';
import { Modal } from '../../../../components/ui/Modal';
import { Button } from '../../../../components/ui/Button';
import { Input } from '../../../../components/ui/Input';
import { useToastStore } from '../../../../stores/toastStore';
import { addAssessmentRisk } from '../api';
import type { RiskLevel, AssessmentRiskFinding } from '../api';

interface Props {
    isOpen: boolean;
    assessmentId: string;
    locationName?: string;
    onClose: () => void;
    onAdded: (risk: AssessmentRiskFinding) => void;
}

const RISK_LEVEL_COLORS: Record<RiskLevel, string> = {
    LOW: '#10b981',
    MEDIUM: '#f59e0b',
    HIGH: '#f97316',
    CRITICAL: '#ef4444'
};

export const AddRiskModal: React.FC<Props> = ({
    isOpen,
    assessmentId,
    locationName,
    onClose,
    onAdded
}) => {
    const [title, setTitle] = useState('');
    const [category, setCategory] = useState('PERIMETER');
    const [riskLevel, setRiskLevel] = useState<RiskLevel>('MEDIUM');
    const [locationArea, setLocationArea] = useState(locationName || '');
    const [description, setDescription] = useState('');
    const [recommendation, setRecommendation] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim()) {
            useToastStore.getState().error('Please enter a risk title.');
            return;
        }

        setIsSubmitting(true);
        try {
            const risk = await addAssessmentRisk(assessmentId, {
                title,
                category,
                risk_level: riskLevel,
                location_area: locationArea,
                description,
                recommendation,
                status: 'OPEN'
            });

            useToastStore.getState().success('Risk finding recorded.');
            onAdded(risk);
            onClose();
        } catch (err: any) {
            useToastStore.getState().error(err.response?.data?.error || 'Failed to add risk finding.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Record Security Risk / Vulnerability" width="600px">
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
                        Risk Title *
                    </label>
                    <Input 
                        placeholder="e.g. Unmonitored Rear Loading Dock Gate"
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                        required
                    />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
                            Category
                        </label>
                        <select 
                            value={category} 
                            onChange={e => setCategory(e.target.value)}
                            style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: '6px', background: 'var(--color-surface)', color: 'var(--color-text)' }}
                        >
                            <option value="PERIMETER">Perimeter & Boundary</option>
                            <option value="ACCESS_CONTROL">Access Control & Entry</option>
                            <option value="SURVEILLANCE">CCTV & Surveillance</option>
                            <option value="FIRE_SAFETY">Fire & Emergency Safety</option>
                            <option value="PERSONNEL">Personnel & Visitor Screening</option>
                            <option value="LIGHTING">Lighting & Visibility</option>
                            <option value="OPERATIONAL">Operational / Key Control</option>
                            <option value="OTHER">Other Vulnerability</option>
                        </select>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
                            Risk Level *
                        </label>
                        <select 
                            value={riskLevel} 
                            onChange={e => setRiskLevel(e.target.value as RiskLevel)}
                            style={{ 
                                width: '100%', 
                                padding: '8px 12px', 
                                border: `2px solid ${RISK_LEVEL_COLORS[riskLevel]}`, 
                                borderRadius: '6px', 
                                background: 'var(--color-surface)', 
                                color: 'var(--color-text)',
                                fontWeight: 600
                            }}
                        >
                            <option value="LOW">LOW — Minor Observation</option>
                            <option value="MEDIUM">MEDIUM — Moderate Exposure</option>
                            <option value="HIGH">HIGH — Significant Vulnerability</option>
                            <option value="CRITICAL">CRITICAL — Severe Threat / Immediate Action</option>
                        </select>
                    </div>
                </div>

                <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
                        Specific Area / Zone
                    </label>
                    <Input 
                        placeholder="e.g. North Perimeter Fence, Sector 3"
                        value={locationArea}
                        onChange={e => setLocationArea(e.target.value)}
                    />
                </div>

                <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
                        Detailed Vulnerability Description
                    </label>
                    <textarea 
                        rows={3}
                        placeholder="Describe the condition, potential threat vectors, and existing controls..."
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                        style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: '6px', background: 'var(--color-surface)', color: 'var(--color-text)', resize: 'vertical' }}
                    />
                </div>

                <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
                        Recommended Mitigation
                    </label>
                    <textarea 
                        rows={3}
                        placeholder="e.g. Deploy 1 static guard on Night Shift and install PTZ CCTV with motion detection..."
                        value={recommendation}
                        onChange={e => setRecommendation(e.target.value)}
                        style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: '6px', background: 'var(--color-surface)', color: 'var(--color-text)', resize: 'vertical' }}
                    />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                    <Button type="button" variant="secondary" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button type="submit" variant="primary" loading={isSubmitting}>
                        <i className='bx bx-plus-circle'></i> Add Risk Finding
                    </Button>
                </div>
            </form>
        </Modal>
    );
};
