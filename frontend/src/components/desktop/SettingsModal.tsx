import React, { useState, useEffect, useRef } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { useAuthStore } from '../../auth/authStore';
import { useToastStore } from '../../stores/toastStore';
import { 
    getMySignatures, createSignature, updateSignature, 
    deleteSignature, type UserEmailSignature 
} from '../../api/communications';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialTab?: 'profile' | 'signatures' | 'company' | 'settings';
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, initialTab = 'profile' }) => {
    const { user } = useAuthStore();
    const [activeTab, setActiveTab] = useState(initialTab);

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
        if (isOpen) {
            setActiveTab(initialTab);
            loadSignatures();
        }
    }, [isOpen, initialTab]);

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
        setSigType(sig.signature_type);
        setSigName(sig.name);
        setSigText(sig.text_content || '');
        setSigImageFile(null);
        setSigImagePreview(sig.image_url || null);
        setSigIsDefault(sig.is_default);
        setIsAddingSignature(true);
    };

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setSigImageFile(file);
            setSigImagePreview(URL.createObjectURL(file));
        }
    };

    const handleSaveSignature = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!sigName.trim()) {
            useToastStore.getState().error('Please enter a signature name.');
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

    if (!isOpen) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Account & Settings" size="large">
            <div style={{ display: 'flex', gap: '20px', minHeight: '440px' }}>
                {/* Left Navigation Tabs */}
                <div style={{ width: '200px', borderRight: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: '6px', paddingRight: '16px' }}>
                    <button 
                        style={{ 
                            padding: '9px 12px', textAlign: 'left', 
                            background: activeTab === 'profile' ? 'var(--color-surface-secondary)' : 'transparent', 
                            border: '1px solid',
                            borderColor: activeTab === 'profile' ? 'var(--color-border)' : 'transparent', 
                            borderRadius: '8px', cursor: 'pointer', 
                            fontWeight: activeTab === 'profile' ? 700 : 500, 
                            color: activeTab === 'profile' ? 'var(--color-primary)' : 'var(--color-text)',
                            display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px'
                        }}
                        onClick={() => { setActiveTab('profile'); resetSigForm(); }}
                    >
                        <i className='bx bx-user' style={{ fontSize: '16px' }}></i> Profile
                    </button>
                    
                    <button 
                        style={{ 
                            padding: '9px 12px', textAlign: 'left', 
                            background: activeTab === 'signatures' ? 'var(--color-surface-secondary)' : 'transparent', 
                            border: '1px solid',
                            borderColor: activeTab === 'signatures' ? 'var(--color-border)' : 'transparent', 
                            borderRadius: '8px', cursor: 'pointer', 
                            fontWeight: activeTab === 'signatures' ? 700 : 500, 
                            color: activeTab === 'signatures' ? 'var(--color-primary)' : 'var(--color-text)',
                            display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px'
                        }}
                        onClick={() => { setActiveTab('signatures'); resetSigForm(); }}
                    >
                        <i className='bx bx-edit-alt' style={{ fontSize: '16px' }}></i> Email Signatures
                    </button>

                    <button 
                        style={{ 
                            padding: '9px 12px', textAlign: 'left', 
                            background: activeTab === 'company' ? 'var(--color-surface-secondary)' : 'transparent', 
                            border: '1px solid',
                            borderColor: activeTab === 'company' ? 'var(--color-border)' : 'transparent', 
                            borderRadius: '8px', cursor: 'pointer', 
                            fontWeight: activeTab === 'company' ? 700 : 500, 
                            color: activeTab === 'company' ? 'var(--color-primary)' : 'var(--color-text)',
                            display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px'
                        }}
                        onClick={() => { setActiveTab('company'); resetSigForm(); }}
                    >
                        <i className='bx bx-buildings' style={{ fontSize: '16px' }}></i> Company Details
                    </button>

                    <button 
                        style={{ 
                            padding: '9px 12px', textAlign: 'left', 
                            background: activeTab === 'settings' ? 'var(--color-surface-secondary)' : 'transparent', 
                            border: '1px solid',
                            borderColor: activeTab === 'settings' ? 'var(--color-border)' : 'transparent', 
                            borderRadius: '8px', cursor: 'pointer', 
                            fontWeight: activeTab === 'settings' ? 700 : 500, 
                            color: activeTab === 'settings' ? 'var(--color-primary)' : 'var(--color-text)',
                            display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px'
                        }}
                        onClick={() => { setActiveTab('settings'); resetSigForm(); }}
                    >
                        <i className='bx bx-cog' style={{ fontSize: '16px' }}></i> Preferences
                    </button>
                </div>
                
                {/* Tab Content Body */}
                <div style={{ flex: 1, padding: '0 8px', overflowY: 'auto' }}>
                    {/* Tab 1: Profile */}
                    {activeTab === 'profile' && (
                        <div>
                            <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 16px 0' }}>Profile Details</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
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
                                    <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>Email Signatures</h3>
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

                            {/* Signature Form (Create / Edit) */}
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

                                    {/* Format Selector: Text vs Image */}
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

                                    {/* Name Input */}
                                    <div style={{ marginBottom: '14px' }}>
                                        <Input 
                                            label="Signature Label / Name *"
                                            placeholder="e.g. Official Signature, Mobile Signature"
                                            value={sigName}
                                            onChange={(e) => setSigName(e.target.value)}
                                            required
                                        />
                                    </div>

                                    {/* Text Signature Editor */}
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

                                    {/* Image Signature Uploader */}
                                    {sigType === 'IMAGE' && (
                                        <div style={{ marginBottom: '14px' }}>
                                            <label style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: '6px' }}>
                                                Upload Signature Image (PNG, JPG, SVG) *
                                            </label>
                                            <input 
                                                type="file"
                                                accept="image/*"
                                                ref={imageInputRef}
                                                onChange={handleImageChange}
                                                style={{ display: 'none' }}
                                            />
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                                                <Button 
                                                    type="button" 
                                                    variant="secondary" 
                                                    size="sm"
                                                    onClick={() => imageInputRef.current?.click()}
                                                >
                                                    <i className='bx bx-upload'></i> Choose Image File
                                                </Button>
                                                {sigImageFile && (
                                                    <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                                                        {sigImageFile.name} ({(sigImageFile.size / 1024).toFixed(1)} KB)
                                                    </span>
                                                )}
                                            </div>

                                            {sigImagePreview && (
                                                <div style={{ marginTop: '10px', padding: '10px', border: '1px dashed var(--color-border)', borderRadius: '8px', background: 'var(--color-surface)', display: 'inline-block' }}>
                                                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>Image Preview:</div>
                                                    <img 
                                                        src={sigImagePreview} 
                                                        alt="Signature Preview" 
                                                        style={{ maxHeight: '70px', maxWidth: '240px', objectFit: 'contain', display: 'block' }}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Set as default checkbox */}
                                    <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <input 
                                            type="checkbox"
                                            id="sig-default-check"
                                            checked={sigIsDefault}
                                            onChange={(e) => setSigIsDefault(e.target.checked)}
                                        />
                                        <label htmlFor="sig-default-check" style={{ fontSize: '12.5px', color: 'var(--color-text)', cursor: 'pointer' }}>
                                            Set as my default email signature
                                        </label>
                                    </div>

                                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                        <Button type="button" variant="ghost" size="sm" onClick={resetSigForm}>
                                            Cancel
                                        </Button>
                                        <Button type="submit" variant="primary" size="sm" disabled={savingSig}>
                                            {savingSig ? 'Saving...' : editingSigId ? 'Update Signature' : 'Save Signature'}
                                        </Button>
                                    </div>
                                </form>
                            ) : null}

                            {/* Signatures List */}
                            {loadingSignatures ? (
                                <div style={{ textAlign: 'center', padding: '24px', color: 'var(--color-text-muted)' }}>
                                    Loading signatures...
                                </div>
                            ) : signatures.length === 0 && !isAddingSignature ? (
                                <div style={{ textAlign: 'center', padding: '36px 16px', border: '1px dashed var(--color-border)', borderRadius: '10px', background: 'var(--color-surface-secondary)' }}>
                                    <i className='bx bx-edit' style={{ fontSize: '32px', color: 'var(--color-text-muted)', marginBottom: '8px' }}></i>
                                    <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px' }}>No Email Signatures Saved</div>
                                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '14px' }}>
                                        Create a Text or Image signature to include in emails automatically.
                                    </div>
                                    <Button variant="primary" size="sm" onClick={handleStartNewSig}>
                                        <i className='bx bx-plus'></i> Create Signature
                                    </Button>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {signatures.map(sig => (
                                        <div 
                                            key={sig.id}
                                            style={{
                                                padding: '12px 16px',
                                                borderRadius: '10px',
                                                border: '1px solid var(--color-border)',
                                                background: 'var(--color-surface)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                gap: '12px'
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                <div style={{ 
                                                    width: '34px', height: '34px', borderRadius: '8px', 
                                                    background: sig.signature_type === 'TEXT' ? 'rgba(56, 189, 248, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                                                    color: sig.signature_type === 'TEXT' ? '#38bdf8' : '#34d399',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px'
                                                }}>
                                                    <i className={sig.signature_type === 'TEXT' ? 'bx bx-font' : 'bx bx-image'}></i>
                                                </div>
                                                <div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <strong style={{ fontSize: '13.5px' }}>{sig.name}</strong>
                                                        <span style={{ 
                                                            fontSize: '10px', padding: '1px 6px', borderRadius: '4px', 
                                                            background: 'var(--color-surface-secondary)', border: '1px solid var(--color-border)', 
                                                            color: 'var(--color-text-muted)', fontWeight: 600 
                                                        }}>
                                                            {sig.signature_type === 'TEXT' ? 'Text Signature' : 'Image Signature'}
                                                        </span>
                                                        {sig.is_default && (
                                                            <span style={{ 
                                                                fontSize: '10px', padding: '1px 6px', borderRadius: '4px', 
                                                                background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', 
                                                                color: '#10b981', fontWeight: 700 
                                                            }}>
                                                                DEFAULT
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div style={{ fontSize: '11.5px', color: 'var(--color-text-muted)', marginTop: '2px', maxWidth: '380px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {sig.signature_type === 'TEXT' ? sig.text_content : 'Uploaded image banner'}
                                                    </div>
                                                </div>
                                            </div>

                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
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
                            <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 16px 0' }}>Company Details</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: '4px' }}>Company ID</label>
                                    <div style={{ padding: '9px 12px', border: '1px solid var(--color-border)', borderRadius: '8px', background: 'var(--color-surface-secondary)', fontSize: '13.5px' }}>{user?.company_id || 'Not Assigned'}</div>
                                </div>
                                <p style={{ color: 'var(--color-text-muted)', fontSize: '13px', marginTop: '16px' }}>
                                    <i className='bx bx-info-circle'></i> Company management is available in the Platform Administration module.
                                </p>
                            </div>
                        </div>
                    )}
                    
                    {/* Tab 4: Preferences */}
                    {activeTab === 'settings' && (
                        <div>
                            <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 16px 0' }}>Preferences</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                <p style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>No additional preferences configured yet.</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--color-border)', paddingTop: '16px' }}>
                <Button variant="secondary" onClick={onClose}>
                    Close
                </Button>
            </div>
        </Modal>
    );
};
