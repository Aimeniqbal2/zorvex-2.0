import React from 'react';
import { SessionGuard } from './components/SessionGuard';
import { POSWorkspace } from './components/POSWorkspace';
import './styles/pos.css'; // Minimal extra POS-specific styles if any

export const POSModule: React.FC = () => {
    return (
        <SessionGuard>
            <POSWorkspace />
        </SessionGuard>
    );
};
