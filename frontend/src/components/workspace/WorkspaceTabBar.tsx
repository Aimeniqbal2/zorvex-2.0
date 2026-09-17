import React, { useRef } from 'react';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useNavigate } from 'react-router-dom';
import { WorkspaceTabItem } from './WorkspaceTabItem';

export const WorkspaceTabBar: React.FC = () => {
    const { tabs, activeTabId } = useWorkspaceStore();
    const navigate = useNavigate();
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    if (tabs.length === 0) return null;

    const handleWheel = (e: React.WheelEvent) => {
        if (scrollContainerRef.current) {
            if (e.deltaY !== 0) {
                // Prevent default vertical scroll and apply it to horizontal scroll
                scrollContainerRef.current.scrollLeft += e.deltaY;
            }
        }
    };

    const scrollLeft = () => {
        if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollBy({ left: -200, behavior: 'smooth' });
        }
    };

    const scrollRight = () => {
        if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollBy({ left: 200, behavior: 'smooth' });
        }
    };

    return (
        <div className="workspace-tab-bar">
            <button className="desktop-home-btn" onClick={() => navigate('/')} title="Go to Desktop">
                <i className='bx bxs-dashboard'></i>
            </button>
            <button className="tab-scroll-btn" onClick={scrollLeft}>
                <i className='bx bx-chevron-left'></i>
            </button>
            <div 
                className="tabs-container" 
                ref={scrollContainerRef}
                onWheel={handleWheel}
            >
                {tabs.map(tab => (
                    <WorkspaceTabItem key={tab.id} tab={tab} isActive={tab.id === activeTabId} />
                ))}
            </div>
            <button className="tab-scroll-btn" onClick={scrollRight}>
                <i className='bx bx-chevron-right'></i>
            </button>
        </div>
    );
};
