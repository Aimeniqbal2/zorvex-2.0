import React, { useEffect, useMemo } from 'react';
import { useAppStore } from '../../stores/appStore';
import { useAuthStore } from '../../auth/authStore';
import { MODULE_REGISTRY } from '../../config/modules';
import { isModuleAuthorized } from '../../auth/moduleAuth';
import { AppIcon } from './AppIcon';

export const AppLauncher: React.FC = () => {
    const { enabledModules, fetchModuleState, loadingModules } = useAppStore();
    const { user } = useAuthStore();

    useEffect(() => {
        fetchModuleState();
    }, [fetchModuleState]);

    const visibleModules = useMemo(() => {
        return MODULE_REGISTRY.filter(mod => isModuleAuthorized(mod, user, enabledModules));
    }, [user, enabledModules]);

    if (loadingModules) {
        return <div style={{ color: 'var(--color-text-muted)' }}>Loading Applications...</div>;
    }

    return (
        <div className="app-grid">
            {visibleModules.map(mod => (
                <AppIcon key={mod.code} module={mod} />
            ))}
        </div>
    );
};
