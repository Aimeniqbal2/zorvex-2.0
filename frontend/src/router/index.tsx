import React from 'react';
import { createBrowserRouter, Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../auth/authStore';
import { AppLayout } from '../layouts/AppLayout';
import { WorkspaceManager } from '../components/workspace/WorkspaceManager';
import { UIShowcase } from '../pages/UIShowcase';
import { Login } from '../auth/Login';
import { ZorvexLoadingScreen } from '../components/ui/ZorvexLoadingScreen';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { isAuthenticated, loading } = useAuthStore();
    const location = useLocation();

    if (loading) {
        return <ZorvexLoadingScreen variant="dark" />;
    }

    if (!isAuthenticated) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    return <>{children}</>;
};

const PublicRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { isAuthenticated, loading } = useAuthStore();

    if (loading) {
        return <ZorvexLoadingScreen variant="dark" />;
    }

    if (isAuthenticated) {
        return <Navigate to="/" replace />;
    }

    return <>{children}</>;
};

export const router = createBrowserRouter([
    {
        path: '/login',
        element: (
            <PublicRoute>
                <Login />
            </PublicRoute>
        )
    },
    {
        path: '/',
        element: (
            <ProtectedRoute>
                <AppLayout />
            </ProtectedRoute>
        ),
        children: [
            {
                index: true,
                element: <WorkspaceManager />
            },
            {
                path: 'ui-showcase',
                element: <UIShowcase />
            },
            {
                path: '*',
                element: <WorkspaceManager />
            }
        ]
    }
], {
    basename: '/app'
});
