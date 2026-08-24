import { useState, useEffect } from 'react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Toolbar } from '../../../layouts/PageLayout';
import { fetchVouchers, createVoucher, postVoucher, fetchChartOfAccounts, fetchVoucherLines, createVoucherLine, deleteVoucherLine } from '../api';
import type { ChartOfAccount } from '../types';

export default function VouchersView() {
    const [vouchers, setVouchers] = useState<any[]>([]);
    const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
    const [loading, setLoading] = useState(true);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingVoucher, setEditingVoucher] = useState<any | null>(null);
    const [voucherLines, setVoucherLines] = useState<any[]>([]);
    const [loadingLines, setLoadingLines] = useState(false);

    // Form states
    const [voucherType, setVoucherType] = useState('PAYMENT');
    const [date, setDate] = useState('');
    const [paymentAccount, setPaymentAccount] = useState('');
    const [paymentMethod, setPaymentMethod] = useState('CASH');
    const [reference, setReference] = useState('');
    const [description, setDescription] = useState('');
    const [payeeName, setPayeeName] = useState('');
    const [errorMsg, setErrorMsg] = useState('');

    // Line form states
    const [newLineAccount, setNewLineAccount] = useState('');
    const [newLineAmount, setNewLineAmount] = useState('');
    const [newLineDescription, setNewLineDescription] = useState('');

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [vData, accData] = await Promise.all([
                fetchVouchers(),
                fetchChartOfAccounts()
            ]);
            setVouchers(vData.results || vData);
            setAccounts(accData.results || accData);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const loadLines = async (voucherId: string) => {
        setLoadingLines(true);
        try {
            const data = await fetchVoucherLines(voucherId);
            setVoucherLines(data.results || data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoadingLines(false);
        }
    };

    const handleCreateNew = () => {
        setEditingVoucher(null);
        setVoucherType('PAYMENT');
        setDate(new Date().toISOString().split('T')[0]);
        setPaymentAccount('');
        setPaymentMethod('CASH');
        setReference('');
        setDescription('');
        setPayeeName('');
        setVoucherLines([]);
        setErrorMsg('');
        setIsModalOpen(true);
    };

    const handleEdit = (v: any) => {
        setEditingVoucher(v);
        setVoucherType(v.voucher_type);
        setDate(v.date);
        setPaymentAccount(v.payment_account);
        setPaymentMethod(v.payment_method);
        setReference(v.reference || '');
        setDescription(v.description || '');
        setPayeeName(v.payee_name || '');
        setErrorMsg('');
        loadLines(v.id);
        setIsModalOpen(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMsg('');
        
        try {
            const payload = {
                voucher_type: voucherType,
                date,
                payment_account: paymentAccount,
                payment_method: paymentMethod,
                reference,
                description,
                payee_name: payeeName
            };
            
            if (editingVoucher) {
                // Voucher update is usually restricted, assuming create only for simplicity if not supported
                // but we will attempt it or just skip if backend doesn't support PATCH well.
                // Assuming create-only or standard PATCH for Drafts.
            } else {
                await createVoucher(payload);
                alert('Voucher created successfully');
            }
            setIsModalOpen(false);
            loadData();
        } catch (err: any) {
            console.error(err);
            setErrorMsg(err.response?.data?.detail || JSON.stringify(err.response?.data) || 'Failed to save voucher');
        }
    };

    const handleAddLine = async () => {
        if (!editingVoucher) return;
        if (!newLineAccount || !newLineAmount) {
            alert('Account and Amount are required.');
            return;
        }
        try {
            await createVoucherLine({
                voucher: editingVoucher.id,
                account: newLineAccount,
                amount: newLineAmount,
                description: newLineDescription
            });
            setNewLineAccount('');
            setNewLineAmount('');
            setNewLineDescription('');
            loadLines(editingVoucher.id);
        } catch (err: any) {
            alert(err.response?.data?.detail || JSON.stringify(err.response?.data) || 'Failed to add line');
        }
    };

    const handleDeleteLine = async (lineId: string) => {
        if (!editingVoucher) return;
        if (!window.confirm('Delete line?')) return;
        try {
            await deleteVoucherLine(lineId);
            loadLines(editingVoucher.id);
        } catch (err: any) {
            alert('Failed to delete line');
        }
    };

    const handlePost = async (v: any) => {
        if (!window.confirm('Post this voucher? This cannot be undone.')) return;
        try {
            await postVoucher(v.id);
            alert('Voucher posted successfully');
            loadData();
        } catch (err: any) {
            alert(err.response?.data?.detail || JSON.stringify(err.response?.data) || 'Failed to post voucher');
        }
    };

    return (
        <div>
            <Toolbar>
                <div style={{ fontWeight: 600 }}>Financial Vouchers</div>
                <div style={{ flex: 1 }} />
                <Button variant="primary" onClick={handleCreateNew}>
                    + New Voucher
                </Button>
            </Toolbar>
            
            {isModalOpen && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
                    backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center',
                    alignItems: 'center', zIndex: 1000, overflowY: 'auto'
                }}>
                    <div style={{ backgroundColor: 'var(--color-surface)', padding: '24px', borderRadius: '8px', width: '800px', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto' }}>
                        <h2 style={{ marginTop: 0, marginBottom: '24px', borderBottom: '1px solid var(--color-border)', paddingBottom: '12px' }}>
                            {editingVoucher ? `Voucher ${editingVoucher.voucher_number}` : 'Create Voucher'}
                        </h2>
                        
                        {errorMsg && (
                            <div style={{ backgroundColor: '#fee2e2', color: '#b91c1c', padding: '12px', borderRadius: '4px', marginBottom: '16px' }}>
                                {errorMsg}
                            </div>
                        )}

                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 600 }}>Type *</label>
                                    <select required disabled={!!editingVoucher} value={voucherType} onChange={e => setVoucherType(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid var(--color-border)', borderRadius: '4px' }}>
                                        <option value="PAYMENT">Payment</option>
                                        <option value="RECEIPT">Receipt</option>
                                        <option value="CONTRA">Contra</option>
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 600 }}>Date *</label>
                                    <input required type="date" disabled={!!editingVoucher} value={date} onChange={e => setDate(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid var(--color-border)', borderRadius: '4px' }} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 600 }}>Payment Account *</label>
                                    <select required disabled={!!editingVoucher} value={paymentAccount} onChange={e => setPaymentAccount(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid var(--color-border)', borderRadius: '4px' }}>
                                        <option value="">-- Select --</option>
                                        {accounts.map(a => (
                                            <option key={a.id} value={a.id}>{a.account_code} - {a.account_name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 600 }}>Payment Method *</label>
                                    <select required disabled={!!editingVoucher} value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid var(--color-border)', borderRadius: '4px' }}>
                                        <option value="CASH">Cash</option>
                                        <option value="BANK_TRANSFER">Bank Transfer</option>
                                        <option value="CHEQUE">Cheque</option>
                                        <option value="CREDIT_CARD">Credit Card</option>
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 600 }}>Reference</label>
                                    <input type="text" disabled={!!editingVoucher} value={reference} onChange={e => setReference(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid var(--color-border)', borderRadius: '4px' }} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 600 }}>Payee Name</label>
                                    <input type="text" disabled={!!editingVoucher} value={payeeName} onChange={e => setPayeeName(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid var(--color-border)', borderRadius: '4px' }} />
                                </div>
                            </div>
                            
                            {!editingVoucher && (
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '16px', borderTop: '1px solid var(--color-border)', paddingTop: '16px' }}>
                                    <Button variant="ghost" type="button" onClick={() => setIsModalOpen(false)}>Cancel</Button>
                                    <Button variant="primary" type="submit">Create Header</Button>
                                </div>
                            )}
                            {editingVoucher && (
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '16px', borderTop: '1px solid var(--color-border)', paddingTop: '16px' }}>
                                    <Button variant="ghost" type="button" onClick={() => setIsModalOpen(false)}>Close</Button>
                                </div>
                            )}
                        </form>

                        {editingVoucher && editingVoucher.status === 'DRAFT' && (
                            <div style={{ marginTop: '32px' }}>
                                <h3 style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '8px', marginBottom: '16px' }}>Voucher Lines</h3>
                                
                                {loadingLines ? <p>Loading lines...</p> : (
                                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', marginBottom: '16px' }}>
                                        <thead>
                                            <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                                                <th style={{ padding: '8px' }}>Account</th>
                                                <th style={{ padding: '8px' }}>Description</th>
                                                <th style={{ padding: '8px' }}>Amount</th>
                                                <th style={{ padding: '8px' }}></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {voucherLines.map(line => (
                                                <tr key={line.id} style={{ borderBottom: '1px solid #eee' }}>
                                                    <td style={{ padding: '8px' }}>{accounts.find(a => a.id === line.account)?.account_name || line.account}</td>
                                                    <td style={{ padding: '8px' }}>{line.description}</td>
                                                    <td style={{ padding: '8px' }}>{line.amount}</td>
                                                    <td style={{ padding: '8px' }}>
                                                        <Button variant="danger" onClick={() => handleDeleteLine(line.id)}>✕</Button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                                
                                <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr auto', gap: '8px', alignItems: 'end' }}>
                                    <div>
                                        <select value={newLineAccount} onChange={e => setNewLineAccount(e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid var(--color-border)', borderRadius: '4px' }}>
                                            <option value="">Select Account</option>
                                            {accounts.map(a => <option key={a.id} value={a.id}>{a.account_code} - {a.account_name}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <input type="text" value={newLineDescription} onChange={e => setNewLineDescription(e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid var(--color-border)', borderRadius: '4px' }} placeholder="Description" />
                                    </div>
                                    <div>
                                        <input type="number" min="0" step="0.01" value={newLineAmount} onChange={e => setNewLineAmount(e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid var(--color-border)', borderRadius: '4px' }} placeholder="Amount" />
                                    </div>
                                    <div>
                                        <Button variant="secondary" onClick={handleAddLine}>Add</Button>
                                    </div>
                                </div>
                            </div>
                        )}
                        {editingVoucher && editingVoucher.status !== 'DRAFT' && (
                            <div style={{ marginTop: '32px' }}>
                                <h3 style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '8px', marginBottom: '16px' }}>Voucher Lines</h3>
                                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', marginBottom: '16px' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                                            <th style={{ padding: '8px' }}>Account</th>
                                            <th style={{ padding: '8px' }}>Description</th>
                                            <th style={{ padding: '8px' }}>Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {voucherLines.map(line => (
                                            <tr key={line.id} style={{ borderBottom: '1px solid #eee' }}>
                                                <td style={{ padding: '8px' }}>{accounts.find(a => a.id === line.account)?.account_name || line.account}</td>
                                                <td style={{ padding: '8px' }}>{line.description}</td>
                                                <td style={{ padding: '8px' }}>{line.amount}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}
            
            <Card>
                <div className="p-4">
                    {loading ? (
                        <p className="text-gray-500">Loading...</p>
                    ) : (
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead>
                                <tr>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Number</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {vouchers.map((v) => (
                                    <tr key={v.id}>
                                        <td className="px-4 py-2 font-medium">{v.voucher_number || 'TBD'}</td>
                                        <td className="px-4 py-2">{v.voucher_type}</td>
                                        <td className="px-4 py-2">{v.date}</td>
                                        <td className="px-4 py-2">{v.total_amount}</td>
                                        <td className="px-4 py-2">
                                            <span className={`text-xs px-2 rounded ${v.status === 'POSTED' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                                {v.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2" style={{ display: 'flex', gap: '8px' }}>
                                            <Button variant="ghost" onClick={() => handleEdit(v)}>View/Edit</Button>
                                            {v.status === 'DRAFT' && (
                                                <Button variant="secondary" onClick={() => handlePost(v)}>Post</Button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {vouchers.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="px-4 py-2 text-gray-500 text-center">No vouchers found.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    )}
                </div>
            </Card>
        </div>
    );
}
