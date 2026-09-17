import React, { useState, useEffect } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { relieveDeployment } from '../api';

interface DeploymentRelieveModalProps {
    isOpen: boolean;
    onClose: () => void;
    deploymentId: string | null;
    employeeName?: string;
    onRelieved: () => void;
}

export const DeploymentRelieveModal: React.FC<DeploymentRelieveModalProps> = ({
    isOpen,
    onClose,
    deploymentId,
    employeeName,
    onRelieved
}) => {
    const [relievedDate, setRelievedDate] = useState(new Date().toISOString().split('T')[0]);
    const [reliefReason, setReliefReason] = useState('Deployment completed / relieved');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            setRelievedDate(new Date().toISOString().split('T')[0]);
            setReliefReason('Deployment completed / relieved');
            setError(null);
        }
    }, [isOpen]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!deploymentId) return;
        setLoading(true);
        setError(null);
        try {
            await relieveDeployment(deploymentId, {
                relieved_date: relievedDate,
                relief_reason: reliefReason
            });
            onRelieved();
            onClose();
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to relieve deployment');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Relieve Guard — ${employeeName || 'Deployment'}`}>
            <form onSubmit={handleSubmit} style={{ padding: '8px' }}>
                {error && (
                    <div style={{ padding: '10px 14px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderRadius: '6px', marginBottom: '14px', fontSize: '13px' }}>
                        {error}
                    </div>
                )}

                <div style={{ background: 'var(--color-surface)', padding: '12px', borderRadius: '6px', marginBottom: '14px', border: '1px solid var(--color-border)', fontSize: '12px' }}>
                    <strong>Relief Notice:</strong> Ending this active deployment will mark the guard as Relieved as of the designated date. The vacancy at the site/post will be automatically reopened and the employee will be freed for reassignment.
                </div>

                <div style={{ marginBottom: '14px' }}>
                    <Input
                        label="Relieved Date *"
                        type="date"
                        value={relievedDate}
                        onChange={e => setRelievedDate(e.target.value)}
                        required
                    />
                </div>

                <div className="form-field" style={{ marginBottom: '16px' }}>
                    <label className="form-label">Relief Reason *</label>
                    <textarea
                        className="input-base"
                        rows={3}
                        placeholder="e.g. Contract completed, Guard on emergency personal leave, Demobilization"
                        value={reliefReason}
                        onChange={e => setReliefReason(e.target.value)}
                        required
                    />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                    <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>Cancel</Button>
                    <Button type="submit" variant="danger" loading={loading}>Relieve Guard</Button>
                </div>
            </form>
        </Modal>
    );
};
