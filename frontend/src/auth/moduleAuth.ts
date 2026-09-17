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

    const engineToCheck = module.engine || module.code;

    // 1. Core platform/settings apps rely strictly on explicit role boundaries
    if (['platform', 'settings'].includes(engineToCheck)) {
        return userLevel >= minLevel;
    }

    // 2. Technician legacy logic
    if (isTechnician) {
        if (['pos', 'sales', 'finance'].includes(module.code)) return false;
    }

    // 3. Backend Module State - if the backend explicitly granted it via Custom Access or Full Company, allow it!
    if (enabledModules[engineToCheck]) {
        return true;
    }

    // 4. Default open for basic core apps like dashboard/reports, subject to legacy minRole
    if (['dashboard', 'reports', 'core'].includes(engineToCheck)) {
        return userLevel >= minLevel;
    }
    
    return false;
}
