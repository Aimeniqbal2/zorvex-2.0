import React from 'react';
import { useAppStore } from '../../stores/appStore';
import './ZorvexLoadingScreen.css';

export interface ZorvexLoadingScreenProps {
    variant?: 'dark' | 'light' | 'auto';
    message?: string;
    fullScreen?: boolean;
    className?: string;
    style?: React.CSSProperties;
}

export const ZorvexLoadingScreen: React.FC<ZorvexLoadingScreenProps> = ({
    variant = 'auto',
    message,
    fullScreen = true,
    className = '',
    style
}) => {
    const { theme } = useAppStore();
    
    // Determine effective theme
    const resolvedVariant = variant === 'auto' ? (theme === 'light' ? 'light' : 'dark') : variant;

    return (
        <div 
            className={`zorvex-loading-screen ${resolvedVariant} ${fullScreen ? 'fullscreen' : 'contained'} ${className}`}
            style={style}
        >
            <div className="zorvex-logo-container">
                <div className="zorvex-logo-glow" />
                <img 
                    src="/app/assets/zorvex-logo.png" 
                    alt="Zorvex ERP" 
                    className="zorvex-logo-img"
                />
            </div>
            
            <div className="zorvex-spinner" />

            {message && (
                <div className="zorvex-loading-message">
                    {message}
                </div>
            )}
        </div>
    );
};
