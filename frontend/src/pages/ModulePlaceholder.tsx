import React from 'react';

interface Props {
    title: string;
}

export const ModulePlaceholder: React.FC<Props> = ({ title }) => {
    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text)', backgroundColor: 'var(--color-background)', height: '100%' }}>
            <i className='bx bx-time' style={{ fontSize: '48px', color: 'var(--color-primary)', marginBottom: '16px' }}></i>
            <h1 style={{ marginBottom: '8px', fontSize: '24px' }}>ZORVEX {title}</h1>
            <p style={{ color: 'var(--color-text-muted)' }}>This module is being migrated to the new ZORVEX workspace.</p>
        </div>
    );
};
