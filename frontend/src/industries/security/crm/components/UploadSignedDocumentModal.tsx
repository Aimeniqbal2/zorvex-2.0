import React, { useState } from 'react';
import type { SecurityProposal, ProposalSignedDocument } from '../api';
import { uploadSignedDocument } from '../api';
import { useToastStore } from '../../../../stores/toastStore';

interface Props {
    proposal: SecurityProposal;
    onClose: () => void;
    onSuccess: (doc: ProposalSignedDocument) => void;
}

export const UploadSignedDocumentModal: React.FC<Props> = ({
    proposal,
    onClose,
    onSuccess
}) => {
    const [title, setTitle] = useState('');
    const [documentType, setDocumentType] = useState<'SIGNED_CONTRACT' | 'SIGNED_PROPOSAL' | 'PURCHASE_ORDER' | 'AWARD_LETTER' | 'OTHER_SUPPORTING'>('SIGNED_CONTRACT');
    const [file, setFile] = useState<File | null>(null);
    const [notes, setNotes] = useState('');
    const [loading, setLoading] = useState(false);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const f = e.target.files[0];
            setFile(f);
            if (!title) {
                // Auto-fill title from filename without extension
                const nameWithoutExt = f.name.replace(/\.[^/.]+$/, "");
                setTitle(nameWithoutExt);
            }
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!file) {
            useToastStore.getState().error('Please select a file to upload.');
            return;
        }

        setLoading(true);
        const formData = new FormData();
        formData.append('title', title);
        formData.append('document_type', documentType);
        formData.append('file', file);
        formData.append('notes', notes);

        try {
            const doc = await uploadSignedDocument(proposal.id, formData);
            useToastStore.getState().success('Document uploaded successfully!');
            onSuccess(doc);
            onClose();
        } catch (err: any) {
            console.error('Document upload failed', err);
            const msg = err.response?.data?.error || err.message || 'Failed to upload document';
            useToastStore.getState().error(msg);
        } finally {
            setLoading(false);
        }
    };

    const overlayStyle: React.CSSProperties = {
        position: 'fixed', inset: 0, zIndex: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)',
        padding: '16px', overflowY: 'auto'
    };
    const panelStyle: React.CSSProperties = {
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 20,
        width: '100%', maxWidth: 480,
        boxShadow: '0 24px 60px rgba(0,0,0,0.3)',
        padding: 28,
        color: 'var(--color-text)'
    };
    const headerStyle: React.CSSProperties = {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        paddingBottom: 20, marginBottom: 20,
        borderBottom: '1px solid var(--color-border)'
    };
    const iconBgStyle: React.CSSProperties = {
        width: 44, height: 44, borderRadius: 12,
        background: 'rgba(99,102,241,0.15)', color: '#6366f1',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 20, flexShrink: 0
    };
    const closeBtnStyle: React.CSSProperties = {
        background: 'none', border: 'none', cursor: 'pointer',
        color: 'var(--color-text-muted)', fontSize: 22, lineHeight: 1,
        padding: 4, borderRadius: 6
    };
    const labelStyle: React.CSSProperties = {
        display: 'block', fontSize: 11, fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: '0.06em',
        color: 'var(--color-text-muted)', marginBottom: 6
    };
    const inputStyle: React.CSSProperties = {
        width: '100%', background: 'var(--color-surface-secondary)',
        border: '1px solid var(--color-border)', borderRadius: 10,
        padding: '9px 12px', fontSize: 13.5, color: 'var(--color-text)',
        outline: 'none', boxSizing: 'border-box'
    };

    return (
        <div style={overlayStyle}>
            <div style={panelStyle}>
                {/* Header */}
                <div style={headerStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div style={iconBgStyle}>
                            <i className="bx bx-upload" />
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Upload Signed Document</h3>
                            <p style={{ margin: '3px 0 0', fontSize: 12.5, color: 'var(--color-text-muted)' }}>
                                Attach signed agreement, PO, or award letter
                            </p>
                        </div>
                    </div>
                    <button style={closeBtnStyle} onClick={onClose}>
                        <i className="bx bx-x" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* Document Type */}
                    <div>
                        <label style={labelStyle}>Document Type</label>
                        <select
                            value={documentType}
                            onChange={(e) => setDocumentType(e.target.value as any)}
                            style={inputStyle}
                        >
                            <option value="SIGNED_CONTRACT">Signed Contract Agreement</option>
                            <option value="SIGNED_PROPOSAL">Signed Commercial Proposal</option>
                            <option value="PURCHASE_ORDER">Client Purchase Order (PO)</option>
                            <option value="AWARD_LETTER">Award / Intent Letter</option>
                            <option value="OTHER_SUPPORTING">Other Supporting Document</option>
                        </select>
                    </div>

                    {/* Document Title */}
                    <div>
                        <label style={labelStyle}>Document Title</label>
                        <input
                            type="text"
                            placeholder="e.g. Master Security Agreement - Signed"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            style={inputStyle}
                            required
                        />
                    </div>

                    {/* File Upload */}
                    <div>
                        <label style={labelStyle}>Choose File (PDF, DOCX, PNG, JPG)</label>
                        <div style={{
                            background: 'var(--color-surface-secondary)',
                            border: '2px dashed var(--color-border)',
                            borderRadius: 10, padding: '16px',
                            textAlign: 'center', cursor: 'pointer',
                            transition: 'border-color 0.2s'
                        }}>
                            <i className="bx bx-cloud-upload" style={{
                                fontSize: 28, color: '#6366f1', marginBottom: 6, display: 'block'
                            }} />
                            <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--color-text-muted)' }}>
                                {file ? file.name : 'Click to choose or drag & drop a file'}
                            </p>
                            <input
                                type="file"
                                onChange={handleFileChange}
                                accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                                required
                                style={{
                                    position: 'absolute', opacity: 0, width: 1, height: 1
                                }}
                                id="doc-file-upload"
                            />
                            <label
                                htmlFor="doc-file-upload"
                                style={{
                                    display: 'inline-block', padding: '6px 14px',
                                    background: '#6366f1', color: '#fff',
                                    borderRadius: 8, fontSize: 12.5, fontWeight: 600,
                                    cursor: 'pointer', transition: 'background 0.2s'
                                }}
                            >
                                Browse File
                            </label>
                        </div>
                    </div>

                    {/* Notes */}
                    <div>
                        <label style={labelStyle}>Notes / Reference (Optional)</label>
                        <textarea
                            rows={2}
                            placeholder="Any notes about countersigning, stamp, or signatories..."
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            style={{ ...inputStyle, resize: 'vertical' }}
                        />
                    </div>

                    {/* Footer */}
                    <div style={{
                        display: 'flex', justifyContent: 'flex-end', gap: 12,
                        paddingTop: 16, borderTop: '1px solid var(--color-border)'
                    }}>
                        <button
                            type="button"
                            onClick={onClose}
                            style={{
                                padding: '9px 18px',
                                background: 'var(--color-surface-secondary)',
                                border: '1px solid var(--color-border)',
                                borderRadius: 10, fontSize: 13.5, fontWeight: 600,
                                color: 'var(--color-text-muted)', cursor: 'pointer'
                            }}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            style={{
                                padding: '9px 20px',
                                background: loading ? '#6b7280' : 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
                                border: 'none', borderRadius: 10,
                                fontSize: 13.5, fontWeight: 700, color: '#fff',
                                cursor: loading ? 'not-allowed' : 'pointer',
                                display: 'flex', alignItems: 'center', gap: 8,
                                boxShadow: loading ? 'none' : '0 4px 14px rgba(99,102,241,0.35)'
                            }}
                        >
                            {loading
                                ? <><i className="bx bx-loader-alt" style={{ animation: 'spin 1s linear infinite' }} /> Uploading...</>
                                : <><i className="bx bx-upload" /> Upload Document</>
                            }
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
