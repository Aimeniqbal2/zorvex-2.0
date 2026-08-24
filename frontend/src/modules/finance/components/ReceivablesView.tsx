import { useState, useEffect } from 'react';
import { Card } from '../../../components/ui/Card';
import { fetchServiceInvoices, recordServiceInvoicePayment, fetchBankAccounts } from '../api';
import type { ServiceInvoice, BankAccount } from '../types';

export default function ReceivablesView({ canWrite }: { canWrite?: boolean }) {
    const [invoices, setInvoices] = useState<ServiceInvoice[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [paymentModalOpen, setPaymentModalOpen] = useState(false);
    const [selectedInvoice, setSelectedInvoice] = useState<ServiceInvoice | null>(null);
    const [paymentAmount, setPaymentAmount] = useState('');
    const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
    const [paymentMethod, setPaymentMethod] = useState('BANK');
    const [paymentReference, setPaymentReference] = useState('');
    const [paymentBankAccount, setPaymentBankAccount] = useState('');
    const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);

    useEffect(() => {
        loadInvoices();
    }, []);

    const loadInvoices = async () => {
        try {
            const [data, accounts] = await Promise.all([
                fetchServiceInvoices(),
                fetchBankAccounts()
            ]);
            setInvoices(data.results || data);
            setBankAccounts(accounts.results || accounts);
            setError(null);
        } catch (err: any) {
            setError(err.message || 'Failed to load receivables');
        } finally {
            setLoading(false);
        }
    };

    const handleOpenPayment = (inv: ServiceInvoice) => {
        setSelectedInvoice(inv);
        setPaymentAmount(inv.total_amount);
        setPaymentModalOpen(true);
    };

    const handleRecordPayment = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedInvoice) return;
        try {
            await recordServiceInvoicePayment(selectedInvoice.id, {
                amount: parseFloat(paymentAmount),
                payment_date: paymentDate,
                payment_method: paymentMethod,
                reference: paymentReference,
                bank_account_id: paymentBankAccount || undefined
            });
            setPaymentModalOpen(false);
            loadInvoices();
        } catch (err: any) {
            alert(err.message || 'Failed to record payment');
        }
    };

    return (
        <div className="space-y-6">
            <Card title="Accounts Receivable (Service Invoices)">
                <div className="p-4">
                    {loading ? (
                        <p className="text-gray-500">Loading receivables...</p>
                    ) : error ? (
                        <p className="text-red-500">{error}</p>
                    ) : invoices.length === 0 ? (
                        <p className="text-gray-500">No receivables found.</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead>
                                    <tr>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Invoice #</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Issue Date</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Due Date</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {invoices.map((inv) => (
                                        <tr key={inv.id}>
                                            <td className="px-4 py-2">{inv.invoice_number}</td>
                                            <td className="px-4 py-2">{inv.customer_name || 'N/A'}</td>
                                            <td className="px-4 py-2">{inv.issue_date}</td>
                                            <td className="px-4 py-2">{inv.due_date}</td>
                                            <td className="px-4 py-2">{inv.total_amount}</td>
                                            <td className="px-4 py-2">
                                                <span className={`px-2 py-1 rounded text-xs font-medium ${
                                                    inv.payment_status === 'PAID' ? 'bg-green-100 text-green-800' :
                                                    inv.payment_status === 'PARTIALLY_PAID' ? 'bg-yellow-100 text-yellow-800' :
                                                    'bg-red-100 text-red-800'
                                                }`}>
                                                    {inv.payment_status}
                                                </span>
                                            </td>
                                            <td className="px-4 py-2">
                                                {canWrite && inv.payment_status !== 'PAID' && (
                                                    <button
                                                        className="text-indigo-600 hover:text-indigo-900"
                                                        onClick={() => handleOpenPayment(inv)}
                                                    >
                                                        Record Payment
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </Card>

            {paymentModalOpen && selectedInvoice && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center">
                    <div className="bg-white p-6 rounded-md shadow-lg max-w-md w-full">
                        <h3 className="text-lg font-medium text-gray-900 mb-4">Record Payment for {selectedInvoice.invoice_number}</h3>
                        <form onSubmit={handleRecordPayment}>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Amount</label>
                                    <input 
                                        type="number" step="0.01" required
                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                        value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} 
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Payment Date</label>
                                    <input 
                                        type="date" required
                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                        value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} 
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Payment Method</label>
                                    <select 
                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                        value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}
                                    >
                                        <option value="BANK">Bank</option>
                                        <option value="CASH">Cash</option>
                                        <option value="OTHER">Other</option>
                                    </select>
                                </div>
                                {(paymentMethod === 'BANK' || paymentMethod === 'CASH') && (
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Bank/Cash Account</label>
                                        <select 
                                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                            value={paymentBankAccount} onChange={(e) => setPaymentBankAccount(e.target.value)}
                                        >
                                            <option value="">-- Auto-Default --</option>
                                            {bankAccounts.map(b => (
                                                <option key={b.id} value={b.id}>{b.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Reference</label>
                                    <input 
                                        type="text"
                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                        value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} 
                                        placeholder="Check #, Transaction ID"
                                    />
                                </div>
                            </div>
                            <div className="mt-6 flex justify-end space-x-3">
                                <button type="button" onClick={() => setPaymentModalOpen(false)} className="px-4 py-2 border rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">
                                    Cancel
                                </button>
                                <button type="submit" className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700">
                                    Record Payment
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
