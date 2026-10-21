import React, { useState, useEffect, useMemo } from 'react';
import { mobileHrmApi } from './mobileHrmApi';
import type { PayrollRecord } from './types';

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

interface MobilePayrollTabProps {
    onSelectPayslip?: (employeeId: string) => void;
}

export const MobilePayrollTab: React.FC<MobilePayrollTabProps> = ({ onSelectPayslip }) => {
    const [year, setYear] = useState<number>(2026);
    const [month, setMonth] = useState<number>(9); // September 2026 default
    const [records, setRecords] = useState<PayrollRecord[]>([]);
    const [loading, setLoading] = useState(true);

    // Adjustment Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedRecord, setSelectedRecord] = useState<PayrollRecord | null>(null);
    const [modalForm, setModalForm] = useState({
        basic_salary: 20000,
        loan_principal: 0,
        loan_deduction: 0,
        damaged_parts: 0,
        bill_deduction: 0,
        overtime_hours: 0,
        status: 'DRAFT',
        notes: ''
    });
    const [modalPreview, setModalPreview] = useState<any>(null);
    const [saving, setSaving] = useState(false);
    const [downloadingId, setDownloadingId] = useState<string | null>(null);

    const loadPayroll = async () => {
        try {
            setLoading(true);
            const data = await mobileHrmApi.getPayrollOverview(year, month);
            setRecords(data.records || []);
        } catch (err) {
            console.error('Failed to load payroll overview:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadPayroll();
    }, [year, month]);

    // KPI Aggregates
    const totals = useMemo(() => {
        let basePay = 0;
        let bonuses = 0;
        let overtime = 0;
        let attendanceDeductions = 0;
        let otherDeductions = 0;
        let netTotal = 0;

        for (const r of records) {
            basePay += Number(r.basic_salary || 0);
            bonuses += Number(r.bonus_time || 0) + Number(r.bonus_zero_holiday || 0);
            overtime += Number(r.overtime_pay || 0);
            attendanceDeductions += Number(r.total_attendance_deduction || 0);
            otherDeductions += Number(r.total_other_deductions || 0);
            netTotal += Number(r.gross_total || 0);
        }

        return {
            count: records.length,
            basePay,
            bonuses,
            overtime,
            deductions: attendanceDeductions + otherDeductions,
            netTotal
        };
    }, [records]);

    const handleOpenAdjust = (rec: PayrollRecord) => {
        setSelectedRecord(rec);
        const initialForm = {
            basic_salary: rec.basic_salary,
            loan_principal: rec.loan_principal,
            loan_deduction: rec.loan_deduction,
            damaged_parts: rec.damaged_parts,
            bill_deduction: rec.bill_deduction,
            overtime_hours: rec.overtime_hours,
            status: rec.status || 'DRAFT',
            notes: ''
        };
        setModalForm(initialForm);
        fetchLivePreview(rec.employee_id, initialForm);
        setIsModalOpen(true);
    };

    const fetchLivePreview = async (employeeId: string, formValues: typeof modalForm) => {
        try {
            const preview = await mobileHrmApi.calculatePayroll({
                employee_id: employeeId,
                year,
                month,
                ...formValues
            });
            setModalPreview(preview);
        } catch (err) {
            console.error('Preview calc error:', err);
        }
    };

    const handleFormChange = (key: string, value: any) => {
        const next = { ...modalForm, [key]: value };
        setModalForm(next);
        if (selectedRecord) {
            fetchLivePreview(selectedRecord.employee_id, next);
        }
    };

    const handleSaveAdjustment = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedRecord) return;
        try {
            setSaving(true);
            await mobileHrmApi.savePayrollRecord({
                employee_id: selectedRecord.employee_id,
                year,
                month,
                ...modalForm
            });
            setIsModalOpen(false);
            await loadPayroll();
        } catch (err) {
            alert('Failed to save payroll record.');
        } finally {
            setSaving(false);
        }
    };

    const handleDownloadPdf = async (employeeId: string, empName: string) => {
        try {
            setDownloadingId(employeeId);
            const blob = await mobileHrmApi.downloadPayslipPdf(employeeId, year, month);
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Salary_Slip_${empName.replace(/\s+/g, '_')}_${year}_${String(month).padStart(2, '0')}.pdf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (err) {
            alert('Failed to generate PDF payslip.');
        } finally {
            setDownloadingId(null);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '24px' }}>
            {/* Top Toolbar */}
            <div style={{
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748b' }}>Payroll Month:</span>
                        <select
                            value={month}
                            onChange={e => setMonth(Number(e.target.value))}
                            style={{
                                padding: '6px 12px',
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

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748b' }}>Year:</span>
                        <select
                            value={year}
                            onChange={e => setYear(Number(e.target.value))}
                            style={{
                                padding: '6px 12px',
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

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#64748b' }}>
                    <i className="bx bx-info-circle" />
                    <span>Auto-calculated using Softech Late/Cutoff & Attendance matrix</span>
                </div>
            </div>

            {/* KPI Cards Grid */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '16px'
            }}>
                <div style={{ background: '#ffffff', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                    <div style={{ color: '#64748b', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase' }}>Active Technicians</div>
                    <div style={{ fontSize: '24px', fontWeight: 700, color: '#1e293b', marginTop: '4px' }}>{totals.count}</div>
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>Staff on payroll</div>
                </div>

                <div style={{ background: '#ffffff', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                    <div style={{ color: '#64748b', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase' }}>Basic Salaries</div>
                    <div style={{ fontSize: '24px', fontWeight: 700, color: '#0f172a', marginTop: '4px' }}>Rs. {totals.basePay.toLocaleString()}</div>
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>Contracted base</div>
                </div>

                <div style={{ background: '#ffffff', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                    <div style={{ color: '#16a34a', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase' }}>Earned Bonuses</div>
                    <div style={{ fontSize: '24px', fontWeight: 700, color: '#16a34a', marginTop: '4px' }}>Rs. {totals.bonuses.toLocaleString()}</div>
                    <div style={{ fontSize: '11px', color: '#16a34a', marginTop: '2px' }}>Time + Zero-Holiday bonuses</div>
                </div>

                <div style={{ background: '#ffffff', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                    <div style={{ color: '#2563eb', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase' }}>Overtime Pay</div>
                    <div style={{ fontSize: '24px', fontWeight: 700, color: '#2563eb', marginTop: '4px' }}>Rs. {totals.overtime.toLocaleString()}</div>
                    <div style={{ fontSize: '11px', color: '#2563eb', marginTop: '2px' }}>Lab overtime disbursements</div>
                </div>

                <div style={{ background: '#ffffff', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                    <div style={{ color: '#dc2626', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase' }}>Total Deductions</div>
                    <div style={{ fontSize: '24px', fontWeight: 700, color: '#dc2626', marginTop: '4px' }}>Rs. {totals.deductions.toLocaleString()}</div>
                    <div style={{ fontSize: '11px', color: '#dc2626', marginTop: '2px' }}>Attendance, penalties & loans</div>
                </div>

                <div style={{ background: '#eff6ff', padding: '16px', borderRadius: '12px', border: '1px solid #bfdbfe', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                    <div style={{ color: '#1e40af', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase' }}>Net Disbursement</div>
                    <div style={{ fontSize: '24px', fontWeight: 800, color: '#1d4ed8', marginTop: '4px' }}>Rs. {totals.netTotal.toLocaleString()}</div>
                    <div style={{ fontSize: '11px', color: '#2563eb', marginTop: '2px' }}>Total take-home payable</div>
                </div>
            </div>

            {/* Calculations Table */}
            {loading ? (
                <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>
                    <i className="bx bx-loader-alt bx-spin" style={{ fontSize: '32px', marginBottom: '8px' }} />
                    <div>Loading Salary Matrix...</div>
                </div>
            ) : records.length === 0 ? (
                <div style={{
                    padding: '40px',
                    textAlign: 'center',
                    background: 'var(--color-surface, #ffffff)',
                    borderRadius: '12px',
                    border: '1px dashed var(--color-border, #cbd5e1)'
                }}>
                    <i className="bx bx-money-withdraw" style={{ fontSize: '40px', color: '#94a3b8', marginBottom: '8px' }} />
                    <div>No payroll records found for this period.</div>
                </div>
            ) : (
                <div style={{
                    background: 'var(--color-surface, #ffffff)',
                    borderRadius: '12px',
                    border: '1px solid var(--color-border, #e2e8f0)',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                    overflowX: 'auto'
                }}>
                    <table style={{
                        width: '100%',
                        borderCollapse: 'collapse',
                        fontSize: '12px',
                        textAlign: 'left'
                    }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #cbd5e1', color: '#475569', fontWeight: 600 }}>
                                <th style={{ padding: '12px 14px' }}>Technician</th>
                                <th style={{ padding: '12px 10px' }}>Dept</th>
                                <th style={{ padding: '12px 10px', textAlign: 'right' }}>Basic</th>
                                <th style={{ padding: '12px 8px', textAlign: 'right', color: '#15803d' }}>Time Bon.</th>
                                <th style={{ padding: '12px 8px', textAlign: 'right', color: '#15803d' }}>Zero-Hol.</th>
                                <th style={{ padding: '12px 8px', textAlign: 'right', color: '#2563eb' }}>Overtime</th>
                                <th style={{ padding: '12px 10px', textAlign: 'right', fontWeight: 700 }}>Gross Earn.</th>
                                <th style={{ padding: '12px 10px', textAlign: 'right', color: '#dc2626' }}>Att. Ded.</th>
                                <th style={{ padding: '12px 10px', textAlign: 'right', color: '#dc2626' }}>Other Ded.</th>
                                <th style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: '#1d4ed8' }}>Net Pay</th>
                                <th style={{ padding: '12px 10px', textAlign: 'center' }}>Status</th>
                                <th style={{ padding: '12px 14px', textAlign: 'center' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {records.map((r, idx) => {
                                const rowBg = idx % 2 === 0 ? 'var(--color-surface, #ffffff)' : '#fcfcfd';
                                const isDownloading = downloadingId === r.employee_id;
                                return (
                                    <tr
                                        key={r.employee_id}
                                        style={{
                                            background: rowBg,
                                            borderBottom: '1px solid #e2e8f0',
                                            transition: 'background 0.1s'
                                        }}
                                    >
                                        <td style={{ padding: '10px 14px' }}>
                                            <div style={{ fontWeight: 600, color: '#0f172a' }}>{r.employee_name}</div>
                                            <div style={{ fontSize: '10px', color: '#64748b' }}>{r.employee_code}</div>
                                        </td>
                                        <td style={{ padding: '10px 10px', color: '#475569' }}>
                                            {r.department}
                                        </td>
                                        <td style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 500 }}>
                                            Rs. {r.basic_salary.toLocaleString()}
                                        </td>
                                        <td style={{ padding: '10px 8px', textAlign: 'right', color: r.bonus_time > 0 ? '#15803d' : '#94a3b8' }}>
                                            {r.bonus_time > 0 ? `+${r.bonus_time}` : '-'}
                                        </td>
                                        <td style={{ padding: '10px 8px', textAlign: 'right', color: r.bonus_zero_holiday > 0 ? '#15803d' : '#94a3b8' }}>
                                            {r.bonus_zero_holiday > 0 ? `+${r.bonus_zero_holiday}` : '-'}
                                        </td>
                                        <td style={{ padding: '10px 8px', textAlign: 'right', color: r.overtime_pay > 0 ? '#2563eb' : '#94a3b8' }}>
                                            {r.overtime_pay > 0 ? `Rs. ${r.overtime_pay.toLocaleString()} (${r.overtime_hours}h)` : '-'}
                                        </td>
                                        <td style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 600, color: '#1e293b' }}>
                                            Rs. {r.pay_and_allowances.toLocaleString()}
                                        </td>
                                        <td style={{ padding: '10px 10px', textAlign: 'right', color: r.total_attendance_deduction > 0 ? '#dc2626' : '#94a3b8' }}>
                                            {r.total_attendance_deduction > 0 ? `-Rs. ${r.total_attendance_deduction.toLocaleString()}` : '-'}
                                        </td>
                                        <td style={{ padding: '10px 10px', textAlign: 'right', color: r.total_other_deductions > 0 ? '#dc2626' : '#94a3b8' }}>
                                            {r.total_other_deductions > 0 ? `-Rs. ${r.total_other_deductions.toLocaleString()}` : '-'}
                                        </td>
                                        <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                                            <span style={{
                                                fontWeight: 700,
                                                fontSize: '13px',
                                                padding: '4px 10px',
                                                borderRadius: '6px',
                                                background: '#eff6ff',
                                                color: '#1d4ed8',
                                                border: '1px solid #bfdbfe'
                                            }}>
                                                Rs. {r.gross_total.toLocaleString()}
                                            </span>
                                        </td>
                                        <td style={{ padding: '10px 10px', textAlign: 'center' }}>
                                            <span style={{
                                                fontSize: '11px',
                                                fontWeight: 600,
                                                padding: '2px 8px',
                                                borderRadius: '12px',
                                                background: r.status === 'PAID' ? '#dcfce7' : r.status === 'APPROVED' ? '#e0f2fe' : '#f1f5f9',
                                                color: r.status === 'PAID' ? '#15803d' : r.status === 'APPROVED' ? '#0369a1' : '#475569'
                                            }}>
                                                {r.status}
                                            </span>
                                        </td>
                                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                                <button
                                                    type="button"
                                                    title="Adjust Loan / Parts / Base"
                                                    onClick={() => handleOpenAdjust(r)}
                                                    style={{
                                                        padding: '4px 8px',
                                                        borderRadius: '6px',
                                                        border: '1px solid #cbd5e1',
                                                        background: '#ffffff',
                                                        color: '#334155',
                                                        cursor: 'pointer',
                                                        fontSize: '12px'
                                                    }}
                                                >
                                                    <i className="bx bx-slider-alt" />
                                                </button>

                                                <button
                                                    type="button"
                                                    title="View Salary Slip"
                                                    onClick={() => onSelectPayslip && onSelectPayslip(r.employee_id)}
                                                    style={{
                                                        padding: '4px 8px',
                                                        borderRadius: '6px',
                                                        border: '1px solid #cbd5e1',
                                                        background: '#ffffff',
                                                        color: '#0284c7',
                                                        cursor: 'pointer',
                                                        fontSize: '12px'
                                                    }}
                                                >
                                                    <i className="bx bx-receipt" />
                                                </button>

                                                <button
                                                    type="button"
                                                    title="Download Official PDF"
                                                    disabled={isDownloading}
                                                    onClick={() => handleDownloadPdf(r.employee_id, r.employee_name)}
                                                    style={{
                                                        padding: '4px 8px',
                                                        borderRadius: '6px',
                                                        border: '1px solid #bbf7d0',
                                                        background: '#f0fdf4',
                                                        color: '#16a34a',
                                                        cursor: isDownloading ? 'not-allowed' : 'pointer',
                                                        fontSize: '12px'
                                                    }}
                                                >
                                                    <i className={`bx ${isDownloading ? 'bx-loader-alt bx-spin' : 'bx-download'}`} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Adjustments & Calculation Modal */}
            {isModalOpen && selectedRecord && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(15, 23, 42, 0.6)',
                    backdropFilter: 'blur(4px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 9999,
                    padding: '20px'
                }}>
                    <div style={{
                        background: 'var(--color-surface, #ffffff)',
                        borderRadius: '16px',
                        width: '100%',
                        maxWidth: '680px',
                        maxHeight: '90vh',
                        overflowY: 'auto',
                        padding: '24px',
                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--color-text, #0f172a)' }}>
                                    Salary Adjustment: {selectedRecord.employee_name}
                                </h3>
                                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                                    {selectedRecord.department} · {MONTH_NAMES[month - 1]} {year}
                                </div>
                            </div>
                            <button
                                onClick={() => setIsModalOpen(false)}
                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#64748b' }}
                            >
                                <i className="bx bx-x" />
                            </button>
                        </div>

                        <form onSubmit={handleSaveAdjustment} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {/* Live Calculation Box */}
                            {modalPreview && (
                                <div style={{
                                    background: '#f8fafc',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: '10px',
                                    padding: '14px',
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(3, 1fr)',
                                    gap: '10px',
                                    fontSize: '12px'
                                }}>
                                    <div>
                                        <span style={{ color: '#64748b' }}>Time Bonus:</span>
                                        <div style={{ fontWeight: 700, color: modalPreview.bonus_time > 0 ? '#16a34a' : '#64748b' }}>
                                            Rs. {modalPreview.bonus_time}
                                        </div>
                                    </div>
                                    <div>
                                        <span style={{ color: '#64748b' }}>Zero-Holiday Bonus:</span>
                                        <div style={{ fontWeight: 700, color: modalPreview.bonus_zero_holiday > 0 ? '#16a34a' : '#64748b' }}>
                                            Rs. {modalPreview.bonus_zero_holiday}
                                        </div>
                                    </div>
                                    <div>
                                        <span style={{ color: '#64748b' }}>Attendance Ded:</span>
                                        <div style={{ fontWeight: 700, color: '#dc2626' }}>
                                            -Rs. {modalPreview.total_attendance_deduction}
                                        </div>
                                    </div>
                                    <div style={{ gridColumn: 'span 3', borderTop: '1px dashed #cbd5e1', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontWeight: 700, color: '#1e293b' }}>Calculated Net Pay:</span>
                                        <span style={{ fontSize: '18px', fontWeight: 800, color: '#1d4ed8' }}>
                                            Rs. {modalPreview.gross_total?.toLocaleString()}
                                        </span>
                                    </div>
                                </div>
                            )}

                            {/* Base & OT */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                                        Basic Salary (PKR)
                                    </label>
                                    <input
                                        type="number"
                                        value={modalForm.basic_salary}
                                        onChange={e => handleFormChange('basic_salary', Number(e.target.value))}
                                        style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                                        Overtime Hours Override
                                    </label>
                                    <input
                                        type="number"
                                        step="0.5"
                                        value={modalForm.overtime_hours}
                                        onChange={e => handleFormChange('overtime_hours', Number(e.target.value))}
                                        style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                                    />
                                </div>
                            </div>

                            {/* Incident Deductions */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                                        Damaged Parts / Displays (PKR)
                                    </label>
                                    <input
                                        type="number"
                                        value={modalForm.damaged_parts}
                                        onChange={e => handleFormChange('damaged_parts', Number(e.target.value))}
                                        placeholder="0"
                                        style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                                        Phone / Utility Bill Deduction (PKR)
                                    </label>
                                    <input
                                        type="number"
                                        value={modalForm.bill_deduction}
                                        onChange={e => handleFormChange('bill_deduction', Number(e.target.value))}
                                        placeholder="0"
                                        style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                                    />
                                </div>
                            </div>

                            {/* Loan Adjustments */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                                        Loan Principal (PKR)
                                    </label>
                                    <input
                                        type="number"
                                        value={modalForm.loan_principal}
                                        onChange={e => handleFormChange('loan_principal', Number(e.target.value))}
                                        placeholder="0"
                                        style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                                        Monthly Loan Deduction (PKR)
                                    </label>
                                    <input
                                        type="number"
                                        value={modalForm.loan_deduction}
                                        onChange={e => handleFormChange('loan_deduction', Number(e.target.value))}
                                        placeholder="0"
                                        style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                                    />
                                </div>
                            </div>

                            {/* Status */}
                            <div>
                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                                    Payroll Status
                                </label>
                                <select
                                    value={modalForm.status}
                                    onChange={e => handleFormChange('status', e.target.value)}
                                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                                >
                                    <option value="DRAFT">Draft / Calculated</option>
                                    <option value="APPROVED">Approved</option>
                                    <option value="PAID">Disbursed / Paid</option>
                                </select>
                            </div>

                            {/* Modal Actions */}
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    style={{
                                        padding: '9px 18px',
                                        borderRadius: '8px',
                                        border: '1px solid #cbd5e1',
                                        background: '#f8fafc',
                                        color: '#475569',
                                        cursor: 'pointer',
                                        fontWeight: 500
                                    }}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    style={{
                                        padding: '9px 24px',
                                        borderRadius: '8px',
                                        border: 'none',
                                        background: 'var(--color-primary, #2563eb)',
                                        color: '#ffffff',
                                        cursor: saving ? 'not-allowed' : 'pointer',
                                        fontWeight: 600
                                    }}
                                >
                                    {saving ? 'Saving...' : 'Save & Confirm Payroll'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
