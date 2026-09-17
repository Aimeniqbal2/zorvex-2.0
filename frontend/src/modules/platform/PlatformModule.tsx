import React, { useState } from 'react';
import { CompanyProvisioningWizard } from './components/CompanyProvisioningWizard';
import { UserManagement } from './components/UserManagement';

export const PlatformModule: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'companies' | 'users'>('users');

    return (
        <div style={{ padding: '24px', maxWidth: '1000px', margin: '0 auto', height: '100%', overflowY: 'auto' }}>
            <h2 style={{ marginBottom: '24px' }}>Platform Administration</h2>
            
            <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', borderBottom: '1px solid var(--color-border)' }}>
                <button 
                    style={{ padding: '8px 16px', border: 'none', background: 'transparent', borderBottom: activeTab === 'companies' ? '2px solid var(--color-primary)' : '2px solid transparent', cursor: 'pointer', fontWeight: activeTab === 'companies' ? 'bold' : 'normal' }}
                    onClick={() => setActiveTab('companies')}
                >
                    Companies
                </button>
                <button 
                    style={{ padding: '8px 16px', border: 'none', background: 'transparent', borderBottom: activeTab === 'users' ? '2px solid var(--color-primary)' : '2px solid transparent', cursor: 'pointer', fontWeight: activeTab === 'users' ? 'bold' : 'normal' }}
                    onClick={() => setActiveTab('users')}
                >
                    Users
                </button>
            </div>

            {activeTab === 'companies' && <CompanyProvisioningWizard />}
            {activeTab === 'users' && <UserManagement />}
        </div>
    );
};
