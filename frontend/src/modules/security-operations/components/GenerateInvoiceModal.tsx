import React, { useState, useEffect } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { generateServiceInvoice, getServiceContracts } from '../api';
import type { ServiceContract } from '../types';

interface GenerateInvoiceModalProps {
    onClose: () => void;
    onSuccess: () => void;
}

export const GenerateInvoiceModal: React.FC<GenerateInvoiceModalProps> = ({ onClose, onSuccess }) => {
    const [loading, setLoading] = useState(false);
    const [contracts, setContracts] = useState<ServiceContract[]>([]);
    const [error, setError] = useState<string | null>(null);
    
    // Default to last month
    const now = new Date();
    const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastDayLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    const [formData, setFormData] = useState({
        service_contract_id: '',
        period_start: firstDayLastMonth.toISOString().slice(0, 10),
        period_end: lastDayLastMonth.toISOString().slice(0, 10),
    });

    useEffect(() => {
        const fetchInitialData = async () => {
            try {
                // Fetch active contracts
                const contractsRes = await getServiceContracts({ status: 'ACTIVE' });
                setContracts(contractsRes.results || []);
                
                if (contractsRes.results?.length > 0) {
                    setFormData(prev => ({ ...prev, service_contract_id: contractsRes.results[0].id }));
                }
            } catch (err) {
                console.error("Failed to load contracts", err);
                setError("Failed to load active contracts.");
            }
        };
        fetchInitialData();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            await generateServiceInvoice(formData);
            onSuccess();
        } catch (err: any) {
            console.error("Failed to generate invoice", err);
            setError(err?.response?.data?.error || err.message || 'Failed to generate invoice.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal title="Generate Service Invoice" isOpen={true} onClose={onClose}>
            <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                    <div className="p-3 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 rounded-md text-sm">
                        {error}
                    </div>
                )}
                
                <div className="grid grid-cols-1 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Service Contract *
                        </label>
                        <select
                            required
                            className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={formData.service_contract_id}
                            onChange={(e) => setFormData({...formData, service_contract_id: e.target.value})}
                        >
                            <option value="">Select Contract</option>
                            {contracts.map(contract => (
                                <option key={contract.id} value={contract.id}>
                                    {contract.contract_code} - {contract.customer_name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Input
                                label="Period Start *"
                                type="date"
                                required
                                value={formData.period_start}
                                onChange={(e) => setFormData({...formData, period_start: e.target.value})}
                            />
                        </div>
                        <div>
                            <Input
                                label="Period End *"
                                type="date"
                                required
                                value={formData.period_end}
                                onChange={(e) => setFormData({...formData, period_end: e.target.value})}
                            />
                        </div>
                    </div>
                </div>

                <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 rounded-md text-sm border border-blue-100 dark:border-blue-900/50">
                    <p className="font-medium mb-1"><i className="bx bx-info-circle mr-1"></i> Billing Mechanics</p>
                    <p>Generating an invoice will automatically identify all completed and unbilled duty assignments within the selected period. It will resolve contract rates and create a Draft Service Invoice.</p>
                </div>

                <div className="flex justify-end gap-3 mt-6 pt-4 border-t dark:border-gray-700">
                    <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
                        Cancel
                    </Button>
                    <Button type="submit" disabled={loading}>
                        {loading ? 'Generating...' : 'Generate Invoice'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
};
