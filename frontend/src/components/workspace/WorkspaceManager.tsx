import React, { useEffect } from 'react';
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

export const WorkspaceManager: React.FC = () => {
    const { tabs, activeTabId, openTab, activateTab } = useWorkspaceStore();
    const { user } = useAuthStore();
    const { enabledModules } = useAppStore();
    const location = useLocation();
    const navigate = useNavigate();

    // Synchronize URL with active tab
    useEffect(() => {
        if (location.pathname === '/') {
            // Desktop
            activateTab('');
            return;
        }

        // Try to find module for this route
        const module = MODULE_REGISTRY.find(m => m.route === location.pathname);
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
    }, [location.pathname, openTab, activateTab, navigate, user, enabledModules]);

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
                            width: '100%'
                        }}
                    >
                        {tab.moduleCode === 'inventory' ? (
                            <InventoryModule />
                        ) : tab.moduleCode === 'pos' ? (
                            <POSModule />
                        ) : tab.moduleCode === 'crm' ? (
                            <CRMModule />
                        ) : tab.moduleCode === 'security_ops' ? (
                            <SecurityOperationsModule />
                        ) : tab.moduleCode === 'platform' ? (
                            <PlatformModule />
                        ) : tab.moduleCode === 'hr' ? (
                            <HRModule />
                        ) : tab.moduleCode === 'finance' ? (
                            <FinanceModule />
                        ) : tab.moduleCode === 'purchasing' ? (
                            <PurchasingModule />
                        ) : (
                            <ModulePlaceholder title={tab.title} />
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};
