import React, { useState, useEffect } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Badge } from '../../../components/ui/Badge';
import { getEmployeeDeploymentHistory } from '../api';
import type { Deployment } from '../types';

interface DeploymentHistoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    employeeId: string | null;
    employeeName?: string;
}

export const DeploymentHistoryModal: React.FC<DeploymentHistoryModalProps> = ({
    isOpen,
    onClose,
    employeeId,
    employeeName
}) => {
    const [history, setHistory] = useState<Deployment[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen && employeeId) {
            setLoading(true);
            setError(null);
            getEmployeeDeploymentHistory(employeeId)
                .then(data => setHistory(data))
                .catch(err => setError(err.response?.data?.error || 'Failed to load deployment history'))
                .finally(() => setLoading(false));
        }
    }, [isOpen, employeeId]);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Deployment History — ${employeeName || 'Employee'}`}>
            <div style={{ maxHeight: '75vh', overflowY: 'auto', padding: '8px' }}>
                {error && (
                    <div style={{ padding: '10px 14px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderRadius: '6px', marginBottom: '14px', fontSize: '13px' }}>
                        {error}
                    </div>
                )}

                {loading ? (
                    <div style={{ padding: '30px', textAlign: 'center', color: 'var(--color-text-muted)' }}>Loading history...</div>
                ) : history.length === 0 ? (
                    <div style={{ padding: '30px', textAlign: 'center', color: 'var(--color-text-muted)' }}>No historical deployment records found for this employee.</div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {history.map((dep) => (
                            <div 
                                key={dep.id} 
                                style={{
                                    border: '1px solid var(--color-border)',
                                    borderRadius: '8px',
                                    padding: '12px 14px',
                                    background: dep.status === 'ACTIVE' ? 'rgba(16, 185, 129, 0.03)' : 'var(--color-surface)',
                                    borderLeft: dep.status === 'ACTIVE' ? '4px solid #10b981' : dep.status === 'RELIEVED' ? '4px solid #6b7280' : '4px solid var(--color-border)'
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                                    <div>
                                        <span style={{ fontWeight: 600, fontSize: '14px' }}>{dep.site_name}</span>
                                        {dep.post_name && <span style={{ marginLeft: '8px', fontSize: '12px', color: 'var(--color-text-muted)' }}>• Post: {dep.post_name}</span>}
                                    </div>
                                    <div style={{ display: 'flex', gap: '6px' }}>
                                        <Badge variant={dep.assignment_type === 'PERMANENT' ? 'primary' : 'default'}>
                                            {dep.assignment_type}
                                        </Badge>
                                        <Badge variant={dep.status === 'ACTIVE' ? 'success' : dep.status === 'RELIEVED' ? 'default' : 'primary'}>
                                            {dep.status}
                                        </Badge>
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '6px' }}>
                                    <div><strong>Designation:</strong> {dep.designation_name}</div>
                                    <div><strong>Duration:</strong> {dep.start_date} → {dep.end_date || 'Present'}</div>
                                    <div><strong>Contract:</strong> {dep.contract_code || '—'}</div>
                                </div>

                                {dep.assigned_by_name && (
                                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                                        Assigned by: {dep.assigned_by_name}
                                    </div>
                                )}

                                {dep.relieved_date && (
                                    <div style={{ fontSize: '12px', marginTop: '6px', padding: '6px 10px', background: 'var(--color-surface-hover)', borderRadius: '4px' }}>
                                        <span style={{ color: '#ef4444', fontWeight: 600 }}>Relieved on {dep.relieved_date}:</span> {dep.relief_reason || 'No reason specified'}
                                        {dep.relieved_by_name && <span style={{ color: 'var(--color-text-muted)', marginLeft: '6px' }}>({dep.relieved_by_name})</span>}
                                    </div>
                                )}

                                {dep.notes && (
                                    <div style={{ fontSize: '12px', marginTop: '4px', fontStyle: 'italic', color: 'var(--color-text-muted)' }}>
                                        Notes: {dep.notes}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </Modal>
    );
};
