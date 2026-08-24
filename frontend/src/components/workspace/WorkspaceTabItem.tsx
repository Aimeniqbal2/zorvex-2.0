import React, { useState } from 'react';
import type { WorkspaceTab } from '../../stores/workspaceStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useNavigate } from 'react-router-dom';

interface Props {
    tab: WorkspaceTab;
    isActive: boolean;
}

export const WorkspaceTabItem: React.FC<Props> = ({ tab, isActive }) => {
    const { closeTab, activateTab, closeOtherTabs, closeAllTabs } = useWorkspaceStore();
    const navigate = useNavigate();
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number } | null>(null);

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY });
    };

    const closeContextMenu = () => {
        setContextMenu(null);
    };

    const handleActivate = () => {
        if (!isActive) {
            activateTab(tab.id);
            navigate(tab.path);
        }
    };

    const handleClose = (e: React.MouseEvent) => {
        e.stopPropagation();
        closeTab(tab.id);
        // Navigation logic is handled in a centralized useEffect in the WorkspaceManager
    };

    return (
        <>
            <div 
                className={`workspace-tab ${isActive ? 'active' : ''}`}
                onClick={handleActivate}
                onContextMenu={handleContextMenu}
                title={tab.title}
            >
                <i className={`bx ${tab.icon} tab-icon`}></i>
                <span className="tab-title">{tab.title}</span>
                <button className="tab-close-btn" onClick={handleClose} title="Close Tab">
                    <i className='bx bx-x'></i>
                </button>
            </div>

            {contextMenu && (
                <>
                    <div className="context-menu-overlay" onClick={closeContextMenu}></div>
                    <div className="context-menu" style={{ top: contextMenu.y, left: contextMenu.x }}>
                        <button onClick={() => { closeTab(tab.id); closeContextMenu(); }}>Close</button>
                        <button onClick={() => { closeOtherTabs(tab.id); activateTab(tab.id); navigate(tab.path); closeContextMenu(); }}>Close Others</button>
                        <button onClick={() => { closeAllTabs(); navigate('/'); closeContextMenu(); }}>Close All</button>
                    </div>
                </>
            )}
        </>
    );
};
