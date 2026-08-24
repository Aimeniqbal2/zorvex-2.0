import React, { useState } from 'react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { DataTable } from '../components/tables/DataTable';
import { useToastStore } from '../stores/toastStore';
import { DesktopHeader } from '../components/desktop/DesktopHeader';

interface DemoData {
    id: string;
    name: string;
    status: string;
    price: number;
}

export const UIShowcase: React.FC = () => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const { success, error, warning, info } = useToastStore();

    const columns = [
        { key: 'id', header: 'ID' },
        { key: 'name', header: 'Name' },
        { 
            key: 'status', 
            header: 'Status',
            render: (row: DemoData) => (
                <Badge variant={row.status === 'Active' ? 'success' : 'default'}>
                    {row.status}
                </Badge>
            )
        },
        { 
            key: 'price', 
            header: 'Price',
            render: (row: DemoData) => `$${row.price.toFixed(2)}`
        }
    ];

    const data: DemoData[] = [
        { id: '1', name: 'Product A', status: 'Active', price: 99.99 },
        { id: '2', name: 'Product B', status: 'Draft', price: 149.00 },
        { id: '3', name: 'Product C', status: 'Active', price: 29.50 },
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: 'var(--color-background)', overflowY: 'auto' }}>
            <DesktopHeader />
            <div style={{ padding: 'var(--spacing-6)', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
                <h1 style={{ color: 'var(--color-text)', marginBottom: 'var(--spacing-6)' }}>ZORVEX UI Showcase</h1>
                
                <section style={{ marginBottom: 'var(--spacing-8)' }}>
                    <h2 style={{ color: 'var(--color-text)', marginBottom: 'var(--spacing-4)' }}>Buttons</h2>
                    <div style={{ display: 'flex', gap: 'var(--spacing-3)', flexWrap: 'wrap' }}>
                        <Button variant="primary">Primary</Button>
                        <Button variant="secondary">Secondary</Button>
                        <Button variant="danger">Danger</Button>
                        <Button variant="ghost">Ghost</Button>
                        <Button variant="primary" icon="bx-save">With Icon</Button>
                        <Button variant="primary" loading>Loading</Button>
                        <Button variant="primary" disabled>Disabled</Button>
                    </div>
                </section>

                <section style={{ marginBottom: 'var(--spacing-8)' }}>
                    <h2 style={{ color: 'var(--color-text)', marginBottom: 'var(--spacing-4)' }}>Inputs & Forms</h2>
                    <Card style={{ maxWidth: '400px' }}>
                        <Input label="Email Address" type="email" placeholder="john@example.com" required />
                        <Input label="Password" type="password" placeholder="••••••••" />
                        <Input label="Username" defaultValue="invalid_user!" error="Username contains invalid characters." />
                        <Input label="Disabled Field" disabled value="Cannot edit me" />
                    </Card>
                </section>

                <section style={{ marginBottom: 'var(--spacing-8)' }}>
                    <h2 style={{ color: 'var(--color-text)', marginBottom: 'var(--spacing-4)' }}>Badges</h2>
                    <div style={{ display: 'flex', gap: 'var(--spacing-3)' }}>
                        <Badge variant="default">Default</Badge>
                        <Badge variant="primary">Primary</Badge>
                        <Badge variant="success">Success</Badge>
                        <Badge variant="warning">Warning</Badge>
                        <Badge variant="danger">Danger</Badge>
                    </div>
                </section>

                <section style={{ marginBottom: 'var(--spacing-8)' }}>
                    <h2 style={{ color: 'var(--color-text)', marginBottom: 'var(--spacing-4)' }}>Toasts</h2>
                    <div style={{ display: 'flex', gap: 'var(--spacing-3)' }}>
                        <Button variant="secondary" onClick={() => success('Operation completed successfully!')}>Success Toast</Button>
                        <Button variant="secondary" onClick={() => error('Failed to save changes.')}>Error Toast</Button>
                        <Button variant="secondary" onClick={() => warning('Storage is almost full.')}>Warning Toast</Button>
                        <Button variant="secondary" onClick={() => info('New update available.')}>Info Toast</Button>
                    </div>
                </section>

                <section style={{ marginBottom: 'var(--spacing-8)' }}>
                    <h2 style={{ color: 'var(--color-text)', marginBottom: 'var(--spacing-4)' }}>Modals</h2>
                    <Button variant="primary" onClick={() => setIsModalOpen(true)}>Open Modal</Button>
                    <Modal 
                        isOpen={isModalOpen} 
                        onClose={() => setIsModalOpen(false)} 
                        title="Delete Confirmation"
                        footer={
                            <>
                                <Button variant="ghost" onClick={() => setIsModalOpen(false)}>Cancel</Button>
                                <Button variant="danger" onClick={() => setIsModalOpen(false)}>Delete</Button>
                            </>
                        }
                    >
                        <p style={{ color: 'var(--color-text)' }}>Are you sure you want to delete this item? This action cannot be undone.</p>
                    </Modal>
                </section>

                <section style={{ marginBottom: 'var(--spacing-8)' }}>
                    <h2 style={{ color: 'var(--color-text)', marginBottom: 'var(--spacing-4)' }}>Data Table</h2>
                    <DataTable 
                        columns={columns} 
                        data={data} 
                        keyExtractor={(row) => row.id} 
                    />
                </section>
            </div>
        </div>
    );
};
