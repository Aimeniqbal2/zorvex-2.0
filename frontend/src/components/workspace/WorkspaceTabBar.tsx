import React from 'react';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useNavigate } from 'react-router-dom';
import { WorkspaceTabItem } from './WorkspaceTabItem';

export const WorkspaceTabBar: React.FC = () => {
    const { tabs, activeTabId } = useWorkspaceStore();
    const navigate = useNavigate();

    if (tabs.length === 0) return null;

    return (
        <div className="workspace-tab-bar">
            <button className="desktop-home-btn" onClick={() => navigate('/')} title="Go to Desktop">
                <i className='bx bxs-dashboard'></i>
            </button>
            <div className="tabs-container">
                {tabs.map(tab => (
                    <WorkspaceTabItem key={tab.id} tab={tab} isActive={tab.id === activeTabId} />
                ))}
            </div>
        </div>
    );
};
