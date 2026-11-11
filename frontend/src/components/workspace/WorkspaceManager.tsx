import React, { Suspense, useEffect, useRef } from 'react';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { WorkspaceTabBar } from './WorkspaceTabBar';
import { DesktopHeader } from '../desktop/DesktopHeader';
import { Desktop } from '../desktop/Desktop';
import { ModulePlaceholder } from '../../pages/ModulePlaceholder';
import { MODULE_REGISTRY } from '../../config/modules';
import { isModuleAuthorized } from '../../auth/moduleAuth';
import { useAuthStore } from '../../auth/authStore';
import { useAppStore } from '../../stores/appStore';
import { useLocation, useNavigate } from 'react-router-dom';
import { SECURITY_NAVIGATION } from '../../industries/security/navigation';
import { MOBILE_NAVIGATION } from '../../industries/mobile/navigation';

// Route-level code splitting so initial login/desktop loads only the lightweight shell
const InventoryModule = React.lazy(() => import('../../modules/inventory/InventoryModule').then(m => ({ default: m.InventoryModule })));
const POSModule = React.lazy(() => import('../../modules/pos').then(m => ({ default: m.POSModule })));
const CRMModule = React.lazy(() => import('../../modules/crm/CRMModule').then(m => ({ default: m.CRMModule })));
const SecurityOperationsModule = React.lazy(() => import('../../modules/security-operations/SecurityOperationsModule').then(m => ({ default: m.SecurityOperationsModule })));
const PlatformModule = React.lazy(() => import('../../modules/platform/PlatformModule').then(m => ({ default: m.PlatformModule })));
const HRModule = React.lazy(() => import('../../modules/hr').then(m => ({ default: m.HRModule })));
const FinanceModule = React.lazy(() => import('../../modules/finance/FinanceModule'));
const PurchasingModule = React.lazy(() => import('../../modules/purchasing/PurchasingModule').then(m => ({ default: m.PurchasingModule })));
const MobileHRModule = React.lazy(() => import('../../industries/mobile/hrm/MobileHRModule').then(m => ({ default: m.MobileHRModule })));
const SecurityCRMModule = React.lazy(() => import('../../industries/security/crm/SecurityCRMModule').then(m => ({ default: m.SecurityCRMModule })));
const SecurityPurchasingModule = React.lazy(() => import('../../industries/security/purchasing/SecurityPurchasingModule').then(m => ({ default: m.SecurityPurchasingModule })));
const SecurityFinanceModule = React.lazy(() => import('../../industries/security/finance/SecurityFinanceModule').then(m => ({ default: m.SecurityFinanceModule })));
const SecurityReportsWorkspace = React.lazy(() => import('../../modules/security-operations/components/SecurityReportsWorkspace').then(m => ({ default: m.SecurityReportsWorkspace })));
const SecurityInventoryWorkspace = React.lazy(() => import('../../modules/security-operations/components/SecurityInventoryWorkspace').then(m => ({ default: m.SecurityInventoryWorkspace })));
const MonthlyMusterSheetTab = React.lazy(() => import('../../modules/security-operations/components/MonthlyMusterSheetTab').then(m => ({ default: m.MonthlyMusterSheetTab })));
const OperationsAttendanceLedgerView = React.lazy(() => import('../../modules/security-operations/components/AttendanceRegisterView').then(m => ({ default: m.AttendanceRegisterView })));
const MasterAttendanceRegistryView = React.lazy(() => import('../../modules/hr/components/AttendanceRegisterView').then(m => ({ default: m.AttendanceRegisterView })));
const FastCostingGridTab = React.lazy(() => import('../../industries/security/crm/components/FastCostingGridTab').then(m => ({ default: m.FastCostingGridTab })));
const SettingsWorkspace = React.lazy(() => import('../desktop/SettingsWorkspace').then(m => ({ default: m.SettingsWorkspace })));

const TabLoadingFallback = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '32px', color: '#64748b', fontSize: '0.9rem', fontWeight: 500 }}>
        Loading workspace...
    </div>
);


export const WorkspaceManager: React.FC = () => {
    const { tabs, activeTabId, openTab, activateTab, closeTab } = useWorkspaceStore();
    const { user } = useAuthStore();
    const { enabledModules, fetchModuleState, industry, company } = useAppStore();
    const location = useLocation();
    const navigate = useNavigate();
    const mounted = useRef(false);

    // Authoritative industry context: active company business_type takes precedence
    const isSecurityIndustry = company?.business_type 
        ? company.business_type.toLowerCase() === 'security'
        : (industry?.code === 'security' || user?.business_type === 'security');

    const isMobileIndustry = company?.business_type 
        ? company.business_type.toLowerCase() === 'mobile'
        : (industry?.code === 'mobile' || user?.business_type === 'mobile');

    useEffect(() => {
        fetchModuleState();
    }, [fetchModuleState]);

    useEffect(() => {
        useWorkspaceStore.getState().pruneStaleIndustryTabs(isSecurityIndustry);
    }, [isSecurityIndustry, company?.id]);

    // Synchronize URL with active tab
    useEffect(() => {
        if (!mounted.current) {
            mounted.current = true;
            return;
        }

        if (location.pathname === '/') {
            // Desktop
            activateTab('');
            return;
        }

        // Try to find module for this route — check industry-specific registries
        const securityModule = SECURITY_NAVIGATION.find(m => m.route === location.pathname);
        const mobileModule = MOBILE_NAVIGATION.find(m => m.route === location.pathname);
        const universalModule = MODULE_REGISTRY.find(m => m.route === location.pathname);
        const module = isSecurityIndustry 
            ? (securityModule ?? universalModule) 
            : isMobileIndustry 
            ? (mobileModule ?? universalModule) 
            : universalModule;

        if (module) {
            if (isModuleAuthorized(module, user, enabledModules)) {
                openTab(module);
            } else {
                // Unauthorized
                navigate('/');
            }
        } else {
            // Fallback to desktop if route unknown
            navigate('/');
        }
    }, [location.pathname, openTab, activateTab, navigate, user, enabledModules, industry, isSecurityIndustry, isMobileIndustry]);

    // Render logic
    const isDesktop = location.pathname === '/' || !activeTabId;

    return (
        <div className="workspace-container" style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
            <DesktopHeader />
            <WorkspaceTabBar />
            
            <div className="workspace-content" style={{ flex: 1, position: 'relative', minHeight: 0 }}>
                {/* Desktop Layer */}
                <div style={{ display: isDesktop ? 'block' : 'none', height: '100%' }}>
                    {/* We only render Desktop Launcher here without its own header */}
                    <Desktop hideHeader={true} />
                </div>

                {/* Tab Layers */}
                {tabs.map(tab => (
                    <div 
                        key={tab.id} 
                        style={{ 
                            display: activeTabId === tab.id ? 'block' : 'none',
                            height: '100%',
                            width: '100%',
                            overflowY: 'auto'
                        }}
                    >
                    <Suspense fallback={TabLoadingFallback}>
                        {tab.moduleCode === 'inventory' || tab.moduleCode === 'store_equipment' ? (
                            isSecurityIndustry ? <SecurityInventoryWorkspace /> : <InventoryModule />
                        ) : tab.moduleCode === 'pos' ? (
                            <POSModule />
                        ) : tab.moduleCode === 'crm' || tab.moduleCode === 'clients_contracts' ? (
                            isSecurityIndustry ? <SecurityCRMModule /> : <CRMModule />
                        ) : tab.moduleCode === 'security_ops' || tab.moduleCode === 'operations' ? (
                            <SecurityOperationsModule />
                        ) : tab.moduleCode === 'monthly_muster' ? (
                            <MonthlyMusterSheetTab onBack={() => {
                                closeTab(tab.id);
                                activateTab('operations');
                            }} />
                        ) : tab.moduleCode === 'attendance_register' ? (
                            <OperationsAttendanceLedgerView onBack={() => {
                                closeTab(tab.id);
                                activateTab('operations');
                            }} />
                        ) : tab.moduleCode === 'attendance_registry' ? (
                            <MasterAttendanceRegistryView
                                isStandalone
                                onBack={() => {
                                    closeTab(tab.id);
                                    activateTab('operations');
                                }}
                            />
                        ) : tab.moduleCode === 'fast_costing' ? (
                            <div style={{ height: '100%', padding: '16px 20px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
                                <FastCostingGridTab onBack={() => {
                                    closeTab(tab.id);
                                    activateTab(isSecurityIndustry ? 'clients_contracts' : 'crm');
                                }} />
                            </div>
                        ) : tab.moduleCode === 'platform' ? (
                            <PlatformModule />
                        ) : tab.moduleCode === 'hr' || tab.moduleCode === 'guards_staff' || tab.moduleCode === 'technicians_staff' ? (
                            isMobileIndustry ? <MobileHRModule /> : <HRModule isSecurity={isSecurityIndustry} />
                        ) : tab.moduleCode === 'finance' || tab.moduleCode === 'security_finance' ? (
                            isSecurityIndustry ? <SecurityFinanceModule /> : <FinanceModule />
                        ) : tab.moduleCode === 'purchasing' || tab.moduleCode === 'vendors_purchasing' ? (
                            isSecurityIndustry ? <SecurityPurchasingModule /> : <PurchasingModule />
                        ) : tab.moduleCode === 'reports' ? (
                            isSecurityIndustry ? <SecurityReportsWorkspace /> : <ModulePlaceholder title={tab.title} />
                        ) : tab.moduleCode === 'settings' ? (
                            <SettingsWorkspace />
                        ) : (
                            <ModulePlaceholder title={tab.title} />
                        )}
                    </Suspense>

                    </div>
                ))}
            </div>
        </div>
    );
};
