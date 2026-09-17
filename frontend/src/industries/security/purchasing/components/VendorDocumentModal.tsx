import React, { useState, useRef } from 'react';
import { Modal } from '../../../../components/ui/Modal';
import { Button } from '../../../../components/ui/Button';
import { Input } from '../../../../components/ui/Input';
import { useToastStore } from '../../../../stores/toastStore';
import { uploadVendorDocument } from '../api';

interface VendorDocumentModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSaved: () => void;
    vendorId: string;
}

export const VendorDocumentModal: React.FC<VendorDocumentModalProps> = ({
    isOpen,
    onClose,
    onSaved,
    vendorId
}) => {
    const [title, setTitle] = useState('');
    const [docType, setDocType] = useState<'AGREEMENT' | 'TAX_CERTIFICATE' | 'BANK_DETAILS' | 'QUOTATION' | 'PRICE_LIST' | 'WARRANTY' | 'OTHER'>('AGREEMENT');
    const [file, setFile] = useState<File | null>(null);
    const [notes, setNotes] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const chosen = e.target.files[0];
            setFile(chosen);
            if (!title) {
                // Auto-fill title from filename
                const nameWithoutExt = chosen.name.replace(/\.[^/.]+$/, '');
                setTitle(nameWithoutExt);
            }
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim()) {
            useToastStore.getState().error('Document title is required.');
            return;
        }
        if (!file) {
            useToastStore.getState().error('Please select a file to upload.');
            return;
        }

        setIsSaving(true);
        try {
            const formData = new FormData();
            formData.append('title', title.trim());
            formData.append('document_type', docType);
            formData.append('file', file);
            formData.append('notes', notes.trim());

            await uploadVendorDocument(vendorId, formData);
            useToastStore.getState().success('Vendor document uploaded successfully.');
            onSaved();
            onClose();
        } catch (err: any) {
            useToastStore.getState().error(err?.response?.data?.detail || 'Failed to upload document.');
        } finally {
            setIsSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Upload Vendor Document" size="medium">
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                    <label style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: '4px' }}>
                        Document Category / Type *
                    </label>
                    <select
                        value={docType}
                        onChange={(e) => setDocType(e.target.value as any)}
                        style={{
                            width: '100%',
                            padding: '9px 12px',
                            borderRadius: '8px',
                            border: '1px solid var(--color-border)',
                            background: 'var(--color-surface)',
                            color: 'var(--color-text)',
                            fontSize: '13px'
                        }}
                        required
                    >
                        <option value="AGREEMENT">Supplier Agreement / NDA</option>
                        <option value="TAX_CERTIFICATE">Tax Certificate / NTN Form</option>
                        <option value="BANK_DETAILS">Bank Details / Verification Letter</option>
                        <option value="QUOTATION">Quotation / RFQ Response</option>
                        <option value="PRICE_LIST">Official Price List / Catalogue</option>
                        <option value="WARRANTY">Warranty & SLA Certificate</option>
                        <option value="OTHER">Other Compliance Document</option>
                    </select>
                </div>

                <Input
                    label="Document Title *"
                    placeholder="e.g. Master Supply Agreement 2026-2027"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                />

                <div>
                    <label style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: '6px' }}>
                        Document File (PDF, DOCX, XLSX, PNG) *
                    </label>
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        style={{ display: 'none' }}
                        required
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <Button 
                            type="button" 
                            variant="secondary" 
                            size="sm"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <i className='bx bx-upload'></i> Choose File
                        </Button>
                        {file ? (
                            <span style={{ fontSize: '12.5px', color: 'var(--color-text)' }}>
                                {file.name} ({(file.size / 1024).toFixed(1)} KB)
                            </span>
                        ) : (
                            <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                                No file selected
                            </span>
                        )}
                    </div>
                </div>

                <div>
                    <label style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: '4px' }}>
                        Notes / Expiry / Validity
                    </label>
                    <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        rows={2}
                        placeholder="Add remarks or expiry date info..."
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
                    />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
                    <Button type="button" variant="secondary" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button type="submit" variant="primary" disabled={isSaving}>
                        {isSaving ? 'Uploading...' : 'Upload Document'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
};
