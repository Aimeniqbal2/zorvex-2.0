import React, { useState, useEffect } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { apiClient } from '../api';
import type { Payslip } from '../types';


interface PayslipDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    payslip?: Payslip | null;
}

export const PayslipDetailModal: React.FC<PayslipDetailModalProps> = ({
    isOpen,
    onClose,
    payslip
}) => {
    const [lines, setLines] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen && payslip) {
            fetchLines();
        } else {
            setLines([]);
        }
    }, [isOpen, payslip]);

    const fetchLines = async () => {
        setLoading(true);
        try {
            const res = await apiClient.get(`/api/hrm/payslip-lines/?payslip=${payslip?.id}`);
            setLines(res.data.results || (Array.isArray(res.data) ? res.data : []));
            setError(null);
        } catch (err: any) {
            setError(err.message || 'Error loading payslip lines');
        } finally {
            setLoading(false);
        }
    };

    const earnings = lines.filter(l => l.line_type === 'EARNING');
    const deductions = lines.filter(l => l.line_type === 'DEDUCTION');

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Payslip Details">
            {loading ? (
                <div>Loading lines...</div>
            ) : error ? (
                <div style={{ color: 'red' }}>{error}</div>
            ) : payslip ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', background: '#f9fafb', borderRadius: '4px' }}>
                        <div>
                            <strong>Gross Pay: </strong> {payslip.gross_pay}
                        </div>
                        <div>
                            <strong>Total Deductions: </strong> {payslip.total_deductions}
                        </div>
                        <div>
                            <strong>Net Pay: </strong> {payslip.net_pay}
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <div>
                            <h4 style={{ margin: '0 0 8px 0', paddingBottom: '4px', borderBottom: '1px solid #e5e7eb' }}>Earnings</h4>
                            {earnings.length > 0 ? earnings.map(l => (
                                <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                                    <span>{l.description || l.salary_component}</span>
                                    <span>{l.amount}</span>
                                </div>
                            )) : <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>No earnings.</span>}
                        </div>

                        <div>
                            <h4 style={{ margin: '0 0 8px 0', paddingBottom: '4px', borderBottom: '1px solid #e5e7eb' }}>Deductions</h4>
                            {deductions.length > 0 ? deductions.map(l => (
                                <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                                    <span>{l.description || l.salary_component}</span>
                                    <span>{l.amount}</span>
                                </div>
                            )) : <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>No deductions.</span>}
                        </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
                        <Button variant="secondary" onClick={onClose}>Close</Button>
                    </div>
                </div>
            ) : null}
        </Modal>
    );
};
