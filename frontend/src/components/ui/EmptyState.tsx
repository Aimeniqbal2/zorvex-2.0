import React from 'react';

export interface EmptyStateProps {
    title: string;
    description?: string;
    icon?: string;
    action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ 
    title, 
    description, 
    icon = 'bx-box', 
    action 
}) => {
    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 'var(--spacing-8)',
            textAlign: 'center',
            color: 'var(--color-text-muted)'
        }}>
            <i className={`bx ${icon}`} style={{ fontSize: '48px', marginBottom: 'var(--spacing-4)', opacity: 0.5 }}></i>
            <h3 style={{ margin: '0 0 var(--spacing-2)', color: 'var(--color-text)', fontSize: '18px' }}>{title}</h3>
            {description && <p style={{ margin: '0 0 var(--spacing-4)', maxWidth: '400px' }}>{description}</p>}
            {action && <div>{action}</div>}
        </div>
    );
};
