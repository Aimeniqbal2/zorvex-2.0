import React, { useState, useEffect, useCallback } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Input } from '../../../components/ui/Input';
import { 
    getSiteManpowerSummary, 
    createSecurityPost, 
    updateSecurityPost, 
    deleteSecurityPost
} from '../api';
import { apiClient } from '../api';
import type { 
    OperationalSite, 
    SiteManpowerSummary, 
    SecurityPost, 
    PostManpowerItem, 
    DesignationOption, 
    ServiceContract 
} from '../types';
import { DeploymentTransferModal } from './DeploymentTransferModal';
import { DeploymentRelieveModal } from './DeploymentRelieveModal';
import { PostShiftRequirementModal } from './PostShiftRequirementModal';

interface SiteManpowerModalProps {
    isOpen: boolean;
    onClose: () => void;
    site: OperationalSite | null;
    onRefresh?: () => void;
}

export const SiteManpowerModal: React.FC<SiteManpowerModalProps> = ({
    isOpen,
    onClose,
    site,
    onRefresh
}) => {
    const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'POSTS' | 'DEPLOYED'>('OVERVIEW');
    const [summary, setSummary] = useState<SiteManpowerSummary | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Post creation/edit state
    const [isPostFormOpen, setIsPostFormOpen] = useState(false);
    const [editingPost, setEditingPost] = useState<SecurityPost | null>(null);
    const [postFormData, setPostFormData] = useState({
        post_name: '',
        post_code: '',
        required_designation: '',
        required_headcount: 1,
        service_contract: '',
        notes: '',
        is_active: true
    });

    const [designations, setDesignations] = useState<DesignationOption[]>([]);
    const [siteContracts, setSiteContracts] = useState<ServiceContract[]>([]);

    // Transfer / Relieve modal state
    const [transferDeploymentId, setTransferDeploymentId] = useState<string | null>(null);
    const [transferEmployeeName, setTransferEmployeeName] = useState<string>('');
    const [isTransferOpen, setIsTransferOpen] = useState(false);

    const [relieveDeploymentId, setRelieveDeploymentId] = useState<string | null>(null);
    const [relieveEmployeeName, setRelieveEmployeeName] = useState<string>('');
    const [isRelieveOpen, setIsRelieveOpen] = useState(false);

    // Post shift requirements state
    const [isShiftReqOpen, setIsShiftReqOpen] = useState(false);
    const [selectedPostForShiftReq, setSelectedPostForShiftReq] = useState<{ id: string; name: string } | null>(null);

    const fetchSummary = useCallback(async () => {
        if (!site) return;
        setLoading(true);
        setError(null);
        try {
            const data = await getSiteManpowerSummary(site.id);
            setSummary(data);
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to load manpower summary');
        } finally {
            setLoading(false);
        }
    }, [site]);

    const fetchDropdowns = useCallback(async () => {
        if (!site) return;
        try {
            const [desigRes, contractsRes] = await Promise.all([
                apiClient.get('/api/hrm/designations/?is_active=true&page_size=200'),
                apiClient.get('/api/operations/contracts/?status=ACTIVE&page_size=100')
            ]);
            setDesignations(desigRes.data.results || desigRes.data);
            const allContracts: ServiceContract[] = contractsRes.data.results || contractsRes.data;
            setSiteContracts(allContracts.filter(c => c.sites?.includes(site.id)));
        } catch (err) {
            console.error('Failed to fetch dropdowns', err);
        }
    }, [site]);

    useEffect(() => {
        if (isOpen && site) {
            fetchSummary();
            fetchDropdowns();
            setIsPostFormOpen(false);
            setEditingPost(null);
        }
    }, [isOpen, site, fetchSummary, fetchDropdowns]);

    const handleSavePost = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!site) return;
        setError(null);
        try {
            const payload = {
                site: site.id,
                post_name: postFormData.post_name,
                post_code: postFormData.post_code,
                required_designation: postFormData.required_designation,
                required_headcount: Number(postFormData.required_headcount),
                service_contract: postFormData.service_contract || null,
                notes: postFormData.notes,
                is_active: postFormData.is_active
            };
            if (editingPost) {
                await updateSecurityPost(editingPost.id, payload);
            } else {
                await createSecurityPost(payload);
            }
            setIsPostFormOpen(false);
            setEditingPost(null);
            fetchSummary();
            if (onRefresh) onRefresh();
        } catch (err: any) {
            const errData = err.response?.data;
            setError(typeof errData === 'string' ? errData : JSON.stringify(errData));
        }
    };

    const handleOpenEditPost = (item: PostManpowerItem) => {
        setEditingPost({
            id: item.id,
            site: site!.id,
            post_name: item.post_name,
            post_code: item.post_code,
            required_designation: item.required_designation_id || '',
            required_headcount: item.required_headcount,
            service_contract: item.service_contract_id || '',
            is_active: item.is_active,
            notes: item.notes
        });
        setPostFormData({
            post_name: item.post_name,
            post_code: item.post_code,
            required_designation: item.required_designation_id || '',
            required_headcount: item.required_headcount,
            service_contract: item.service_contract_id || '',
            notes: item.notes || '',
            is_active: item.is_active
        });
        setIsPostFormOpen(true);
    };

    const handleDeletePost = async (postId: string) => {
        if (!confirm('Are you sure you want to delete this security post?')) return;
        try {
            await deleteSecurityPost(postId);
            fetchSummary();
            if (onRefresh) onRefresh();
        } catch (err: any) {
            alert(err.response?.data?.error || 'Failed to delete post');
        }
    };

    return (
        <Modal 
            isOpen={isOpen} 
            onClose={onClose} 
            title={`Manpower & Security Posts — ${site?.name || 'Site'}`}
        >
            <div style={{ maxHeight: '82vh', overflowY: 'auto', padding: '8px' }}>
                {error && (
                    <div style={{ padding: '10px 14px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderRadius: '6px', marginBottom: '14px', fontSize: '13px' }}>
                        {error}
                    </div>
                )}

                {loading && !summary && (
                    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '13px' }}>
                        Loading site manpower and posts...
                    </div>
                )}

                {/* Top Metrics Cards */}
                {summary && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '16px' }}>
                        <div style={{ padding: '12px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '8px', textAlign: 'center' }}>
                            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Required Strength</div>
                            <div style={{ fontSize: '22px', fontWeight: 'bold', color: 'var(--color-primary)', marginTop: '4px' }}>{summary.required_strength}</div>
                        </div>
                        <div style={{ padding: '12px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '8px', textAlign: 'center' }}>
                            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Deployed Strength</div>
                            <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#10b981', marginTop: '4px' }}>{summary.deployed_strength}</div>
                        </div>
                        <div style={{ padding: '12px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '8px', textAlign: 'center' }}>
                            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Vacancies</div>
                            <div style={{ fontSize: '22px', fontWeight: 'bold', color: summary.vacancies > 0 ? '#ef4444' : 'var(--color-text-muted)', marginTop: '4px' }}>{summary.vacancies}</div>
                        </div>
                        <div style={{ padding: '12px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '8px', textAlign: 'center' }}>
                            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Overstaffing</div>
                            <div style={{ fontSize: '22px', fontWeight: 'bold', color: summary.overstaffing > 0 ? '#f59e0b' : 'var(--color-text-muted)', marginTop: '4px' }}>{summary.overstaffing}</div>
                        </div>
                    </div>
                )}

                {/* Sub-tabs */}
                <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--color-border)', marginBottom: '16px' }}>
                    <button
                        type="button"
                        onClick={() => setActiveTab('OVERVIEW')}
                        style={{
                            padding: '8px 16px',
                            background: 'none',
                            border: 'none',
                            borderBottom: activeTab === 'OVERVIEW' ? '2px solid var(--color-primary)' : '2px solid transparent',
                            color: activeTab === 'OVERVIEW' ? 'var(--color-primary)' : 'var(--color-text-muted)',
                            fontWeight: activeTab === 'OVERVIEW' ? '600' : '400',
                            cursor: 'pointer'
                        }}
                    >
                        Posts & Manpower ({summary?.posts.length || 0})
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('DEPLOYED')}
                        style={{
                            padding: '8px 16px',
                            background: 'none',
                            border: 'none',
                            borderBottom: activeTab === 'DEPLOYED' ? '2px solid var(--color-primary)' : '2px solid transparent',
                            color: activeTab === 'DEPLOYED' ? 'var(--color-primary)' : 'var(--color-text-muted)',
                            fontWeight: activeTab === 'DEPLOYED' ? '600' : '400',
                            cursor: 'pointer'
                        }}
                    >
                        Deployed Guards ({summary?.deployments.length || 0})
                    </button>
                </div>

                {/* Tab 1: Posts & Manpower */}
                {activeTab === 'OVERVIEW' && (
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                            <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>Defined Security Posts</h4>
                            <Button
                                variant="primary"
                                size="sm"
                                icon="bx-plus"
                                onClick={() => {
                                    setEditingPost(null);
                                    setPostFormData({
                                        post_name: '',
                                        post_code: '',
                                        required_designation: designations[0]?.id || '',
                                        required_headcount: 1,
                                        service_contract: siteContracts[0]?.id || '',
                                        notes: '',
                                        is_active: true
                                    });
                                    setIsPostFormOpen(true);
                                }}
                            >
                                Add Security Post
                            </Button>
                        </div>

                        {/* Post Form Drawer / Inline Form */}
                        {isPostFormOpen && (
                            <form onSubmit={handleSavePost} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '14px', marginBottom: '16px' }}>
                                <h5 style={{ margin: '0 0 12px 0', fontSize: '13px', fontWeight: 600 }}>
                                    {editingPost ? 'Edit Security Post' : 'New Security Post'}
                                </h5>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                                    <Input
                                        label="Post Name *"
                                        placeholder="e.g. Main Gate, Tower A Lobby"
                                        value={postFormData.post_name}
                                        onChange={e => setPostFormData({ ...postFormData, post_name: e.target.value })}
                                        required
                                    />
                                    <Input
                                        label="Post Code"
                                        placeholder="e.g. P-01"
                                        value={postFormData.post_code}
                                        onChange={e => setPostFormData({ ...postFormData, post_code: e.target.value })}
                                    />
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                                    <div className="form-field">
                                        <label className="form-label">Required Designation *</label>
                                        <select
                                            className="input-base"
                                            value={postFormData.required_designation}
                                            onChange={e => setPostFormData({ ...postFormData, required_designation: e.target.value })}
                                            required
                                        >
                                            <option value="">Select Designation</option>
                                            {designations.map(d => (
                                                <option key={d.id} value={d.id}>{d.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <Input
                                        label="Required Headcount *"
                                        type="number"
                                        min="1"
                                        value={postFormData.required_headcount}
                                        onChange={e => setPostFormData({ ...postFormData, required_headcount: parseInt(e.target.value) || 1 })}
                                        required
                                    />
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                                    <div className="form-field">
                                        <label className="form-label">Linked Contract (Optional)</label>
                                        <select
                                            className="input-base"
                                            value={postFormData.service_contract}
                                            onChange={e => setPostFormData({ ...postFormData, service_contract: e.target.value })}
                                        >
                                            <option value="">None</option>
                                            {siteContracts.map(c => (
                                                <option key={c.id} value={c.id}>{c.contract_code}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <Input
                                        label="Notes"
                                        placeholder="Special post instructions or equipment"
                                        value={postFormData.notes}
                                        onChange={e => setPostFormData({ ...postFormData, notes: e.target.value })}
                                    />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                    <Button type="button" variant="secondary" size="sm" onClick={() => setIsPostFormOpen(false)}>Cancel</Button>
                                    <Button type="submit" variant="primary" size="sm">
                                        {editingPost ? 'Update Post' : 'Create Post'}
                                    </Button>
                                </div>
                            </form>
                        )}

                        {/* Post Table */}
                        <div style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: '6px' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                                <thead style={{ background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)' }}>
                                    <tr>
                                        <th style={{ padding: '8px 12px' }}>Post</th>
                                        <th style={{ padding: '8px 12px' }}>Required Designation</th>
                                        <th style={{ padding: '8px 12px', textAlign: 'center' }}>Required</th>
                                        <th style={{ padding: '8px 12px', textAlign: 'center' }}>Deployed</th>
                                        <th style={{ padding: '8px 12px', textAlign: 'center' }}>Vacant</th>
                                        <th style={{ padding: '8px 12px' }}>Contract</th>
                                        <th style={{ padding: '8px 12px', textAlign: 'right' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {summary?.posts.map(p => (
                                        <tr key={p.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                            <td style={{ padding: '8px 12px' }}>
                                                <div style={{ fontWeight: 600 }}>{p.post_name}</div>
                                                {p.post_code && <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{p.post_code}</div>}
                                            </td>
                                            <td style={{ padding: '8px 12px' }}>{p.required_designation_name || '—'}</td>
                                            <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600 }}>{p.required_headcount}</td>
                                            <td style={{ padding: '8px 12px', textAlign: 'center', color: '#10b981', fontWeight: 600 }}>{p.deployed_headcount}</td>
                                            <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                                                {p.vacancies > 0 ? (
                                                    <span style={{ color: '#ef4444', fontWeight: 600 }}>{p.vacancies}</span>
                                                ) : (
                                                    <span style={{ color: 'var(--color-text-muted)' }}>0</span>
                                                )}
                                            </td>
                                            <td style={{ padding: '8px 12px', fontSize: '12px', color: 'var(--color-text-muted)' }}>{p.service_contract_code || '—'}</td>
                                            <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                                                <button
                                                    onClick={() => {
                                                        setSelectedPostForShiftReq({ id: p.id, name: p.post_name });
                                                        setIsShiftReqOpen(true);
                                                    }}
                                                    style={{ background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer', marginRight: '8px', fontSize: '12px', fontWeight: 500 }}
                                                    title="Configure required headcount per shift"
                                                >
                                                    Shift Targets
                                                </button>
                                                <button
                                                    onClick={() => handleOpenEditPost(p)}
                                                    style={{ background: 'none', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', marginRight: '8px', fontSize: '12px' }}
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    onClick={() => handleDeletePost(p.id)}
                                                    style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '12px' }}
                                                >
                                                    Delete
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {(!summary?.posts || summary.posts.length === 0) && (
                                        <tr>
                                            <td colSpan={7} style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                                                No security posts configured for this site yet. Click "Add Security Post" to configure manpower requirements.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Tab 2: Deployed Guards */}
                {activeTab === 'DEPLOYED' && (
                    <div>
                        <div style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: '6px' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                                <thead style={{ background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)' }}>
                                    <tr>
                                        <th style={{ padding: '8px 12px' }}>Employee</th>
                                        <th style={{ padding: '8px 12px' }}>Post</th>
                                        <th style={{ padding: '8px 12px' }}>Designation</th>
                                        <th style={{ padding: '8px 12px' }}>Type</th>
                                        <th style={{ padding: '8px 12px' }}>From Date</th>
                                        <th style={{ padding: '8px 12px' }}>Status</th>
                                        <th style={{ padding: '8px 12px', textAlign: 'right' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {summary?.deployments.map(d => (
                                        <tr key={d.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                            <td style={{ padding: '8px 12px' }}>
                                                <div style={{ fontWeight: 600 }}>{d.employee_name}</div>
                                                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{d.employee_code || d.employee_classification}</div>
                                            </td>
                                            <td style={{ padding: '8px 12px' }}>{d.post_name}</td>
                                            <td style={{ padding: '8px 12px' }}>{d.designation_name}</td>
                                            <td style={{ padding: '8px 12px' }}>
                                                <Badge variant={d.assignment_type === 'PERMANENT' ? 'primary' : 'default'}>
                                                    {d.assignment_type}
                                                </Badge>
                                            </td>
                                            <td style={{ padding: '8px 12px' }}>{d.from_date}</td>
                                            <td style={{ padding: '8px 12px' }}>
                                                <Badge variant="success">{d.status}</Badge>
                                            </td>
                                            <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                                                <button
                                                    onClick={() => {
                                                        setTransferDeploymentId(d.id);
                                                        setTransferEmployeeName(d.employee_name);
                                                        setIsTransferOpen(true);
                                                    }}
                                                    style={{ background: 'none', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', marginRight: '8px', fontSize: '12px' }}
                                                >
                                                    Transfer
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setRelieveDeploymentId(d.id);
                                                        setRelieveEmployeeName(d.employee_name);
                                                        setIsRelieveOpen(true);
                                                    }}
                                                    style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '12px' }}
                                                >
                                                    Relieve
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {(!summary?.deployments || summary.deployments.length === 0) && (
                                        <tr>
                                            <td colSpan={7} style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                                                No active deployments at this site currently.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            {/* Transfer Modal */}
            <DeploymentTransferModal
                isOpen={isTransferOpen}
                onClose={() => setIsTransferOpen(false)}
                deploymentId={transferDeploymentId}
                employeeName={transferEmployeeName}
                onTransferred={() => {
                    fetchSummary();
                    if (onRefresh) onRefresh();
                }}
            />

            {/* Relieve Modal */}
            <DeploymentRelieveModal
                isOpen={isRelieveOpen}
                onClose={() => setIsRelieveOpen(false)}
                deploymentId={relieveDeploymentId}
                employeeName={relieveEmployeeName}
                onRelieved={() => {
                    fetchSummary();
                    if (onRefresh) onRefresh();
                }}
            />

            {/* Post Shift Requirement Modal */}
            {site && (
                <PostShiftRequirementModal
                    isOpen={isShiftReqOpen}
                    onClose={() => {
                        setIsShiftReqOpen(false);
                        setSelectedPostForShiftReq(null);
                    }}
                    onSave={() => {
                        fetchSummary();
                        if (onRefresh) onRefresh();
                    }}
                    initialSiteId={site.id}
                    selectedPostId={selectedPostForShiftReq?.id}
                />
            )}
        </Modal>
    );
};
