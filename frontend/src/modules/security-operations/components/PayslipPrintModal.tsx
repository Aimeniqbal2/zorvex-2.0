import React, { useRef } from 'react';
import { Button } from '../../../components/ui/Button';
import type { OperationalPayslipItem } from '../types';

interface PayslipPrintModalProps {
    isOpen: boolean;
    onClose: () => void;
    payslip: OperationalPayslipItem | null;
}

export const PayslipPrintModal: React.FC<PayslipPrintModalProps> = ({
    isOpen,
    onClose,
    payslip
}) => {
    const printableRef = useRef<HTMLDivElement>(null);

    if (!isOpen || !payslip) return null;

    const handlePrint = () => {
        window.print();
    };

    const dutyEarnings = Number(payslip.duty_earnings || 0);
    const singleOt = Number(payslip.single_ot_amount || 0);
    const doubleOt = Number(payslip.double_ot_amount || 0);
    const allowances = Number(payslip.allowances_amount || 0);
    const bonuses = Number(payslip.bonuses_amount || 0);
    const otherAdditions = Number(payslip.other_additions_amount || 0);
    const grossEarnings = Number(payslip.gross_earnings || 0);

    const eobiEmp = Number(payslip.eobi_employee || 0);
    const sessiEmp = Number(payslip.sessi_employee || 0);
    const pessiEmp = Number(payslip.pessi_employee || 0);
    const patrolling = Number(payslip.patrolling_deduction || 0);
    const insurance = Number(payslip.insurance_deduction || 0);
    const advanceRecovery = Number(payslip.advance_recovery || 0);
    const otherDeductions = Number(payslip.other_deductions || 0);
    const totalDeductions = Number(payslip.total_deductions || 0);
    const netSalary = Number(payslip.net_salary || 0);

    const eobiEmpr = Number(payslip.eobi_employer || 0);
    const sessiEmpr = Number(payslip.sessi_employer || 0);
    const pessiEmpr = Number(payslip.pessi_employer || 0);
    const employerTotal = Number(payslip.employer_statutory_total || (eobiEmpr + sessiEmpr + pessiEmpr));

    // Dynamic statutory scheme rate snapshots (never hardcoded)
    const statSchemes = (payslip.rate_snapshot?.statutory_schemes || {}) as Record<string, any>;
    const eobiInfo = statSchemes['EOBI'] || statSchemes['STATUTORY_EOBI'] || {};
    const sessiInfo = statSchemes['SESSI'] || statSchemes['STATUTORY_SESSI'] || {};
    const pessiInfo = statSchemes['PESSI'] || statSchemes['STATUTORY_PESSI'] || {};

    const formatRate = (rate: any) => {
        if (rate === undefined || rate === null || rate === '') return '';
        const num = Number(rate);
        return isNaN(num) ? String(rate) : `${num}%`;
    };

    const eobiEmpRate = formatRate(eobiInfo.employee_rate ?? payslip.rate_snapshot?.['EOBI_emp_rate']);
    const eobiEmprRate = formatRate(eobiInfo.employer_rate ?? payslip.rate_snapshot?.['EOBI_empr_rate']);

    const sessiEmpRate = formatRate(sessiInfo.employee_rate ?? payslip.rate_snapshot?.['SESSI_emp_rate']);
    const sessiEmprRate = formatRate(sessiInfo.employer_rate ?? payslip.rate_snapshot?.['SESSI_empr_rate']);

    const pessiEmpRate = formatRate(pessiInfo.employee_rate ?? payslip.rate_snapshot?.['PESSI_emp_rate']);
    const pessiEmprRate = formatRate(pessiInfo.employer_rate ?? payslip.rate_snapshot?.['PESSI_empr_rate']);

    return (
        <div className="modal-overlay" style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px'
        }}>
            <div className="modal-content" style={{
                backgroundColor: 'var(--color-surface, #ffffff)',
                borderRadius: '8px',
                width: '100%',
                maxWidth: '850px',
                maxHeight: '92vh',
                overflowY: 'auto',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
                display: 'flex',
                flexDirection: 'column'
            }}>
                {/* Modal Header / Action Bar */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '16px 24px',
                    borderBottom: '1px solid var(--color-border, #e5e7eb)',
                    backgroundColor: 'var(--color-surface-subtle, #f9fafb)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <i className="bx bx-receipt" style={{ fontSize: '20px', color: 'var(--color-primary, #2563eb)' }}></i>
                        <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>Employee Payslip Snapshot</h3>
                        {payslip.is_frozen && (
                            <span style={{
                                backgroundColor: '#dcfce7',
                                color: '#15803d',
                                fontSize: '12px',
                                padding: '2px 8px',
                                borderRadius: '4px',
                                fontWeight: 500
                            }}>
                                <i className="bx bx-lock-alt" style={{ marginRight: '4px' }}></i>
                                Frozen / Finalized
                            </span>
                        )}
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <Button variant="secondary" onClick={handlePrint}>
                            <i className="bx bx-printer" style={{ marginRight: '6px' }}></i>
                            Print Payslip
                        </Button>
                        <Button variant="secondary" onClick={onClose}>
                            <i className="bx bx-x" style={{ marginRight: '4px' }}></i>
                            Close
                        </Button>
                    </div>
                </div>

                {/* Printable Payslip Body */}
                <div ref={printableRef} style={{ padding: '32px 40px', color: '#111827', fontFamily: 'inherit' }}>
                    {/* Organization & Payslip Title */}
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        borderBottom: '2px solid #2563eb',
                        paddingBottom: '16px',
                        marginBottom: '20px'
                    }}>
                        <div>
                            <h2 style={{ margin: '0 0 4px 0', fontSize: '22px', fontWeight: 700, color: '#1e3a8a', letterSpacing: '-0.5px' }}>
                                ZORVEX SECURITY SERVICES
                            </h2>
                            <p style={{ margin: 0, fontSize: '13px', color: '#4b5563' }}>
                                Workforce Operations & Payroll Management System
                            </p>
                            <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#6b7280' }}>
                                Statutory & Commercial Immutability Document
                            </p>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{
                                backgroundColor: '#eff6ff',
                                border: '1px solid #bfdbfe',
                                color: '#1e40af',
                                fontWeight: 700,
                                fontSize: '14px',
                                padding: '6px 14px',
                                borderRadius: '6px',
                                display: 'inline-block',
                                marginBottom: '6px'
                            }}>
                                PAYSLIP
                            </div>
                            <div style={{ fontSize: '12px', color: '#4b5563' }}>
                                Run Ref: <strong>{payslip.payroll_run_number || 'N/A'}</strong>
                            </div>
                            <div style={{ fontSize: '12px', color: '#6b7280' }}>
                                Date: {payslip.created_at ? new Date(payslip.created_at).toLocaleDateString() : 'N/A'}
                            </div>
                        </div>
                    </div>

                    {/* Employee & Period Information Grid */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(4, 1fr)',
                        gap: '12px',
                        backgroundColor: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: '6px',
                        padding: '14px 18px',
                        marginBottom: '24px',
                        fontSize: '13px'
                    }}>
                        <div>
                            <span style={{ color: '#64748b', fontSize: '11px', textTransform: 'uppercase', fontWeight: 600 }}>Employee Name</span>
                            <div style={{ fontWeight: 600, color: '#0f172a', marginTop: '2px' }}>{payslip.employee_name}</div>
                        </div>
                        <div>
                            <span style={{ color: '#64748b', fontSize: '11px', textTransform: 'uppercase', fontWeight: 600 }}>Employee Code</span>
                            <div style={{ fontWeight: 600, color: '#0f172a', marginTop: '2px' }}>{payslip.employee_code}</div>
                        </div>
                        <div>
                            <span style={{ color: '#64748b', fontSize: '11px', textTransform: 'uppercase', fontWeight: 600 }}>Designation</span>
                            <div style={{ fontWeight: 600, color: '#0f172a', marginTop: '2px' }}>{payslip.designation_name || 'Security Guard'}</div>
                        </div>
                        <div>
                            <span style={{ color: '#64748b', fontSize: '11px', textTransform: 'uppercase', fontWeight: 600 }}>Period</span>
                            <div style={{ fontWeight: 600, color: '#0f172a', marginTop: '2px' }}>
                                {payslip.period_start} to {payslip.period_end}
                            </div>
                        </div>
                    </div>

                    {/* Two-Column Earnings & Deductions Breakdown */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
                        {/* Earnings Panel */}
                        <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', overflow: 'hidden' }}>
                            <div style={{
                                backgroundColor: '#f1f5f9',
                                padding: '10px 14px',
                                fontWeight: 700,
                                fontSize: '13px',
                                color: '#1e293b',
                                borderBottom: '1px solid #e2e8f0',
                                display: 'flex',
                                justifyContent: 'space-between'
                            }}>
                                <span>EARNINGS</span>
                                <span>AMOUNT (PKR)</span>
                            </div>
                            <div style={{ padding: '8px 14px', fontSize: '13px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px dashed #f1f5f9' }}>
                                    <span style={{ color: '#334155' }}>Duty Earnings</span>
                                    <span style={{ fontWeight: 500 }}>₨ {dutyEarnings.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px dashed #f1f5f9' }}>
                                    <span style={{ color: '#334155' }}>Single Overtime (OT)</span>
                                    <span style={{ fontWeight: 500 }}>₨ {singleOt.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px dashed #f1f5f9' }}>
                                    <span style={{ color: '#334155' }}>Double Overtime (2x OT)</span>
                                    <span style={{ fontWeight: 500 }}>₨ {doubleOt.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px dashed #f1f5f9' }}>
                                    <span style={{ color: '#334155' }}>Allowances</span>
                                    <span style={{ fontWeight: 500 }}>₨ {allowances.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px dashed #f1f5f9' }}>
                                    <span style={{ color: '#334155' }}>Bonuses / Incentives</span>
                                    <span style={{ fontWeight: 500 }}>₨ {bonuses.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                                    <span style={{ color: '#334155' }}>Other Additions</span>
                                    <span style={{ fontWeight: 500 }}>₨ {otherAdditions.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                </div>
                            </div>
                            <div style={{
                                backgroundColor: '#f8fafc',
                                padding: '10px 14px',
                                fontWeight: 700,
                                fontSize: '13px',
                                color: '#0f172a',
                                borderTop: '1px solid #cbd5e1',
                                display: 'flex',
                                justifyContent: 'space-between'
                            }}>
                                <span>Gross Earnings</span>
                                <span style={{ color: '#15803d' }}>₨ {grossEarnings.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </div>
                        </div>

                        {/* Deductions Panel */}
                        <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', overflow: 'hidden' }}>
                            <div style={{
                                backgroundColor: '#f1f5f9',
                                padding: '10px 14px',
                                fontWeight: 700,
                                fontSize: '13px',
                                color: '#1e293b',
                                borderBottom: '1px solid #e2e8f0',
                                display: 'flex',
                                justifyContent: 'space-between'
                            }}>
                                <span>DEDUCTIONS</span>
                                <span>AMOUNT (PKR)</span>
                            </div>
                            <div style={{ padding: '8px 14px', fontSize: '13px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px dashed #f1f5f9' }}>
                                    <span style={{ color: '#334155' }}>
                                        EOBI (Employee{eobiEmpRate ? ` @ ${eobiEmpRate}` : ''})
                                    </span>
                                    <span style={{ fontWeight: 500 }}>₨ {eobiEmp.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px dashed #f1f5f9' }}>
                                    <span style={{ color: '#334155' }}>
                                        SESSI (Employee{sessiEmpRate ? ` @ ${sessiEmpRate}` : ''})
                                    </span>
                                    <span style={{ fontWeight: 500 }}>₨ {sessiEmp.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px dashed #f1f5f9' }}>
                                    <span style={{ color: '#334155' }}>
                                        PESSI (Employee{pessiEmpRate ? ` @ ${pessiEmpRate}` : ''})
                                    </span>
                                    <span style={{ fontWeight: 500 }}>₨ {pessiEmp.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px dashed #f1f5f9' }}>
                                    <span style={{ color: '#334155' }}>Patrolling Deduction</span>
                                    <span style={{ fontWeight: 500 }}>₨ {patrolling.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px dashed #f1f5f9' }}>
                                    <span style={{ color: '#334155' }}>Insurance</span>
                                    <span style={{ fontWeight: 500 }}>₨ {insurance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px dashed #f1f5f9' }}>
                                    <span style={{ color: '#334155' }}>Advance Recovery</span>
                                    <span style={{ fontWeight: 500 }}>₨ {advanceRecovery.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                                    <span style={{ color: '#334155' }}>Other Deductions</span>
                                    <span style={{ fontWeight: 500 }}>₨ {otherDeductions.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                </div>
                            </div>
                            <div style={{
                                backgroundColor: '#f8fafc',
                                padding: '10px 14px',
                                fontWeight: 700,
                                fontSize: '13px',
                                color: '#0f172a',
                                borderTop: '1px solid #cbd5e1',
                                display: 'flex',
                                justifyContent: 'space-between'
                            }}>
                                <span>Total Deductions</span>
                                <span style={{ color: '#b91c1c' }}>₨ {totalDeductions.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </div>
                        </div>
                    </div>

                    {/* Net Salary Payable Callout */}
                    <div style={{
                        backgroundColor: '#1e3a8a',
                        color: '#ffffff',
                        padding: '16px 24px',
                        borderRadius: '6px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '24px'
                    }}>
                        <div>
                            <div style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', opacity: 0.9 }}>
                                Take-Home Compensation
                            </div>
                            <div style={{ fontSize: '18px', fontWeight: 700, marginTop: '2px' }}>
                                NET PAYABLE SALARY
                            </div>
                        </div>
                        <div style={{ fontSize: '26px', fontWeight: 800, letterSpacing: '-0.5px' }}>
                            ₨ {netSalary.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </div>
                    </div>

                    {/* Employer Statutory Contributions (Separate Section) */}
                    <div style={{
                        border: '1px solid #fed7aa',
                        backgroundColor: '#fff7ed',
                        borderRadius: '6px',
                        padding: '14px 18px',
                        marginBottom: '28px'
                    }}>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#9a3412', textTransform: 'uppercase', marginBottom: '8px' }}>
                            Employer Statutory Contributions (Informational - Not Deducted from Salary)
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', fontSize: '13px' }}>
                            <div>
                                <span style={{ color: '#7c2d12', fontSize: '11px' }}>
                                    Employer EOBI{eobiEmprRate ? ` (${eobiEmprRate})` : ''}:
                                </span>
                                <div style={{ fontWeight: 600, color: '#431407', marginTop: '2px' }}>
                                    ₨ {eobiEmpr.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </div>
                            </div>
                            <div>
                                <span style={{ color: '#7c2d12', fontSize: '11px' }}>
                                    Employer SESSI{sessiEmprRate ? ` (${sessiEmprRate})` : ''}:
                                </span>
                                <div style={{ fontWeight: 600, color: '#431407', marginTop: '2px' }}>
                                    ₨ {sessiEmpr.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </div>
                            </div>
                            <div>
                                <span style={{ color: '#7c2d12', fontSize: '11px' }}>
                                    Employer PESSI{pessiEmprRate ? ` (${pessiEmprRate})` : ''}:
                                </span>
                                <div style={{ fontWeight: 600, color: '#431407', marginTop: '2px' }}>
                                    ₨ {pessiEmpr.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </div>
                            </div>
                            <div>
                                <span style={{ color: '#7c2d12', fontSize: '11px' }}>Total Employer Contribution:</span>
                                <div style={{ fontWeight: 700, color: '#9a3412', marginTop: '2px' }}>
                                    ₨ {employerTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Verification & Signatures */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr 1fr',
                        gap: '24px',
                        paddingTop: '28px',
                        borderTop: '1px solid #e2e8f0',
                        fontSize: '12px',
                        color: '#64748b'
                    }}>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ borderBottom: '1px solid #cbd5e1', height: '36px', marginBottom: '8px' }}></div>
                            <div>Prepared By (Operations)</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ borderBottom: '1px solid #cbd5e1', height: '36px', marginBottom: '8px' }}></div>
                            <div>Checked & Approved (Finance)</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ borderBottom: '1px solid #cbd5e1', height: '36px', marginBottom: '8px' }}></div>
                            <div>Employee Signature / Acknowledgment</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
