import React, { useEffect, useRef } from 'react';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { WorkspaceTabBar } from './WorkspaceTabBar';
import { DesktopHeader } from '../desktop/DesktopHeader';
import { Desktop } from '../desktop/Desktop';
import { ModulePlaceholder } from '../../pages/ModulePlaceholder';
import { InventoryModule } from '../../modules/inventory/InventoryModule';
import { POSModule } from '../../modules/pos';
import { CRMModule } from '../../modules/crm/CRMModule';
import { SecurityOperationsModule } from '../../modules/security-operations/SecurityOperationsModule';
import { PlatformModule } from '../../modules/platform/PlatformModule';
import { HRModule } from '../../modules/hr';
import FinanceModule from '../../modules/finance/FinanceModule';
import { PurchasingModule } from '../../modules/purchasing/PurchasingModule';
import { MODULE_REGISTRY } from '../../config/modules';
import { isModuleAuthorized } from '../../auth/moduleAuth';
import { useAuthStore } from '../../auth/authStore';
import { useAppStore } from '../../stores/appStore';
import { useLocation, useNavigate } from 'react-router-dom';
import { SECURITY_NAVIGATION } from '../../industries/security/navigation';
import { MOBILE_NAVIGATION } from '../../industries/mobile/navigation';
import { MobileHRModule } from '../../industries/mobile/hrm/MobileHRModule';
import { SecurityCRMModule } from '../../industries/security/crm/SecurityCRMModule';
import { SecurityPurchasingModule } from '../../industries/security/purchasing/SecurityPurchasingModule';
import { SecurityFinanceModule } from '../../industries/security/finance/SecurityFinanceModule';
import { SecurityReportsWorkspace } from '../../modules/security-operations/components/SecurityReportsWorkspace';
import { SecurityInventoryWorkspace } from '../../modules/security-operations/components/SecurityInventoryWorkspace';
import { MonthlyMusterSheetTab } from '../../modules/security-operations/components/MonthlyMusterSheetTab';
import { AttendanceRegisterView } from '../../modules/security-operations/components/AttendanceRegisterView';
import { SettingsWorkspace } from '../desktop/SettingsWorkspace';


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
                            <AttendanceRegisterView onBack={() => {
                                closeTab(tab.id);
                                activateTab('operations');
                            }} />
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

                    </div>
                ))}
            </div>
        </div>
    );
};
