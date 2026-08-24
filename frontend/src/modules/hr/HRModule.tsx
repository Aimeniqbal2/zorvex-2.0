import React, { useState } from 'react';
import { PageContainer, PageHeader } from '../../layouts/PageLayout';
import { Card } from '../../components/ui/Card';
import { EmployeeList } from './components/EmployeeList';
import { DesignationList } from './components/DesignationList';
import { RecruitmentList } from './components/RecruitmentList';
import { AttendanceList } from './components/AttendanceList';
import { LeaveList } from './components/LeaveList';
import { PayrollList } from './components/PayrollList';
import { ShiftList } from './components/ShiftList';
import { PayslipList } from './components/PayslipList';
import { SalaryStructureList } from './components/SalaryStructureList';
import { SalaryComponentList } from './components/SalaryComponentList';
import { PayrollPeriodList } from './components/PayrollPeriodList';
import { EmployeeSalaryAssignmentList } from './components/EmployeeSalaryAssignmentList';
import { StatutorySchemeList } from './components/StatutorySchemeList';
import { PayrollDisbursementList } from './components/PayrollDisbursementList';

export const HRModule: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'EMPLOYEES' | 'RECRUITMENT' | 'DESIGNATIONS' | 'ATTENDANCE' | 'SHIFTS' | 'LEAVE' | 'SALARY_COMPONENTS' | 'SALARY_STRUCTURES' | 'ASSIGNMENTS' | 'PAYROLL_PERIODS' | 'PAYROLL' | 'PAYSLIPS' | 'STATUTORY' | 'DISBURSEMENTS'>('EMPLOYEES');

    const renderContent = () => {
        switch (activeTab) {
            case 'EMPLOYEES':
                return <EmployeeList />;
            case 'RECRUITMENT':
                return <RecruitmentList />;
            case 'DESIGNATIONS':
                return <DesignationList />;
            case 'ATTENDANCE':
                return <AttendanceList />;
            case 'SHIFTS':
                return <ShiftList />;
            case 'LEAVE':
                return <LeaveList />;
            case 'SALARY_COMPONENTS':
                return <SalaryComponentList />;
            case 'SALARY_STRUCTURES':
                return <SalaryStructureList />;
            case 'ASSIGNMENTS':
                return <EmployeeSalaryAssignmentList />;
            case 'PAYROLL_PERIODS':
                return <PayrollPeriodList />;
            case 'PAYROLL':
                return <PayrollList />;
            case 'PAYSLIPS':
                return <PayslipList />;
            case 'STATUTORY':
                return <StatutorySchemeList />;
            case 'DISBURSEMENTS':
                return <PayrollDisbursementList />;
            default:
                return null;
        }
    };

    return (
        <PageContainer>
            <PageHeader title="Universal HR" />
            <Card>
                <div style={{ padding: '16px', display: 'flex', gap: '16px', borderBottom: '1px solid var(--color-border)' }}>
                    <button 
                        style={{ padding: '8px 16px', borderBottom: activeTab === 'EMPLOYEES' ? '2px solid var(--color-primary)' : 'none', cursor: 'pointer', background: 'none', borderTop: 'none', borderLeft: 'none', borderRight: 'none', color: activeTab === 'EMPLOYEES' ? 'var(--color-primary)' : 'inherit', fontWeight: activeTab === 'EMPLOYEES' ? 'bold' : 'normal' }}
                        onClick={() => setActiveTab('EMPLOYEES')}
                    >
                        Employees
                    </button>
                    <button 
                        style={{ padding: '8px 16px', borderBottom: activeTab === 'RECRUITMENT' ? '2px solid var(--color-primary)' : 'none', cursor: 'pointer', background: 'none', borderTop: 'none', borderLeft: 'none', borderRight: 'none', color: activeTab === 'RECRUITMENT' ? 'var(--color-primary)' : 'inherit', fontWeight: activeTab === 'RECRUITMENT' ? 'bold' : 'normal' }}
                        onClick={() => setActiveTab('RECRUITMENT')}
                    >
                        Recruitment
                    </button>
                    <button 
                        style={{ padding: '8px 16px', borderBottom: activeTab === 'DESIGNATIONS' ? '2px solid var(--color-primary)' : 'none', cursor: 'pointer', background: 'none', borderTop: 'none', borderLeft: 'none', borderRight: 'none', color: activeTab === 'DESIGNATIONS' ? 'var(--color-primary)' : 'inherit', fontWeight: activeTab === 'DESIGNATIONS' ? 'bold' : 'normal' }}
                        onClick={() => setActiveTab('DESIGNATIONS')}
                    >
                        Designations
                    </button>
                    <button 
                        style={{ padding: '8px 16px', borderBottom: activeTab === 'ATTENDANCE' ? '2px solid var(--color-primary)' : 'none', cursor: 'pointer', background: 'none', borderTop: 'none', borderLeft: 'none', borderRight: 'none', color: activeTab === 'ATTENDANCE' ? 'var(--color-primary)' : 'inherit', fontWeight: activeTab === 'ATTENDANCE' ? 'bold' : 'normal' }}
                        onClick={() => setActiveTab('ATTENDANCE')}
                    >
                        Attendance
                    </button>
                    <button 
                        style={{ padding: '8px 16px', borderBottom: activeTab === 'SHIFTS' ? '2px solid var(--color-primary)' : 'none', cursor: 'pointer', background: 'none', borderTop: 'none', borderLeft: 'none', borderRight: 'none', color: activeTab === 'SHIFTS' ? 'var(--color-primary)' : 'inherit', fontWeight: activeTab === 'SHIFTS' ? 'bold' : 'normal' }}
                        onClick={() => setActiveTab('SHIFTS')}
                    >
                        Shifts
                    </button>
                    <button 
                        style={{ padding: '8px 16px', borderBottom: activeTab === 'LEAVE' ? '2px solid var(--color-primary)' : 'none', cursor: 'pointer', background: 'none', borderTop: 'none', borderLeft: 'none', borderRight: 'none', color: activeTab === 'LEAVE' ? 'var(--color-primary)' : 'inherit', fontWeight: activeTab === 'LEAVE' ? 'bold' : 'normal' }}
                        onClick={() => setActiveTab('LEAVE')}
                    >
                        Leave
                    </button>
                    <button 
                        style={{ padding: '8px 16px', borderBottom: activeTab === 'SALARY_COMPONENTS' ? '2px solid var(--color-primary)' : 'none', cursor: 'pointer', background: 'none', borderTop: 'none', borderLeft: 'none', borderRight: 'none', color: activeTab === 'SALARY_COMPONENTS' ? 'var(--color-primary)' : 'inherit', fontWeight: activeTab === 'SALARY_COMPONENTS' ? 'bold' : 'normal' }}
                        onClick={() => setActiveTab('SALARY_COMPONENTS')}
                    >
                        Salary Components
                    </button>
                    <button 
                        style={{ padding: '8px 16px', borderBottom: activeTab === 'SALARY_STRUCTURES' ? '2px solid var(--color-primary)' : 'none', cursor: 'pointer', background: 'none', borderTop: 'none', borderLeft: 'none', borderRight: 'none', color: activeTab === 'SALARY_STRUCTURES' ? 'var(--color-primary)' : 'inherit', fontWeight: activeTab === 'SALARY_STRUCTURES' ? 'bold' : 'normal' }}
                        onClick={() => setActiveTab('SALARY_STRUCTURES')}
                    >
                        Salary Structures
                    </button>
                    <button 
                        style={{ padding: '8px 16px', borderBottom: activeTab === 'ASSIGNMENTS' ? '2px solid var(--color-primary)' : 'none', cursor: 'pointer', background: 'none', borderTop: 'none', borderLeft: 'none', borderRight: 'none', color: activeTab === 'ASSIGNMENTS' ? 'var(--color-primary)' : 'inherit', fontWeight: activeTab === 'ASSIGNMENTS' ? 'bold' : 'normal' }}
                        onClick={() => setActiveTab('ASSIGNMENTS')}
                    >
                        Assignments
                    </button>
                    <button 
                        style={{ padding: '8px 16px', borderBottom: activeTab === 'PAYROLL_PERIODS' ? '2px solid var(--color-primary)' : 'none', cursor: 'pointer', background: 'none', borderTop: 'none', borderLeft: 'none', borderRight: 'none', color: activeTab === 'PAYROLL_PERIODS' ? 'var(--color-primary)' : 'inherit', fontWeight: activeTab === 'PAYROLL_PERIODS' ? 'bold' : 'normal' }}
                        onClick={() => setActiveTab('PAYROLL_PERIODS')}
                    >
                        Payroll Periods
                    </button>
                    <button 
                        style={{ padding: '8px 16px', borderBottom: activeTab === 'PAYROLL' ? '2px solid var(--color-primary)' : 'none', cursor: 'pointer', background: 'none', borderTop: 'none', borderLeft: 'none', borderRight: 'none', color: activeTab === 'PAYROLL' ? 'var(--color-primary)' : 'inherit', fontWeight: activeTab === 'PAYROLL' ? 'bold' : 'normal' }}
                        onClick={() => setActiveTab('PAYROLL')}
                    >
                        Payroll
                    </button>
                    <button 
                        style={{ padding: '8px 16px', borderBottom: activeTab === 'PAYSLIPS' ? '2px solid var(--color-primary)' : 'none', cursor: 'pointer', background: 'none', borderTop: 'none', borderLeft: 'none', borderRight: 'none', color: activeTab === 'PAYSLIPS' ? 'var(--color-primary)' : 'inherit', fontWeight: activeTab === 'PAYSLIPS' ? 'bold' : 'normal' }}
                        onClick={() => setActiveTab('PAYSLIPS')}
                    >
                        Payslips
                    </button>
                    <button 
                        style={{ padding: '8px 16px', borderBottom: activeTab === 'STATUTORY' ? '2px solid var(--color-primary)' : 'none', cursor: 'pointer', background: 'none', borderTop: 'none', borderLeft: 'none', borderRight: 'none', color: activeTab === 'STATUTORY' ? 'var(--color-primary)' : 'inherit', fontWeight: activeTab === 'STATUTORY' ? 'bold' : 'normal' }}
                        onClick={() => setActiveTab('STATUTORY')}
                    >
                        Statutory
                    </button>
                    <button 
                        style={{ padding: '8px 16px', borderBottom: activeTab === 'DISBURSEMENTS' ? '2px solid var(--color-primary)' : 'none', cursor: 'pointer', background: 'none', borderTop: 'none', borderLeft: 'none', borderRight: 'none', color: activeTab === 'DISBURSEMENTS' ? 'var(--color-primary)' : 'inherit', fontWeight: activeTab === 'DISBURSEMENTS' ? 'bold' : 'normal' }}
                        onClick={() => setActiveTab('DISBURSEMENTS')}
                    >
                        Disbursements
                    </button>
                </div>
                <div style={{ padding: '16px' }}>
                    {renderContent()}
                </div>
            </Card>
        </PageContainer>
    );
};
