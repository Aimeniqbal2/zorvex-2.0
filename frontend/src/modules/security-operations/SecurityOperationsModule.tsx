import React, { useState } from 'react';
import { OperationsControlCenter } from './components/OperationsControlCenter';
import { SecurityOverview } from './components/SecurityOverview';
import { SitesView } from './components/SitesView';
import { DeploymentsView } from './components/DeploymentsView';
import { DutyAssignmentsView } from './components/DutyAssignmentsView';
import { ExtraDutyView } from './components/ExtraDutyView';
import { RosterView } from './components/RosterView';
import { AttendanceView } from './components/AttendanceView';
import { DailyPayReviewView } from './components/DailyPayReviewView';
import { PayrollPreparationView } from './components/PayrollPreparationView';
import { PayrollRunsView } from './components/PayrollRunsView';
import { SecurityInventoryWorkspace } from './components/SecurityInventoryWorkspace';
import { AdvancedOperationsWorkspace } from './components/AdvancedOperationsWorkspace';
import { IncidentsView } from './components/IncidentsView';
import { DailyActivityReportsView } from './components/DailyActivityReportsView';
import { ServiceInvoicesView } from './components/ServiceInvoicesView';
import { TemporaryServicesView } from './components/TemporaryServicesView';
import { QAInspectionsView } from './components/QAInspectionsView';
import { CorrectiveActionsView } from './components/CorrectiveActionsView';
import { SecurityReportsWorkspace } from './components/SecurityReportsWorkspace';
import { MonthlyMusterSheetTab } from './components/MonthlyMusterSheetTab';
import { AttendanceRegisterView } from './components/AttendanceRegisterView';
import './styles/securityOperations.css';

type Tab = 'monthly_muster' | 'attendance_register' | 'overview' | 'advanced_ops' | 'sites' | 'contracts' | 'deployments' | 'duties' | 'roster' | 'attendance' | 'daily_pay' | 'payroll_prep' | 'payroll_runs' | 'extra_duties' | 'equipment_issues' | 'incidents' | 'daily_activity' | 'billing' | 'staffing' | 'temporary_services' | 'qa_inspections' | 'qa_actions' | 'reports';

const TABS: { id: Tab, label: string, icon: string }[] = [
    { id: 'monthly_muster', label: 'Monthly Duty Muster', icon: 'bx-spreadsheet' },
    { id: 'attendance_register', label: 'Attendance Register & Ledger', icon: 'bx-history' },
    { id: 'overview', label: 'Control Center', icon: 'bx-radar' },
    { id: 'advanced_ops', label: 'Advanced Ops & Dispatch', icon: 'bx-broadcast' },
    { id: 'sites', label: 'Sites', icon: 'bx-building-house' },
    { id: 'deployments', label: 'Deployments', icon: 'bx-map-pin' },
    { id: 'duties', label: 'Duty Assignments', icon: 'bx-clipboard' },
    { id: 'roster', label: 'Roster', icon: 'bx-calendar' },
    { id: 'attendance', label: 'Attendance', icon: 'bx-time-five' },
    { id: 'daily_pay', label: 'Daily Duty Pay', icon: 'bx-dollar-circle' },
    { id: 'payroll_prep', label: 'Payroll Prep', icon: 'bx-calculator' },
    { id: 'payroll_runs', label: 'Payroll Runs', icon: 'bx-wallet' },
    { id: 'extra_duties', label: 'Extra Duties', icon: 'bx-plus-circle' },
    { id: 'equipment_issues', label: 'Security Inventory', icon: 'bx-shield-quarter' },
    { id: 'incidents', label: 'Incidents', icon: 'bx-error' },
    { id: 'daily_activity', label: 'Daily Activity', icon: 'bx-book-open' },
    { id: 'billing', label: 'Billing', icon: 'bx-receipt' },
    { id: 'temporary_services', label: 'Temporary Services', icon: 'bx-time' },
    { id: 'qa_inspections', label: 'QA Inspections', icon: 'bx-check-shield' },
    { id: 'qa_actions', label: 'Corrective Actions', icon: 'bx-wrench' },
    { id: 'reports', label: 'Reports & Analytics', icon: 'bx-bar-chart-alt-2' },
];

export const SecurityOperationsModule: React.FC = () => {
    const [activeTab, setActiveTab] = useState<Tab>('overview');
    const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
    const [selectedSiteId, setSelectedSiteId] = useState<string | undefined>(undefined);

    const renderContent = () => {
        switch (activeTab) {
            case 'monthly_muster':
                return <MonthlyMusterSheetTab />;
            case 'attendance_register':
                return <AttendanceRegisterView />;
            case 'overview':
                return <SecurityOverview onNavigate={(tab: Tab) => setActiveTab(tab)} />;
            case 'advanced_ops':
                return <AdvancedOperationsWorkspace onNavigateTab={(tab: any) => setActiveTab(tab)} />;
            case 'sites':
                return (
                    <SitesView 
                        onNavigate={(tab, siteId) => {
                            if (siteId) setSelectedSiteId(siteId);
                            setActiveTab(tab as Tab);
                        }} 
                    />
                );
            case 'contracts':
                return (
                    <SitesView 
                        onNavigate={(tab, siteId) => {
                            if (siteId) setSelectedSiteId(siteId);
                            setActiveTab(tab as Tab);
                        }} 
                    />
                );
            case 'deployments':
                return <DeploymentsView />;
            case 'duties':
                return <DutyAssignmentsView />;
            case 'roster':
                return <RosterView />;
            case 'attendance':
                return <AttendanceView initialSiteId={selectedSiteId} />;
            case 'daily_pay':
                return <DailyPayReviewView />;
            case 'payroll_prep':
                return <PayrollPreparationView />;
            case 'payroll_runs':
                return <PayrollRunsView />;
            case 'extra_duties':
                return <ExtraDutyView />;
            case 'equipment_issues':
                return <SecurityInventoryWorkspace />;
            case 'incidents':
                return <IncidentsView />;
            case 'daily_activity':
                return <DailyActivityReportsView />;
            case 'billing':
                return <ServiceInvoicesView />;
            case 'staffing':
                return <DeploymentsView />;
            case 'temporary_services':
                return <TemporaryServicesView />;
            case 'qa_inspections':
                return <QAInspectionsView />;
            case 'qa_actions':
                return <CorrectiveActionsView />;
            case 'reports':
                return <SecurityReportsWorkspace />;
            case 'overview':
            default:
                return <OperationsControlCenter onNavigate={(tab: Tab) => setActiveTab(tab)} />;
        }
    };

    // Full-screen canvas modes: completely remove sidebar, header and padding
    if (activeTab === 'monthly_muster') {
        return <MonthlyMusterSheetTab onBack={() => setActiveTab('overview')} />;
    }
    if (activeTab === 'attendance_register') {
        return <AttendanceRegisterView onBack={() => setActiveTab('overview')} />;
    }

    return (
        <div className="security-operations-module">
            <div className="security-ops-header">
                <div className="header-content">
                    <button className="sidebar-toggle-btn" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
                        <i className={`bx ${isSidebarOpen ? 'bx-menu-alt-left' : 'bx-menu'}`}></i>
                    </button>
                    <div className="header-text">
                        <h1>Security Operations</h1>
                        <p>Manage sites, service contracts, workforce deployments and daily operations.</p>
                    </div>
                </div>
            </div>

            <div className="security-ops-body-layout">
                <div className={`security-ops-sidebar ${isSidebarOpen ? 'open' : 'closed'}`}>
                    <div className="sidebar-nav">
                        {TABS.map(tab => (
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
                
                <div className="security-ops-main">
                    <div className="security-ops-content">
                        {renderContent()}
                    </div>
                </div>
            </div>
        </div>
    );
};
