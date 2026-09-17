import React, { useEffect, useMemo } from 'react';
import { useAppStore } from '../../stores/appStore';
import { useAuthStore } from '../../auth/authStore';
import { MODULE_REGISTRY } from '../../config/modules';
import { isModuleAuthorized } from '../../auth/moduleAuth';
import { AppIcon } from './AppIcon';

import { SECURITY_NAVIGATION } from '../../industries/security/navigation';

export const AppLauncher: React.FC = () => {
    const { enabledModules, fetchModuleState, loadingModules, industry } = useAppStore();
    const { user } = useAuthStore();

    useEffect(() => {
        fetchModuleState();
    }, [fetchModuleState]);

    const isSecurityIndustry = industry?.code === 'security' || user?.business_type === 'security';

    const visibleModules = useMemo(() => {
        const registryToUse = isSecurityIndustry ? SECURITY_NAVIGATION : MODULE_REGISTRY;
        return registryToUse.filter(mod => isModuleAuthorized(mod, user, enabledModules));
    }, [user, enabledModules, isSecurityIndustry]);

    if (loadingModules) {
        return (
            <div style={{ color: 'var(--color-text-muted)', minHeight: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <i className="bx bx-loader-alt bx-spin" style={{ marginRight: '8px', fontSize: '18px' }}></i>
                Loading Applications...
            </div>
        );
    }

    return (
        <div className="app-grid">
            {visibleModules.map(mod => (
                <AppIcon key={mod.code} module={mod} />
            ))}
        </div>
    );
};
