import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../../../auth/authStore';
import { mobileHrmApi } from './mobileHrmApi';
import type { Technician, PayrollRecord } from './types';

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

interface MobilePayslipViewerTabProps {
    initialEmployeeId?: string | null;
}

export const MobilePayslipViewerTab: React.FC<MobilePayslipViewerTabProps> = ({ initialEmployeeId }) => {
    const user = useAuthStore(s => s.user);
    const companyLogoUrl = user?.company_logo
        ? (user.company_logo.startsWith('http') ? user.company_logo : `http://127.0.0.1:8000${user.company_logo}`)
        : null;
    const companyName = user?.company_name || 'SOFTECH MOBILE & REPAIR LAB';

    const [year, setYear] = useState<number>(2026);
    const [month, setMonth] = useState<number>(9); // September 2026 default
    const [employeeOptions, setEmployeeOptions] = useState<{ id: string; label: string }[]>([]);
    const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>(initialEmployeeId || '');
    const [payrollRecord, setPayrollRecord] = useState<PayrollRecord | null>(null);
    const [loading, setLoading] = useState(false);
    const [downloading, setDownloading] = useState(false);

    useEffect(() => {
        let isMounted = true;
        const loadInitial = async () => {
            try {
                setLoading(true);
                const [techList, overview] = await Promise.all([
                    mobileHrmApi.getTechnicians().catch(() => []),
                    mobileHrmApi.getPayrollOverview(year, month).catch(() => ({ records: [] }))
                ]);
                if (!isMounted) return;

                const optionsMap = new Map<string, string>();
                techList.forEach((t: Technician) => {
                    optionsMap.set(t.employee, `${t.employee_name} (${t.employee_code} - ${t.department_display})`);
                });
                (overview.records || []).forEach((r: any) => {
                    if (!optionsMap.has(r.employee_id)) {
                        optionsMap.set(r.employee_id, `${r.employee_name} (${r.employee_code} - ${r.department})`);
                    }
                });

                const opts = Array.from(optionsMap.entries()).map(([id, label]) => ({ id, label }));
                setEmployeeOptions(opts);

                let targetEmpId = selectedEmployeeId || initialEmployeeId || '';
                if ((!targetEmpId || !optionsMap.has(targetEmpId)) && opts.length > 0) {
                    targetEmpId = opts[0].id;
                    setSelectedEmployeeId(targetEmpId);
                }

                if (targetEmpId) {
                    const match = (overview.records || []).find((r: any) => r.employee_id === targetEmpId);
                    setPayrollRecord(match || null);
                }
            } catch (err) {
                console.error('Failed to load payslip data:', err);
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        loadInitial();
        return () => { isMounted = false; };
    }, [year, month]);

    useEffect(() => {
        if (initialEmployeeId) {
            setSelectedEmployeeId(initialEmployeeId);
        }
    }, [initialEmployeeId]);

    const handleSelectEmployee = async (empId: string) => {
        setSelectedEmployeeId(empId);
        if (!empId) return;
        try {
            setLoading(true);
            const overview = await mobileHrmApi.getPayrollOverview(year, month);
            const match = (overview.records || []).find(r => r.employee_id === empId);
            setPayrollRecord(match || null);
        } catch (err) {
            console.error('Failed to load payslip for employee:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleDownloadPdf = async () => {
        if (!selectedEmployeeId || !payrollRecord) return;
        try {
            setDownloading(true);
            const blob = await mobileHrmApi.downloadPayslipPdf(selectedEmployeeId, year, month);
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Salary_Slip_${payrollRecord.employee_name.replace(/\s+/g, '_')}_${year}_${String(month).padStart(2, '0')}.pdf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (err) {
            alert('Failed to generate PDF payslip.');
        } finally {
            setDownloading(false);
        }
    };

    const handlePrint = () => {
        window.print();
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '24px' }}>
            {/* Top Toolbar */}
            <div className="no-print" style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '16px',
                background: 'var(--color-surface, #ffffff)',
                padding: '16px 20px',
                borderRadius: '12px',
                border: '1px solid var(--color-border, #e2e8f0)',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                    {/* Employee / Staff Selector */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748b' }}>Employee / Staff:</span>
                        <select
                            value={selectedEmployeeId}
                            onChange={e => handleSelectEmployee(e.target.value)}
                            style={{
                                padding: '8px 14px',
                                borderRadius: '8px',
                                border: '1px solid var(--color-border, #cbd5e1)',
                                fontSize: '14px',
                                fontWeight: 600,
                                background: '#f8fafc',
                                outline: 'none',
                                minWidth: '240px'
                            }}
                        >
                            {employeeOptions.length === 0 ? (
                                <option value="">No employees found</option>
                            ) : (
                                employeeOptions.map(opt => (
                                    <option key={opt.id} value={opt.id}>
                                        {opt.label}
                                    </option>
                                ))
                            )}
                        </select>
                    </div>

                    {/* Month Picker */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748b' }}>Month:</span>
                        <select
                            value={month}
                            onChange={e => setMonth(Number(e.target.value))}
                            style={{
                                padding: '8px 12px',
                                borderRadius: '8px',
                                border: '1px solid var(--color-border, #cbd5e1)',
                                fontSize: '14px',
                                fontWeight: 500,
                                background: '#f8fafc',
                                outline: 'none'
                            }}
                        >
                            {MONTH_NAMES.map((name, i) => (
                                <option key={i + 1} value={i + 1}>{name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Year Picker */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748b' }}>Year:</span>
                        <select
                            value={year}
                            onChange={e => setYear(Number(e.target.value))}
                            style={{
                                padding: '8px 12px',
                                borderRadius: '8px',
                                border: '1px solid var(--color-border, #cbd5e1)',
                                fontSize: '14px',
                                fontWeight: 500,
                                background: '#f8fafc',
                                outline: 'none'
                            }}
                        >
                            {[2024, 2025, 2026, 2027].map(y => (
                                <option key={y} value={y}>{y}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Print & Download Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <button
                        type="button"
                        onClick={handlePrint}
                        disabled={!payrollRecord}
                        style={{
                            padding: '8px 16px',
                            background: '#f8fafc',
                            border: '1px solid #cbd5e1',
                            borderRadius: '8px',
                            color: '#334155',
                            fontWeight: 600,
                            fontSize: '13px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        <i className="bx bx-printer" />
                        Print Slip
                    </button>

                    <button
                        type="button"
                        onClick={handleDownloadPdf}
                        disabled={downloading || !payrollRecord}
                        style={{
                            padding: '8px 18px',
                            background: '#16a34a',
                            color: '#ffffff',
                            borderRadius: '8px',
                            border: 'none',
                            fontWeight: 600,
                            fontSize: '13px',
                            cursor: downloading ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        <i className={`bx ${downloading ? 'bx-loader-alt bx-spin' : 'bx-download'}`} />
                        {downloading ? 'Generating PDF...' : 'Download Official PDF'}
                    </button>
                </div>
            </div>

            {/* Payslip Document Preview */}
            {loading ? (
                <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>
                    <i className="bx bx-loader-alt bx-spin" style={{ fontSize: '32px', marginBottom: '8px' }} />
                    <div>Loading Salary Slip Document...</div>
                </div>
            ) : !payrollRecord ? (
                <div style={{
                    padding: '40px',
                    textAlign: 'center',
                    background: 'var(--color-surface, #ffffff)',
                    borderRadius: '12px',
                    border: '1px dashed var(--color-border, #cbd5e1)'
                }}>
                    <i className="bx bx-file-blank" style={{ fontSize: '40px', color: '#94a3b8', marginBottom: '8px' }} />
                    <div>No salary data available for the selected technician and month.</div>
                </div>
            ) : (
                <div style={{
                    display: 'flex',
                    justifyContent: 'center'
                }}>
                    {/* Realistic Physical Paper Preview */}
                    <div className="printable-slip" style={{
                        width: '100%',
                        maxWidth: '780px',
                        background: '#ffffff',
                        padding: '40px 48px',
                        borderRadius: '12px',
                        border: '1px solid #cbd5e1',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                        color: '#0f172a'
                    }}>
                        {/* Header */}
                        <div style={{ textAlign: 'center', marginBottom: '24px', borderBottom: '2px solid #0f172a', paddingBottom: '16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '14px', marginBottom: '8px' }}>
                                {companyLogoUrl && (
                                    <img
                                        src={companyLogoUrl}
                                        alt={companyName}
                                        style={{ height: '44px', maxWidth: '100px', objectFit: 'contain' }}
                                    />
                                )}
                                <h2 style={{ margin: 0, fontSize: '24px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    {companyName}
                                </h2>
                            </div>
                            <div style={{ fontSize: '13px', color: '#475569', marginTop: '4px' }}>
                                Smart Device Diagnostics, Micro-Soldering & Display Refurbishing Centre
                            </div>
                            <div style={{
                                marginTop: '12px',
                                display: 'inline-block',
                                background: '#f1f5f9',
                                padding: '4px 16px',
                                borderRadius: '20px',
                                fontSize: '13px',
                                fontWeight: 700,
                                color: '#0f172a'
                            }}>
                                SALARY SLIP FOR THE MONTH OF {MONTH_NAMES[month - 1].toUpperCase()} {year}
                            </div>
                        </div>

                        {/* Employee Meta Info Box */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr',
                            gap: '12px',
                            background: '#f8fafc',
                            padding: '16px',
                            borderRadius: '8px',
                            border: '1px solid #e2e8f0',
                            fontSize: '13px',
                            marginBottom: '24px'
                        }}>
                            <div>
                                <span style={{ color: '#64748b' }}>Employee Name:</span>{' '}
                                <strong style={{ color: '#0f172a' }}>{payrollRecord.employee_name}</strong>
                            </div>
                            <div>
                                <span style={{ color: '#64748b' }}>Employee Code:</span>{' '}
                                <strong style={{ color: '#0f172a' }}>{payrollRecord.employee_code}</strong>
                            </div>
                            <div>
                                <span style={{ color: '#64748b' }}>Designation:</span>{' '}
                                <strong style={{ color: '#0f172a' }}>{payrollRecord.designation}</strong>
                            </div>
                            <div>
                                <span style={{ color: '#64748b' }}>Department:</span>{' '}
                                <strong style={{ color: '#0f172a' }}>{payrollRecord.department}</strong>
                            </div>
                        </div>

                        {/* Section 1: Allowance & Facilities */}
                        <div style={{ marginBottom: '20px' }}>
                            <div style={{
                                background: '#1e293b',
                                color: '#ffffff',
                                padding: '6px 12px',
                                fontSize: '12px',
                                fontWeight: 700,
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                                borderRadius: '4px 4px 0 0'
                            }}>
                                1. Allowance & Facilities
                            </div>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', border: '1px solid #cbd5e1' }}>
                                <tbody>
                                    <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                                        <td style={{ padding: '8px 12px', color: '#475569' }}>Basic Salary</td>
                                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>Rs. {payrollRecord.basic_salary.toLocaleString()}</td>
                                    </tr>
                                    <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                                        <td style={{ padding: '8px 12px', color: '#475569' }}>Bonus - Time (Punctuality)</td>
                                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: payrollRecord.bonus_time > 0 ? '#15803d' : '#94a3b8' }}>
                                            {payrollRecord.bonus_time > 0 ? `+Rs. ${payrollRecord.bonus_time.toLocaleString()}` : '0'}
                                        </td>
                                    </tr>
                                    <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                                        <td style={{ padding: '8px 12px', color: '#475569' }}>Bonus - Zero Holiday (Attendance)</td>
                                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: payrollRecord.bonus_zero_holiday > 0 ? '#15803d' : '#94a3b8' }}>
                                            {payrollRecord.bonus_zero_holiday > 0 ? `+Rs. ${payrollRecord.bonus_zero_holiday.toLocaleString()}` : '0'}
                                        </td>
                                    </tr>
                                    <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                                        <td style={{ padding: '8px 12px', color: '#475569' }}>
                                            Overtime ({payrollRecord.overtime_hours} hrs @ Rs. {payrollRecord.overtime_rate}/hr)
                                        </td>
                                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: payrollRecord.overtime_pay > 0 ? '#2563eb' : '#94a3b8' }}>
                                            {payrollRecord.overtime_pay > 0 ? `+Rs. ${payrollRecord.overtime_pay.toLocaleString()}` : '0'}
                                        </td>
                                    </tr>
                                    <tr style={{ background: '#f8fafc', fontWeight: 700 }}>
                                        <td style={{ padding: '10px 12px', color: '#0f172a' }}>Pay & Allowances (Total Earnings)</td>
                                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#0f172a' }}>Rs. {payrollRecord.pay_and_allowances.toLocaleString()}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        {/* Section 2: Attendance Chart & Deductions */}
                        <div style={{ marginBottom: '20px' }}>
                            <div style={{
                                background: '#1e293b',
                                color: '#ffffff',
                                padding: '6px 12px',
                                fontSize: '12px',
                                fontWeight: 700,
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                                borderRadius: '4px 4px 0 0'
                            }}>
                                2. Attendance Chart & Deductions
                            </div>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', border: '1px solid #cbd5e1' }}>
                                <tbody>
                                    <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                                        <td style={{ padding: '8px 12px', color: '#475569' }}>Late Arrivals ({payrollRecord.late_count})</td>
                                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: payrollRecord.late_deduction > 0 ? '#dc2626' : '#94a3b8' }}>
                                            {payrollRecord.late_deduction > 0 ? `-Rs. ${payrollRecord.late_deduction.toLocaleString()}` : '0'}
                                        </td>
                                    </tr>
                                    <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                                        <td style={{ padding: '8px 12px', color: '#475569' }}>Half Days ({payrollRecord.half_day_count})</td>
                                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: payrollRecord.half_day_deduction > 0 ? '#dc2626' : '#94a3b8' }}>
                                            {payrollRecord.half_day_deduction > 0 ? `-Rs. ${payrollRecord.half_day_deduction.toLocaleString()}` : '0'}
                                        </td>
                                    </tr>
                                    <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                                        <td style={{ padding: '8px 12px', color: '#475569' }}>Unapproved Holidays / Absents ({payrollRecord.holiday_count})</td>
                                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: payrollRecord.holiday_deduction > 0 ? '#dc2626' : '#94a3b8' }}>
                                            {payrollRecord.holiday_deduction > 0 ? `-Rs. ${payrollRecord.holiday_deduction.toLocaleString()}` : '0'}
                                        </td>
                                    </tr>
                                    <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                                        <td style={{ padding: '8px 12px', color: '#475569' }}>Penalty (Absence Policy Enforcement)</td>
                                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: payrollRecord.penalty > 0 ? '#dc2626' : '#94a3b8' }}>
                                            {payrollRecord.penalty > 0 ? `-Rs. ${payrollRecord.penalty.toLocaleString()}` : '0'}
                                        </td>
                                    </tr>
                                    <tr style={{ background: '#fef2f2', fontWeight: 700 }}>
                                        <td style={{ padding: '10px 12px', color: '#b91c1c' }}>Total Attendance Deductions</td>
                                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#b91c1c' }}>-Rs. {payrollRecord.total_attendance_deduction.toLocaleString()}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        {/* Section 3: Loan & Incident Deductions */}
                        <div style={{ marginBottom: '24px' }}>
                            <div style={{
                                background: '#1e293b',
                                color: '#ffffff',
                                padding: '6px 12px',
                                fontSize: '12px',
                                fontWeight: 700,
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                                borderRadius: '4px 4px 0 0'
                            }}>
                                3. Loan & Incident Deductions
                            </div>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', border: '1px solid #cbd5e1' }}>
                                <tbody>
                                    <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                                        <td style={{ padding: '8px 12px', color: '#475569' }}>
                                            Advance Loan (Principal: Rs. {payrollRecord.loan_principal.toLocaleString()} | Bal: Rs. {payrollRecord.loan_balance.toLocaleString()})
                                        </td>
                                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: payrollRecord.loan_deduction > 0 ? '#dc2626' : '#94a3b8' }}>
                                            {payrollRecord.loan_deduction > 0 ? `-Rs. ${payrollRecord.loan_deduction.toLocaleString()}` : '0'}
                                        </td>
                                    </tr>
                                    <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                                        <td style={{ padding: '8px 12px', color: '#475569' }}>Damaged Parts / Displays Charged</td>
                                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: payrollRecord.damaged_parts > 0 ? '#dc2626' : '#94a3b8' }}>
                                            {payrollRecord.damaged_parts > 0 ? `-Rs. ${payrollRecord.damaged_parts.toLocaleString()}` : '0'}
                                        </td>
                                    </tr>
                                    <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                                        <td style={{ padding: '8px 12px', color: '#475569' }}>Mobile / Utility Bill Deduction</td>
                                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: payrollRecord.bill_deduction > 0 ? '#dc2626' : '#94a3b8' }}>
                                            {payrollRecord.bill_deduction > 0 ? `-Rs. ${payrollRecord.bill_deduction.toLocaleString()}` : '0'}
                                        </td>
                                    </tr>
                                    <tr style={{ background: '#fef2f2', fontWeight: 700 }}>
                                        <td style={{ padding: '10px 12px', color: '#b91c1c' }}>Total Other Deductions</td>
                                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#b91c1c' }}>-Rs. {payrollRecord.total_other_deductions.toLocaleString()}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        {/* Net Pay Highlight Bar */}
                        <div style={{
                            background: '#1e3a8a',
                            color: '#ffffff',
                            padding: '16px 20px',
                            borderRadius: '8px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '40px'
                        }}>
                            <div>
                                <div style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#93c5fd' }}>
                                    Net Take-Home Payable
                                </div>
                                <div style={{ fontSize: '20px', fontWeight: 800 }}>
                                    GROSS TOTAL
                                </div>
                            </div>
                            <div style={{ fontSize: '28px', fontWeight: 900, letterSpacing: '0.02em' }}>
                                Rs. {payrollRecord.gross_total.toLocaleString()}
                            </div>
                        </div>

                        {/* Signature Blocks */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr',
                            gap: '40px',
                            marginTop: '20px',
                            paddingTop: '20px'
                        }}>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ height: '50px' }} />
                                <div style={{ borderTop: '1px solid #0f172a', paddingTop: '6px', fontSize: '12px', fontWeight: 600 }}>
                                    Technician's Signature
                                </div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ height: '50px' }} />
                                <div style={{ borderTop: '1px solid #0f172a', paddingTop: '6px', fontSize: '12px', fontWeight: 600 }}>
                                    Authorized Lab Incharge / Director
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
