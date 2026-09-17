import React, { useState, useEffect, useRef } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { useAuthStore } from '../../auth/authStore';
import { useToastStore } from '../../stores/toastStore';
import { 
    getMySignatures, createSignature, updateSignature, 
    deleteSignature, type UserEmailSignature 
} from '../../api/communications';
import { API_HOST_URL } from '../../api/client';

export const SettingsWorkspace: React.FC = () => {
    const { user } = useAuthStore();
    const [activeTab, setActiveTab] = useState<'profile' | 'signatures' | 'company' | 'settings'>('profile');

    // Signatures State
    const [signatures, setSignatures] = useState<UserEmailSignature[]>([]);
    const [loadingSignatures, setLoadingSignatures] = useState(false);
    const [isAddingSignature, setIsAddingSignature] = useState(false);
    const [editingSigId, setEditingSigId] = useState<string | null>(null);

    // Signature Form State
    const [sigType, setSigType] = useState<'TEXT' | 'IMAGE'>('TEXT');
    const [sigName, setSigName] = useState('');
    const [sigText, setSigText] = useState('');
    const [sigImageFile, setSigImageFile] = useState<File | null>(null);
    const [sigImagePreview, setSigImagePreview] = useState<string | null>(null);
    const [sigIsDefault, setSigIsDefault] = useState(false);
    const [savingSig, setSavingSig] = useState(false);

    const imageInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        loadSignatures();
    }, []);

    const loadSignatures = async () => {
        setLoadingSignatures(true);
        try {
            const data = await getMySignatures();
            setSignatures(data || []);
        } catch (err) {
            console.error('Failed to load email signatures', err);
        } finally {
            setLoadingSignatures(false);
        }
    };

    const resetSigForm = () => {
        setEditingSigId(null);
        setSigType('TEXT');
        setSigName('');
        setSigText('');
        setSigImageFile(null);
        setSigImagePreview(null);
        setSigIsDefault(false);
        setIsAddingSignature(false);
    };

    const handleStartNewSig = () => {
        resetSigForm();
        setSigName('My Signature');
        setSigText(`Best regards,\n${user?.username || 'User'}\nZorvex Security Operations`);
        setIsAddingSignature(true);
    };

    const handleEditSig = (sig: UserEmailSignature) => {
        setEditingSigId(sig.id);
        setSigName(sig.name);
        setSigType(sig.signature_type);
        setSigText(sig.text_content || '');
        setSigImagePreview(sig.image_url || null);
        setSigImageFile(null);
        setSigIsDefault(sig.is_default);
        setIsAddingSignature(true);
    };

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (!file.type.startsWith('image/')) {
                useToastStore.getState().error('Please select an image file (PNG, JPG, etc).');
                return;
            }
            if (file.size > 2 * 1024 * 1024) {
                useToastStore.getState().error('Image file size must be less than 2MB.');
                return;
            }
            setSigImageFile(file);
            setSigImagePreview(URL.createObjectURL(file));
        }
    };

    const handleSaveSignature = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!sigName.trim()) {
            useToastStore.getState().error('Please enter a name/label for the signature.');
            return;
        }

        if (sigType === 'TEXT' && !sigText.trim()) {
            useToastStore.getState().error('Please provide text for your signature.');
            return;
        }

        if (sigType === 'IMAGE' && !sigImageFile && !sigImagePreview) {
            useToastStore.getState().error('Please upload a signature image.');
            return;
        }

        setSavingSig(true);
        try {
            const formData = new FormData();
            formData.append('name', sigName.trim());
            formData.append('signature_type', sigType);
            formData.append('is_default', String(sigIsDefault));

            if (sigType === 'TEXT') {
                formData.append('text_content', sigText);
            } else if (sigImageFile) {
                formData.append('image', sigImageFile);
            }

            if (editingSigId) {
                await updateSignature(editingSigId, formData);
                useToastStore.getState().success('Email signature updated successfully.');
            } else {
                await createSignature(formData);
                useToastStore.getState().success('Email signature saved successfully.');
            }

            resetSigForm();
            await loadSignatures();
        } catch (err: any) {
            useToastStore.getState().error(err?.response?.data?.detail || 'Failed to save signature.');
        } finally {
            setSavingSig(false);
        }
    };

    const handleDeleteSig = async (id: string, name: string) => {
        if (!window.confirm(`Are you sure you want to delete signature "${name}"?`)) return;
        try {
            await deleteSignature(id);
            useToastStore.getState().success('Signature deleted.');
            await loadSignatures();
        } catch (err: any) {
            useToastStore.getState().error('Failed to delete signature.');
        }
    };

    return (
        <div style={{ padding: '24px', height: '100%', overflowY: 'auto', background: 'var(--color-background)' }}>
            <div style={{ maxWidth: '1000px', margin: '0 auto', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '12px', padding: '24px' }}>
                <div style={{ marginBottom: '20px', borderBottom: '1px solid var(--color-border)', paddingBottom: '14px' }}>
                    <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0, color: 'var(--color-text)' }}>Account & Settings</h2>
                    <p style={{ margin: '4px 0 0 0', color: 'var(--color-text-muted)', fontSize: '13px' }}>Manage user profile, outbound communications, email signatures, and system preferences.</p>
                </div>

                <div style={{ display: 'flex', gap: '24px', minHeight: '480px' }}>
                    {/* Left Navigation Tabs */}
                    <div style={{ width: '220px', borderRight: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: '6px', paddingRight: '16px' }}>
                        <button 
                            style={{ 
                                padding: '10px 14px', textAlign: 'left', 
                                background: activeTab === 'profile' ? 'var(--color-surface-secondary)' : 'transparent', 
                                border: '1px solid',
                                borderColor: activeTab === 'profile' ? 'var(--color-border)' : 'transparent', 
                                borderRadius: '8px', cursor: 'pointer', 
                                fontWeight: activeTab === 'profile' ? 700 : 500, 
                                color: activeTab === 'profile' ? 'var(--color-primary)' : 'var(--color-text)',
                                display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13.5px'
                            }}
                            onClick={() => { setActiveTab('profile'); resetSigForm(); }}
                        >
                            <i className='bx bx-user' style={{ fontSize: '18px' }}></i> Profile
                        </button>
                        
                        <button 
                            style={{ 
                                padding: '10px 14px', textAlign: 'left', 
                                background: activeTab === 'signatures' ? 'var(--color-surface-secondary)' : 'transparent', 
                                border: '1px solid',
                                borderColor: activeTab === 'signatures' ? 'var(--color-border)' : 'transparent', 
                                borderRadius: '8px', cursor: 'pointer', 
                                fontWeight: activeTab === 'signatures' ? 700 : 500, 
                                color: activeTab === 'signatures' ? 'var(--color-primary)' : 'var(--color-text)',
                                display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13.5px'
                            }}
                            onClick={() => { setActiveTab('signatures'); resetSigForm(); }}
                        >
                            <i className='bx bx-edit-alt' style={{ fontSize: '18px' }}></i> Email Signatures
                        </button>

                        <button 
                            style={{ 
                                padding: '10px 14px', textAlign: 'left', 
                                background: activeTab === 'company' ? 'var(--color-surface-secondary)' : 'transparent', 
                                border: '1px solid',
                                borderColor: activeTab === 'company' ? 'var(--color-border)' : 'transparent', 
                                borderRadius: '8px', cursor: 'pointer', 
                                fontWeight: activeTab === 'company' ? 700 : 500, 
                                color: activeTab === 'company' ? 'var(--color-primary)' : 'var(--color-text)',
                                display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13.5px'
                            }}
                            onClick={() => { setActiveTab('company'); resetSigForm(); }}
                        >
                            <i className='bx bx-buildings' style={{ fontSize: '18px' }}></i> Company Details
                        </button>

                        <button 
                            style={{ 
                                padding: '10px 14px', textAlign: 'left', 
                                background: activeTab === 'settings' ? 'var(--color-surface-secondary)' : 'transparent', 
                                border: '1px solid',
                                borderColor: activeTab === 'settings' ? 'var(--color-border)' : 'transparent', 
                                borderRadius: '8px', cursor: 'pointer', 
                                fontWeight: activeTab === 'settings' ? 700 : 500, 
                                color: activeTab === 'settings' ? 'var(--color-primary)' : 'var(--color-text)',
                                display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13.5px'
                            }}
                            onClick={() => { setActiveTab('settings'); resetSigForm(); }}
                        >
                            <i className='bx bx-cog' style={{ fontSize: '18px' }}></i> Preferences
                        </button>
                    </div>
                    
                    {/* Tab Content Body */}
                    <div style={{ flex: 1, padding: '0 12px', overflowY: 'auto' }}>
                        {/* Tab 1: Profile */}
                        {activeTab === 'profile' && (
                            <div>
                                <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 16px 0', color: 'var(--color-text)' }}>Profile Details</h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '500px' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: '4px' }}>Username</label>
                                        <div style={{ padding: '9px 12px', border: '1px solid var(--color-border)', borderRadius: '8px', background: 'var(--color-surface-secondary)', fontSize: '13.5px' }}>{user?.username}</div>
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: '4px' }}>Email</label>
                                        <div style={{ padding: '9px 12px', border: '1px solid var(--color-border)', borderRadius: '8px', background: 'var(--color-surface-secondary)', fontSize: '13.5px' }}>{(user as any)?.email || 'N/A'}</div>
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: '4px' }}>Role</label>
                                        <div style={{ padding: '9px 12px', border: '1px solid var(--color-border)', borderRadius: '8px', background: 'var(--color-surface-secondary)', fontSize: '13.5px', textTransform: 'capitalize' }}>{user?.role}</div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Tab 2: Email Signatures */}
                        {activeTab === 'signatures' && (
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                    <div>
                                        <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--color-text)' }}>Email Signatures</h3>
                                        <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', margin: '2px 0 0 0' }}>
                                            Save personal Text and Image signatures to attach in outbound emails.
                                        </p>
                                    </div>
                                    {!isAddingSignature && (
                                        <Button variant="primary" size="sm" onClick={handleStartNewSig}>
                                            <i className='bx bx-plus'></i> Add Signature
                                        </Button>
                                    )}
                                </div>

                                {isAddingSignature ? (
                                    <form onSubmit={handleSaveSignature} style={{ background: 'var(--color-surface-secondary)', padding: '16px', borderRadius: '12px', border: '1px solid var(--color-border)', marginBottom: '16px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                                            <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700 }}>
                                                {editingSigId ? 'Edit Signature' : 'Create New Signature'}
                                            </h4>
                                            <button 
                                                type="button" 
                                                onClick={resetSigForm}
                                                style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: '18px' }}
                                            >
                                                <i className='bx bx-x'></i>
                                            </button>
                                        </div>

                                        <div style={{ marginBottom: '14px' }}>
                                            <label style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: '6px' }}>
                                                Signature Format
                                            </label>
                                            <div style={{ display: 'flex', gap: '10px' }}>
                                                <button
                                                    type="button"
                                                    onClick={() => setSigType('TEXT')}
                                                    style={{
                                                        flex: 1,
                                                        padding: '8px 12px',
                                                        borderRadius: '8px',
                                                        border: `1px solid ${sigType === 'TEXT' ? 'var(--color-primary)' : 'var(--color-border)'}`,
                                                        background: sigType === 'TEXT' ? 'rgba(9, 36, 83, 0.15)' : 'var(--color-surface)',
                                                        color: sigType === 'TEXT' ? 'var(--color-primary)' : 'var(--color-text)',
                                                        fontWeight: 600,
                                                        fontSize: '12.5px',
                                                        cursor: 'pointer',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                                                    }}
                                                >
                                                    <i className='bx bx-font'></i> Text / Rich Text
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setSigType('IMAGE')}
                                                    style={{
                                                        flex: 1,
                                                        padding: '8px 12px',
                                                        borderRadius: '8px',
                                                        border: `1px solid ${sigType === 'IMAGE' ? 'var(--color-primary)' : 'var(--color-border)'}`,
                                                        background: sigType === 'IMAGE' ? 'rgba(9, 36, 83, 0.15)' : 'var(--color-surface)',
                                                        color: sigType === 'IMAGE' ? 'var(--color-primary)' : 'var(--color-text)',
                                                        fontWeight: 600,
                                                        fontSize: '12.5px',
                                                        cursor: 'pointer',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                                                    }}
                                                >
                                                    <i className='bx bx-image'></i> Signature Image
                                                </button>
                                            </div>
                                        </div>

                                        <div style={{ marginBottom: '14px' }}>
                                            <Input 
                                                label="Signature Label / Name *"
                                                placeholder="e.g. Official Signature, Mobile Signature"
                                                value={sigName}
                                                onChange={(e) => setSigName(e.target.value)}
                                                required
                                            />
                                        </div>

                                        {sigType === 'TEXT' && (
                                            <div style={{ marginBottom: '14px' }}>
                                                <label style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: '6px' }}>
                                                    Signature Content (Plain text or HTML) *
                                                </label>
                                                <textarea 
                                                    value={sigText}
                                                    onChange={(e) => setSigText(e.target.value)}
                                                    rows={4}
                                                    placeholder="Best regards,&#10;John Doe&#10;Security Operations Director&#10;+92 300 1234567"
                                                    style={{
                                                        width: '100%',
                                                        padding: '9px 12px',
                                                        borderRadius: '8px',
                                                        border: '1px solid var(--color-border)',
                                                        background: 'var(--color-surface)',
                                                        color: 'var(--color-text)',
                                                        fontSize: '13px',
                                                        fontFamily: 'inherit',
                                                        boxSizing: 'border-box'
                                                    }}
                                                    required
                                                />
                                            </div>
                                        )}

                                        {sigType === 'IMAGE' && (
                                            <div style={{ marginBottom: '14px' }}>
                                                <label style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: '6px' }}>
                                                    Upload Signature Image (Max 2MB) *
                                                </label>
                                                <input 
                                                    type="file" 
                                                    accept="image/*" 
                                                    ref={imageInputRef} 
                                                    onChange={handleImageChange}
                                                    style={{ display: 'none' }}
                                                />
                                                <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
                                                    <Button 
                                                        type="button" 
                                                        variant="secondary" 
                                                        size="sm" 
                                                        onClick={() => imageInputRef.current?.click()}
                                                    >
                                                        <i className='bx bx-upload'></i> Choose Image
                                                    </Button>
                                                    {sigImageFile && (
                                                        <span style={{ fontSize: '12px', color: 'var(--color-text)' }}>
                                                            {sigImageFile.name} ({(sigImageFile.size / 1024).toFixed(1)} KB)
                                                        </span>
                                                    )}
                                                </div>
                                                {sigImagePreview && (
                                                    <div style={{ marginTop: '10px', padding: '10px', border: '1px dashed var(--color-border)', borderRadius: '8px', background: 'var(--color-surface)', maxWidth: '300px' }}>
                                                        <img 
                                                            src={sigImagePreview.startsWith('http') || sigImagePreview.startsWith('blob:') ? sigImagePreview : `${API_HOST_URL}${sigImagePreview}`} 
                                                            alt="Signature preview" 
                                                            style={{ maxWidth: '100%', maxHeight: '100px', objectFit: 'contain' }}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <input 
                                                type="checkbox" 
                                                id="wsSigDefault" 
                                                checked={sigIsDefault} 
                                                onChange={(e) => setSigIsDefault(e.target.checked)}
                                                style={{ cursor: 'pointer' }}
                                            />
                                            <label htmlFor="wsSigDefault" style={{ fontSize: '13px', cursor: 'pointer', color: 'var(--color-text)' }}>
                                                Set as default signature for outgoing emails
                                            </label>
                                        </div>

                                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                                            <Button type="button" variant="secondary" size="sm" onClick={resetSigForm}>
                                                Cancel
                                            </Button>
                                            <Button type="submit" variant="primary" size="sm" disabled={savingSig}>
                                                {savingSig ? 'Saving...' : (editingSigId ? 'Update Signature' : 'Save Signature')}
                                            </Button>
                                        </div>
                                    </form>
                                ) : null}

                                {loadingSignatures ? (
                                    <div style={{ color: 'var(--color-text-muted)', fontSize: '13px', textAlign: 'center', padding: '24px' }}>
                                        <i className='bx bx-loader-alt bx-spin'></i> Loading signatures...
                                    </div>
                                ) : signatures.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '32px 16px', border: '1px dashed var(--color-border)', borderRadius: '12px', background: 'var(--color-surface-secondary)' }}>
                                        <i className='bx bx-edit' style={{ fontSize: '32px', color: 'var(--color-text-muted)', marginBottom: '8px' }}></i>
                                        <p style={{ margin: 0, fontSize: '13.5px', color: 'var(--color-text-muted)' }}>No email signatures added yet.</p>
                                        <Button variant="secondary" size="sm" onClick={handleStartNewSig} style={{ marginTop: '12px' }}>
                                            Create First Signature
                                        </Button>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        {signatures.map(sig => (
                                            <div 
                                                key={sig.id} 
                                                style={{ 
                                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
                                                    padding: '12px 16px', borderRadius: '10px', border: '1px solid var(--color-border)',
                                                    background: 'var(--color-surface-secondary)'
                                                }}
                                            >
                                                <div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <span style={{ fontWeight: 600, fontSize: '13.5px', color: 'var(--color-text)' }}>{sig.name}</span>
                                                        <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: 'var(--color-border)', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                                                            {sig.signature_type}
                                                        </span>
                                                        {sig.is_default && (
                                                            <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: '#22c55e22', color: '#22c55e', fontWeight: 600 }}>
                                                                DEFAULT
                                                            </span>
                                                        )}
                                                    </div>
                                                    {sig.signature_type === 'TEXT' && (
                                                        <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px', whiteSpace: 'pre-line', maxHeight: '36px', overflow: 'hidden' }}>
                                                            {sig.text_content}
                                                        </div>
                                                    )}
                                                    {sig.signature_type === 'IMAGE' && sig.image_url && (
                                                        <div style={{ marginTop: '4px' }}>
                                                            <img 
                                                                src={sig.image_url.startsWith('http') ? sig.image_url : `${API_HOST_URL}${sig.image_url}`} 
                                                                alt={sig.name} 
                                                                style={{ height: '32px', objectFit: 'contain' }}
                                                            />
                                                        </div>
                                                    )}
                                                </div>

                                                <div style={{ display: 'flex', gap: '6px' }}>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleEditSig(sig)}
                                                        style={{ width: '28px', height: '28px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                        title="Edit Signature"
                                                    >
                                                        <i className='bx bx-edit'></i>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeleteSig(sig.id, sig.name)}
                                                        style={{ width: '28px', height: '28px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'transparent', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                        title="Delete Signature"
                                                    >
                                                        <i className='bx bx-trash'></i>
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                        
                        {/* Tab 3: Company Details */}
                        {activeTab === 'company' && (
                            <div>
                                <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 16px 0', color: 'var(--color-text)' }}>Company Details</h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '500px' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: '4px' }}>Company ID</label>
                                        <div style={{ padding: '9px 12px', border: '1px solid var(--color-border)', borderRadius: '8px', background: 'var(--color-surface-secondary)', fontSize: '13.5px' }}>{user?.company_id || 'Not Assigned'}</div>
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: '4px' }}>Industry Profile</label>
                                        <div style={{ padding: '9px 12px', border: '1px solid var(--color-border)', borderRadius: '8px', background: 'var(--color-surface-secondary)', fontSize: '13.5px', textTransform: 'uppercase', fontWeight: 600, color: 'var(--color-primary)' }}>
                                            {user?.business_type || 'Security'}
                                        </div>
                                    </div>
                                    <p style={{ color: 'var(--color-text-muted)', fontSize: '13px', marginTop: '16px' }}>
                                        <i className='bx bx-info-circle'></i> Multi-tenant company configuration and capability toggles are available in Platform Administration.
                                    </p>
                                </div>
                            </div>
                        )}
                        
                        {/* Tab 4: Preferences */}
                        {activeTab === 'settings' && (
                            <div>
                                <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 16px 0', color: 'var(--color-text)' }}>Preferences</h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                    <p style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>System preferences and notifications configured for current tenant.</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
