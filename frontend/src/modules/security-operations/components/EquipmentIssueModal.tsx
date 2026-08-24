import React, { useState, useEffect } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { apiClient } from '../api';

interface EquipmentIssueModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: () => void;
}

export const EquipmentIssueModal: React.FC<EquipmentIssueModalProps> = ({ isOpen, onClose, onSave }) => {
    const [employees, setEmployees] = useState<any[]>([]);
    const [warehouses, setWarehouses] = useState<any[]>([]);
    const [items, setItems] = useState<any[]>([]);
    const [serials, setSerials] = useState<any[]>([]);
    
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    const [formData, setFormData] = useState({
        employee: '',
        warehouse: '',
        item: '',
        item_serial: '',
        quantity: 1,
        issue_condition: 'New',
        expected_return_date: ''
    });

    const [selectedItemTrackSerial, setSelectedItemTrackSerial] = useState(false);

    useEffect(() => {
        if (isOpen) {
            loadInitialData();
            setFormData({
                employee: '',
                warehouse: '',
                item: '',
                item_serial: '',
                quantity: 1,
                issue_condition: 'New',
                expected_return_date: ''
            });
            setError('');
            setSerials([]);
            setSelectedItemTrackSerial(false);
        }
    }, [isOpen]);

    const loadInitialData = async () => {
        setLoading(true);
        try {
            const [empRes, whRes, itemRes] = await Promise.all([
                apiClient.get('/api/hrm/employees/', { params: { is_active: true, limit: 100 } }),
                apiClient.get('/api/platform/warehouses/'),
                apiClient.get('/api/inventory/items/', { params: { is_active: true, limit: 200 } })
            ]);
            
            setEmployees(empRes.data.results || empRes.data);
            setWarehouses(whRes.data.results || whRes.data);
            setItems(itemRes.data.results || itemRes.data);
            
        } catch (err: any) {
            console.error(err);
            setError('Failed to load form data');
        } finally {
            setLoading(false);
        }
    };

    const handleItemChange = async (itemId: string, warehouseId: string) => {
        const item = items.find(i => i.id === itemId);
        setSelectedItemTrackSerial(item?.track_serial_number || false);
        
        if (item?.track_serial_number && warehouseId) {
            try {
                const res = await apiClient.get('/api/inventory/item-serials/', {
                    params: { item: itemId, warehouse: warehouseId, status: 'IN_STOCK' }
                });
                setSerials(res.data.results || res.data);
            } catch (err) {
                console.error(err);
                setError('Failed to fetch serial numbers');
            }
        } else {
            setSerials([]);
            setFormData(prev => ({ ...prev, item_serial: '' }));
        }
    };

    const handleChange = (field: string, value: any) => {
        const newData = { ...formData, [field]: value };
        setFormData(newData);

        if (field === 'item' || field === 'warehouse') {
            handleItemChange(newData.item, newData.warehouse);
        }
        
        if (field === 'item_serial' && value) {
            setFormData(prev => ({ ...prev, quantity: 1 }));
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        setError('');
        try {
            const payload = {
                ...formData,
                expected_return_date: formData.expected_return_date || null,
                item_serial: formData.item_serial || null
            };
            
            await apiClient.post('/api/operations/equipment-issues/', payload);
            onSave();
        } catch (err: any) {
            const msg = err.response?.data?.error || err.response?.data?.detail || 'Failed to issue equipment';
            if (typeof msg === 'string') {
                setError(msg);
            } else {
                setError(JSON.stringify(msg));
            }
        } finally {
            setSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <Modal 
            isOpen={isOpen} 
            onClose={onClose} 
            title="Issue Equipment to Employee"
        >
            {loading ? (
                <div className="flex justify-center p-8">Loading data...</div>
            ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                            {error}
                        </div>
                    )}
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="col-span-1 md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Employee *
                            </label>
                            <select
                                className="w-full border-gray-300 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-2 border"
                                value={formData.employee}
                                onChange={(e) => handleChange('employee', e.target.value)}
                                required
                            >
                                <option value="">Select Employee</option>
                                {employees.map((e) => (
                                    <option key={e.id} value={e.id}>
                                        {e.first_name} {e.last_name} ({e.employee_code})
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Warehouse *
                            </label>
                            <select
                                className="w-full border-gray-300 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-2 border"
                                value={formData.warehouse}
                                onChange={(e) => handleChange('warehouse', e.target.value)}
                                required
                            >
                                <option value="">Select Warehouse</option>
                                {warehouses.map((w) => (
                                    <option key={w.id} value={w.id}>
                                        {w.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Item *
                            </label>
                            <select
                                className="w-full border-gray-300 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-2 border"
                                value={formData.item}
                                onChange={(e) => handleChange('item', e.target.value)}
                                disabled={!formData.warehouse}
                                required
                            >
                                <option value="">Select Item</option>
                                {items.map((i) => (
                                    <option key={i.id} value={i.id}>
                                        {i.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {selectedItemTrackSerial && (
                            <div className="col-span-1 md:col-span-2">
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Serial Number *
                                </label>
                                <select
                                    className={`w-full border-gray-300 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-2 border ${serials.length === 0 ? 'border-red-300' : ''}`}
                                    value={formData.item_serial}
                                    onChange={(e) => handleChange('item_serial', e.target.value)}
                                    required
                                >
                                    <option value="">Select Serial</option>
                                    {serials.map((s) => (
                                        <option key={s.id} value={s.id}>
                                            {s.serial_number}
                                        </option>
                                    ))}
                                </select>
                                {serials.length === 0 && formData.item && (
                                    <p className="text-sm text-red-500 mt-1">No available serials in stock.</p>
                                )}
                            </div>
                        )}

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Quantity *
                            </label>
                            <Input
                                type="number"
                                value={formData.quantity}
                                onChange={(e) => handleChange('quantity', Number(e.target.value))}
                                disabled={selectedItemTrackSerial}
                                min={1}
                                step={0.01}
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Issue Condition
                            </label>
                            <Input
                                value={formData.issue_condition}
                                onChange={(e) => handleChange('issue_condition', e.target.value)}
                            />
                        </div>

                        <div className="col-span-1 md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Expected Return Date
                            </label>
                            <Input
                                type="date"
                                value={formData.expected_return_date}
                                onChange={(e) => handleChange('expected_return_date', e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
                        <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
                            Cancel
                        </Button>
                        <Button 
                            type="submit" 
                            variant="primary" 
                            loading={submitting} 
                            disabled={!formData.employee || !formData.item || !formData.warehouse || (selectedItemTrackSerial && !formData.item_serial) || formData.quantity <= 0}
                        >
                            Issue
                        </Button>
                    </div>
                </form>
            )}
        </Modal>
    );
};
