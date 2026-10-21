import React, { useState } from 'react';
import { TechnicianRosterTab } from './TechnicianRosterTab';
import { MobileAttendanceGridTab } from './MobileAttendanceGridTab';
import { MobilePayrollTab } from './MobilePayrollTab';
import { MobilePayslipViewerTab } from './MobilePayslipViewerTab';

type TabType = 'roster' | 'attendance' | 'payroll' | 'payslip';

export const MobileHRModule: React.FC = () => {
    const [activeTab, setActiveTab] = useState<TabType>('roster');
    const [selectedEmployeeIdForPayslip, setSelectedEmployeeIdForPayslip] = useState<string | null>(null);

    const handleJumpToPayslip = (employeeId: string) => {
        setSelectedEmployeeIdForPayslip(employeeId);
        setActiveTab('payslip');
    };

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            background: 'var(--color-background, #f8fafc)',
            overflowY: 'auto'
        }}>
            {/* Header */}
            <div style={{
                background: 'var(--color-surface, #ffffff)',
                borderBottom: '1px solid var(--color-border, #e2e8f0)',
                padding: '20px 24px 0 24px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: '32px',
                                height: '32px',
                                borderRadius: '8px',
                                background: '#eff6ff',
                                color: '#2563eb'
                            }}>
                                <i className="bx bx-wrench" style={{ fontSize: '20px' }} />
                            </span>
                            <h2 style={{
                                margin: 0,
                                fontSize: '20px',
                                fontWeight: 700,
                                color: 'var(--color-text, #0f172a)'
                            }}>
                                Mobile Services & Repair HRM
                            </h2>
                            <span style={{
                                fontSize: '11px',
                                fontWeight: 600,
                                padding: '2px 8px',
                                borderRadius: '12px',
                                background: '#dcfce7',
                                color: '#15803d'
                            }}>
                                Softech Engine
                            </span>
                        </div>
                        <p style={{
                            margin: '4px 0 0 40px',
                            fontSize: '13px',
                            color: '#64748b'
                        }}>
                            Hardware/Software Technicians Roster, 30-Day Attendance Grid, and Performance Incentive Payroll
                        </p>
                    </div>
                </div>

                {/* Sub Tab Navigation */}
                <div style={{ display: 'flex', gap: '24px', borderBottom: 'none' }}>
                    {[
                        { id: 'roster', label: 'Technicians & Staff', icon: 'bx-group' },
                        { id: 'attendance', label: 'Monthly Attendance Sheet', icon: 'bx-calendar-check' },
                        { id: 'payroll', label: 'Payroll & Compensation', icon: 'bx-calculator' },
                        { id: 'payslip', label: 'Salary Slips & PDF', icon: 'bx-receipt' },
                    ].map(tab => {
                        const active = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => setActiveTab(tab.id as TabType)}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    padding: '12px 4px',
                                    border: 'none',
                                    borderBottom: active ? '2px solid var(--color-primary, #2563eb)' : '2px solid transparent',
                                    background: 'transparent',
                                    color: active ? 'var(--color-primary, #2563eb)' : '#64748b',
                                    fontWeight: active ? 600 : 500,
                                    fontSize: '14px',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                <i className={`bx ${tab.icon}`} style={{ fontSize: '18px' }} />
                                {tab.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Tab Body */}
            <div style={{ flex: 1 }}>
                {activeTab === 'roster' && (
                    <TechnicianRosterTab onSelectTechnicianForPayslip={handleJumpToPayslip} />
                )}
                {activeTab === 'attendance' && (
                    <MobileAttendanceGridTab />
                )}
                {activeTab === 'payroll' && (
                    <MobilePayrollTab onSelectPayslip={handleJumpToPayslip} />
                )}
                {activeTab === 'payslip' && (
                    <MobilePayslipViewerTab initialEmployeeId={selectedEmployeeIdForPayslip} />
                )}
            </div>
        </div>
    );
};
