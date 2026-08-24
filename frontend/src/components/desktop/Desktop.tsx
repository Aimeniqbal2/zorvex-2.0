import React from 'react';
import { DesktopHeader } from './DesktopHeader';
import { AppLauncher } from './AppLauncher';

interface Props {
    hideHeader?: boolean;
}

export const Desktop: React.FC<Props> = ({ hideHeader = false }) => {
    return (
        <div className="desktop-container" style={hideHeader ? { background: 'transparent' } : {}}>
            {!hideHeader && <DesktopHeader />}
            <div className="desktop-content">
                <AppLauncher />
            </div>
        </div>
    );
};
