import React, { useState, useEffect } from 'react';
import { Card } from '../../components/ui/Card';
import { useIndustry, useAppStore } from '../../stores/appStore';
import { EmployeeList } from './components/EmployeeList';
import { DesignationList } from './components/DesignationList';
import { DepartmentList } from './components/DepartmentList';
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
import { OvertimeList } from './components/OvertimeList';
import { CompanyPayrollPolicyForm } from './components/CompanyPayrollPolicyForm';
import { DeploymentsView } from '../security-operations/components/DeploymentsView';
import { RosterView } from '../security-operations/components/RosterView';
import { AttendanceRegisterView } from './components/AttendanceRegisterView';
import { PayslipReportView } from './components/PayslipReportView';

type TabId = 
    | 'EMPLOYEES'
    | 'DEPLOYMENTS'
    | 'ROSTERS'
    | 'RECRUITMENT'
    | 'DESIGNATIONS'
    | 'DEPARTMENTS'
    | 'ATTENDANCE_REGISTER'
    | 'ATTENDANCE'
    | 'SHIFTS'
    | 'LEAVE'
    | 'OVERTIME'
    | 'SALARY_COMPONENTS'
    | 'SALARY_STRUCTURES'
    | 'ASSIGNMENTS'
    | 'PAYROLL_PERIODS'
    | 'PAYROLL'
    | 'PAYSLIP_REPORT'
    | 'PAYSLIPS'
    | 'STATUTORY'
    | 'DISBURSEMENTS'
    | 'SETTINGS';

interface HRModuleProps {
    isSecurity?: boolean;
}

export const HRModule: React.FC<HRModuleProps> = ({ isSecurity: propIsSecurity }) => {
    const { isSecurity: storeIsSecurity } = useIndustry();
    const isSecurity = propIsSecurity !== undefined ? propIsSecurity : storeIsSecurity;
    const { company } = useAppStore();

    const [activeTab, setActiveTab] = useState<TabId>('EMPLOYEES');
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);

    // Auto reset security-only tabs if switched to universal HR
    useEffect(() => {
        if (!isSecurity && (activeTab === 'DEPLOYMENTS' || activeTab === 'ROSTERS')) {
            setActiveTab('EMPLOYEES');
        }
    }, [isSecurity, activeTab]);

    const renderContent = () => {
        switch (activeTab) {
            case 'EMPLOYEES':
                return <EmployeeList key={`${company?.id || 'emp'}-${isSecurity ? 'sec' : 'univ'}`} isSecurity={isSecurity} />;
            case 'DEPLOYMENTS':
                return isSecurity ? <DeploymentsView /> : null;
            case 'ROSTERS':
                return isSecurity ? <RosterView /> : null;
            case 'RECRUITMENT':
                return <RecruitmentList />;
            case 'DESIGNATIONS':
                return <DesignationList />;
            case 'DEPARTMENTS':
                return <DepartmentList />;
            case 'ATTENDANCE_REGISTER':
                return <AttendanceRegisterView />;
            case 'ATTENDANCE':
                return <AttendanceList />;
            case 'SHIFTS':
                return <ShiftList />;
            case 'LEAVE':
                return <LeaveList />;
            case 'OVERTIME':
                return <OvertimeList />;
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
            case 'PAYSLIP_REPORT':
                return <PayslipReportView />;
            case 'PAYSLIPS':
                return <PayslipList />;
            case 'STATUTORY':
                return <StatutorySchemeList />;
            case 'DISBURSEMENTS':
                return <PayrollDisbursementList />;
            case 'SETTINGS':
                return <CompanyPayrollPolicyForm />;
            default:
                return null;
        }
    };

    // Build tabs based on company industry context
    const tabs: Array<{ id: TabId; label: string; icon: string }> = isSecurity
        ? [
            { id: 'EMPLOYEES', label: 'Guards & Staff', icon: 'bx-group' },
            { id: 'DEPLOYMENTS', label: 'Deployments', icon: 'bx-shield-quarter' },
            { id: 'ROSTERS', label: 'Duty Rosters', icon: 'bx-calendar-check' },
            { id: 'ATTENDANCE_REGISTER', label: 'Attendance Register', icon: 'bx-calendar-event' },
            { id: 'PAYSLIP_REPORT', label: 'Pay Slips Report', icon: 'bx-receipt' },
            { id: 'RECRUITMENT', label: 'Recruitment', icon: 'bx-user-plus' },
            { id: 'DESIGNATIONS', label: 'Designations', icon: 'bx-badge-check' },
            { id: 'DEPARTMENTS', label: 'Departments', icon: 'bx-buildings' },
            { id: 'ATTENDANCE', label: 'Daily Logs', icon: 'bx-time-five' },
            { id: 'SHIFTS', label: 'Shifts', icon: 'bx-transfer' },
            { id: 'LEAVE', label: 'Leave', icon: 'bx-calendar-x' },
            { id: 'OVERTIME', label: 'Overtime', icon: 'bx-time' },
            { id: 'SALARY_COMPONENTS', label: 'Salary Components', icon: 'bx-layer' },
            { id: 'SALARY_STRUCTURES', label: 'Salary Structures', icon: 'bx-money' },
            { id: 'ASSIGNMENTS', label: 'Pay Assignments', icon: 'bx-user-pin' },
            { id: 'PAYROLL_PERIODS', label: 'Payroll Periods', icon: 'bx-calendar' },
            { id: 'PAYROLL', label: 'Payroll Calculations', icon: 'bx-calculator' },
            { id: 'PAYSLIPS', label: 'Payslips', icon: 'bx-detail' },
            { id: 'STATUTORY', label: 'Statutory (EOBI/ESSI)', icon: 'bx-shield' },
            { id: 'DISBURSEMENTS', label: 'DisBURSEMENTS', icon: 'bx-wallet' },
            { id: 'SETTINGS', label: 'Payroll Settings', icon: 'bx-cog' }
        ]
        : [
            { id: 'EMPLOYEES', label: 'Employees', icon: 'bx-group' },
            { id: 'ATTENDANCE_REGISTER', label: 'Attendance Register', icon: 'bx-calendar-event' },
            { id: 'PAYSLIP_REPORT', label: 'Pay Slips Report', icon: 'bx-receipt' },
            { id: 'RECRUITMENT', label: 'Recruitment', icon: 'bx-user-plus' },
            { id: 'DESIGNATIONS', label: 'Designations', icon: 'bx-badge-check' },
            { id: 'DEPARTMENTS', label: 'Departments', icon: 'bx-buildings' },
            { id: 'ATTENDANCE', label: 'Attendance', icon: 'bx-time-five' },
            { id: 'SHIFTS', label: 'Shifts', icon: 'bx-transfer' },
            { id: 'LEAVE', label: 'Leave', icon: 'bx-calendar-x' },
            { id: 'OVERTIME', label: 'Overtime', icon: 'bx-time' },
            { id: 'SALARY_COMPONENTS', label: 'Salary Components', icon: 'bx-layer' },
            { id: 'SALARY_STRUCTURES', label: 'Salary Structures', icon: 'bx-money' },
            { id: 'ASSIGNMENTS', label: 'Salary Assignments', icon: 'bx-user-pin' },
            { id: 'PAYROLL_PERIODS', label: 'Payroll Periods', icon: 'bx-calendar' },
            { id: 'PAYROLL', label: 'Payroll', icon: 'bx-calculator' },
            { id: 'PAYSLIPS', label: 'Payslips', icon: 'bx-receipt' },
            { id: 'STATUTORY', label: 'Statutory Deductions', icon: 'bx-shield' },
            { id: 'DISBURSEMENTS', label: 'Disbursements', icon: 'bx-wallet' },
            { id: 'SETTINGS', label: 'Settings', icon: 'bx-cog' }
        ];

    return (
        <div className="module-container">
            <div className="module-header">
                <div className="header-content">
                    <button className="sidebar-toggle-btn" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
                        <i className={`bx ${isSidebarOpen ? 'bx-menu-alt-left' : 'bx-menu'}`}></i>
                    </button>
                    <div>
                        <h1>{isSecurity ? 'Guards & Staff — Security Workforce & HR' : 'Human Resources'}</h1>
                        <p>
                            {isSecurity 
                                ? 'Manage security guards, office staff, deployments, rosters, and payroll.' 
                                : 'Manage employee records, departments, designations, attendance, leave, and payroll.'}
                        </p>
                    </div>
                </div>
            </div>

            <div className="module-body-layout">
                <div className={`module-sidebar ${isSidebarOpen ? 'open' : 'closed'}`}>
                    <div className="module-sidebar-nav">
                        {tabs.map(tab => (
                            <button 
                                key={tab.id}
                                className={`sidebar-nav-btn ${activeTab === tab.id ? 'active' : ''}`}
                                onClick={() => setActiveTab(tab.id)}
                            >
                                <i className={`bx ${tab.icon}`}></i>
                                <span>{tab.label}</span>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="module-main">
                    <div className="module-content">
                        <Card>
                            <div style={{ padding: '24px' }}>
                                {renderContent()}
                            </div>
                        </Card>
                    </div>
                </div>
            </div>
        </div>
    );
};
