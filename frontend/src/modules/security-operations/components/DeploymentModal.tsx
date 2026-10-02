import React, { useState, useEffect } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { apiClient, getUndeployedGuards } from '../api';
import type { Deployment, OperationalSite, SecurityPost, ServiceContract, DesignationOption, UndeployedGuard } from '../types';

interface DeploymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: () => void;
    deployment: Deployment | null;
    initialPostId?: string;
    initialEmployeeId?: string;
    initialSiteId?: string;
}

const DEPLOYMENT_STATUSES = ['DRAFT', 'PLANNED', 'ACTIVE', 'COMPLETED', 'RELIEVED', 'CANCELLED'] as const;

export const DeploymentModal: React.FC<DeploymentModalProps> = ({
    isOpen, onClose, onSave, deployment, initialPostId, initialEmployeeId, initialSiteId
}) => {
    const [sites, setSites] = useState<OperationalSite[]>([]);
    const [sitePosts, setSitePosts] = useState<SecurityPost[]>([]);
    const [designations, setDesignations] = useState<DesignationOption[]>([]);
    const [guards, setGuards] = useState<UndeployedGuard[]>([]);
    const [empSearch, setEmpSearch] = useState('');
    const [loadingEmployees, setLoadingEmployees] = useState(false);

    const [formData, setFormData] = useState<Partial<Deployment>>({
        employee: initialEmployeeId || '',
        site: initialSiteId || '',
        post: initialPostId || '',
        service_contract: null,
        designation: '',
        location_monthly_salary: null,
        assignment_type: 'PERMANENT',
        start_date: new Date().toISOString().split('T')[0],
        end_date: null,
        status: 'ACTIVE',
        notes: '',
    });

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | Record<string, string[]> | null>(null);
    const [siteContracts, setSiteContracts] = useState<ServiceContract[]>([]);

    useEffect(() => {
        if (isOpen) {
            fetchStaticData();
            if (deployment) {
                setFormData({
                    employee: deployment.employee,
                    site: deployment.site,
                    post: deployment.post || '',
                    service_contract: deployment.service_contract,
                    designation: deployment.designation,
                    location_monthly_salary: deployment.location_monthly_salary || null,
                    assignment_type: deployment.assignment_type || 'PERMANENT',
                    start_date: deployment.start_date,
                    end_date: deployment.end_date,
                    status: deployment.status,
                    notes: deployment.notes || '',
                });
                fetchContractsForSite(deployment.site);
                fetchPostsForSite(deployment.site);
                fetchGuardsDebounced('', deployment.post || undefined);
            } else {
                const targetSite = initialSiteId || '';
                const targetPost = initialPostId || '';
                const targetEmp = initialEmployeeId || '';

                setFormData({
                    employee: targetEmp,
                    site: targetSite,
                    post: targetPost,
                    service_contract: null,
                    designation: '',
                    location_monthly_salary: null,
                    assignment_type: 'PERMANENT',
                    start_date: new Date().toISOString().split('T')[0],
                    end_date: null,
                    status: 'ACTIVE',
                    notes: '',
                });

                if (targetSite) {
                    fetchContractsForSite(targetSite);
                    fetchPostsForSite(targetSite);
                } else {
                    setSiteContracts([]);
                    setSitePosts([]);
                }
                fetchGuardsDebounced('', targetPost || undefined);
            }
            setError(null);
        }
    }, [isOpen, deployment, initialPostId, initialEmployeeId, initialSiteId]);

    const fetchStaticData = async () => {
        try {
            const [sitesRes, desigRes] = await Promise.all([
                apiClient.get('/api/operations/sites/?is_active=true&page_size=200'),
                apiClient.get('/api/hrm/designations/?is_active=true&page_size=200'),
            ]);
            setSites(sitesRes.data.results || sitesRes.data);
            setDesignations(desigRes.data.results || desigRes.data);
        } catch (err) {
            console.error('Failed to fetch static data', err);
        }
    };

    const fetchPostsForSite = async (siteId: string) => {
        if (!siteId) { setSitePosts([]); return; }
        try {
            const res = await apiClient.get(`/api/operations/posts/?site=${siteId}&is_active=true&page_size=100`);
            const pList: SecurityPost[] = res.data.results || res.data;
            setSitePosts(pList);

            if (formData.post) {
                const matched = pList.find(p => p.id === formData.post);
                if (matched && matched.monthly_pay_rate && !formData.location_monthly_salary) {
                    setFormData(prev => ({ ...prev, location_monthly_salary: Number(matched.monthly_pay_rate) }));
                }
            }
        } catch {
            setSitePosts([]);
        }
    };

    const fetchContractsForSite = async (siteId: string) => {
        if (!siteId) { setSiteContracts([]); return; }
        try {
            const res = await apiClient.get(`/api/operations/contracts/?status=ACTIVE&page_size=100`);
            const all: ServiceContract[] = res.data.results || res.data;
            setSiteContracts(all.filter(c => c.sites?.includes(siteId)));
        } catch (err) {
            setSiteContracts([]);
        }
    };

    const fetchGuardsDebounced = async (search: string, postId?: string) => {
        setLoadingEmployees(true);
        try {
            const params: any = {};
            if (search) params.search = search;
            if (postId) params.post = postId;
            else if (formData.post) params.post = formData.post;
            else if (formData.designation) params.designation = formData.designation;

            const res = await getUndeployedGuards(params);
            let list = res.results || [];

            // If editing an existing deployment, preserve the currently assigned guard in the choices
            if (deployment?.employee && !list.some(g => g.id === deployment.employee)) {
                list = [{
                    id: deployment.employee,
                    full_name: deployment.employee_name || 'Current Assigned Guard',
                    employee_code: deployment.employee_code || '',
                    designation_name: deployment.designation_name || '',
                    background_type: 'ASSIGNED',
                    background_type_display: 'Currently Assigned',
                    gender: 'MALE',
                    status: 'ACTIVE'
                }, ...list];
            }
            setGuards(list);
        } catch (err) {
            console.error('Failed to fetch undeployed guards', err);
        } finally {
            setLoadingEmployees(false);
        }
    };

    useEffect(() => {
        const t = setTimeout(() => {
            if (isOpen) fetchGuardsDebounced(empSearch, formData.post || undefined);
        }, 400);
        return () => clearTimeout(t);
    }, [empSearch, formData.post, formData.designation, isOpen]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value || null }));

        if (name === 'site') {
            fetchContractsForSite(value);
            fetchPostsForSite(value);
            setFormData(prev => ({ ...prev, site: value, post: '', service_contract: null, location_monthly_salary: null }));
            fetchGuardsDebounced(empSearch, '');
        }
        if (name === 'post') {
            const selectedPost = sitePosts.find(p => p.id === value);
            if (selectedPost) {
                const postSal = selectedPost.monthly_pay_rate ? Number(selectedPost.monthly_pay_rate) : null;
                setFormData(prev => ({
                    ...prev,
                    post: value,
                    designation: selectedPost.required_designation || prev.designation,
                    location_monthly_salary: postSal !== null ? postSal : prev.location_monthly_salary,
                    service_contract: selectedPost.service_contract || prev.service_contract,
                    employee: ''
                }));
                fetchGuardsDebounced(empSearch, value);
            } else {
                setFormData(prev => ({ ...prev, post: value }));
                fetchGuardsDebounced(empSearch, '');
            }
        }
        if (name === 'designation') {
            setFormData(prev => ({ ...prev, designation: value, employee: '' }));
            fetchGuardsDebounced(empSearch, formData.post || undefined);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        const payload = {
            ...formData,
            post: formData.post || null,
            end_date: formData.end_date || null,
            service_contract: formData.service_contract || null,
            location_monthly_salary: formData.location_monthly_salary ? Number(formData.location_monthly_salary) : null,
        };

        try {
            if (deployment?.id) {
                await apiClient.patch(`/api/operations/deployments/${deployment.id}/`, payload);
            } else {
                await apiClient.post('/api/operations/deployments/', payload);
            }
            onSave();
            onClose();
        } catch (err: any) {
            const errData = err.response?.data;
            setError(errData || 'Failed to save deployment');
        } finally {
            setLoading(false);
        }
    };

    const renderError = () => {
        if (!error) return null;
        if (typeof error === 'string') return <div className="text-red-500 text-sm mb-3">{error}</div>;
        return (
            <div className="text-red-500 text-sm mb-3">
                {Object.entries(error).map(([k, v]) => (
                    <div key={k}><strong>{k}:</strong> {Array.isArray(v) ? v.join(', ') : String(v)}</div>
                ))}
            </div>
        );
    };

    const isEditActive = deployment?.status === 'ACTIVE';
    const activeSelectedPost = sitePosts.find(p => p.id === formData.post);
    const postReqText = activeSelectedPost ? `${activeSelectedPost.post_name} ${activeSelectedPost.required_designation_name || ''}`.toLowerCase() : '';
    const isExArmyPost = activeSelectedPost && (postReqText.includes('ex') || postReqText.includes('army') || postReqText.includes('military'));
    const isCivilPost = activeSelectedPost && postReqText.includes('civil') && !isExArmyPost;
    const isLadyPost = activeSelectedPost && (postReqText.includes('lady') || postReqText.includes('searcher') || postReqText.includes('female'));

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={deployment ? 'Edit Deployment' : 'New Workforce Deployment'}>
            <form onSubmit={handleSubmit} className="space-y-4 p-4" style={{ maxHeight: '82vh', overflowY: 'auto' }}>
                {renderError()}

                {isEditActive && (
                    <div style={{
                        padding: '10px 14px',
                        borderRadius: '6px',
                        backgroundColor: 'rgba(234, 179, 8, 0.1)',
                        border: '1px solid rgba(234, 179, 8, 0.3)',
                        color: 'var(--color-warning, #eab308)',
                        fontSize: '13px',
                        marginBottom: '12px'
                    }}>
                        ⚠️ Active deployment: employee, site, and designation cannot be changed.
                    </div>
                )}

                {/* Site (Location from CRM) */}
                <div className="form-field">
                    <label className="form-label" style={{ fontWeight: 600 }}>
                        Client Location / Site <span style={{ color: 'var(--color-danger)' }}>*</span>
                    </label>
                    <select
                        name="site"
                        value={formData.site || ''}
                        onChange={handleChange}
                        className="input-base"
                        required
                        disabled={isEditActive}
                    >
                        <option value="">Select Operational Site / Location</option>
                        {sites.map(s => (
                            <option key={s.id} value={s.id}>{s.name}{s.customer_name ? ` (${s.customer_name})` : ''}</option>
                        ))}
                    </select>
                    <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                        Sites are synced automatically from CRM Client Locations.
                    </span>
                </div>

                {/* Security Post Requirements */}
                <div className="form-field">
                    <label className="form-label" style={{ fontWeight: 600 }}>
                        Post / Service Requirement
                    </label>
                    <select
                        name="post"
                        value={formData.post || ''}
                        onChange={handleChange}
                        className="input-base"
                        disabled={isEditActive || !formData.site}
                    >
                        <option value="">-- General / Unassigned Post --</option>
                        {sitePosts.map(p => (
                            <option key={p.id} value={p.id}>
                                {p.post_name} — Req: {p.required_headcount} {p.required_designation_name ? `(${p.required_designation_name})` : ''} {p.monthly_pay_rate ? `| PKR ${Number(p.monthly_pay_rate).toLocaleString()}/mo` : ''}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Post Requirement Guidance Banner */}
                {activeSelectedPost && (
                    <div style={{
                        padding: '10px 14px',
                        borderRadius: '6px',
                        backgroundColor: isExArmyPost ? 'rgba(59, 130, 246, 0.1)' : isCivilPost ? 'rgba(16, 185, 129, 0.1)' : isLadyPost ? 'rgba(236, 72, 153, 0.1)' : 'rgba(99, 102, 241, 0.1)',
                        border: `1px solid ${isExArmyPost ? 'rgba(59, 130, 246, 0.3)' : isCivilPost ? 'rgba(16, 185, 129, 0.3)' : isLadyPost ? 'rgba(236, 72, 153, 0.3)' : 'rgba(99, 102, 241, 0.3)'}`,
                        fontSize: '12px',
                        lineHeight: 1.4,
                    }}>
                        {isExArmyPost && (
                            <div style={{ color: '#3b82f6', fontWeight: 600 }}>
                                🎖️ Ex-Army / Armed Forces Post: Strict filter active. Only undeployed Ex-Army / Forces personnel are listed.
                            </div>
                        )}
                        {isCivilPost && (
                            <div style={{ color: '#10b981', fontWeight: 600 }}>
                                🏢 Civilian Security Post: Strict filter active. Only undeployed Civilian guards are listed.
                            </div>
                        )}
                        {isLadyPost && (
                            <div style={{ color: '#ec4899', fontWeight: 600 }}>
                                👩 Lady Guard / Searcher Post: Strict filter active. Only undeployed Female workforce are listed.
                            </div>
                        )}
                        {!isExArmyPost && !isCivilPost && !isLadyPost && (
                            <div style={{ color: 'var(--color-primary)' }}>
                                📋 Post: {activeSelectedPost.post_name} | Required: {activeSelectedPost.required_headcount} personnel
                            </div>
                        )}
                    </div>
                )}

                {/* Designation */}
                <div className="form-field">
                    <label className="form-label" style={{ fontWeight: 600 }}>
                        Designation / Role <span style={{ color: 'var(--color-danger)' }}>*</span>
                    </label>
                    <select
                        name="designation"
                        value={formData.designation || ''}
                        onChange={handleChange}
                        className="input-base"
                        required
                        disabled={isEditActive}
                    >
                        <option value="">Select Designation</option>
                        {designations.map(d => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                    </select>
                </div>

                {/* Undeployed Guard Selection */}
                <div className="form-field">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <label className="form-label" style={{ fontWeight: 600, margin: 0 }}>
                            Undeployed Guard / Employee <span style={{ color: 'var(--color-danger)' }}>*</span>
                        </label>
                        <span style={{ fontSize: '12px', color: 'var(--color-primary)', fontWeight: 500 }}>
                            {loadingEmployees ? 'Searching pool...' : `${guards.length} Available Undeployed`}
                        </span>
                    </div>

                    <input
                        type="text"
                        placeholder="Search undeployed guard by name or code..."
                        value={empSearch}
                        onChange={e => setEmpSearch(e.target.value)}
                        className="input-base"
                        style={{ marginBottom: '8px' }}
                        disabled={isEditActive}
                    />

                    <select
                        name="employee"
                        value={formData.employee || ''}
                        onChange={handleChange}
                        className="input-base"
                        required
                        size={5}
                        disabled={isEditActive}
                        style={{ fontFamily: 'monospace', fontSize: '13px' }}
                    >
                        <option value="">-- Choose from Undeployed Pool --</option>
                        {loadingEmployees && <option disabled>Loading undeployed workforce...</option>}
                        {guards.map(g => (
                            <option key={g.id} value={g.id}>
                                {g.full_name} [{g.background_type_display || g.background_type}] - {g.employee_code} ({g.designation_name || 'Guard'})
                            </option>
                        ))}
                        {!loadingEmployees && guards.length === 0 && (
                            <option disabled>No matching undeployed guards found</option>
                        )}
                    </select>
                </div>

                {/* Location Monthly Salary */}
                <div className="form-field">
                    <label className="form-label" style={{ fontWeight: 600 }}>
                        Location Monthly Salary (PKR)
                    </label>
                    <Input
                        type="number"
                        name="location_monthly_salary"
                        value={formData.location_monthly_salary ?? ''}
                        onChange={handleChange}
                        placeholder="e.g. 40000"
                        min="0"
                        step="100"
                    />
                    <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                        Monthly salary assigned to this guard at this location. Daily attendance pay will be derived dynamically: <code>Monthly Salary ÷ Days in Month</code> (28, 29, 30, or 31).
                    </span>
                </div>

                {/* Service Contract (optional, auto-linked from CRM) */}
                {siteContracts.length > 0 && (
                    <div className="form-field">
                        <label className="form-label">Service Contract</label>
                        <select
                            name="service_contract"
                            value={formData.service_contract || ''}
                            onChange={handleChange}
                            className="input-base"
                        >
                            <option value="">None / Default Contract</option>
                            {siteContracts.map(c => (
                                <option key={c.id} value={c.id}>{c.contract_code} - {c.status}</option>
                            ))}
                        </select>
                    </div>
                )}

                {/* Dates */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <Input
                        label="Start Date *"
                        type="date"
                        name="start_date"
                        value={formData.start_date || ''}
                        onChange={handleChange}
                        required
                    />
                    <Input
                        label="End Date"
                        type="date"
                        name="end_date"
                        value={formData.end_date || ''}
                        onChange={handleChange}
                    />
                </div>

                {/* Status and Assignment Type */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div className="form-field">
                        <label className="form-label">Deployment Status</label>
                        <select
                            name="status"
                            value={formData.status || 'ACTIVE'}
                            onChange={handleChange}
                            className="input-base"
                        >
                            {DEPLOYMENT_STATUSES.map(s => (
                                <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>
                            ))}
                        </select>
                    </div>

                    <div className="form-field">
                        <label className="form-label">Assignment Type</label>
                        <select
                            name="assignment_type"
                            value={formData.assignment_type || 'PERMANENT'}
                            onChange={handleChange}
                            className="input-base"
                        >
                            <option value="PERMANENT">Permanent</option>
                            <option value="TEMPORARY">Temporary</option>
                            <option value="RELIEVER">Reliever</option>
                        </select>
                    </div>
                </div>

                {/* Notes */}
                <div className="form-field">
                    <label className="form-label">Notes / Instructions</label>
                    <textarea
                        name="notes"
                        value={formData.notes || ''}
                        onChange={handleChange}
                        className="input-base"
                        rows={2}
                        placeholder="Deployment notes or client instructions..."
                    />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingTop: '16px' }}>
                    <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button type="submit" variant="primary" loading={loading}>
                        {deployment ? 'Save Changes' : 'Deploy to Location'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
};
