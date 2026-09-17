import React from 'react';
import { DesktopHeader } from './DesktopHeader';
import { DesktopDashboard } from './DesktopDashboard';
import './DesktopDashboard.css';

interface Props {
    hideHeader?: boolean;
}

export const Desktop: React.FC<Props> = ({ hideHeader = false }) => {
    return (
        <div className="desktop-container" style={{ height: '100%', ...(hideHeader ? { background: 'transparent' } : {}) }}>
            {!hideHeader && <DesktopHeader />}
            <div className="desktop-content" style={{ height: '100%', minHeight: 0, flex: 1, overflow: 'hidden' }}>
                <DesktopDashboard />
            </div>
        </div>
    );
};
