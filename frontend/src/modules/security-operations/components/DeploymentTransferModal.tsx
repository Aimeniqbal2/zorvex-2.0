import React, { useState, useEffect } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { apiClient, transferDeployment } from '../api';
import type { OperationalSite, SecurityPost, ServiceContract, DesignationOption } from '../types';

interface DeploymentTransferModalProps {
    isOpen: boolean;
    onClose: () => void;
    deploymentId: string | null;
    employeeName?: string;
    onTransferred: () => void;
}

export const DeploymentTransferModal: React.FC<DeploymentTransferModalProps> = ({
    isOpen,
    onClose,
    deploymentId,
    employeeName,
    onTransferred
}) => {
    const [sites, setSites] = useState<OperationalSite[]>([]);
    const [posts, setPosts] = useState<SecurityPost[]>([]);
    const [contracts, setContracts] = useState<ServiceContract[]>([]);
    const [designations, setDesignations] = useState<DesignationOption[]>([]);

    const [formData, setFormData] = useState({
        relieved_date: new Date().toISOString().split('T')[0],
        relief_reason: 'Transferred to new operational site',
        new_site: '',
        new_post: '',
        new_contract: '',
        new_designation: '',
        new_start_date: new Date().toISOString().split('T')[0],
        new_assignment_type: 'PERMANENT',
        notes: ''
    });

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            fetchInitialData();
            setFormData({
                relieved_date: new Date().toISOString().split('T')[0],
                relief_reason: 'Transferred to new operational site',
                new_site: '',
                new_post: '',
                new_contract: '',
                new_designation: '',
                new_start_date: new Date().toISOString().split('T')[0],
                new_assignment_type: 'PERMANENT',
                notes: ''
            });
            setError(null);
        }
    }, [isOpen]);

    const fetchInitialData = async () => {
        try {
            const [sitesRes, desigRes] = await Promise.all([
                apiClient.get('/api/operations/sites/?is_active=true&page_size=200'),
                apiClient.get('/api/hrm/designations/?is_active=true&page_size=200')
            ]);
            setSites(sitesRes.data.results || sitesRes.data);
            setDesignations(desigRes.data.results || desigRes.data);
        } catch (err) {
            console.error('Failed to fetch transfer options', err);
        }
    };

    const handleSiteChange = async (siteId: string) => {
        setFormData(prev => ({ ...prev, new_site: siteId, new_post: '', new_contract: '' }));
        if (!siteId) {
            setPosts([]);
            setContracts([]);
            return;
        }
        try {
            const [postsRes, contractsRes] = await Promise.all([
                apiClient.get(`/api/operations/posts/?site=${siteId}&is_active=true&page_size=100`),
                apiClient.get(`/api/operations/contracts/?status=ACTIVE&page_size=100`)
            ]);
            setPosts(postsRes.data.results || postsRes.data);
            const allC: ServiceContract[] = contractsRes.data.results || contractsRes.data;
            setContracts(allC.filter(c => c.sites?.includes(siteId)));
        } catch (err) {
            console.error('Failed to fetch posts/contracts for new site', err);
        }
    };

    const handlePostChange = (postId: string) => {
        setFormData(prev => {
            const selectedPost = posts.find(p => p.id === postId);
            return {
                ...prev,
                new_post: postId,
                new_designation: selectedPost?.required_designation || prev.new_designation,
                new_contract: selectedPost?.service_contract || prev.new_contract
            };
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!deploymentId || !formData.new_site) return;
        setLoading(true);
        setError(null);
        try {
            await transferDeployment(deploymentId, {
                relieved_date: formData.relieved_date,
                relief_reason: formData.relief_reason,
                new_site: formData.new_site,
                new_post: formData.new_post || null,
                new_contract: formData.new_contract || null,
                new_designation: formData.new_designation || null,
                new_start_date: formData.new_start_date,
                new_assignment_type: formData.new_assignment_type,
                notes: formData.notes
            });
            onTransferred();
            onClose();
        } catch (err: any) {
            const errData = err.response?.data;
            if (typeof errData === 'object') {
                const msgs = Object.entries(errData).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`);
                setError(msgs.join('; '));
            } else {
                setError(errData || 'Failed to transfer deployment');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Transfer Deployment — ${employeeName || 'Guard'}`}>
            <form onSubmit={handleSubmit} style={{ padding: '8px', maxHeight: '80vh', overflowY: 'auto' }}>
                {error && (
                    <div style={{ padding: '10px 14px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderRadius: '6px', marginBottom: '14px', fontSize: '13px' }}>
                        {error}
                    </div>
                )}

                <div style={{ background: 'var(--color-surface)', padding: '12px', borderRadius: '6px', marginBottom: '14px', border: '1px solid var(--color-border)', fontSize: '12px' }}>
                    <strong>Controlled Transfer Protocol:</strong> The employee's current active deployment will be formally ended/relieved with full audit trail, and a new active deployment will be established seamlessly without data overwrite.
                </div>

                {/* Section 1: Relieve Details */}
                <h5 style={{ margin: '0 0 10px 0', fontSize: '13px', fontWeight: 600 }}>1. Existing Deployment Relief</h5>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                    <Input
                        label="Relieved Date *"
                        type="date"
                        value={formData.relieved_date}
                        onChange={e => setFormData({ ...formData, relieved_date: e.target.value })}
                        required
                    />
                    <Input
                        label="Relief Reason *"
                        value={formData.relief_reason}
                        onChange={e => setFormData({ ...formData, relief_reason: e.target.value })}
                        required
                    />
                </div>

                {/* Section 2: New Assignment Details */}
                <h5 style={{ margin: '0 0 10px 0', fontSize: '13px', fontWeight: 600 }}>2. Target Deployment Details</h5>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                    <div className="form-field">
                        <label className="form-label">New Site <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                        <select
                            className="input-base"
                            value={formData.new_site}
                            onChange={e => handleSiteChange(e.target.value)}
                            required
                        >
                            <option value="">Select Destination Site</option>
                            {sites.map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="form-field">
                        <label className="form-label">New Post (Optional)</label>
                        <select
                            className="input-base"
                            value={formData.new_post}
                            onChange={e => handlePostChange(e.target.value)}
                            disabled={!formData.new_site}
                        >
                            <option value="">Unassigned / General Post</option>
                            {posts.map(p => (
                                <option key={p.id} value={p.id}>{p.post_name} (Req: {p.required_headcount})</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                    <div className="form-field">
                        <label className="form-label">Designation</label>
                        <select
                            className="input-base"
                            value={formData.new_designation}
                            onChange={e => setFormData({ ...formData, new_designation: e.target.value })}
                        >
                            <option value="">Maintain Current Designation</option>
                            {designations.map(d => (
                                <option key={d.id} value={d.id}>{d.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="form-field">
                        <label className="form-label">Contract (Optional)</label>
                        <select
                            className="input-base"
                            value={formData.new_contract}
                            onChange={e => setFormData({ ...formData, new_contract: e.target.value })}
                            disabled={!formData.new_site}
                        >
                            <option value="">None</option>
                            {contracts.map(c => (
                                <option key={c.id} value={c.id}>{c.contract_code}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                    <Input
                        label="New Start Date *"
                        type="date"
                        value={formData.new_start_date}
                        onChange={e => setFormData({ ...formData, new_start_date: e.target.value })}
                        required
                    />

                    <div className="form-field">
                        <label className="form-label">Assignment Type</label>
                        <select
                            className="input-base"
                            value={formData.new_assignment_type}
                            onChange={e => setFormData({ ...formData, new_assignment_type: e.target.value })}
                        >
                            <option value="PERMANENT">Permanent</option>
                            <option value="TEMPORARY">Temporary</option>
                        </select>
                    </div>
                </div>

                <div className="form-field" style={{ marginBottom: '16px' }}>
                    <label className="form-label">Transfer Notes</label>
                    <textarea
                        className="input-base"
                        rows={2}
                        placeholder="Logistics, supervisor notes, or specific relief conditions"
                        value={formData.notes}
                        onChange={e => setFormData({ ...formData, notes: e.target.value })}
                    />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                    <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>Cancel</Button>
                    <Button type="submit" variant="primary" loading={loading}>Execute Transfer</Button>
                </div>
            </form>
        </Modal>
    );
};
