import React from 'react';
import { EmployeeList } from '../../hr/components/EmployeeList';

export const EmployeeInfoView: React.FC = () => {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <EmployeeList 
                isSecurity={true} 
                isReadOnly={true}
                title="Workforce & Guard Information"
                subtitle="Operations Employee Directory • Read-only view for site deployments, credentials, and CNIC status"
            />
        </div>
    );
};
