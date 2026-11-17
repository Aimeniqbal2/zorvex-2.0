import React, { useState, useEffect } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { useToastStore } from '../../stores/toastStore';
import {
    getSenderIdentities,
    createSenderIdentity,
    updateSenderIdentity,
    deleteSenderIdentity,
    testSenderConnection,
    type SenderIdentity
} from '../../api/communications';

export const SenderIdentitiesPanel: React.FC = () => {
    const [senders, setSenders] = useState<SenderIdentity[]>([]);
    const [loading, setLoading] = useState(false);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [testingId, setTestingId] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    // Form state
    const [name, setName] = useState('');
    const [emailAddress, setEmailAddress] = useState('');
    const [replyTo, setReplyTo] = useState('');
    const [providerType, setProviderType] = useState<'SMTP' | 'SYSTEM_DEFAULT'>('SMTP');
    const [smtpHost, setSmtpHost] = useState('');
    const [smtpPort, setSmtpPort] = useState<string>('587');
    const [smtpUsername, setSmtpUsername] = useState('');
    const [smtpPassword, setSmtpPassword] = useState('');
    const [smtpUseTls, setSmtpUseTls] = useState(true);
    const [isDefault, setIsDefault] = useState(false);
    const [isActive, setIsActive] = useState(true);

    useEffect(() => {
        loadSenders();
    }, []);

    const loadSenders = async () => {
        setLoading(true);
        try {
            const data = await getSenderIdentities();
            setSenders(data || []);
        } catch (err: any) {
            console.error('Failed to load sender identities:', err);
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setEditingId(null);
        setName('');
        setEmailAddress('');
        setReplyTo('');
        setProviderType('SMTP');
        setSmtpHost('');
        setSmtpPort('587');
        setSmtpUsername('');
        setSmtpPassword('');
        setSmtpUseTls(true);
        setIsDefault(false);
        setIsActive(true);
        setIsFormOpen(false);
    };

    const handleStartNew = () => {
        resetForm();
        setName('Company Communications');
        setEmailAddress('');
        setSmtpHost('');
        setSmtpPort('587');
        setIsFormOpen(true);
    };

    const handleEdit = (sender: SenderIdentity) => {
        setEditingId(sender.id);
        setName(sender.name);
        setEmailAddress(sender.email_address);
        setReplyTo(sender.reply_to || '');
        setProviderType(sender.provider_type);
        setSmtpHost(sender.smtp_host || '');
        setSmtpPort(sender.smtp_port ? String(sender.smtp_port) : '587');
        setSmtpUsername(sender.smtp_username || '');
        setSmtpPassword(''); // Keep blank to leave password unchanged
        setSmtpUseTls(sender.smtp_use_tls);
        setIsDefault(sender.is_default);
        setIsActive(sender.is_active);
        setIsFormOpen(true);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim() || !emailAddress.trim()) {
            useToastStore.getState().error('Please provide a display name and sender email address.');
            return;
        }

        if (providerType === 'SMTP' && !smtpHost.trim()) {
            useToastStore.getState().error('Please provide an SMTP host server address (e.g. smtp.gmail.com).');
            return;
        }

        setSaving(true);
        try {
            const payload: Partial<SenderIdentity> = {
                name: name.trim(),
                email_address: emailAddress.trim(),
                reply_to: replyTo.trim() || null,
                provider_type: providerType,
                is_default: isDefault,
                is_active: isActive,
            };

            if (providerType === 'SMTP') {
                payload.smtp_host = smtpHost.trim() || null;
                payload.smtp_port = smtpPort ? Number(smtpPort) : 587;
                payload.smtp_username = smtpUsername.trim() || null;
                if (smtpPassword) {
                    payload.smtp_password = smtpPassword;
                }
                payload.smtp_use_tls = smtpUseTls;
            }

            if (editingId) {
                await updateSenderIdentity(editingId, payload);
                useToastStore.getState().success('Sender identity updated successfully.');
            } else {
                await createSenderIdentity(payload);
                useToastStore.getState().success('Sender identity created successfully.');
            }

            resetForm();
            await loadSenders();
        } catch (err: any) {
            const msg = err?.response?.data?.email_address?.[0] || err?.response?.data?.error || err?.response?.data?.detail || err?.message || 'Failed to save sender identity.';
            useToastStore.getState().error(msg);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string, senderName: string) => {
        if (!window.confirm(`Are you sure you want to delete sender identity "${senderName}"?`)) return;
        try {
            await deleteSenderIdentity(id);
            useToastStore.getState().success('Sender identity deleted.');
            await loadSenders();
        } catch (err: any) {
            useToastStore.getState().error('Failed to delete sender identity.');
        }
    };

    const handleTestConnection = async (id: string) => {
        setTestingId(id);
        try {
            const res = await testSenderConnection(id);
            if (res.status === 'verified') {
                useToastStore.getState().success('SMTP Connection Verified Successfully! Sender is now usable.');
            } else {
                useToastStore.getState().error(res.message || 'SMTP Connection Test Failed.');
            }
            await loadSenders();
        } catch (err: any) {
            const msg = err?.response?.data?.error || err?.response?.data?.detail || 'SMTP Connection Test Failed. Check credentials.';
            useToastStore.getState().error(msg);
        } finally {
            setTestingId(null);
        }
    };

    const getStatusBadge = (status: string, provider: string) => {
        if (provider === 'SYSTEM_DEFAULT' || status === 'USABLE') {
            return (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, background: '#eff6ff', color: '#1d4ed8' }}>
                    <i className='bx bx-check-circle'></i> Usable (System Default)
                </span>
            );
        }
        if (status === 'VERIFIED') {
            return (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, background: '#ecfdf5', color: '#047857' }}>
                    <i className='bx bx-check-double'></i> SMTP Verified
                </span>
            );
        }
        if (status === 'DISABLED') {
            return (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, background: '#f1f5f9', color: '#64748b' }}>
                    <i className='bx bx-block'></i> Disabled
                </span>
            );
        }
        return (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, background: '#fffbeb', color: '#b45309' }}>
                <i className='bx bx-time'></i> Unverified
            </span>
        );
    };

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                <div>
                    <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--color-text)' }}>
                        Sender Identities & Outbound Email (SMTP)
                    </h3>
                    <p style={{ margin: '3px 0 0 0', color: 'var(--color-text-muted)', fontSize: '13px' }}>
                        Configure the From address, display name, and SMTP relay for sending proposals, invoices, and operations notifications.
                    </p>
                </div>
                {!isFormOpen && (
                    <Button variant="primary" onClick={handleStartNew} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <i className='bx bx-plus' style={{ fontSize: '16px' }}></i> Add Sender Identity
                    </Button>
                )}
            </div>

            {/* Add / Edit Form */}
            {isFormOpen && (
                <div style={{ background: 'var(--color-surface-secondary)', border: '1px solid var(--color-border)', borderRadius: '10px', padding: '18px', marginBottom: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <h4 style={{ margin: 0, fontSize: '14.5px', fontWeight: 700, color: 'var(--color-text)' }}>
                            {editingId ? 'Edit Sender Identity' : 'New Sender Identity'}
                        </h4>
                        <Button variant="ghost" size="sm" onClick={resetForm}>
                            <i className='bx bx-x' style={{ fontSize: '18px' }}></i>
                        </Button>
                    </div>

                    <form onSubmit={handleSave}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px', marginBottom: '14px' }}>
                            <Input
                                label="Sender Display Name *"
                                placeholder="e.g. Zorvex Operations, Billing Dept"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                required
                            />
                            <Input
                                label="Sender Email Address *"
                                type="email"
                                placeholder="e.g. ops@zorvex.com, billing@zorvex.com"
                                value={emailAddress}
                                onChange={(e) => setEmailAddress(e.target.value)}
                                required
                            />
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px', marginBottom: '14px' }}>
                            <Input
                                label="Reply-To Email Address (Optional)"
                                type="email"
                                placeholder="e.g. support@zorvex.com"
                                value={replyTo}
                                onChange={(e) => setReplyTo(e.target.value)}
                            />
                            <div>
                                <label style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: '6px' }}>
                                    Provider Type *
                                </label>
                                <select
                                    value={providerType}
                                    onChange={(e) => setProviderType(e.target.value as any)}
                                    style={{
                                        width: '100%',
                                        padding: '9px 12px',
                                        borderRadius: '8px',
                                        border: '1px solid var(--color-border)',
                                        background: 'var(--color-surface)',
                                        color: 'var(--color-text)',
                                        fontSize: '13px'
                                    }}
                                >
                                    <option value="SMTP">Custom SMTP Server (Gmail, Outlook, Postmark, Private Mail)</option>
                                    <option value="SYSTEM_DEFAULT">System Default (Platform Shared SMTP)</option>
                                </select>
                            </div>
                        </div>

                        {providerType === 'SMTP' && (
                            <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '14px', marginBottom: '14px' }}>
                                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text)', textTransform: 'uppercase', marginBottom: '10px' }}>
                                    SMTP Server Credentials
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '12px' }}>
                                    <Input
                                        label="SMTP Host *"
                                        placeholder="e.g. smtp.gmail.com, mail.zorvex.com"
                                        value={smtpHost}
                                        onChange={(e) => setSmtpHost(e.target.value)}
                                        required={providerType === 'SMTP'}
                                    />
                                    <Input
                                        label="SMTP Port *"
                                        type="number"
                                        placeholder="587 or 465"
                                        value={smtpPort}
                                        onChange={(e) => setSmtpPort(e.target.value)}
                                        required={providerType === 'SMTP'}
                                    />
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '12px' }}>
                                    <Input
                                        label="SMTP Username *"
                                        placeholder="e.g. user@domain.com"
                                        value={smtpUsername}
                                        onChange={(e) => setSmtpUsername(e.target.value)}
                                    />
                                    <Input
                                        label={editingId ? 'SMTP Password (leave blank to keep current)' : 'SMTP Password *'}
                                        type="password"
                                        placeholder="App Password or SMTP Secret"
                                        value={smtpPassword}
                                        onChange={(e) => setSmtpPassword(e.target.value)}
                                    />
                                </div>
                                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer', color: 'var(--color-text)' }}>
                                    <input
                                        type="checkbox"
                                        checked={smtpUseTls}
                                        onChange={(e) => setSmtpUseTls(e.target.checked)}
                                    />
                                    Use TLS / STARTTLS Encryption (Recommended)
                                </label>
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: '20px', alignItems: 'center', marginBottom: '18px' }}>
                            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer', color: 'var(--color-text)' }}>
                                <input
                                    type="checkbox"
                                    checked={isDefault}
                                    onChange={(e) => setIsDefault(e.target.checked)}
                                />
                                Set as Default Outbound Sender
                            </label>
                            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer', color: 'var(--color-text)' }}>
                                <input
                                    type="checkbox"
                                    checked={isActive}
                                    onChange={(e) => setIsActive(e.target.checked)}
                                />
                                Active for Communications
                            </label>
                        </div>

                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                            <Button variant="ghost" type="button" onClick={resetForm} disabled={saving}>
                                Cancel
                            </Button>
                            <Button variant="primary" type="submit" disabled={saving}>
                                {saving ? 'Saving...' : (editingId ? 'Update Sender Identity' : 'Save Sender Identity')}
                            </Button>
                        </div>
                    </form>
                </div>
            )}

            {/* Senders List */}
            {loading ? (
                <div style={{ padding: '30px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                    <i className='bx bx-loader-alt bx-spin' style={{ fontSize: '24px', marginRight: '8px' }}></i>
                    Loading sender identities...
                </div>
            ) : senders.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', border: '1px dashed var(--color-border)', borderRadius: '10px', color: 'var(--color-text-muted)' }}>
                    <i className='bx bx-envelope' style={{ fontSize: '32px', marginBottom: '8px', opacity: 0.5 }}></i>
                    <p style={{ margin: '0 0 12px 0', fontSize: '14px' }}>No custom sender identities configured yet.</p>
                    <Button variant="primary" size="sm" onClick={handleStartNew}>
                        Add First Sender Identity
                    </Button>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {senders.map((s) => (
                        <div
                            key={s.id}
                            style={{
                                padding: '14px 18px',
                                background: 'var(--color-surface)',
                                border: '1px solid var(--color-border)',
                                borderRadius: '10px',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                gap: '16px'
                            }}
                        >
                            <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                                    <span style={{ fontWeight: 700, fontSize: '14.5px', color: 'var(--color-text)' }}>
                                        {s.name}
                                    </span>
                                    <span style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>
                                        &lt;{s.email_address}&gt;
                                    </span>
                                    {s.is_default && (
                                        <span style={{ padding: '2px 7px', borderRadius: '4px', fontSize: '10.5px', fontWeight: 700, background: 'var(--color-primary-light, #eff6ff)', color: 'var(--color-primary)' }}>
                                            DEFAULT
                                        </span>
                                    )}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                                    {getStatusBadge(s.verification_status, s.provider_type)}
                                    {s.provider_type === 'SMTP' && s.smtp_host && (
                                        <span>
                                            <i className='bx bx-server' style={{ marginRight: '4px' }}></i>
                                            {s.smtp_host}:{s.smtp_port || 587}
                                        </span>
                                    )}
                                    {s.reply_to && (
                                        <span>
                                            <i className='bx bx-reply' style={{ marginRight: '4px' }}></i>
                                            Reply-To: {s.reply_to}
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                {s.provider_type === 'SMTP' && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleTestConnection(s.id)}
                                        disabled={testingId === s.id}
                                        title="Send SMTP test ping to verify credentials"
                                        style={{ fontSize: '12px' }}
                                    >
                                        <i className={`bx ${testingId === s.id ? 'bx-loader-alt bx-spin' : 'bx-wifi'}`} style={{ marginRight: '4px' }}></i>
                                        {testingId === s.id ? 'Testing...' : 'Test Connection'}
                                    </Button>
                                )}
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleEdit(s)}
                                    title="Edit Sender"
                                    style={{ fontSize: '12px' }}
                                >
                                    <i className='bx bx-edit' style={{ marginRight: '4px' }}></i> Edit
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDelete(s.id, s.name)}
                                    title="Delete Sender"
                                    style={{ color: '#dc2626', fontSize: '12px' }}
                                >
                                    <i className='bx bx-trash'></i>
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
