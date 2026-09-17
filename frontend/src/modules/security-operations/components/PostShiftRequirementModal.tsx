import React, { useState, useEffect, useCallback } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Badge } from '../../../components/ui/Badge';
import { 
    getPostShiftRequirements, 
    createPostShiftRequirement, 
    updatePostShiftRequirement, 
    deletePostShiftRequirement,
    getShifts,
    getSecurityPosts
} from '../api';
import type { PostShiftRequirement, SecurityPost, Shift } from '../types';

interface PostShiftRequirementModalProps {
    isOpen: boolean;
    onClose: () => void;
    post?: SecurityPost | { id: string; post_name?: string; name?: string } | null;
    initialSiteId?: string;
    selectedPostId?: string;
    onChanged?: () => void;
    onSave?: () => void;
}

export const PostShiftRequirementModal: React.FC<PostShiftRequirementModalProps> = ({
    isOpen,
    onClose,
    post,
    initialSiteId,
    selectedPostId,
    onChanged,
    onSave
}) => {
    const [requirements, setRequirements] = useState<PostShiftRequirement[]>([]);
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [sitePosts, setSitePosts] = useState<SecurityPost[]>([]);
    const [activePostId, setActivePostId] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Form
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingReq, setEditingReq] = useState<PostShiftRequirement | null>(null);
    const [formData, setFormData] = useState({
        shift: '',
        required_headcount: 1,
        is_active: true,
        notes: ''
    });

    // Resolve active post
    useEffect(() => {
        if (post?.id) {
            setActivePostId(post.id);
        } else if (selectedPostId) {
            setActivePostId(selectedPostId);
        }
    }, [post, selectedPostId]);

    // Load site posts if siteId provided
    useEffect(() => {
        if (isOpen && initialSiteId) {
            getSecurityPosts({ site: initialSiteId, is_active: true })
                .then(postsRes => {
                    const posts = postsRes.results || (Array.isArray(postsRes) ? postsRes : []);
                    setSitePosts(posts);
                    if (!activePostId && posts.length > 0) {
                        setActivePostId(posts[0].id);
                    }
                })
                .catch(() => {});
        }
    }, [isOpen, initialSiteId, activePostId]);

    const loadData = useCallback(async () => {
        if (!activePostId) return;
        setLoading(true);
        setError(null);
        try {
            const [reqs, shs] = await Promise.all([
                getPostShiftRequirements({ post: activePostId }),
                getShifts({ is_active: true })
            ]);
            setRequirements(reqs);
            setShifts(shs);
            if (shs.length > 0 && !formData.shift) {
                setFormData(prev => ({ ...prev, shift: shs[0].id }));
            }
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to load post shift requirements');
        } finally {
            setLoading(false);
        }
    }, [activePostId, formData.shift]);

    useEffect(() => {
        if (isOpen && activePostId) {
            loadData();
            setIsFormOpen(false);
            setEditingReq(null);
        }
    }, [isOpen, activePostId, loadData]);

    const handleOpenCreate = () => {
        setEditingReq(null);
        setFormData({
            shift: shifts[0]?.id || '',
            required_headcount: 1,
            is_active: true,
            notes: ''
        });
        setIsFormOpen(true);
    };

    const handleOpenEdit = (req: PostShiftRequirement) => {
        setEditingReq(req);
        setFormData({
            shift: req.shift,
            required_headcount: req.required_headcount,
            is_active: req.is_active,
            notes: req.notes || ''
        });
        setIsFormOpen(true);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!activePostId) return;
        setError(null);
        try {
            if (editingReq) {
                await updatePostShiftRequirement(editingReq.id, {
                    required_headcount: formData.required_headcount,
                    is_active: formData.is_active,
                    notes: formData.notes
                });
            } else {
                await createPostShiftRequirement({
                    post: activePostId,
                    shift: formData.shift,
                    required_headcount: formData.required_headcount,
                    is_active: formData.is_active,
                    notes: formData.notes
                });
            }
            setIsFormOpen(false);
            loadData();
            if (onChanged) onChanged();
            if (onSave) onSave();
        } catch (err: any) {
            const errData = err.response?.data;
            const msg = typeof errData === 'object' ? Object.values(errData).flat().join(' ') : (errData || 'Failed to save requirement');
            setError(msg);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Remove this shift requirement for this post?')) return;
        try {
            await deletePostShiftRequirement(id);
            loadData();
            if (onChanged) onChanged();
            if (onSave) onSave();
        } catch (err: any) {
            alert(err.response?.data?.error || 'Failed to delete');
        }
    };

    const currentPostName = post?.post_name || sitePosts.find(p => p.id === activePostId)?.post_name || 'Post';

    return (
        <Modal 
            isOpen={isOpen} 
            onClose={onClose} 
            title={`Shift Manpower Requirements — ${currentPostName}`}
        >
            <div style={{ padding: '16px', maxWidth: '650px', width: '100%', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {error && (
                    <div style={{ padding: '10px 14px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderRadius: '6px', fontSize: '13px' }}>
                        {error}
                    </div>
                )}

                {/* Post Selector if site has multiple posts */}
                {sitePosts.length > 1 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Security Post:</span>
                        <select
                            value={activePostId}
                            onChange={e => setActivePostId(e.target.value)}
                            className="input-base"
                            style={{ padding: '6px 10px', fontSize: '13px', minWidth: '200px' }}
                        >
                            {sitePosts.map(p => (
                                <option key={p.id} value={p.id}>{p.post_name} ({p.post_code})</option>
                            ))}
                        </select>
                    </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
                        Define required guard strength per shift (e.g. Day Shift → 4, Night Shift → 3).
                    </div>
                    {!isFormOpen && (
                        <Button variant="primary" size="sm" icon="bx-plus" onClick={handleOpenCreate}>
                            Add Shift Requirement
                        </Button>
                    )}
                </div>

                {isFormOpen && (
                    <form onSubmit={handleSave} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>
                            {editingReq ? `Edit Requirement (${editingReq.shift_name})` : 'New Shift Manpower Target'}
                        </h4>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                            <div className="form-field">
                                <label className="form-label" style={{ fontSize: '12px', fontWeight: 600 }}>Select Shift *</label>
                                <select 
                                    value={formData.shift} 
                                    onChange={e => setFormData({ ...formData, shift: e.target.value })}
                                    disabled={!!editingReq}
                                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-background)', color: 'var(--color-text)' }}
                                >
                                    {shifts.map(s => (
                                        <option key={s.id} value={s.id}>{s.name} ({s.start_time} - {s.end_time})</option>
                                    ))}
                                </select>
                            </div>
                            <Input 
                                label="Required Headcount *" 
                                type="number" 
                                min={1} 
                                value={formData.required_headcount} 
                                onChange={e => setFormData({ ...formData, required_headcount: parseInt(e.target.value) || 1 })} 
                                required 
                            />
                        </div>
                        <Input 
                            label="Notes / Instructions" 
                            value={formData.notes} 
                            onChange={e => setFormData({ ...formData, notes: e.target.value })} 
                            placeholder="e.g. 1 Armed, 1 Lady searcher required" 
                        />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                            <Button variant="secondary" size="sm" type="button" onClick={() => setIsFormOpen(false)}>Cancel</Button>
                            <Button variant="primary" size="sm" type="submit">Save Target</Button>
                        </div>
                    </form>
                )}

                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
                                <th style={{ padding: '8px 12px' }}>Shift</th>
                                <th style={{ padding: '8px 12px' }}>Shift Times</th>
                                <th style={{ padding: '8px 12px', textAlign: 'center' }}>Required Headcount</th>
                                <th style={{ padding: '8px 12px' }}>Status</th>
                                <th style={{ padding: '8px 12px' }}>Notes</th>
                                <th style={{ padding: '8px 12px', textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                                        Loading shift requirements...
                                    </td>
                                </tr>
                            ) : requirements.length === 0 ? (
                                <tr>
                                    <td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                                        No specific shift requirements configured. Default post headcount will be used for all shifts.
                                    </td>
                                </tr>
                            ) : (
                                requirements.map(req => (
                                    <tr key={req.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                        <td style={{ padding: '8px 12px', fontWeight: 600 }}>{req.shift_name} ({req.shift_code})</td>
                                        <td style={{ padding: '8px 12px', color: 'var(--color-text-muted)' }}>{req.start_time} – {req.end_time}</td>
                                        <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600 }}>
                                            <span style={{ display: 'inline-block', padding: '2px 8px', background: 'rgba(59, 130, 246, 0.1)', color: 'var(--color-primary)', borderRadius: '12px' }}>
                                                {req.required_headcount} Guards
                                            </span>
                                        </td>
                                        <td style={{ padding: '8px 12px' }}>
                                            <Badge variant={req.is_active ? 'success' : 'default'}>
                                                {req.is_active ? 'Active' : 'Inactive'}
                                            </Badge>
                                        </td>
                                        <td style={{ padding: '8px 12px', color: 'var(--color-text-muted)' }}>{req.notes || '—'}</td>
                                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                                            <button 
                                                onClick={() => handleOpenEdit(req)}
                                                style={{ background: 'none', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', marginRight: '8px', fontSize: '12px' }}
                                            >
                                                Edit
                                            </button>
                                            <button 
                                                onClick={() => handleDelete(req.id)}
                                                style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '12px' }}
                                            >
                                                Delete
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--color-border)', paddingTop: '12px' }}>
                    <Button variant="secondary" onClick={onClose}>Close</Button>
                </div>
            </div>
        </Modal>
    );
};
