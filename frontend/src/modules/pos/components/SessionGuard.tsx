import React, { useEffect, useState } from 'react';
import { usePosStore } from '../store/usePosStore';
import { getActiveSession } from '../api';
import { LoadingState } from '../../../components/ui/LoadingState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { OpenSessionModal } from './OpenSessionModal';
import { POSHeader } from './POSHeader';

interface SessionGuardProps {
    children: React.ReactNode;
}

export const SessionGuard: React.FC<SessionGuardProps> = ({ children }) => {
    const { activeSession, setSession } = usePosStore();
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isOpenModalOpen, setIsOpenModalOpen] = useState(false);

    const fetchSession = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const session = await getActiveSession();
            setSession(session);
        } catch (err: any) {
            console.error('Failed to fetch active session:', err);
            setError('Unable to load POS session. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        // Initial fetch on mount
        fetchSession();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (isLoading) {
        return (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <POSHeader />
                <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    <LoadingState message="Checking POS Session..." />
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <POSHeader />
                <div style={{ flex: 1, padding: 'var(--spacing-6)' }}>
                    <ErrorState 
                        title="Session Error" 
                        message={error}
                        onRetry={fetchSession}
                    />
                </div>
            </div>
        );
    }

    if (!activeSession) {
        return (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <POSHeader />
                <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 'var(--spacing-6)' }}>
                    <Card style={{ maxWidth: '400px', width: '100%', textAlign: 'center', padding: 'var(--spacing-8)' }}>
                        <div style={{ fontSize: '48px', marginBottom: 'var(--spacing-4)' }}>🏪</div>
                        <h2 style={{ margin: '0 0 var(--spacing-2)', color: 'var(--color-text)', fontSize: '20px' }}>
                            POS Session Required
                        </h2>
                        <p style={{ margin: '0 0 var(--spacing-6)', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
                            You don't have an active register session.<br/>
                            Opening a session is required before processing sales.
                        </p>
                        <Button variant="primary" style={{ width: '100%' }} onClick={() => setIsOpenModalOpen(true)}>
                            Open Session
                        </Button>
                    </Card>
                </div>
                <OpenSessionModal 
                    isOpen={isOpenModalOpen} 
                    onClose={() => setIsOpenModalOpen(false)} 
                    onSuccess={fetchSession} 
                />
            </div>
        );
    }

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--color-background)' }}>
            <POSHeader />
            <div style={{ flex: 1, overflow: 'hidden' }}>
                {children}
            </div>
        </div>
    );
};
