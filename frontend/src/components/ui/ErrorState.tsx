import React from 'react';

export interface ErrorStateProps {
    title?: string;
    message: string;
    onRetry?: () => void;
}

export const ErrorState: React.FC<ErrorStateProps> = ({ 
    title = 'Something went wrong', 
    message, 
    onRetry 
}) => {
    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 'var(--spacing-8)',
            textAlign: 'center',
            color: 'var(--color-danger)'
        }}>
            <i className='bx bx-error-circle' style={{ fontSize: '48px', marginBottom: 'var(--spacing-4)', opacity: 0.8 }}></i>
            <h3 style={{ margin: '0 0 var(--spacing-2)', fontSize: '18px' }}>{title}</h3>
            <p style={{ margin: '0 0 var(--spacing-4)', maxWidth: '400px', color: 'var(--color-text-muted)' }}>{message}</p>
            {onRetry && (
                <button 
                    onClick={onRetry}
                    className="btn btn-secondary"
                >
                    <i className='bx bx-refresh'></i> Try Again
                </button>
            )}
        </div>
    );
};
