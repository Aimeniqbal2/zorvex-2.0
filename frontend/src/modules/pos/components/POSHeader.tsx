import React, { useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { usePosStore } from '../store/usePosStore';
import { CloseSessionModal } from './CloseSessionModal';

export const POSHeader: React.FC = () => {
    const { activeSession } = usePosStore();
    const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);

    return (
        <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: 'var(--spacing-4)',
            backgroundColor: 'var(--color-surface)',
            borderBottom: '1px solid var(--color-border)',
            height: '64px',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-4)' }}>
                <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 600, color: 'var(--color-text)' }}>
                    POS
                </h1>
                {activeSession ? (
                    <Badge variant="success">Register Active</Badge>
                ) : (
                    <Badge variant="warning">Session Required</Badge>
                )}
            </div>

            {activeSession && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-6)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', fontSize: '12px' }}>
                        <span style={{ color: 'var(--color-text-muted)' }}>Session #{activeSession.id.slice(0, 8)}</span>
                        <span style={{ color: 'var(--color-text)', fontWeight: 500 }}>
                            Opened: PKR {parseFloat(activeSession.opening_cash).toLocaleString()}
                        </span>
                    </div>
                    <Button variant="secondary" onClick={() => setIsCloseModalOpen(true)}>
                        Close Session
                    </Button>
                </div>
            )}

            {activeSession && (
                <CloseSessionModal 
                    isOpen={isCloseModalOpen}
                    onClose={() => setIsCloseModalOpen(false)}
                    sessionId={activeSession.id}
                />
            )}
        </div>
    );
};
