import React, { useState } from 'react';
import { Modal } from '../../../../components/ui/Modal';
import { Button } from '../../../../components/ui/Button';
import { Input } from '../../../../components/ui/Input';
import { useToastStore } from '../../../../stores/toastStore';
import { addAssessmentEquipment } from '../api';
import type { AssessmentEquipmentRecommendation } from '../api';

interface Props {
    isOpen: boolean;
    assessmentId: string;
    locationName?: string;
    onClose: () => void;
    onAdded: (equipment: AssessmentEquipmentRecommendation) => void;
}

export const AddEquipmentModal: React.FC<Props> = ({
    isOpen,
    assessmentId,
    locationName,
    onClose,
    onAdded
}) => {
    const [equipmentName, setEquipmentName] = useState('');
    const [quantity, setQuantity] = useState(1);
    const [locationArea, setLocationArea] = useState(locationName || '');
    const [purpose, setPurpose] = useState('');
    const [notes, setNotes] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!equipmentName.trim()) {
            useToastStore.getState().error('Please enter equipment name.');
            return;
        }

        setIsSubmitting(true);
        try {
            const eq = await addAssessmentEquipment(assessmentId, {
                equipment_name: equipmentName,
                quantity: Number(quantity) || 1,
                location_area: locationArea,
                purpose,
                notes
            });

            useToastStore.getState().success('Equipment recommendation added.');
            onAdded(eq);
            onClose();
        } catch (err: any) {
            useToastStore.getState().error(err.response?.data?.error || 'Failed to add equipment.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Recommend Security Equipment" width="600px">
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
                            Equipment / Hardware Name *
                        </label>
                        <Input 
                            placeholder="e.g. Handheld Metal Detector, 4K PTZ Camera, VHF Two-Way Radio"
                            value={equipmentName}
                            onChange={e => setEquipmentName(e.target.value)}
                            required
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
                            Quantity *
                        </label>
                        <Input 
                            type="number"
                            min="1"
                            value={quantity}
                            onChange={e => setQuantity(parseInt(e.target.value) || 1)}
                            required
                        />
                    </div>
                </div>

                <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
                        Deployment Location / Area
                    </label>
                    <Input 
                        placeholder="e.g. Main Gate, Guard Room, Server Room Entrance"
                        value={locationArea}
                        onChange={e => setLocationArea(e.target.value)}
                    />
                </div>

                <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
                        Purpose & Usage
                    </label>
                    <Input 
                        placeholder="e.g. Visitor bag inspection, Perimeter night monitoring"
                        value={purpose}
                        onChange={e => setPurpose(e.target.value)}
                    />
                </div>

                <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
                        Technical Specifications / Notes
                    </label>
                    <textarea 
                        rows={3}
                        placeholder="e.g. Weatherproof IP67 rating, lithium rechargeable battery, solar backup..."
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                        style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: '6px', background: 'var(--color-surface)', color: 'var(--color-text)', resize: 'vertical' }}
                    />
                </div>

                <div style={{ padding: '10px 14px', background: 'var(--color-surface-secondary)', borderRadius: '6px', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                    <i className='bx bx-info-circle'></i> <strong>CRM Requirement Only:</strong> This records hardware requirements for proposal scoping. It does not issue inventory or reduce stock.
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                    <Button type="button" variant="secondary" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button type="submit" variant="primary" loading={isSubmitting}>
                        <i className='bx bx-plus-circle'></i> Add Equipment
                    </Button>
                </div>
            </form>
        </Modal>
    );
};
