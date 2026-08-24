import React from 'react';

export const LoadingState: React.FC<{ message?: string }> = ({ message = 'Loading...' }) => {
    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 'var(--spacing-8)',
            color: 'var(--color-text-muted)'
        }}>
            <i className='bx bx-loader-alt bx-spin' style={{ fontSize: '32px', color: 'var(--color-primary)', marginBottom: 'var(--spacing-3)' }}></i>
            <span>{message}</span>
        </div>
    );
};
