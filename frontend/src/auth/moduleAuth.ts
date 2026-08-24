import type { ERPModule } from '../config/modules';
import { ROLE_LEVELS } from '../config/modules';
import type { AuthUser } from './authTypes';

export function isModuleAuthorized(
    module: ERPModule, 
    user: AuthUser | null, 
    enabledModules: Record<string, boolean>
): boolean {
    if (!user) return false;

    const userRole = user.role || 'staff';
    const isTechnician = ['hardware_technician', 'software_technician'].includes(userRole);
    const userLevel = ROLE_LEVELS[userRole] || 0;
    const minLevel = ROLE_LEVELS[module.minRole] || 0;

    // 1. Check Role Level
    if (userLevel < minLevel) return false;

    // 2. Technician special logic (like legacy)
    if (isTechnician) {
        if (['pos', 'sales', 'finance'].includes(module.code)) return false;
    }

    // 3. Backend Module State
    if (module.code !== 'dashboard' && module.code !== 'settings' && module.code !== 'hr') {
        if (enabledModules && !enabledModules[module.code]) return false;
    }

    return true;
}
