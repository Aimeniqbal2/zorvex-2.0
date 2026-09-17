import React, { useState, useEffect } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Badge } from '../../../components/ui/Badge';
import { apiClient } from '../api';
import type { Candidate, Designation } from '../types';

interface CandidateModalProps {
    isOpen: boolean;
    onClose: () => void;
    candidate: Candidate | null;
    onSave: () => void;
}

export const CandidateModal: React.FC<CandidateModalProps> = ({ isOpen, onClose, candidate, onSave }) => {
    const [activeTab, setActiveTab] = useState<'BIO' | 'DOCS' | 'VETTING'>('BIO');
    const [formData, setFormData] = useState<Partial<Candidate>>({
        first_name: '',
        last_name: '',
        father_name: '',
        national_id: '',
        phone: '',
        email: '',
        address: '',
        applied_designation: '',
        application_date: new Date().toISOString().split('T')[0],
        biometric_enrolled: false
    });
    
    const [designations, setDesignations] = useState<Designation[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<any>(null);

    useEffect(() => {
        if (candidate) {
            setFormData({
                ...candidate,
                applied_designation: candidate.applied_designation || ''
            });
        } else {
            setFormData({
                first_name: '', last_name: '', father_name: '', national_id: '',
                phone: '', email: '', address: '', applied_designation: '',
                application_date: new Date().toISOString().split('T')[0],
                biometric_enrolled: false
            });
        }
        setError(null);
        setActiveTab('BIO');
    }, [candidate, isOpen]);

    useEffect(() => {
        if (isOpen) {
            apiClient.get('/api/hrm/designations/').then(res => setDesignations(res.data.results || (Array.isArray(res.data) ? res.data : []))).catch(() => setDesignations([]));
        }
    }, [isOpen]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const value = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value;
        setFormData({ ...formData, [e.target.name]: value });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const payload = { ...formData };
            if (!payload.applied_designation) delete payload.applied_designation;

            if (candidate?.id) {
                await apiClient.patch(`/api/hrm/candidates/${candidate.id}/`, payload);
            } else {
                await apiClient.post('/api/hrm/candidates/', payload);
            }
            onSave();
            onClose();
        } catch (err: any) {
            setError(err.response?.data || 'Failed to save candidate');
        } finally {
            setLoading(false);
        }
    };

    const handleAction = async (action: 'select' | 'hire') => {
        setLoading(true);
        try {
            await apiClient.post(`/api/hrm/candidates/${candidate?.id}/${action}/`);
            onSave();
            onClose();
        } catch (err: any) {
            setError(err.response?.data || `Failed to ${action} candidate`);
        } finally {
            setLoading(false);
        }
    };

    const renderError = () => {
        if (!error) return null;
        if (typeof error === 'string') return <div style={{ color: 'var(--color-danger)', fontSize: '14px', marginBottom: '12px' }}>{error}</div>;
        return (
            <div style={{ color: 'var(--color-danger)', fontSize: '14px', marginBottom: '12px', background: 'var(--color-danger-light)', padding: '8px', borderRadius: '4px' }}>
                {Object.entries(error).map(([k, v]) => (
                    <div key={k}><strong>{k === 'non_field_errors' ? '' : k + ':'}</strong> {Array.isArray(v) ? v.join(' ') : String(v)}</div>
                ))}
            </div>
        );
    };

    const isNew = !candidate;
    const canSelect = candidate?.status === 'APPLIED' || candidate?.status === 'SCREENING' || candidate?.status === 'VERIFICATION';
    const canHire = candidate?.status === 'SELECTED' || candidate?.status === 'VERIFICATION';

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={candidate ? `Candidate: ${candidate.candidate_number} - ${candidate.first_name}` : 'New Candidate'}>
            
            {!isNew && (
                <div style={{ display: 'flex', gap: '16px', borderBottom: '1px solid var(--color-border)', padding: '0 16px' }}>
                    {['BIO', 'DOCS', 'VETTING'].map(t => (
                        <button 
                            key={t}
                            style={{ 
                                padding: '12px 16px', 
                                borderBottom: activeTab === t ? '2px solid var(--color-primary)' : 'none', 
                                cursor: 'pointer', 
                                background: 'none', borderTop: 'none', borderLeft: 'none', borderRight: 'none',
                                color: activeTab === t ? 'var(--color-primary)' : 'inherit', 
                                fontWeight: activeTab === t ? 'bold' : 'normal' 
                            }}
                            onClick={() => setActiveTab(t as any)}
                        >
                            {t === 'BIO' ? 'Bio Data' : t === 'DOCS' ? 'Documents' : 'Police & Vetting'}
                        </button>
                    ))}
                </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px', maxHeight: '70vh', overflowY: 'auto' }}>
                {renderError()}
                
                {activeTab === 'BIO' && (
                    <>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                            <Input label="First Name *" name="first_name" value={formData.first_name || ''} onChange={handleChange} required />
                            <Input label="Last Name *" name="last_name" value={formData.last_name || ''} onChange={handleChange} required />
                            <Input label="Father Name" name="father_name" value={formData.father_name || ''} onChange={handleChange} />
                            <Input label="Date of Birth" type="date" name="date_of_birth" value={formData.date_of_birth || ''} onChange={handleChange} />
                        </div>
                        
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                            <Input label="National ID / CNIC" name="national_id" value={formData.national_id || ''} onChange={handleChange} />
                            <Input label="Phone" name="phone" value={formData.phone || ''} onChange={handleChange} />
                            <Input label="Email" type="email" name="email" value={formData.email || ''} onChange={handleChange} />
                        </div>

                        <div className="form-field">
                            <label className="form-label">Address</label>
                            <textarea name="address" value={formData.address || ''} onChange={handleChange} className="input-base" rows={2} />
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                            <div className="form-field">
                                <label className="form-label">Applied Designation *</label>
                                <select name="applied_designation" value={formData.applied_designation || ''} onChange={handleChange} className="input-base" required>
                                    <option value="">-- Select --</option>
                                    {designations.map(d => (
                                        <option key={d.id} value={d.id}>{d.name}</option>
                                    ))}
                                </select>
                            </div>
                            <Input label="Application Date *" type="date" name="application_date" value={formData.application_date || ''} onChange={handleChange} required />
                        </div>

                        <div className="form-field" style={{ flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
                            <input type="checkbox" name="biometric_enrolled" checked={formData.biometric_enrolled || false} onChange={handleChange} id="bio_enrolled" />
                            <label htmlFor="bio_enrolled" className="form-label" style={{ margin: 0 }}>Biometric Enrolled (Fingerprint)</label>
                        </div>
                    </>
                )}

                {activeTab === 'DOCS' && !isNew && (
                    <div>
                        <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', marginBottom: '16px' }}>
                            Documents functionality requires the dedicated candidate detail page. Currently viewing basic Bio Data.
                        </p>

                        {candidate?.documents?.length ? (
                            <ul style={{ listStyle: 'none', padding: 0 }}>
                                {candidate.documents.map(d => (
                                    <li key={d.id} style={{ padding: '8px', border: '1px solid var(--color-border)', marginBottom: '8px', borderRadius: '4px' }}>
                                        {d.document_type} - {d.status}
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <div>No documents uploaded.</div>
                        )}
                    </div>
                )}

                {activeTab === 'VETTING' && !isNew && (
                    <div>
                        <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', marginBottom: '16px' }}>
                            Vetting functionality requires the dedicated candidate detail page. Currently viewing basic Bio Data.
                        </p>
                        {candidate?.verifications?.length ? (
                            <ul style={{ listStyle: 'none', padding: 0 }}>
                                {candidate.verifications.map(v => (
                                    <li key={v.id} style={{ padding: '8px', border: '1px solid var(--color-border)', marginBottom: '8px', borderRadius: '4px' }}>
                                        {v.verification_type} - <Badge>{v.status}</Badge>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <div>No verifications started.</div>
                        )}
                    </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--color-border)' }}>
                    <div>
                        {!isNew && canSelect && (
                            <Button type="button" variant="secondary" onClick={() => handleAction('select')} loading={loading}>
                                Mark Selected
                            </Button>
                        )}
                        {!isNew && canHire && (
                            <Button type="button" variant="primary" style={{ marginLeft: '8px', backgroundColor: 'var(--color-success)', color: 'white', borderColor: 'var(--color-success)' }} onClick={() => handleAction('hire')} loading={loading}>
                                HIRE EMPLOYEE
                            </Button>
                        )}
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <Button type="button" variant="secondary" onClick={onClose}>Close</Button>
                        {activeTab === 'BIO' && (
                            <Button type="submit" variant="primary" loading={loading}>Save Bio Data</Button>
                        )}
                    </div>
                </div>
            </form>
        </Modal>
    );
};
