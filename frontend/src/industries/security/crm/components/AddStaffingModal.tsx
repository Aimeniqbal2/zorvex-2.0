import React, { useState, useEffect } from 'react';
import { Modal } from '../../../../components/ui/Modal';
import { Button } from '../../../../components/ui/Button';
import { Input } from '../../../../components/ui/Input';
import { useToastStore } from '../../../../stores/toastStore';
import { 
    addAssessmentStaffing, 
    getSecurityServiceTypes 
} from '../api';
import type { 
    SecurityServiceType, 
    AssessmentStaffingRecommendation 
} from '../api';

interface Props {
    isOpen: boolean;
    assessmentId: string;
    locationId?: string;
    onClose: () => void;
    onAdded: (staffing: AssessmentStaffingRecommendation) => void;
}

export const AddStaffingModal: React.FC<Props> = ({
    isOpen,
    assessmentId,
    locationId,
    onClose,
    onAdded
}) => {
    const [serviceTypes, setServiceTypes] = useState<SecurityServiceType[]>([]);
    const [serviceTypeId, setServiceTypeId] = useState('');
    const [quantity, setQuantity] = useState(1);
    const [postArea, setPostArea] = useState('');
    const [shiftCoverageNotes, setShiftCoverageNotes] = useState('12-Hour Shift (Day & Night)');
    const [remarks, setRemarks] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isLoadingTypes, setIsLoadingTypes] = useState(true);

    useEffect(() => {
        if (isOpen) {
            const fetchTypes = async () => {
                setIsLoadingTypes(true);
                try {
                    const res = await getSecurityServiceTypes();
                    const types = res.results || [];
                    setServiceTypes(types);
                    if (types.length > 0) {
                        setServiceTypeId(types[0].id);
                    }
                } catch (err) {
                    console.error('Failed to load service types', err);
                } finally {
                    setIsLoadingTypes(false);
                }
            };
            fetchTypes();
        }
    }, [isOpen]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!serviceTypeId) {
            useToastStore.getState().error('Please select a security service type.');
            return;
        }

        setIsSubmitting(true);
        try {
            const staffing = await addAssessmentStaffing(assessmentId, {
                service_type: serviceTypeId,
                location: locationId || undefined,
                quantity: Number(quantity) || 1,
                post_area: postArea,
                shift_coverage_notes: shiftCoverageNotes,
                remarks: remarks
            });

            useToastStore.getState().success('Staffing recommendation added.');
            onAdded(staffing);
            onClose();
        } catch (err: any) {
            useToastStore.getState().error(err.response?.data?.error || 'Failed to add staffing recommendation.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Recommend Security Staffing Requirement" width="600px">
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {isLoadingTypes ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                        <i className='bx bx-loader-alt bx-spin' style={{ fontSize: '24px' }}></i>
                        <p style={{ marginTop: '8px' }}>Loading service types...</p>
                    </div>
                ) : (
                    <>
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
                                    Security Service Type *
                                </label>
                                <select 
                                    value={serviceTypeId} 
                                    onChange={e => setServiceTypeId(e.target.value)}
                                    required
                                    style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: '6px', background: 'var(--color-surface)', color: 'var(--color-text)' }}
                                >
                                    {serviceTypes.map(st => (
                                        <option key={st.id} value={st.id}>{st.name} ({st.code})</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
                                    Recommended Qty *
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
                                Post / Guard Deployment Area
                            </label>
                            <Input 
                                placeholder="e.g. Main Entrance Gate, Loading Bay, Reception Desk"
                                value={postArea}
                                onChange={e => setPostArea(e.target.value)}
                            />
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
                                Shift & Coverage Notes
                            </label>
                            <Input 
                                placeholder="e.g. 24/7 2 Guards per shift, 12h Rotational, Weekends Only"
                                value={shiftCoverageNotes}
                                onChange={e => setShiftCoverageNotes(e.target.value)}
                            />
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
                                Operational Remarks / Special Skills
                            </label>
                            <textarea 
                                rows={3}
                                placeholder="e.g. Requires armed certification, CCTV monitoring experience, bilingual communication..."
                                value={remarks}
                                onChange={e => setRemarks(e.target.value)}
                                style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: '6px', background: 'var(--color-surface)', color: 'var(--color-text)', resize: 'vertical' }}
                            />
                        </div>

                        <div style={{ padding: '10px 14px', background: 'var(--color-surface-secondary)', borderRadius: '6px', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                            <i className='bx bx-info-circle'></i> <strong>Recommendation Only:</strong> This records requirements for proposal costing. It does not create employee deployments or payroll records.
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                            <Button type="button" variant="secondary" onClick={onClose}>
                                Cancel
                            </Button>
                            <Button type="submit" variant="primary" loading={isSubmitting}>
                                <i className='bx bx-plus-circle'></i> Add Recommendation
                            </Button>
                        </div>
                    </>
                )}
            </form>
        </Modal>
    );
};
