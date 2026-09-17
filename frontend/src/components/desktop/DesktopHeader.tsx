import React, { useState } from 'react';
import { useAppStore } from '../../stores/appStore';
import { useAuthStore } from '../../auth/authStore';
import { SettingsModal } from './SettingsModal';

export const DesktopHeader: React.FC = () => {
    const { theme, toggleTheme } = useAppStore();
    const { user, clearAuth } = useAuthStore();
    const [menuOpen, setMenuOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [settingsTab, setSettingsTab] = useState<'profile'|'company'|'settings'>('profile');

    const handleLogout = () => {
        clearAuth();
        window.location.href = '/app/login';
    };

    const roleDisplay = user?.role ? user.role.replace(/_/g, ' ') : 'Staff';

    return (
        <header className="desktop-header">
            <div className="header-left">
                <div className="brand-logo">
                    <img 
                        src="/app/assets/zorvex-logo.png"
                        alt="ZORVEX Logo" 
                        className="desktop-logo" 
                    />
                </div>
                <div className="header-search">
                    <i className='bx bx-search'></i>
                    <input type="text" placeholder="Search..." />
                </div>
            </div>
            
            <div className="header-right">
                <button className="header-action-btn" title="Toggle Theme" onClick={toggleTheme}>
                    <i className={`bx ${theme === 'light' ? 'bx-moon' : 'bx-sun'}`}></i>
                </button>
                <button className="header-action-btn" title="Notifications">
                    <i className='bx bx-bell'></i>
                    <span className="notification-badge"></span>
                </button>
                
                <div style={{ position: 'relative' }}>
                    <button className="user-menu-btn" onClick={() => setMenuOpen(!menuOpen)}>
                        <img 
                            src={`https://ui-avatars.com/api/?name=${encodeURIComponent(user?.username || 'User')}&background=4318ff&color=fff&rounded=true&size=32`} 
                            alt="Avatar" 
                            className="user-avatar" 
                        />
                        <div className="user-info">
                            <span className="user-name">{user?.username || 'User'}</span>
                            <span className="user-role">{roleDisplay}</span>
                        </div>
                    </button>
                    
                    <div className={`user-menu-dropdown ${menuOpen ? 'active' : ''}`}>
                        <button className="dropdown-item" onClick={() => { setSettingsTab('profile'); setSettingsOpen(true); setMenuOpen(false); }}>
                            <i className='bx bx-user'></i> Profile
                        </button>
                        <button className="dropdown-item" onClick={() => { setSettingsTab('company'); setSettingsOpen(true); setMenuOpen(false); }}>
                            <i className='bx bx-buildings'></i> {user?.company_id ? `Company ${user.company_id}` : 'My Company'}
                        </button>
                        <button className="dropdown-item" onClick={() => { setSettingsTab('settings'); setSettingsOpen(true); setMenuOpen(false); }}>
                            <i className='bx bx-cog'></i> Settings
                        </button>
                        <div className="dropdown-divider"></div>
                        <button className="dropdown-item text-danger" onClick={handleLogout}>
                            <i className='bx bx-log-out'></i> Logout
                        </button>
                    </div>
                </div>
            </div>
            
            <SettingsModal 
                isOpen={settingsOpen} 
                onClose={() => setSettingsOpen(false)} 
                initialTab={settingsTab} 
            />
        </header>
    );
};
