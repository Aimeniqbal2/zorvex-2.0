import React from 'react';
import { useNavigate } from 'react-router-dom';
import type { ERPModule } from '../../config/modules';

interface AppIconProps {
    module: ERPModule;
}

export const AppIcon: React.FC<AppIconProps> = ({ module }) => {
    const navigate = useNavigate();

    const handleClick = () => {
        navigate(module.route);
    };

    return (
        <div className="app-icon-wrapper" onClick={handleClick} title={module.name}>
            <div className="app-icon-box">
                <i className={`bx ${module.icon}`}></i>
            </div>
            <span className="app-icon-label">{module.name}</span>
        </div>
    );
};
