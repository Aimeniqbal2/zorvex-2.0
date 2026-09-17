import React from 'react';

export const PageContainer: React.FC<{ children: React.ReactNode, className?: string }> = ({ children, className = '' }) => (
    <div className={`page-container ${className}`} style={{ padding: 'var(--spacing-5)', height: '100%', overflowY: 'auto' }}>
        {children}
    </div>
);

export const PageHeader: React.FC<{ title: string, subtitle?: string, actions?: React.ReactNode, onBack?: () => void }> = ({ title, subtitle, actions, onBack }) => (
    <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--spacing-5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {onBack && (
                <button 
                    onClick={onBack} 
                    style={{ 
                        background: 'var(--color-surface)', 
                        border: '1px solid var(--color-border)', 
                        borderRadius: '6px', 
                        padding: '6px 10px', 
                        cursor: 'pointer', 
                        display: 'flex', 
                        alignItems: 'center', 
                        color: 'var(--color-text)' 
                    }}
                    title="Go Back"
                >
                    <i className='bx bx-arrow-back' style={{ fontSize: '18px' }}></i>
                </button>
            )}
            <div>
                <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 600, color: 'var(--color-text)' }}>{title}</h1>
                {subtitle && <p style={{ margin: 'var(--spacing-1) 0 0', color: 'var(--color-text-muted)', fontSize: '14px' }}>{subtitle}</p>}
            </div>
        </div>
        {actions && <div style={{ display: 'flex', gap: 'var(--spacing-2)' }}>{actions}</div>}
    </div>
);

export const Toolbar: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="toolbar" style={{ display: 'flex', gap: 'var(--spacing-3)', marginBottom: 'var(--spacing-4)', alignItems: 'center', flexWrap: 'wrap' }}>
        {children}
    </div>
);
