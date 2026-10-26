import React, { useState } from 'react';
import { useAuthStore } from '../../../auth/authStore';
import { TechnicianRosterTab } from './TechnicianRosterTab';
import { HiringOnboardingTab } from './HiringOnboardingTab';
import { MobileAttendanceGridTab } from './MobileAttendanceGridTab';
import { MobilePayrollTab } from './MobilePayrollTab';
import { MobilePayslipViewerTab } from './MobilePayslipViewerTab';
import { CompanyPoliciesTab } from './CompanyPoliciesTab';
import { ExitProcessTab } from './ExitProcessTab';
import { EmployeeSelfServicePortal } from './EmployeeSelfServicePortal';
import { LeaveManagementTab } from './LeaveManagementTab';

type OperationsTabType = 'roster' | 'onboarding' | 'attendance' | 'payroll' | 'payslip' | 'leaves' | 'policies' | 'exit';
type ViewMode = 'operations' | 'portal';

export const MobileHRModule: React.FC = () => {
    const user = useAuthStore(s => s.user);
    const isAdminRole = user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'manager' || user?.role === 'owner' || user?.role === 'management';
    const [viewMode, setViewMode] = useState<ViewMode>(isAdminRole ? 'operations' : 'portal');
    const [activeTab, setActiveTab] = useState<OperationsTabType>('roster');
    const [selectedEmployeeIdForPayslip, setSelectedEmployeeIdForPayslip] = useState<string | null>(null);

    const handleJumpToPayslip = (employeeId: string) => {
        setSelectedEmployeeIdForPayslip(employeeId);
        setViewMode('operations');
        setActiveTab('payslip');
    };

    // Strict Role-Based View: Non-admin staff members are strictly locked to their self-service portal
    if (!isAdminRole) {
        return (
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                background: 'var(--color-background, #f8fafc)',
                overflowY: 'auto'
            }}>
                <EmployeeSelfServicePortal isStaffOnly={true} />
            </div>
        );
    }

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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifySelf: 'center',
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
                            Role-Based Architecture: Hiring Pipeline, Testing Lab Assets, 30-Day Attendance, Incentive Payroll, and Relieving Workflows.
                        </p>
                    </div>

                    {/* View Switcher: Admin Operations vs Staff Self-Service */}
                    <div style={{
                        display: 'flex',
                        background: '#f1f5f9',
                        padding: '3px',
                        borderRadius: '10px',
                        border: '1px solid #e2e8f0'
                    }}>
                        <button
                            type="button"
                            onClick={() => setViewMode('operations')}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '6px 14px',
                                borderRadius: '8px',
                                border: 'none',
                                background: viewMode === 'operations' ? '#ffffff' : 'transparent',
                                color: viewMode === 'operations' ? '#0f172a' : '#64748b',
                                fontWeight: viewMode === 'operations' ? 700 : 500,
                                fontSize: '13px',
                                cursor: 'pointer',
                                boxShadow: viewMode === 'operations' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            <i className="bx bx-slider-alt" />
                            Management Operations
                        </button>
                        <button
                            type="button"
                            onClick={() => setViewMode('portal')}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '6px 14px',
                                borderRadius: '8px',
                                border: 'none',
                                background: viewMode === 'portal' ? '#2563eb' : 'transparent',
                                color: viewMode === 'portal' ? '#ffffff' : '#64748b',
                                fontWeight: viewMode === 'portal' ? 700 : 500,
                                fontSize: '13px',
                                cursor: 'pointer',
                                boxShadow: viewMode === 'portal' ? '0 1px 3px rgba(37,99,235,0.2)' : 'none',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            <i className="bx bx-user-circle" />
                            Staff Self-Service Portal
                        </button>
                    </div>
                </div>

                {/* Sub Tab Navigation (Active only in Management Operations Mode) */}
                {viewMode === 'operations' && (
                    <div style={{ display: 'flex', gap: '20px', borderBottom: 'none', overflowX: 'auto' }}>
                        {[
                            { id: 'roster', label: 'Staff & Employees', icon: 'bx-group' },
                            { id: 'onboarding', label: 'Hiring & Onboarding', icon: 'bx-user-plus' },
                            { id: 'attendance', label: 'Monthly Attendance', icon: 'bx-calendar-check' },
                            { id: 'payroll', label: 'Payroll & Compensation', icon: 'bx-calculator' },
                            { id: 'payslip', label: 'Salary Slips & PDF', icon: 'bx-receipt' },
                            { id: 'leaves', label: 'Leave Requests & Approvals', icon: 'bx-calendar-event' },
                            { id: 'policies', label: 'Company Policies', icon: 'bx-book-open' },
                            { id: 'exit', label: 'Exit Process', icon: 'bx-log-out-circle' },
                        ].map(tab => {
                            const active = activeTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => setActiveTab(tab.id as OperationsTabType)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '7px',
                                        padding: '12px 4px',
                                        border: 'none',
                                        borderBottom: active ? '2px solid var(--color-primary, #2563eb)' : '2px solid transparent',
                                        background: 'transparent',
                                        color: active ? 'var(--color-primary, #2563eb)' : '#64748b',
                                        fontWeight: active ? 600 : 500,
                                        fontSize: '13.5px',
                                        cursor: 'pointer',
                                        transition: 'all 0.15s ease',
                                        whiteSpace: 'nowrap'
                                    }}
                                >
                                    <i className={`bx ${tab.icon}`} style={{ fontSize: '17px' }} />
                                    {tab.label}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Tab Body */}
            <div style={{ flex: 1 }}>
                {viewMode === 'portal' ? (
                    <EmployeeSelfServicePortal isStaffOnly={false} />
                ) : (
                    <>
                        {activeTab === 'roster' && (
                            <TechnicianRosterTab onSelectTechnicianForPayslip={handleJumpToPayslip} />
                        )}
                        {activeTab === 'onboarding' && (
                            <HiringOnboardingTab />
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
                        {activeTab === 'leaves' && (
                            <LeaveManagementTab />
                        )}
                        {activeTab === 'policies' && (
                            <CompanyPoliciesTab />
                        )}
                        {activeTab === 'exit' && (
                            <ExitProcessTab />
                        )}
                    </>
                )}
            </div>
        </div>
    );
};
