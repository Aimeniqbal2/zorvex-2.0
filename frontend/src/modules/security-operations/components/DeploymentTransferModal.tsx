import React, { useState, useEffect } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { apiClient, transferDeployment } from '../api';
import type { OperationalSite, SecurityPost, ServiceContract, DesignationOption } from '../types';
import { resolveDesignationId } from './DeploymentModal';

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

    const [formData, setFormData] = useState<{
        relieved_date: string;
        relief_reason: string;
        new_site: string;
        new_post: string;
        new_contract: string;
        new_designation: string;
        new_location_monthly_salary: number | null;
        new_start_date: string;
        new_assignment_type: string;
        notes: string;
    }>({
        relieved_date: new Date().toISOString().split('T')[0],
        relief_reason: 'Transferred to new operational site',
        new_site: '',
        new_post: '',
        new_contract: '',
        new_designation: '',
        new_location_monthly_salary: null,
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
                new_location_monthly_salary: null,
                new_start_date: new Date().toISOString().split('T')[0],
                new_assignment_type: 'PERMANENT',
                notes: ''
            });
            setError(null);
        }
    }, [isOpen]);

    const fetchInitialData = async () => {
        try {
            const sitesRes = await apiClient.get('/api/operations/sites/?is_active=true&page_size=1000');
            setSites(sitesRes.data.results || sitesRes.data || []);
        } catch (err) {
            console.error('Failed to fetch sites for transfer', err);
        }

        try {
            const desigRes = await apiClient.get('/api/hrm/designations/?is_active=true&page_size=1000');
            setDesignations(desigRes.data.results || desigRes.data || []);
        } catch (err) {
            console.error('Failed to fetch designations for transfer', err);
        }
    };

    const handleSiteChange = async (siteId: string) => {
        setFormData(prev => ({ 
            ...prev, 
            new_site: siteId, 
            new_post: '', 
            new_contract: '', 
            new_location_monthly_salary: null 
        }));
        if (!siteId) {
            setPosts([]);
            setContracts([]);
            return;
        }

        try {
            const postsRes = await apiClient.get(`/api/operations/posts/?site=${siteId}&is_active=true&page_size=100`);
            setPosts(postsRes.data.results || postsRes.data || []);
        } catch (err) {
            console.error('Failed to fetch posts for new site', err);
            setPosts([]);
        }

        try {
            const contractsRes = await apiClient.get(`/api/operations/contracts/?status=ACTIVE&page_size=100`);
            const allC: ServiceContract[] = contractsRes.data.results || contractsRes.data || [];
            const siteMatches = allC.filter(c => c.sites?.includes(siteId));
            setContracts(siteMatches);
            if (siteMatches.length > 0) {
                setFormData(prev => ({ ...prev, new_contract: siteMatches[0].id }));
            }
        } catch (err) {
            console.error('Failed to fetch contracts for new site', err);
            setContracts([]);
        }
    };

    const handlePostChange = (postId: string) => {
        const selectedPost = posts.find(p => p.id === postId);
        const matchedDesig = resolveDesignationId(selectedPost, designations);
        setFormData(prev => ({
            ...prev,
            new_post: postId,
            new_designation: matchedDesig || prev.new_designation,
            new_contract: selectedPost?.service_contract || prev.new_contract || (contracts[0]?.id || ''),
            new_location_monthly_salary: selectedPost?.monthly_pay_rate ? Number(selectedPost.monthly_pay_rate) : null
        }));
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
                new_location_monthly_salary: formData.new_location_monthly_salary,
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

    const activeContract = contracts.find(c => c.id === formData.new_contract) || contracts[0];

    return (
        <Modal 
            isOpen={isOpen} 
            onClose={onClose} 
            title={`Transfer Deployment — ${employeeName || 'Guard'}`}
            width="980px"
        >
            <form onSubmit={handleSubmit} style={{ padding: '4px 6px' }}>
                {error && (
                    <div style={{ padding: '10px 14px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderRadius: '6px', marginBottom: '14px', fontSize: '13px' }}>
                        {error}
                    </div>
                )}

                {/* Section 1: Relieve Details */}
                <div style={{
                    background: 'var(--color-surface, #1e293b)',
                    border: '1px solid var(--color-border, #334155)',
                    borderRadius: '8px',
                    padding: '16px',
                    marginBottom: '16px'
                }}>
                    <h5 style={{ margin: '0 0 12px 0', fontSize: '13px', fontWeight: 600, color: 'var(--color-text, #f8fafc)' }}>
                        1. Existing Deployment Relief
                    </h5>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
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
                </div>

                {/* Section 2: Target Deployment Details */}
                <div style={{
                    background: 'var(--color-surface, #1e293b)',
                    border: '1px solid var(--color-border, #334155)',
                    borderRadius: '8px',
                    padding: '16px',
                    marginBottom: '16px'
                }}>
                    <h5 style={{ margin: '0 0 12px 0', fontSize: '13px', fontWeight: 600, color: 'var(--color-text, #f8fafc)' }}>
                        2. Target Deployment Details
                    </h5>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                        <div className="form-field">
                            <label className="form-label" style={{ fontWeight: 600 }}>Destination Site <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                            <select
                                className="input-base"
                                value={formData.new_site}
                                onChange={e => handleSiteChange(e.target.value)}
                                required
                            >
                                <option value="">Select Destination Site</option>
                                {sites.map(s => (
                                    <option key={s.id} value={s.id}>{s.name}{s.customer_name ? ` (${s.customer_name})` : ''}</option>
                                ))}
                            </select>
                        </div>

                        <div className="form-field">
                            <label className="form-label" style={{ fontWeight: 600 }}>New Post / Requirement</label>
                            <select
                                className="input-base"
                                value={formData.new_post}
                                onChange={e => handlePostChange(e.target.value)}
                                disabled={!formData.new_site}
                            >
                                <option value="">Unassigned / General Post</option>
                                {posts.map(p => (
                                    <option key={p.id} value={p.id}>
                                        {p.post_name} (Req: {p.required_headcount}) {p.monthly_pay_rate ? `| PKR ${Number(p.monthly_pay_rate).toLocaleString()}/mo` : ''}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                        <div className="form-field">
                            <label className="form-label" style={{ fontWeight: 600 }}>Designation</label>
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

                        {/* CRM-Locked Financial & Contract Display */}
                        <div style={{
                            background: 'var(--color-surface-elevated, rgba(255,255,255,0.02))',
                            border: '1px solid var(--color-border)',
                            borderRadius: '6px',
                            padding: '10px 14px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '12px'
                        }}>
                            <div>
                                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
                                    Target Salary (Fixed by CRM)
                                </div>
                                <div style={{ fontSize: '17px', fontWeight: 700, color: 'var(--color-primary, #3b82f6)', marginTop: '2px' }}>
                                    {formData.new_location_monthly_salary ? `PKR ${Number(formData.new_location_monthly_salary).toLocaleString()}` : 'Standard Rate'}
                                    <span style={{ fontSize: '12px', fontWeight: 400, color: 'var(--color-text-muted)', marginLeft: '4px' }}>/ mo</span>
                                </div>
                            </div>
                            {activeContract && (
                                <div style={{ textAlign: 'right', borderLeft: '1px solid var(--color-border)', paddingLeft: '14px' }}>
                                    <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
                                        Service Contract
                                    </div>
                                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text)' }}>
                                        {activeContract.contract_code}
                                    </div>
                                    <span style={{ fontSize: '9.5px', color: '#10b981', fontWeight: 600 }}>LOCKED BY CRM</span>
                                </div>
                            )}
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                        <Input
                            label="New Start Date *"
                            type="date"
                            value={formData.new_start_date}
                            onChange={e => setFormData({ ...formData, new_start_date: e.target.value })}
                            required
                        />

                        <div className="form-field">
                            <label className="form-label" style={{ fontWeight: 600 }}>Assignment Type</label>
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

                    <div className="form-field">
                        <label className="form-label" style={{ fontWeight: 600 }}>Transfer Notes</label>
                        <textarea
                            className="input-base"
                            rows={2}
                            placeholder="Optional transfer notes..."
                            value={formData.notes}
                            onChange={e => setFormData({ ...formData, notes: e.target.value })}
                        />
                    </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                    <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>Cancel</Button>
                    <Button type="submit" variant="primary" loading={loading}>Transfer Deployment</Button>
                </div>
            </form>
        </Modal>
    );
};
