import React from 'react';

export interface CardProps {
    title?: React.ReactNode;
    children: React.ReactNode;
    footer?: React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
}

export const Card: React.FC<CardProps> = ({ title, children, footer, className = '', style }) => {
    return (
        <div className={`card ${className}`} style={style}>
            {title && <div className="card-header">{title}</div>}
            <div className="card-content">
                {children}
            </div>
            {footer && <div className="card-footer">{footer}</div>}
        </div>
    );
};
