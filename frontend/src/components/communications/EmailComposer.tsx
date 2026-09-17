import React, { useState, useEffect, useRef } from 'react';
import { apiClient as api } from '../../api/client';
import { getMySignatures, type UserEmailSignature } from '../../api/communications';
import './EmailComposer.css';

export interface EmailComposerProps {
    contextType?: string;
    contextId?: string;
    contextVersionId?: string;
    prefillTo?: string;
    prefillSubject?: string;
    prefillBodyHtml?: string;
    onTriggerSend?: (emailId: string) => Promise<void>;
    onSent?: () => void;
    onCancel?: () => void;
}

const EmailComposer: React.FC<EmailComposerProps> = ({
    contextType,
    contextId,
    contextVersionId,
    prefillTo = '',
    prefillSubject = '',
    prefillBodyHtml = '',
    onTriggerSend,
    onSent,
    onCancel
}) => {
    const [senders, setSenders] = useState<any[]>([]);
    const [selectedSender, setSelectedSender] = useState<string>('');
    const [to, setTo] = useState(prefillTo);
    const [cc, setCc] = useState('');
    const [bcc, setBcc] = useState('');
    const [subject, setSubject] = useState(prefillSubject);
    const [body, setBody] = useState(prefillBodyHtml);
    const [files, setFiles] = useState<File[]>([]);
    const [isSending, setIsSending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Email Signatures State
    const [signatures, setSignatures] = useState<UserEmailSignature[]>([]);
    const [includeSignature, setIncludeSignature] = useState(true);
    const [selectedSigId, setSelectedSigId] = useState<string>('');
    const [showSigPreview, setShowSigPreview] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        fetchSenders();
        fetchSignatures();
    }, []);

    const fetchSenders = async () => {
        try {
            const res = await api.get('/api/communications/senders/');
            const data = res.data.results || res.data;
            setSenders(data);
            const usable = data.filter((s: any) => s.is_usable || s.verification_status === 'VERIFIED' || s.verification_status === 'USABLE' || s.provider_type === 'SYSTEM_DEFAULT');
            if (usable.length > 0) {
                const def = usable.find((s: any) => s.is_default);
                setSelectedSender(def ? def.id : usable[0].id);
            }
        } catch (err: any) {
            console.error("Failed to load senders", err);
        }
    };

    const fetchSignatures = async () => {
        try {
            const data = await getMySignatures();
            if (Array.isArray(data) && data.length > 0) {
                setSignatures(data);
                const defaultSig = data.find(s => s.is_default) || data[0];
                setSelectedSigId(defaultSig.id);
                setIncludeSignature(true);
            } else {
                setSignatures([]);
                setIncludeSignature(false);
            }
        } catch (err: any) {
            console.error("Failed to load signatures", err);
        }
    };

    const activeSignature = signatures.find(s => s.id === selectedSigId);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const selectedFiles = Array.from(e.target.files);
            setFiles(prev => [...prev, ...selectedFiles]);
        }
    };

    const removeFile = (index: number) => {
        setFiles(prev => prev.filter((_, i) => i !== index));
    };

    const constructFinalBodyHtml = (): string => {
        let finalHtml = body;

        // Automatically append selected signature if enabled
        if (includeSignature && activeSignature) {
            if (activeSignature.signature_type === 'TEXT' && activeSignature.text_content) {
                const formattedText = activeSignature.text_content.replace(/\n/g, '<br/>');
                finalHtml += `<div class="email-signature" style="margin-top: 24px; padding-top: 14px; border-top: 1px solid #cbd5e1; color: #475569; font-size: 13px; line-height: 1.5;">${formattedText}</div>`;
            } else if (activeSignature.signature_type === 'IMAGE' && (activeSignature.image_url || activeSignature.image)) {
                const imgUrl = activeSignature.image_url || activeSignature.image;
                finalHtml += `<div class="email-signature-image" style="margin-top: 24px; padding-top: 14px; border-top: 1px solid #cbd5e1;"><img src="${imgUrl}" alt="${activeSignature.name}" style="max-height: 80px; max-width: 260px; object-fit: contain; display: block;" /></div>`;
            }
        }

        return finalHtml;
    };

    const handleSend = async () => {
        if (!selectedSender) {
            setError("A valid, configured sender must be selected.");
            return;
        }
        if (!to) {
            setError("Recipient (To) is required.");
            return;
        }

        setIsSending(true);
        setError(null);

        try {
            const finalBodyHtml = constructFinalBodyHtml();

            // 1. Create the Draft Email with full context linkages and attached signature
            const draftRes = await api.post('/api/communications/emails/', {
                sender_identity: selectedSender,
                to,
                cc,
                bcc,
                subject,
                body_html: finalBodyHtml,
                context_type: contextType,
                context_id: contextId,
                context_version_id: contextVersionId
            });
            const emailId = draftRes.data.id;

            // 2. Upload attachments sequentially
            for (const file of files) {
                const formData = new FormData();
                formData.append('file', file);
                await api.post(`/api/communications/emails/${emailId}/add_attachment/`, formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
            }

            // 3. Trigger Send
            if (onTriggerSend) {
                await onTriggerSend(emailId);
            } else {
                await api.post(`/api/communications/emails/${emailId}/send/`);
            }
            
            if (onSent) onSent();
        } catch (err: any) {
            console.error(err);
            const msg = err.response?.data?.error || err.response?.data?.detail || "An error occurred while sending.";
            setError(msg);
        } finally {
            setIsSending(false);
        }
    };

    const usableSenders = senders.filter(
        (s: any) => s.is_usable || s.verification_status === 'VERIFIED' || s.verification_status === 'USABLE' || s.provider_type === 'SYSTEM_DEFAULT'
    );

    return (
        <div className="email-composer-container">
            <div className="email-composer-header">
                <h3>Universal Email Composer</h3>
            </div>
            
            <div className="email-composer-body">
                {error && <div className="email-composer-alert">{error}</div>}
                
                <div className="email-composer-row">
                    <label>From:</label>
                    <select 
                        value={selectedSender} 
                        onChange={e => setSelectedSender(e.target.value)}
                        disabled={isSending || usableSenders.length === 0}
                    >
                        <option value="">-- Select Sender --</option>
                        {usableSenders.map(s => (
                            <option key={s.id} value={s.id}>
                                {s.name} &lt;{s.email_address}&gt; {s.provider_type === 'SYSTEM_DEFAULT' ? '(Platform Default)' : s.verification_status === 'VERIFIED' ? '(Verified SMTP)' : ''}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="email-composer-row">
                    <label>To:</label>
                    <input type="text" value={to} onChange={e => setTo(e.target.value)} disabled={isSending} />
                </div>

                <div className="email-composer-row">
                    <label>CC:</label>
                    <input type="text" value={cc} onChange={e => setCc(e.target.value)} disabled={isSending} />
                </div>

                <div className="email-composer-row">
                    <label>BCC:</label>
                    <input type="text" value={bcc} onChange={e => setBcc(e.target.value)} disabled={isSending} />
                </div>

                <div className="email-composer-row">
                    <label>Subject:</label>
                    <input type="text" value={subject} onChange={e => setSubject(e.target.value)} disabled={isSending} />
                </div>

                <div className="email-composer-row email-composer-editor">
                    <label>Message:</label>
                    <textarea 
                        value={body} 
                        onChange={e => setBody(e.target.value)}
                        disabled={isSending}
                        rows={9}
                        placeholder="Write your email message..."
                    />
                </div>

                {/* Email Signature Section */}
                <div className="email-signature-section">
                    <div className="email-signature-header">
                        <label className="email-signature-toggle">
                            <input 
                                type="checkbox"
                                checked={includeSignature}
                                onChange={(e) => setIncludeSignature(e.target.checked)}
                                disabled={isSending || signatures.length === 0}
                            />
                            <span>Include Email Signature</span>
                        </label>

                        {signatures.length > 0 && includeSignature && (
                            <button
                                type="button"
                                onClick={() => setShowSigPreview(!showSigPreview)}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: 'var(--color-primary, #6366f1)',
                                    fontSize: '12px',
                                    cursor: 'pointer',
                                    fontWeight: 600
                                }}
                            >
                                {showSigPreview ? 'Hide Signature Preview' : 'Preview Signature'}
                            </button>
                        )}
                    </div>

                    {signatures.length === 0 ? (
                        <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                            No email signatures configured. You can save Text and Image signatures in Settings / My Profile.
                        </div>
                    ) : includeSignature ? (
                        <div className="email-signature-controls">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <label style={{ fontSize: '12px', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>Choose Signature:</label>
                                <select
                                    value={selectedSigId}
                                    onChange={(e) => setSelectedSigId(e.target.value)}
                                    disabled={isSending}
                                    style={{ flex: 1 }}
                                >
                                    {signatures.map(s => (
                                        <option key={s.id} value={s.id}>
                                            {s.name} ({s.signature_type === 'TEXT' ? 'Text' : 'Image'}) {s.is_default ? '★ Default' : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Live Preview of the Signature */}
                            {(showSigPreview || activeSignature) && (
                                <div className="email-signature-preview">
                                    <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 700, marginBottom: '6px' }}>
                                        Signature Preview ({activeSignature?.signature_type}):
                                    </div>
                                    {activeSignature?.signature_type === 'TEXT' ? (
                                        <div 
                                            style={{ lineHeight: 1.4, color: 'var(--color-text)' }}
                                            dangerouslySetInnerHTML={{ __html: activeSignature.text_content.replace(/\n/g, '<br/>') }}
                                        />
                                    ) : activeSignature?.image_url || activeSignature?.image ? (
                                        <img 
                                            src={activeSignature.image_url || activeSignature.image || ''} 
                                            alt={activeSignature.name} 
                                            style={{ maxHeight: '60px', maxWidth: '220px', objectFit: 'contain' }}
                                        />
                                    ) : (
                                        <span style={{ fontStyle: 'italic' }}>No image content</span>
                                    )}
                                </div>
                            )}
                        </div>
                    ) : null}
                </div>

                <div className="email-composer-row">
                    <label>Attachments:</label>
                    <input 
                        type="file" 
                        multiple 
                        ref={fileInputRef} 
                        onChange={handleFileChange}
                        style={{ display: 'none' }}
                        disabled={isSending}
                    />
                    <button 
                        type="button" 
                        className="btn-secondary" 
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isSending}
                    >
                        <i className='bx bx-paperclip'></i> + Add Attachment
                    </button>
                    <div className="attachment-list">
                        {files.map((f, i) => (
                            <div key={i} className="attachment-item">
                                {f.name} ({(f.size / 1024).toFixed(1)} KB)
                                <button type="button" onClick={() => removeFile(i)} disabled={isSending}>x</button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="email-composer-footer">
                <button type="button" className="btn-cancel" onClick={onCancel} disabled={isSending}>Cancel</button>
                <button type="button" className="btn-primary" onClick={handleSend} disabled={isSending || !selectedSender}>
                    {isSending ? 'Sending...' : 'Send'}
                </button>
            </div>
        </div>
    );
};

export default EmailComposer;
