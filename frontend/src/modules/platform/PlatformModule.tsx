import React from 'react';
import { CompanyProvisioningWizard } from './components/CompanyProvisioningWizard';

export const PlatformModule: React.FC = () => {
    return (
        <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto', height: '100%', overflowY: 'auto' }}>
            <h2 style={{ marginBottom: '24px' }}>Platform Administration</h2>
            <CompanyProvisioningWizard />
        </div>
    );
};
