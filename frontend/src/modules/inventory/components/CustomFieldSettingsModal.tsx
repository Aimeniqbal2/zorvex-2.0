import React, { useState, useEffect, useCallback } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { DataTable } from '../../../components/tables/DataTable';
import type { Column } from '../../../components/tables/DataTable';
import { getItemFieldDefinitions, deleteItemFieldDefinition } from '../api';
import type { ItemFieldDefinition } from '../types';
import { useToastStore } from '../../../stores/toastStore';
import { CustomFieldFormModal } from './CustomFieldFormModal';

interface CustomFieldSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const CustomFieldSettingsModal: React.FC<CustomFieldSettingsModalProps> = ({ isOpen, onClose }) => {
    const [fields, setFields] = useState<ItemFieldDefinition[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [fieldToEdit, setFieldToEdit] = useState<ItemFieldDefinition | null>(null);
    const { success, error } = useToastStore();

    const fetchFields = useCallback(async () => {
        setIsLoading(true);
        try {
            // pass params: {} to avoid default active: 'true' filter so we can see inactive fields too
            const data = await getItemFieldDefinitions(undefined, {});
            setFields(data);
        } catch (err) {
            error('Failed to load custom fields');
        } finally {
            setIsLoading(false);
        }
    }, [error]);

    useEffect(() => {
        if (isOpen) {
            fetchFields();
        }
    }, [isOpen, fetchFields]);

    const handleAdd = () => {
        setFieldToEdit(null);
        setIsFormOpen(true);
    };

    const handleEdit = (field: ItemFieldDefinition) => {
        setFieldToEdit(field);
        setIsFormOpen(true);
    };

    const handleDelete = async (field: ItemFieldDefinition) => {
        if (!confirm('Are you sure you want to deactivate/delete this field? Historical data is kept, but it will not appear for new items.')) return;
        try {
            await deleteItemFieldDefinition(field.id);
            success('Field removed successfully');
            fetchFields();
        } catch (err) {
            error('Failed to remove field');
        }
    };

    const columns: Column<ItemFieldDefinition>[] = [
        { key: 'name', header: 'Field Label', render: (row) => <strong>{row.name}</strong> },
        { key: 'key', header: 'Internal Name', render: (row) => <code>{row.key}</code> },
        { key: 'field_type', header: 'Type' },
        { key: 'category', header: 'Applies To', render: (row) => row.category ? 'Specific Category' : 'Global' },
        { key: 'required', header: 'Required', render: (row) => row.required ? 'Yes' : 'No' },
        { key: 'active', header: 'Status', render: (row) => row.active ? <Badge variant="success">Active</Badge> : <Badge variant="danger">Inactive</Badge> },
        { key: 'sort_order', header: 'Order' },
        {
            key: 'actions',
            header: '',
            render: (row) => (
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <Button variant="ghost" icon="bx-edit" onClick={() => handleEdit(row)} />
                    <Button variant="ghost" icon="bx-trash" onClick={() => handleDelete(row)} style={{ color: 'var(--color-danger)' }} />
                </div>
            )
        }
    ];

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Custom Fields Management"
            footer={
                <Button variant="ghost" onClick={onClose}>Close</Button>
            }
        >
            <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'flex-end' }}>
                <Button variant="primary" icon="bx-plus" onClick={handleAdd}>
                    Add Field
                </Button>
            </div>
            
            <DataTable<ItemFieldDefinition>
                data={fields}
                columns={columns}
                isLoading={isLoading}
                keyExtractor={(row) => row.id}
                emptyMessage="No custom fields configured."
            />

            <CustomFieldFormModal
                isOpen={isFormOpen}
                onClose={() => setIsFormOpen(false)}
                onSuccess={fetchFields}
                field={fieldToEdit}
            />
        </Modal>
    );
};
