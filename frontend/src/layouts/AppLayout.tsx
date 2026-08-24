import React from 'react';
import { Outlet } from 'react-router-dom';
import { ToastContainer } from '../components/ui/Toast';

export const AppLayout: React.FC = () => {
    return (
        <div className="app-layout">
            <ToastContainer />
            <main className="main-content">
                <Outlet />
            </main>
        </div>
    );
};
