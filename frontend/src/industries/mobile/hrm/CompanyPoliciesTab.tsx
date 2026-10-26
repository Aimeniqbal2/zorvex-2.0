import React, { useState, useEffect } from 'react';
import { mobileHrmApi } from './mobileHrmApi';
import type { CompanyPolicy } from './types';

export const CompanyPoliciesTab: React.FC = () => {
    const [policy, setPolicy] = useState<CompanyPolicy | null>(null);
    const [loading, setLoading] = useState(true);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editTitle, setEditTitle] = useState('');
    const [editContent, setEditContent] = useState('');
    const [editVersion, setEditVersion] = useState('');
    const [saving, setSaving] = useState(false);
    const [copied, setCopied] = useState(false);

    const loadPolicy = async () => {
        try {
            setLoading(true);
            const data = await mobileHrmApi.getActivePolicy();
            setPolicy(data);
        } catch (err) {
            console.error('Failed to load active policy:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadPolicy();
    }, []);

    const handleOpenEdit = () => {
        if (!policy) return;
        setEditTitle(policy.title);
        setEditContent(policy.content);
        setEditVersion(policy.version || '1.1');
        setIsEditModalOpen(true);
    };

    const handleSavePolicy = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setSaving(true);
            const updated = await mobileHrmApi.saveActivePolicy({
                title: editTitle,
                content: editContent,
                version: editVersion
            });
            setPolicy(updated);
            setIsEditModalOpen(false);
            alert('Company policy updated successfully! All staff portal views are now updated.');
        } catch (err) {
            alert('Failed to update company policy.');
        } finally {
            setSaving(false);
        }
    };

    const handleCopyText = () => {
        if (!policy) return;
        navigator.clipboard.writeText(policy.content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // Parse bullet rules from content
    const rulesList = (policy?.content || '')
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && /^[0-9]+\./.test(line));

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', padding: '24px', maxWidth: '1100px', margin: '0 auto' }}>
            {/* Header Banner */}
            <div style={{
                background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
                color: '#ffffff',
                padding: '24px 30px',
                borderRadius: '16px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '16px'
            }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '36px',
                            height: '36px',
                            borderRadius: '10px',
                            background: 'rgba(59, 130, 246, 0.2)',
                            color: '#60a5fa'
                        }}>
                            <i className="bx bx-shield-quarter" style={{ fontSize: '22px' }} />
                        </span>
                        <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 700 }}>
                            SOFTECH MOBILE (SERVICE & SALE)
                        </h2>
                        <span style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            padding: '3px 10px',
                            borderRadius: '12px',
                            background: '#22c55e',
                            color: '#ffffff'
                        }}>
                            Active Tenant Policy v{policy?.version || '1.0'}
                        </span>
                    </div>
                    <p style={{ margin: '8px 0 0 46px', fontSize: '14px', color: '#94a3b8' }}>
                        Official Workplace Regulations, Attendance Grace Cutoffs, Incentives & Penalties
                    </p>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                        type="button"
                        onClick={handleCopyText}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '8px 16px',
                            background: 'rgba(255, 255, 255, 0.1)',
                            color: '#ffffff',
                            borderRadius: '8px',
                            border: '1px solid rgba(255, 255, 255, 0.2)',
                            fontSize: '13px',
                            fontWeight: 600,
                            cursor: 'pointer'
                        }}
                    >
                        <i className={`bx ${copied ? 'bx-check' : 'bx-copy'}`} />
                        {copied ? 'Copied' : 'Copy Text'}
                    </button>

                    <button
                        type="button"
                        onClick={() => window.print()}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '8px 16px',
                            background: 'rgba(255, 255, 255, 0.1)',
                            color: '#ffffff',
                            borderRadius: '8px',
                            border: '1px solid rgba(255, 255, 255, 0.2)',
                            fontSize: '13px',
                            fontWeight: 600,
                            cursor: 'pointer'
                        }}
                    >
                        <i className="bx bx-printer" />
                        Print Policy
                    </button>

                    <button
                        type="button"
                        onClick={handleOpenEdit}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '8px 18px',
                            background: '#0284c7',
                            color: '#ffffff',
                            borderRadius: '8px',
                            border: 'none',
                            fontSize: '13px',
                            fontWeight: 600,
                            cursor: 'pointer'
                        }}
                    >
                        <i className="bx bx-edit" />
                        Edit Rules & Policy
                    </button>
                </div>
            </div>

            {/* Quick Metrics Bar */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                <div style={{ background: '#ffffff', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <div style={{ color: '#64748b', fontSize: '12px', fontWeight: 600 }}>PUNCTUALITY BONUS</div>
                    <div style={{ fontSize: '20px', fontWeight: 800, color: '#16a34a', marginTop: '4px' }}>Rs. 1,000 / mo</div>
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>Late &lt; 3 & 0 uninformed holidays</div>
                </div>

                <div style={{ background: '#ffffff', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <div style={{ color: '#64748b', fontSize: '12px', fontWeight: 600 }}>ZERO HOLIDAY REWARD</div>
                    <div style={{ fontSize: '20px', fontWeight: 800, color: '#0284c7', marginTop: '4px' }}>1 Day Salary</div>
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>Whole month 0 holidays & D &lt; 3</div>
                </div>

                <div style={{ background: '#ffffff', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <div style={{ color: '#64748b', fontSize: '12px', fontWeight: 600 }}>ARRIVAL GRACE PERIOD</div>
                    <div style={{ fontSize: '20px', fontWeight: 800, color: '#d97706', marginTop: '4px' }}>10 Minutes</div>
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>Cutoff: 1 hour max after shift</div>
                </div>

                <div style={{ background: '#ffffff', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <div style={{ color: '#64748b', fontSize: '12px', fontWeight: 600 }}>UNAPPROVED HOLIDAY PENALTY</div>
                    <div style={{ fontSize: '20px', fontWeight: 800, color: '#dc2626', marginTop: '4px' }}>Rs. 1,000 Flat</div>
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>Saturday holiday marks Sunday too</div>
                </div>
            </div>

            {/* Rules Content Container */}
            <div style={{
                background: '#ffffff',
                borderRadius: '16px',
                border: '1px solid #e2e8f0',
                padding: '32px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '16px', marginBottom: '24px' }}>
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>
                        Clause-by-Clause Workplace Directives
                    </h3>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>
                        Admin Approver: <strong>{policy?.created_by_name || 'Sheikh Muhammad Afnan (CEO)'}</strong>
                    </div>
                </div>

                {loading ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                        <i className="bx bx-loader-alt bx-spin" style={{ fontSize: '28px', marginBottom: '8px' }} />
                        <div>Loading active company policy...</div>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        {(rulesList.length > 0 ? rulesList : (policy?.content || '').split('\n')).map((line, idx) => {
                            if (!line.trim()) return null;
                            const isHeading = !/^[0-9]+\./.test(line);

                            if (isHeading) {
                                return (
                                    <div key={idx} style={{ fontSize: '15px', fontWeight: 700, color: '#1e293b', marginTop: '8px' }}>
                                        {line}
                                    </div>
                                );
                            }

                            const match = line.match(/^([0-9]+\.)\s*(.*)$/);
                            const num = match ? match[1] : `${idx + 1}.`;
                            const text = match ? match[2] : line;

                            return (
                                <div
                                    key={idx}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'flex-start',
                                        gap: '12px',
                                        padding: '12px 16px',
                                        borderRadius: '10px',
                                        background: '#f8fafc',
                                        border: '1px solid #f1f5f9',
                                        transition: 'background 0.15s ease'
                                    }}
                                >
                                    <span style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        minWidth: '28px',
                                        height: '28px',
                                        borderRadius: '8px',
                                        background: '#e0f2fe',
                                        color: '#0284c7',
                                        fontWeight: 700,
                                        fontSize: '12px'
                                    }}>
                                        {num.replace('.', '')}
                                    </span>
                                    <div style={{ fontSize: '14px', lineHeight: '1.6', color: '#1e293b', flex: 1 }}>
                                        {text}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Edit Policy Modal */}
            {isEditModalOpen && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(15, 23, 42, 0.65)',
                    backdropFilter: 'blur(4px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 9999,
                    padding: '20px'
                }}>
                    <div style={{
                        background: '#ffffff',
                        borderRadius: '16px',
                        width: '100%',
                        maxWidth: '720px',
                        maxHeight: '90vh',
                        overflowY: 'auto',
                        padding: '28px',
                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <h3 style={{ margin: 0, fontSize: '19px', fontWeight: 700, color: '#0f172a' }}>
                                Edit Workplace Rules & Regulations Policy
                            </h3>
                            <button onClick={() => setIsEditModalOpen(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '22px', color: '#64748b' }}>
                                <i className="bx bx-x" />
                            </button>
                        </div>

                        <form onSubmit={handleSavePolicy} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Policy Title</label>
                                    <input
                                        type="text"
                                        required
                                        value={editTitle}
                                        onChange={e => setEditTitle(e.target.value)}
                                        style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Revision / Version</label>
                                    <input
                                        type="text"
                                        value={editVersion}
                                        onChange={e => setEditVersion(e.target.value)}
                                        placeholder="e.g. 1.1"
                                        style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                                    />
                                </div>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                                    Clauses & Regulations (1 rule per numbered line)
                                </label>
                                <textarea
                                    rows={15}
                                    required
                                    value={editContent}
                                    onChange={e => setEditContent(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '12px',
                                        borderRadius: '8px',
                                        border: '1px solid #cbd5e1',
                                        fontFamily: 'monospace',
                                        fontSize: '13px',
                                        lineHeight: '1.6'
                                    }}
                                />
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                                <button type="button" onClick={() => setIsEditModalOpen(false)} style={{ padding: '8px 16px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer' }}>
                                    Cancel
                                </button>
                                <button type="submit" disabled={saving} style={{ padding: '8px 22px', background: '#0284c7', color: '#ffffff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}>
                                    {saving ? 'Publishing...' : 'Publish Across Tenant'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
