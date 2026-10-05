import React, { useState, useEffect } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { apiClient, getUndeployedGuards, getActiveDeployedGuards, transferDeployment } from '../api';
import type { Deployment, OperationalSite, SecurityPost, ServiceContract, DesignationOption, UndeployedGuard, ActiveDeployedGuard } from '../types';

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

export const resolveDesignationId = (post: SecurityPost | null | undefined, desigList: DesignationOption[]): string => {
    if (!post || !desigList || desigList.length === 0) {
        return (post?.required_designation as string) || '';
    }

    // 1. Exact ID match if post.required_designation is already a valid designation ID
    if (post.required_designation) {
        const byId = desigList.find(d => String(d.id) === String(post.required_designation));
        if (byId) return byId.id;
    }

    // Candidate names from the post
    const candidates = [
        post.required_designation_name,
        post.post_name,
        typeof post.required_designation === 'string' ? post.required_designation : ''
    ].filter(Boolean) as string[];

    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

    // 2. Try exact normalized name match
    for (const c of candidates) {
        const normC = normalize(c);
        if (!normC) continue;
        const matched = desigList.find(d => normalize(d.name) === normC);
        if (matched) return matched.id;
    }

    // 3. Try containment / substring match
    for (const c of candidates) {
        const normC = normalize(c);
        if (!normC) continue;
        const matched = desigList.find(d => {
            const normD = normalize(d.name);
            return normD.includes(normC) || normC.includes(normD);
        });
        if (matched) return matched.id;
    }

    // 4. Keyword heuristic based on security workforce categories
    for (const c of candidates) {
        const lower = c.toLowerCase();
        if (lower.includes('ex-army') || lower.includes('army') || lower.includes('military') || lower.includes('forces')) {
            const exArmy = desigList.find(d => {
                const dl = d.name.toLowerCase();
                return dl.includes('army') || dl.includes('forces');
            });
            if (exArmy) return exArmy.id;
        }
        if (lower.includes('lady') || lower.includes('female') || lower.includes('searcher')) {
            const lady = desigList.find(d => {
                const dl = d.name.toLowerCase();
                return dl.includes('lady') || dl.includes('female');
            });
            if (lady) return lady.id;
        }
        if (lower.includes('supervisor')) {
            const sup = desigList.find(d => d.name.toLowerCase().includes('supervisor'));
            if (sup) return sup.id;
        }
        if (lower.includes('cctv')) {
            const cctv = desigList.find(d => d.name.toLowerCase().includes('cctv'));
            if (cctv) return cctv.id;
        }
        if (lower.includes('civil') || lower.includes('guard')) {
            const civil = desigList.find(d => {
                const dl = d.name.toLowerCase();
                return dl.includes('civil') || (dl.includes('guard') && !dl.includes('army') && !dl.includes('lady'));
            });
            if (civil) return civil.id;
        }
    }

    return (post.required_designation as string) || '';
};

export const DeploymentModal: React.FC<DeploymentModalProps> = ({
    isOpen, onClose, onSave, deployment, initialPostId, initialEmployeeId, initialSiteId
}) => {
    const [sites, setSites] = useState<OperationalSite[]>([]);
    const [sitePosts, setSitePosts] = useState<SecurityPost[]>([]);
    const [designations, setDesignations] = useState<DesignationOption[]>([]);
    const [guards, setGuards] = useState<UndeployedGuard[]>([]);
    const [deployedGuards, setDeployedGuards] = useState<ActiveDeployedGuard[]>([]);
    const [selectedTransferGuard, setSelectedTransferGuard] = useState<ActiveDeployedGuard | null>(null);
    const [sourceMode, setSourceMode] = useState<'UNDEPLOYED' | 'TRANSFER'>('UNDEPLOYED');
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
                fetchPostsForSite(deployment.site, deployment.post || undefined);
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
                    fetchPostsForSite(targetSite, targetPost);
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
            const res = await apiClient.get('/api/operations/sites/?is_active=true&page_size=1000');
            setSites(res.data.results || res.data || []);
        } catch (err) {
            console.error('Failed to fetch sites', err);
        }
        try {
            const res = await apiClient.get('/api/hrm/designations/?is_active=true&page_size=1000');
            setDesignations(res.data.results || res.data || []);
        } catch (err) {
            console.error('Failed to fetch designations', err);
        }
    };

    const fetchPostsForSite = async (siteId: string, preselectedPostId?: string) => {
        if (!siteId) { setSitePosts([]); return; }
        try {
            const res = await apiClient.get(`/api/operations/posts/?site=${siteId}&is_active=true&page_size=100`);
            const pList: SecurityPost[] = res.data.results || res.data || [];
            setSitePosts(pList);

            const activePostId = preselectedPostId || (pList.length === 1 ? pList[0].id : formData.post);
            if (activePostId) {
                const matched = pList.find(p => p.id === activePostId);
                if (matched) {
                    const postSal = matched.monthly_pay_rate ? Number(matched.monthly_pay_rate) : null;
                    const matchedDesig = resolveDesignationId(matched, designations);
                    setFormData(prev => ({
                        ...prev,
                        post: activePostId,
                        location_monthly_salary: postSal !== null ? postSal : prev.location_monthly_salary,
                        service_contract: matched.service_contract || prev.service_contract,
                        designation: matchedDesig || prev.designation
                    }));
                }
            }
        } catch {
            setSitePosts([]);
        }
    };

    // Auto-sync designation whenever post, posts list, or designations list change
    useEffect(() => {
        if (formData.post && sitePosts.length > 0 && designations.length > 0) {
            const selectedPost = sitePosts.find(p => p.id === formData.post);
            if (selectedPost) {
                const matchedDesigId = resolveDesignationId(selectedPost, designations);
                if (matchedDesigId && formData.designation !== matchedDesigId) {
                    setFormData(prev => ({
                        ...prev,
                        designation: matchedDesigId
                    }));
                }
            }
        }
    }, [formData.post, sitePosts, designations, formData.designation]);

    const fetchContractsForSite = async (siteId: string) => {
        if (!siteId) { setSiteContracts([]); return; }
        try {
            const res = await apiClient.get(`/api/operations/contracts/?status=ACTIVE&page_size=100`);
            const all: ServiceContract[] = res.data.results || res.data;
            const siteMatches = all.filter(c => c.sites?.includes(siteId));
            setSiteContracts(siteMatches);
            if (siteMatches.length > 0 && !formData.service_contract) {
                setFormData(prev => ({ ...prev, service_contract: siteMatches[0].id }));
            }
        } catch (err) {
            setSiteContracts([]);
        }
    };

    const fetchGuardsDebounced = async (search: string, postId?: string, siteId?: string) => {
        setLoadingEmployees(true);
        try {
            const effectivePost = postId || formData.post;
            const effectiveSite = siteId || formData.site;
            const params: any = {};
            if (search) params.search = search;
            if (effectivePost) params.post = effectivePost;
            else if (formData.designation) params.designation = formData.designation;

            // Fetch undeployed guards
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

            // Also fetch currently deployed guards for shift/transfer option
            try {
                const depRes = await getActiveDeployedGuards({
                    exclude_site: effectiveSite || undefined,
                    post: effectivePost || undefined,
                    search: search || undefined
                });
                setDeployedGuards(depRes.results || []);
            } catch (err) {
                console.error('Failed to fetch deployed guards for transfer', err);
            }
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
            setFormData(prev => ({ ...prev, site: value, post: '', designation: '', service_contract: null, location_monthly_salary: null }));
            fetchGuardsDebounced(empSearch, '');
        }
        if (name === 'post') {
            const selectedPost = sitePosts.find(p => p.id === value);
            if (selectedPost) {
                const postSal = selectedPost.monthly_pay_rate ? Number(selectedPost.monthly_pay_rate) : null;
                const matchedDesig = resolveDesignationId(selectedPost, designations);
                setFormData(prev => ({
                    ...prev,
                    post: value,
                    designation: matchedDesig || prev.designation,
                    location_monthly_salary: postSal !== null ? postSal : prev.location_monthly_salary,
                    service_contract: selectedPost.service_contract || prev.service_contract || (siteContracts[0]?.id || null),
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
            if (sourceMode === 'TRANSFER' && selectedTransferGuard && formData.site) {
                await transferDeployment(selectedTransferGuard.deployment_id, {
                    relieved_date: formData.start_date || new Date().toISOString().split('T')[0],
                    relief_reason: `Shifted to ${sites.find(s => s.id === formData.site)?.name || 'new site'}`,
                    new_site: formData.site,
                    new_post: formData.post || null,
                    new_contract: formData.service_contract || null,
                    new_designation: formData.designation || null,
                    new_location_monthly_salary: formData.location_monthly_salary ? Number(formData.location_monthly_salary) : null,
                    new_start_date: formData.start_date || new Date().toISOString().split('T')[0],
                    new_assignment_type: formData.assignment_type || 'PERMANENT',
                    notes: formData.notes || ''
                });
            } else if (deployment?.id) {
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

    const linkedContract = siteContracts.find(c => c.id === formData.service_contract) || siteContracts[0];

    const getInitials = (name?: string) => {
        if (!name) return 'GD';
        const parts = name.trim().split(' ');
        if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    };

    const selectedGuardObj = sourceMode === 'UNDEPLOYED'
        ? guards.find(g => g.id === formData.employee)
        : deployedGuards.find(g => g.id === formData.employee || g.deployment_id === selectedTransferGuard?.deployment_id);

    return (
        <Modal 
            isOpen={isOpen} 
            onClose={onClose} 
            title={deployment ? 'Edit Deployment' : 'New Workforce Deployment'}
            width="1000px"
        >
            <form onSubmit={handleSubmit} style={{ padding: '4px 6px' }}>
                {renderError()}

                {isEditActive && (
                    <div style={{
                        padding: '10px 14px',
                        borderRadius: '6px',
                        backgroundColor: 'rgba(234, 179, 8, 0.1)',
                        border: '1px solid rgba(234, 179, 8, 0.3)',
                        color: 'var(--color-warning, #eab308)',
                        fontSize: '13px',
                        marginBottom: '14px'
                    }}>
                        ⚠️ Active deployment: employee, site, and designation cannot be changed directly. Use Transfer or Relieve.
                    </div>
                )}

                {/* Section: Operational Site & Post */}
                <div style={{
                    background: 'var(--color-surface, #1e293b)',
                    border: '1px solid var(--color-border, #334155)',
                    borderRadius: '8px',
                    padding: '16px',
                    marginBottom: '16px'
                }}>
                    <h5 style={{ margin: '0 0 12px 0', fontSize: '13px', fontWeight: 600, color: 'var(--color-text, #f8fafc)' }}>
                        Location & Role Configuration
                    </h5>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                        {/* Site */}
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
                            marginBottom: '14px'
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

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', alignItems: 'center' }}>
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

                        {/* CRM-Locked Financial & Contract Display (Non-Editable for Operations) */}
                        <div style={{
                            background: 'var(--color-surface-elevated, rgba(255, 255, 255, 0.02))',
                            border: '1px solid var(--color-border)',
                            borderRadius: '6px',
                            padding: '10px 14px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '12px'
                        }}>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                        Monthly Salary Rate
                                    </span>
                                    <span style={{ fontSize: '9.5px', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>
                                        LOCKED BY CRM
                                    </span>
                                </div>
                                <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-primary, #3b82f6)', marginTop: '2px' }}>
                                    {formData.location_monthly_salary ? `PKR ${Number(formData.location_monthly_salary).toLocaleString()}` : 'Standard Rate'}
                                    <span style={{ fontSize: '12px', fontWeight: 400, color: 'var(--color-text-muted)', marginLeft: '4px' }}>/ month</span>
                                </div>
                                <div style={{ fontSize: '10.5px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                                    Daily attendance pay derived dynamically: <code>Monthly Salary ÷ Days in Month</code>
                                </div>
                            </div>

                            {linkedContract && (
                                <div style={{ textAlign: 'right', borderLeft: '1px solid var(--color-border)', paddingLeft: '14px' }}>
                                    <div style={{ fontSize: '10.5px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
                                        Service Contract
                                    </div>
                                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text, #f8fafc)', marginTop: '2px' }}>
                                        {linkedContract.contract_code}
                                    </div>
                                    <span style={{ fontSize: '9.5px', color: '#10b981', fontWeight: 600 }}>ACTIVE</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Section: Workforce Selection */}
                <div style={{
                    background: 'var(--color-surface, #1e293b)',
                    border: '1px solid var(--color-border, #334155)',
                    borderRadius: '8px',
                    padding: '16px',
                    marginBottom: '16px'
                }}>
                    <h5 style={{ margin: '0 0 12px 0', fontSize: '13px', fontWeight: 600, color: 'var(--color-text, #f8fafc)' }}>
                        Workforce Assignment
                    </h5>

                    {/* Guard Source Selection: Undeployed vs Shift/Transfer */}
                    {!deployment && (
                        <div style={{
                            display: 'flex',
                            gap: '8px',
                            marginBottom: '12px',
                            background: 'rgba(0, 0, 0, 0.2)',
                            padding: '4px',
                            borderRadius: '6px',
                            border: '1px solid var(--color-border, #334155)'
                        }}>
                            <button
                                type="button"
                                onClick={() => {
                                    setSourceMode('UNDEPLOYED');
                                    setSelectedTransferGuard(null);
                                    setFormData(prev => ({ ...prev, employee: '' }));
                                }}
                                style={{
                                    flex: 1,
                                    padding: '8px 12px',
                                    borderRadius: '4px',
                                    border: 'none',
                                    fontWeight: 600,
                                    fontSize: '13px',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease',
                                    background: sourceMode === 'UNDEPLOYED' ? 'var(--color-primary, #3b82f6)' : 'transparent',
                                    color: sourceMode === 'UNDEPLOYED' ? '#ffffff' : 'var(--color-text-secondary, #94a3b8)'
                                }}
                            >
                                🟢 Undeployed Guards ({guards.length})
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setSourceMode('TRANSFER');
                                    setFormData(prev => ({ ...prev, employee: '' }));
                                }}
                                style={{
                                    flex: 1,
                                    padding: '8px 12px',
                                    borderRadius: '4px',
                                    border: 'none',
                                    fontWeight: 600,
                                    fontSize: '13px',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease',
                                    background: sourceMode === 'TRANSFER' ? 'var(--color-primary, #3b82f6)' : 'transparent',
                                    color: sourceMode === 'TRANSFER' ? '#ffffff' : 'var(--color-text-secondary, #94a3b8)'
                                }}
                            >
                                🔄 Transfer / Shift Active Guard ({deployedGuards.length})
                            </button>
                        </div>
                    )}

                    {/* Mode A: Undeployed Guard Selection */}
                    {sourceMode === 'UNDEPLOYED' && (
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <label className="form-label" style={{ fontWeight: 700, margin: 0 }}>
                                    Undeployed Guard / Employee <span style={{ color: 'var(--color-danger)' }}>*</span>
                                </label>
                                <span style={{ fontSize: '12px', color: 'var(--color-primary)', fontWeight: 600 }}>
                                    {loadingEmployees ? 'Searching pool...' : `${guards.length} Available in Pool`}
                                </span>
                            </div>

                            {/* Selected Guard Highlight Banner */}
                            {selectedGuardObj && (
                                <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    padding: '10px 14px',
                                    borderRadius: '8px',
                                    background: 'rgba(59, 130, 246, 0.08)',
                                    border: '1.5px solid var(--color-primary)',
                                    marginBottom: '10px'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <div style={{
                                            width: '36px',
                                            height: '36px',
                                            borderRadius: '50%',
                                            background: 'var(--color-primary)',
                                            color: '#ffffff',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontWeight: 700,
                                            fontSize: '13px'
                                        }}>
                                            {getInitials(selectedGuardObj.full_name)}
                                        </div>
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--color-text)' }}>
                                                    {selectedGuardObj.full_name}
                                                </span>
                                                <span style={{
                                                    fontSize: '11px',
                                                    padding: '2px 8px',
                                                    borderRadius: '4px',
                                                    fontWeight: 600,
                                                    background: (selectedGuardObj.background_type || '').toLowerCase().includes('army') 
                                                        ? 'rgba(59, 130, 246, 0.15)' 
                                                        : 'rgba(16, 185, 129, 0.15)',
                                                    color: (selectedGuardObj.background_type || '').toLowerCase().includes('army') 
                                                        ? '#3b82f6' 
                                                        : '#10b981'
                                                }}>
                                                    {selectedGuardObj.background_type_display || selectedGuardObj.background_type || 'Civilian'}
                                                </span>
                                            </div>
                                            <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                                                Code: <strong style={{ color: 'var(--color-text)' }}>{selectedGuardObj.employee_code}</strong> • {selectedGuardObj.designation_name || 'Security Guard'}
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ fontSize: '12px', color: '#10b981', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            ✓ Selected
                                        </span>
                                        {!isEditActive && (
                                            <button
                                                type="button"
                                                onClick={() => setFormData(prev => ({ ...prev, employee: '' }))}
                                                style={{
                                                    padding: '3px 8px',
                                                    borderRadius: '4px',
                                                    border: '1px solid var(--color-border)',
                                                    background: 'var(--color-surface)',
                                                    color: 'var(--color-text-muted)',
                                                    fontSize: '11px',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                Change
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Search Input with Clear Button */}
                            <div style={{ position: 'relative', marginBottom: '8px' }}>
                                <input
                                    type="text"
                                    placeholder="Search undeployed guard by name, code (e.g. 042184), or CNIC..."
                                    value={empSearch}
                                    onChange={e => setEmpSearch(e.target.value)}
                                    className="input-base"
                                    style={{ paddingRight: empSearch ? '30px' : '10px' }}
                                    disabled={isEditActive}
                                />
                                {empSearch && !isEditActive && (
                                    <button
                                        type="button"
                                        onClick={() => setEmpSearch('')}
                                        style={{
                                            position: 'absolute',
                                            right: '8px',
                                            top: '50%',
                                            transform: 'translateY(-50%)',
                                            background: 'none',
                                            border: 'none',
                                            color: 'var(--color-text-muted)',
                                            cursor: 'pointer',
                                            fontSize: '13px'
                                        }}
                                    >
                                        ✕
                                    </button>
                                )}
                            </div>

                            {/* Scrollable Card List of Guards */}
                            <div style={{
                                maxHeight: '230px',
                                overflowY: 'auto',
                                border: '1px solid var(--color-border)',
                                borderRadius: '6px',
                                background: 'var(--color-surface)',
                                padding: '6px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '4px'
                            }}>
                                {loadingEmployees ? (
                                    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '13px' }}>
                                        <i className="bx bx-loader-alt bx-spin" style={{ marginRight: '6px' }}></i>
                                        Searching undeployed workforce...
                                    </div>
                                ) : guards.length === 0 ? (
                                    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '13px' }}>
                                        No matching undeployed guards found in this pool.
                                    </div>
                                ) : (
                                    guards.map(g => {
                                        const isSelected = formData.employee === g.id;
                                        const isMilitary = (g.background_type || '').toLowerCase().includes('army') || (g.background_type || '').toLowerCase().includes('military');
                                        const isLady = (g.gender || '').toLowerCase() === 'female' || (g.designation_name || '').toLowerCase().includes('lady');

                                        return (
                                            <div
                                                key={g.id}
                                                onClick={() => {
                                                    if (isEditActive) return;
                                                    setFormData(prev => ({
                                                        ...prev,
                                                        employee: g.id,
                                                        designation: prev.designation || g.designation_id || prev.designation
                                                    }));
                                                }}
                                                style={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    padding: '8px 12px',
                                                    borderRadius: '6px',
                                                    border: isSelected ? '1.5px solid var(--color-primary)' : '1px solid var(--color-border)',
                                                    background: isSelected ? 'rgba(59, 130, 246, 0.08)' : 'var(--color-surface-hover, rgba(255,255,255,0.02))',
                                                    cursor: isEditActive ? 'not-allowed' : 'pointer',
                                                    transition: 'all 0.15s ease'
                                                }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                    <div style={{
                                                        width: '32px',
                                                        height: '32px',
                                                        borderRadius: '50%',
                                                        background: isSelected ? 'var(--color-primary)' : 'var(--color-surface-secondary)',
                                                        color: isSelected ? '#ffffff' : 'var(--color-text)',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        fontWeight: 700,
                                                        fontSize: '11.5px'
                                                    }}>
                                                        {getInitials(g.full_name)}
                                                    </div>
                                                    <div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <span style={{ fontSize: '13px', fontWeight: isSelected ? 700 : 600, color: 'var(--color-text)' }}>
                                                                {g.full_name}
                                                            </span>
                                                            <span style={{
                                                                fontSize: '10.5px',
                                                                padding: '1px 6px',
                                                                borderRadius: '4px',
                                                                fontWeight: 600,
                                                                background: isMilitary 
                                                                    ? 'rgba(59, 130, 246, 0.15)' 
                                                                    : isLady 
                                                                        ? 'rgba(236, 72, 153, 0.15)' 
                                                                        : 'rgba(16, 185, 129, 0.15)',
                                                                color: isMilitary ? '#3b82f6' : isLady ? '#ec4899' : '#10b981'
                                                            }}>
                                                                {g.background_type_display || g.background_type || 'Civilian'}
                                                            </span>
                                                        </div>
                                                        <div style={{ fontSize: '11.5px', color: 'var(--color-text-secondary)', marginTop: '1px' }}>
                                                            Code: <strong style={{ color: 'var(--color-text)' }}>{g.employee_code}</strong> • {g.designation_name || 'Guard'}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <div style={{
                                                        width: '18px',
                                                        height: '18px',
                                                        borderRadius: '50%',
                                                        border: isSelected ? '5px solid var(--color-primary)' : '2px solid var(--color-border)',
                                                        background: 'var(--color-surface)'
                                                    }} />
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                            <input type="hidden" name="employee" value={formData.employee || ''} required={sourceMode === 'UNDEPLOYED'} />
                        </div>
                    )}

                    {/* Mode B: Shift / Transfer Guard from Another Site */}
                    {sourceMode === 'TRANSFER' && (
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <label className="form-label" style={{ fontWeight: 700, margin: 0 }}>
                                    Currently Deployed Guard (to Shift/Transfer) <span style={{ color: 'var(--color-danger)' }}>*</span>
                                </label>
                                <span style={{ fontSize: '12px', color: 'var(--color-primary)', fontWeight: 600 }}>
                                    {loadingEmployees ? 'Searching active guards...' : `${deployedGuards.length} Available at other sites`}
                                </span>
                            </div>

                            {/* Selected Transfer Guard Highlight Banner */}
                            {selectedTransferGuard && (
                                <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    padding: '10px 14px',
                                    borderRadius: '8px',
                                    background: 'rgba(59, 130, 246, 0.08)',
                                    border: '1.5px solid var(--color-primary)',
                                    marginBottom: '10px'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <div style={{
                                            width: '36px',
                                            height: '36px',
                                            borderRadius: '50%',
                                            background: 'var(--color-primary)',
                                            color: '#ffffff',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontWeight: 700,
                                            fontSize: '13px'
                                        }}>
                                            {getInitials(selectedTransferGuard.full_name)}
                                        </div>
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--color-text)' }}>
                                                    {selectedTransferGuard.full_name}
                                                </span>
                                                <span style={{
                                                    fontSize: '11px',
                                                    padding: '2px 8px',
                                                    borderRadius: '4px',
                                                    fontWeight: 600,
                                                    background: 'rgba(59, 130, 246, 0.15)',
                                                    color: '#3b82f6'
                                                }}>
                                                    Shift from {selectedTransferGuard.current_site_name}
                                                </span>
                                            </div>
                                            <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                                                Code: <strong style={{ color: 'var(--color-text)' }}>{selectedTransferGuard.employee_code}</strong> • Post: {selectedTransferGuard.current_post_name} • Current Salary: PKR {selectedTransferGuard.current_monthly_salary ? selectedTransferGuard.current_monthly_salary.toLocaleString() : '0'}/mo
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ fontSize: '12px', color: '#10b981', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            ✓ Selected
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setSelectedTransferGuard(null);
                                                setFormData(prev => ({ ...prev, employee: '' }));
                                            }}
                                            style={{
                                                padding: '3px 8px',
                                                borderRadius: '4px',
                                                border: '1px solid var(--color-border)',
                                                background: 'var(--color-surface)',
                                                color: 'var(--color-text-muted)',
                                                fontSize: '11px',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            Change
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Search Input with Clear Button */}
                            <div style={{ position: 'relative', marginBottom: '8px' }}>
                                <input
                                    type="text"
                                    placeholder="Search active guard by name, code, or current site..."
                                    value={empSearch}
                                    onChange={e => setEmpSearch(e.target.value)}
                                    className="input-base"
                                    style={{ paddingRight: empSearch ? '30px' : '10px' }}
                                />
                                {empSearch && (
                                    <button
                                        type="button"
                                        onClick={() => setEmpSearch('')}
                                        style={{
                                            position: 'absolute',
                                            right: '8px',
                                            top: '50%',
                                            transform: 'translateY(-50%)',
                                            background: 'none',
                                            border: 'none',
                                            color: 'var(--color-text-muted)',
                                            cursor: 'pointer',
                                            fontSize: '13px'
                                        }}
                                    >
                                        ✕
                                    </button>
                                )}
                            </div>

                            {/* Scrollable Card List of Deployed Guards to Transfer */}
                            <div style={{
                                maxHeight: '230px',
                                overflowY: 'auto',
                                border: '1px solid var(--color-border)',
                                borderRadius: '6px',
                                background: 'var(--color-surface)',
                                padding: '6px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '4px'
                            }}>
                                {loadingEmployees ? (
                                    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '13px' }}>
                                        <i className="bx bx-loader-alt bx-spin" style={{ marginRight: '6px' }}></i>
                                        Searching deployed workforce...
                                    </div>
                                ) : deployedGuards.length === 0 ? (
                                    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '13px' }}>
                                        No deployed guards found at other sites matching search.
                                    </div>
                                ) : (
                                    deployedGuards.map(g => {
                                        const isSelected = selectedTransferGuard?.deployment_id === g.deployment_id;

                                        return (
                                            <div
                                                key={g.deployment_id}
                                                onClick={() => {
                                                    setSelectedTransferGuard(g);
                                                    setFormData(prev => ({
                                                        ...prev,
                                                        employee: g.id,
                                                        designation: g.designation_id || prev.designation
                                                    }));
                                                }}
                                                style={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    padding: '8px 12px',
                                                    borderRadius: '6px',
                                                    border: isSelected ? '1.5px solid var(--color-primary)' : '1px solid var(--color-border)',
                                                    background: isSelected ? 'rgba(59, 130, 246, 0.08)' : 'var(--color-surface-hover, rgba(255,255,255,0.02))',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.15s ease'
                                                }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                    <div style={{
                                                        width: '32px',
                                                        height: '32px',
                                                        borderRadius: '50%',
                                                        background: isSelected ? 'var(--color-primary)' : 'var(--color-surface-secondary)',
                                                        color: isSelected ? '#ffffff' : 'var(--color-text)',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        fontWeight: 700,
                                                        fontSize: '11.5px'
                                                    }}>
                                                        {getInitials(g.full_name)}
                                                    </div>
                                                    <div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <span style={{ fontSize: '13px', fontWeight: isSelected ? 700 : 600, color: 'var(--color-text)' }}>
                                                                {g.full_name}
                                                            </span>
                                                            <span style={{ fontSize: '11px', color: 'var(--color-primary)', fontWeight: 600 }}>
                                                                @ {g.current_site_name}
                                                            </span>
                                                        </div>
                                                        <div style={{ fontSize: '11.5px', color: 'var(--color-text-secondary)', marginTop: '1px' }}>
                                                            Code: <strong style={{ color: 'var(--color-text)' }}>{g.employee_code}</strong> • Post: {g.current_post_name} • Salary: PKR {g.current_monthly_salary ? g.current_monthly_salary.toLocaleString() : '0'}/mo
                                                        </div>
                                                    </div>
                                                </div>

                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <div style={{
                                                        width: '18px',
                                                        height: '18px',
                                                        borderRadius: '50%',
                                                        border: isSelected ? '5px solid var(--color-primary)' : '2px solid var(--color-border)',
                                                        background: 'var(--color-surface)'
                                                    }} />
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                            <input type="hidden" name="employee" value={formData.employee || ''} required={sourceMode === 'TRANSFER'} />

                            {selectedTransferGuard && (
                                <div style={{
                                    marginTop: '10px',
                                    padding: '12px 14px',
                                    borderRadius: '6px',
                                    background: 'rgba(59, 130, 246, 0.08)',
                                    border: '1px solid rgba(59, 130, 246, 0.3)',
                                    fontSize: '12px',
                                    lineHeight: '1.5'
                                }}>
                                    <div style={{ fontWeight: 600, color: 'var(--color-primary)', marginBottom: '4px' }}>
                                        🔄 Guard Shift & Rate Re-allocation:
                                    </div>
                                    <div>• <strong>Current Location:</strong> {selectedTransferGuard.current_site_name} (Post: {selectedTransferGuard.current_post_name})</div>
                                    <div>• <strong>Current Salary:</strong> PKR {selectedTransferGuard.current_monthly_salary ? selectedTransferGuard.current_monthly_salary.toLocaleString() : '0'} / month</div>
                                    <div>• <strong>Target Location:</strong> {sites.find(s => s.id === formData.site)?.name || 'Selected Site'}</div>
                                    <div>• <strong>Target Salary:</strong> PKR {formData.location_monthly_salary ? Number(formData.location_monthly_salary).toLocaleString() : '0'} / month (CRM Locked)</div>
                                    <div style={{ color: 'var(--color-text-secondary)', marginTop: '6px', fontStyle: 'italic' }}>
                                        Notice: The previous deployment at {selectedTransferGuard.current_site_name} will automatically close as of yesterday.
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Section: Dates, Status & Assignment Type */}
                <div style={{
                    background: 'var(--color-surface, #1e293b)',
                    border: '1px solid var(--color-border, #334155)',
                    borderRadius: '8px',
                    padding: '16px',
                    marginBottom: '16px'
                }}>
                    <h5 style={{ margin: '0 0 12px 0', fontSize: '13px', fontWeight: 600, color: 'var(--color-text, #f8fafc)' }}>
                        Deployment Timeline & Contractual Terms
                    </h5>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                        <Input
                            label="Start Date *"
                            type="date"
                            name="start_date"
                            value={formData.start_date || ''}
                            onChange={handleChange}
                            required
                        />
                        <Input
                            label="End Date (Optional)"
                            type="date"
                            name="end_date"
                            value={formData.end_date || ''}
                            onChange={handleChange}
                        />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                        <div className="form-field">
                            <label className="form-label" style={{ fontWeight: 600 }}>Deployment Status</label>
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
                            <label className="form-label" style={{ fontWeight: 600 }}>Assignment Type</label>
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
                        <label className="form-label" style={{ fontWeight: 600 }}>Notes / Instructions</label>
                        <textarea
                            name="notes"
                            value={formData.notes || ''}
                            onChange={handleChange}
                            className="input-base"
                            rows={2}
                            placeholder="Deployment notes or site specific instructions..."
                        />
                    </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingTop: '8px' }}>
                    <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button type="submit" variant="primary" loading={loading}>
                        {deployment ? 'Save Changes' : 'Deploy to Location'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
};
