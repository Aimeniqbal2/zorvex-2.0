import React, { useState } from 'react';
import { SecurityOverview } from './components/SecurityOverview';
import { SitesView } from './components/SitesView';
import { ContractsView } from './components/ContractsView';
import { DeploymentsView } from './components/DeploymentsView';
import { DutyAssignmentsView } from './components/DutyAssignmentsView';
import { ExtraDutyView } from './components/ExtraDutyView';
import { RosterView } from './components/RosterView';
import { AttendanceView } from './components/AttendanceView';
import { EquipmentIssueView } from './components/EquipmentIssueView';
import { IncidentsView } from './components/IncidentsView';
import { DailyActivityReportsView } from './components/DailyActivityReportsView';
import { ServiceInvoicesView } from './components/ServiceInvoicesView';
import { StaffingRequirementsView } from './components/StaffingRequirementsView';
import { TemporaryServicesView } from './components/TemporaryServicesView';
import { QAInspectionsView } from './components/QAInspectionsView';
import './styles/securityOperations.css';

type Tab = 'overview' | 'sites' | 'contracts' | 'deployments' | 'duties' | 'roster' | 'attendance' | 'extra_duties' | 'equipment_issues' | 'incidents' | 'daily_activity' | 'billing' | 'staffing' | 'temporary_services' | 'qa_inspections';

export const SecurityOperationsModule: React.FC = () => {
    const [activeTab, setActiveTab] = useState<Tab>('overview');

    const renderContent = () => {
        switch (activeTab) {
            case 'overview':
                return <SecurityOverview onNavigate={(tab: Tab) => setActiveTab(tab)} />;
            case 'sites':
                return <SitesView />;
            case 'contracts':
                return <ContractsView />;
            case 'deployments':
                return <DeploymentsView />;
            case 'duties':
                return <DutyAssignmentsView />;
            case 'roster':
                return <RosterView />;
            case 'attendance':
                return <AttendanceView />;
            case 'extra_duties':
                return <ExtraDutyView />;
            case 'equipment_issues':
                return <EquipmentIssueView />;
            case 'incidents':
                return <IncidentsView />;
            case 'daily_activity':
                return <DailyActivityReportsView />;
            case 'billing':
                return <ServiceInvoicesView />;
            case 'staffing':
                return <StaffingRequirementsView />;
            case 'temporary_services':
                return <TemporaryServicesView />;
            case 'qa_inspections':
                return <QAInspectionsView />;
            default:
                return <SecurityOverview onNavigate={(tab: Tab) => setActiveTab(tab)} />;
        }
    };

    return (
        <div className="security-operations-module">
            <div className="security-ops-header">
                <div className="header-content">
                    <h1>Security Operations</h1>
                    <p>Manage sites, service contracts, workforce deployments and daily security operations.</p>
                </div>
            </div>

            <div className="security-ops-nav">
                <button 
                    className={`nav-btn ${activeTab === 'overview' ? 'active' : ''}`}
                    onClick={() => setActiveTab('overview')}
                >
                    Overview
                </button>
                <button 
                    className={`nav-btn ${activeTab === 'sites' ? 'active' : ''}`}
                    onClick={() => setActiveTab('sites')}
                >
                    Sites
                </button>
                <button 
                    className={`nav-btn ${activeTab === 'contracts' ? 'active' : ''}`}
                    onClick={() => setActiveTab('contracts')}
                >
                    Contracts
                </button>
                <button 
                    className={`nav-btn ${activeTab === 'deployments' ? 'active' : ''}`}
                    onClick={() => setActiveTab('deployments')}
                >
                    Deployments
                </button>
                <button 
                    className={`nav-btn ${activeTab === 'staffing' ? 'active' : ''}`}
                    onClick={() => setActiveTab('staffing')}
                >
                    Staffing
                </button>
                <button 
                    className={`nav-btn ${activeTab === 'duties' ? 'active' : ''}`}
                    onClick={() => setActiveTab('duties')}
                >
                    Duty Assignments
                </button>
                <button 
                    className={`nav-btn ${activeTab === 'roster' ? 'active' : ''}`}
                    onClick={() => setActiveTab('roster')}
                >
                    📅 Roster
                </button>
                <button 
                    className={`nav-btn ${activeTab === 'attendance' ? 'active' : ''}`}
                    onClick={() => setActiveTab('attendance')}
                >
                    Attendance
                </button>
                <button 
                    className={`nav-btn ${activeTab === 'extra_duties' ? 'active' : ''}`}
                    onClick={() => setActiveTab('extra_duties')}
                >
                    Extra Duties
                </button>
                <button 
                    className={`nav-btn ${activeTab === 'equipment_issues' ? 'active' : ''}`}
                    onClick={() => setActiveTab('equipment_issues')}
                >
                    Equipment Issues
                </button>
                <button 
                    className={`nav-btn ${activeTab === 'incidents' ? 'active' : ''}`}
                    onClick={() => setActiveTab('incidents')}
                >
                    Incidents
                </button>
                <button 
                    className={`nav-btn ${activeTab === 'daily_activity' ? 'active' : ''}`}
                    onClick={() => setActiveTab('daily_activity')}
                >
                    Daily Activity
                </button>
                <button 
                    className={`nav-btn ${activeTab === 'billing' ? 'active' : ''}`}
                    onClick={() => setActiveTab('billing')}
                >
                    Billing
                </button>
                <button 
                    className={`nav-btn ${activeTab === 'temporary_services' ? 'active' : ''}`}
                    onClick={() => setActiveTab('temporary_services')}
                >
                    Temporary Services
                </button>
                <button 
                    className={`nav-btn ${activeTab === 'qa_inspections' ? 'active' : ''}`}
                    onClick={() => setActiveTab('qa_inspections')}
                >
                    Quality Assurance
                </button>
            </div>

            <div className="security-ops-content">
                {renderContent()}
            </div>
        </div>
    );
};
