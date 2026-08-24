import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../auth/authStore';
import { apiClient } from '../api/client';

export const HomePage: React.FC = () => {
    const { user, clearAuth } = useAuthStore();
    const [status, setStatus] = useState<string>('Testing API connection...');

    useEffect(() => {
        const testApi = async () => {
            try {
                // Hitting a harmless endpoint to verify authentication header flow
                const response = await apiClient.get('/api/platform/module-state/');
                if (response.status === 200) {
                    setStatus('API Connection Successful. Modules Loaded.');
                }
            } catch (error: any) {
                setStatus(`API Connection Failed: ${error.message}`);
            }
        };
        
        testApi();
    }, []);

    const handleLogout = () => {
        clearAuth();
        window.location.href = '/login/';
    };

    return (
        <div style={{ padding: '40px', fontFamily: 'sans-serif' }}>
            <h1>ZORVEX</h1>
            <h2>Frontend Foundation</h2>
            <p>Authenticated successfully.</p>
            
            <div style={{ background: '#f5f5f5', padding: '20px', borderRadius: '8px', marginTop: '20px' }}>
                <h3>Session Details</h3>
                <p><strong>Username:</strong> {user?.username || 'Unknown'}</p>
                <p><strong>Role:</strong> {user?.role || 'Unknown'}</p>
                <p><strong>Status:</strong> {status}</p>
            </div>
            
            <button 
                onClick={handleLogout}
                style={{ marginTop: '20px', padding: '10px 20px', cursor: 'pointer' }}
            >
                Logout (Clear Tokens)
            </button>
        </div>
    );
};
