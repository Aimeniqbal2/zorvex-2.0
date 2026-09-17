import React, { useState } from 'react';
import { Card } from '../../components/ui/Card';
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

export const HRModule: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'EMPLOYEES' | 'RECRUITMENT' | 'DESIGNATIONS' | 'DEPARTMENTS' | 'ATTENDANCE' | 'SHIFTS' | 'LEAVE' | 'OVERTIME' | 'SALARY_COMPONENTS' | 'SALARY_STRUCTURES' | 'ASSIGNMENTS' | 'PAYROLL_PERIODS' | 'PAYROLL' | 'PAYSLIPS' | 'STATUTORY' | 'DISBURSEMENTS' | 'SETTINGS'>('EMPLOYEES');
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);

    const renderContent = () => {
        switch (activeTab) {
            case 'EMPLOYEES':
                return <EmployeeList />;
            case 'RECRUITMENT':
                return <RecruitmentList />;
            case 'DESIGNATIONS':
                return <DesignationList />;
            case 'DEPARTMENTS':
                return <DepartmentList />;
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

    const tabs = [
        { id: 'EMPLOYEES', label: 'Employees', icon: 'bx-group' },
        { id: 'RECRUITMENT', label: 'Recruitment', icon: 'bx-user-plus' },
        { id: 'DESIGNATIONS', label: 'Designations', icon: 'bx-badge-check' },
        { id: 'DEPARTMENTS', label: 'Departments', icon: 'bx-buildings' },
        { id: 'ATTENDANCE', label: 'Attendance', icon: 'bx-time-five' },
        { id: 'SHIFTS', label: 'Shifts', icon: 'bx-transfer' },
        { id: 'LEAVE', label: 'Leave', icon: 'bx-calendar-x' },
        { id: 'OVERTIME', label: 'Overtime', icon: 'bx-time' },
        { id: 'SALARY_COMPONENTS', label: 'Salary Components', icon: 'bx-layer' },
        { id: 'SALARY_STRUCTURES', label: 'Salary Structures', icon: 'bx-money' },
        { id: 'ASSIGNMENTS', label: 'Assignments', icon: 'bx-user-pin' },
        { id: 'PAYROLL_PERIODS', label: 'Payroll Periods', icon: 'bx-calendar' },
        { id: 'PAYROLL', label: 'Payroll', icon: 'bx-calculator' },
        { id: 'PAYSLIPS', label: 'Payslips', icon: 'bx-receipt' },
        { id: 'STATUTORY', label: 'Statutory', icon: 'bx-shield' },
        { id: 'DISBURSEMENTS', label: 'Disbursements', icon: 'bx-wallet' },
        { id: 'SETTINGS', label: 'Settings', icon: 'bx-cog' }
    ] as const;

    return (
        <div className="module-container">
            <div className="module-header">
                <div className="header-content">
                    <button className="sidebar-toggle-btn" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
                        <i className={`bx ${isSidebarOpen ? 'bx-menu-alt-left' : 'bx-menu'}`}></i>
                    </button>
                    <div>
                        <h1>Universal HR</h1>
                        <p>Manage employees, attendance, payroll, and recruitment.</p>
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
                                onClick={() => setActiveTab(tab.id as any)}
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
