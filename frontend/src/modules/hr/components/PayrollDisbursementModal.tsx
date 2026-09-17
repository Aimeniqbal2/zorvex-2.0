import React, { useState, useEffect } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { apiClient } from '../api';

interface PayrollDisbursementModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: () => void;
}

export const PayrollDisbursementModal: React.FC<PayrollDisbursementModalProps> = ({ isOpen, onClose, onSave }) => {
    const [runs, setRuns] = useState<any[]>([]);
    const [accounts, setAccounts] = useState<any[]>([]);
    const [selectedRun, setSelectedRun] = useState('');
    const [selectedAccount, setSelectedAccount] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<any>(null);

    useEffect(() => {
        if (isOpen) {
            Promise.all([
                apiClient.get('/api/hrm/payroll-runs/?status=FINALIZED'),
                apiClient.get('/api/finance/accounts/?account_type=BANK,CASH') // Assuming this exists or similar
            ]).then(([runsRes, accRes]) => {
                setRuns(runsRes.data.results || (Array.isArray(runsRes.data) ? runsRes.data : []));
                setAccounts(accRes.data.results || (Array.isArray(accRes.data) ? accRes.data : []));
            }).catch(err => {
                console.error("Failed to fetch dependencies", err);
            });
        }
    }, [isOpen]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            await apiClient.post('/api/hrm/payroll-disbursements/', {
                payroll_run: selectedRun,
                payment_account: selectedAccount,
                disbursement_date: new Date().toISOString().split('T')[0]
            });
            onSave();
            onClose();
        } catch (err: any) {
            setError(err.response?.data || 'Failed to execute disbursement');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Execute Payroll Disbursement">
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px' }}>
                {error && (
                    <div style={{ color: 'var(--color-danger)', fontSize: '14px', background: 'var(--color-danger-light)', padding: '8px', borderRadius: '4px' }}>
                        {typeof error === 'string' ? error : Object.entries(error).map(([k, v]) => (
                            <div key={k}><strong>{k}:</strong> {Array.isArray(v) ? v.join(' ') : String(v)}</div>
                        ))}
                    </div>
                )}
                
                <div className="form-field">
                    <label className="form-label">Finalized Payroll Run *</label>
                    <select value={selectedRun} onChange={e => setSelectedRun(e.target.value)} className="input-base" required>
                        <option value="">-- Select Payroll Run --</option>
                        {runs.map(r => (
                            <option key={r.id} value={r.id}>
                                Run {r.id.slice(0, 8)} - {r.payroll_period_name || r.payroll_period} (Net: {r.total_net})
                            </option>
                        ))}
                    </select>
                </div>
                
                <div className="form-field">
                    <label className="form-label">Payment Bank/Cash Account *</label>
                    <select value={selectedAccount} onChange={e => setSelectedAccount(e.target.value)} className="input-base" required>
                        <option value="">-- Select Payment Account --</option>
                        {accounts.map(a => (
                            <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                        ))}
                    </select>
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
                    <Button type="button" variant="secondary" onClick={onClose}>Close</Button>
                    <Button type="submit" variant="primary" loading={loading}>Execute Disbursement</Button>
                </div>
            </form>
        </Modal>
    );
};
