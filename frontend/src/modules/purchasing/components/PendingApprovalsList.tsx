import React, { useState, useEffect } from 'react';
import { purchasingApi } from '../api';
import { Button } from '../../../components/ui/Button';
import type { ProcurementDocument } from '../types';

export const PendingApprovalsList: React.FC = () => {
    const [documents, setDocuments] = useState<ProcurementDocument[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [selectedDoc, setSelectedDoc] = useState<ProcurementDocument | null>(null);
    const [comment, setComment] = useState('');
    const [actionLoading, setActionLoading] = useState(false);

    useEffect(() => {
        fetchPendingApprovals();
    }, []);

    const fetchPendingApprovals = async () => {
        try {
            setLoading(true);
            const response = await purchasingApi.getPendingApprovals();
            const results = Array.isArray(response) ? response : (response.results || []);
            setDocuments(results);
        } catch (error) {
            console.error("Error fetching pending approvals:", error);
            alert("Failed to load pending approvals.");
        } finally {
            setLoading(false);
        }
    };

    const handleApprove = async () => {
        if (!selectedDoc) return;
        try {
            setActionLoading(true);
            await purchasingApi.postAction(selectedDoc.id, 'approve', { comments: comment });
            alert('Document approved successfully.');
            setSelectedDoc(null);
            setComment('');
            fetchPendingApprovals();
        } catch (err: any) {
            alert(err.response?.data?.detail || "Failed to approve document.");
        } finally {
            setActionLoading(false);
        }
    };

    const handleReject = async () => {
        if (!selectedDoc) return;
        if (!comment.trim()) {
            alert('Rejection requires a comment or reason.');
            return;
        }
        try {
            setActionLoading(true);
            await purchasingApi.postAction(selectedDoc.id, 'reject', { comments: comment });
            alert('Document rejected successfully.');
            setSelectedDoc(null);
            setComment('');
            fetchPendingApprovals();
        } catch (err: any) {
            alert(err.response?.data?.detail || "Failed to reject document.");
        } finally {
            setActionLoading(false);
        }
    };

    if (loading) {
        return <div>Loading pending approvals...</div>;
    }

    return (
        <div>
            <h2>Pending My Approval</h2>
            {documents.length === 0 ? (
                <p>No documents are currently awaiting your approval.</p>
            ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '16px' }}>
                    <thead>
                        <tr style={{ borderBottom: '2px solid var(--color-border)', textAlign: 'left' }}>
                            <th style={{ padding: '8px' }}>Document #</th>
                            <th style={{ padding: '8px' }}>Type</th>
                            <th style={{ padding: '8px' }}>Date</th>
                            <th style={{ padding: '8px' }}>Amount</th>
                            <th style={{ padding: '8px' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {documents.map((doc) => (
                            <tr key={doc.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                <td style={{ padding: '8px' }}>{doc.number}</td>
                                <td style={{ padding: '8px' }}>{doc.document_type}</td>
                                <td style={{ padding: '8px' }}>{doc.document_date}</td>
                                <td style={{ padding: '8px' }}>{doc.total_amount} {doc.currency}</td>
                                <td style={{ padding: '8px' }}>
                                    <Button variant="ghost" onClick={() => setSelectedDoc(doc)}>Review</Button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}

            {selectedDoc && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div style={{ background: '#fff', padding: '24px', borderRadius: '8px', width: '600px', maxHeight: '90vh', overflowY: 'auto' }}>
                        <h3>Review {selectedDoc.document_type} #{selectedDoc.number}</h3>
                        <div style={{ marginTop: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                            <div>
                                <p><strong>Date:</strong> {selectedDoc.document_date}</p>
                                <p><strong>Expected Delivery:</strong> {selectedDoc.expected_delivery_date || 'N/A'}</p>
                            </div>
                            <div>
                                <p><strong>Total Amount:</strong> {selectedDoc.total_amount} {selectedDoc.currency}</p>
                                <p><strong>Status:</strong> {selectedDoc.status}</p>
                            </div>
                        </div>
                        
                        <div style={{ marginTop: '16px' }}>
                            <h4>Lines</h4>
                            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '8px' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid #ddd', textAlign: 'left' }}>
                                        <th>Item ID</th>
                                        <th>Quantity</th>
                                        <th>Unit Price</th>
                                        <th>Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {selectedDoc.lines?.map((line: any) => (
                                        <tr key={line.id} style={{ borderBottom: '1px solid #eee' }}>
                                            <td>{line.item}</td>
                                            <td>{line.quantity}</td>
                                            <td>{line.unit_price}</td>
                                            <td>{line.total_amount}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div style={{ marginTop: '24px' }}>
                            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Approval/Rejection Comments:</label>
                            <textarea 
                                value={comment} 
                                onChange={e => setComment(e.target.value)} 
                                style={{ width: '100%', padding: '8px', minHeight: '80px', border: '1px solid #ccc', borderRadius: '4px' }}
                                placeholder="Required for rejection, optional for approval."
                            />
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                            <Button variant="ghost" onClick={() => { setSelectedDoc(null); setComment(''); }} disabled={actionLoading}>Cancel</Button>
                            <Button variant="danger" onClick={handleReject} disabled={actionLoading}>Reject</Button>
                            <Button variant="primary" onClick={handleApprove} disabled={actionLoading}>Approve</Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
