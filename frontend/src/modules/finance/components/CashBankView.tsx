import { useState, useEffect } from 'react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Toolbar } from '../../../layouts/PageLayout';
import { 
    fetchBankAccounts, createBankAccount, updateBankAccount, 
    fetchCheques, createCheque, clearCheque,
    fetchBankStatements, createBankStatement,
    fetchChartOfAccounts,
    fetchVouchers
} from '../api';
import type { BankAccount, ChartOfAccount, Cheque, BankStatement } from '../types';

export default function CashBankView() {
    const [activeTab, setActiveTab] = useState<'ACCOUNTS' | 'CHEQUES' | 'STATEMENTS' | 'RECONCILIATION'>('ACCOUNTS');
    
    // Data states
    const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
    const [chartOfAccounts, setChartOfAccounts] = useState<ChartOfAccount[]>([]);
    const [cheques, setCheques] = useState<Cheque[]>([]);
    const [statements, setStatements] = useState<BankStatement[]>([]);
    const [vouchers, setVouchers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // Modals
    const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
    const [isChequeModalOpen, setIsChequeModalOpen] = useState(false);
    const [isStatementModalOpen, setIsStatementModalOpen] = useState(false);
    
    const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null);
    const [errorMsg, setErrorMsg] = useState('');

    // Account Form
    const [accName, setAccName] = useState('');
    const [bankName, setBankName] = useState('');
    const [accountNumber, setAccountNumber] = useState('');
    const [branch, setBranch] = useState('');
    const [glAccount, setGlAccount] = useState('');
    const [isActive, setIsActive] = useState(true);

    // Cheque Form
    const [chqNumber, setChqNumber] = useState('');
    const [chqBankAccount, setChqBankAccount] = useState('');
    const [chqVoucher, setChqVoucher] = useState('');
    const [chqIssueDate, setChqIssueDate] = useState('');
    const [chqAmount, setChqAmount] = useState('');
    const [chqPayee, setChqPayee] = useState('');

    // Statement Form
    const [stmtBankAccount, setStmtBankAccount] = useState('');
    const [stmtDate, setStmtDate] = useState('');
    const [stmtStartDate, setStmtStartDate] = useState('');
    const [stmtEndDate, setStmtEndDate] = useState('');
    const [stmtOpenBal, setStmtOpenBal] = useState('');
    const [stmtCloseBal, setStmtCloseBal] = useState('');

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [bData, accData, chqData, stmtData, vchData] = await Promise.all([
                fetchBankAccounts(),
                fetchChartOfAccounts(),
                fetchCheques(),
                fetchBankStatements(),
                fetchVouchers()
            ]);
            setBankAccounts(bData.results || bData);
            setChartOfAccounts(accData.results || accData);
            setCheques(chqData.results || chqData);
            setStatements(stmtData.results || stmtData);
            setVouchers(vchData.results || vchData);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    // --- ACCOUNT HANDLERS ---
    const handleCreateAccount = () => {
        setEditingAccount(null);
        setAccName(''); setBankName(''); setAccountNumber(''); setBranch(''); setGlAccount(''); setIsActive(true);
        setErrorMsg(''); setIsAccountModalOpen(true);
    };

    const handleEditAccount = (acc: BankAccount) => {
        setEditingAccount(acc);
        setAccName(acc.name); setBankName(acc.bank_name); setAccountNumber(acc.account_number); setBranch(acc.branch || ''); setGlAccount(acc.account); setIsActive(acc.is_active);
        setErrorMsg(''); setIsAccountModalOpen(true);
    };

    const submitAccount = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMsg('');
        try {
            const payload = { name: accName, bank_name: bankName, account_number: accountNumber, branch, account: glAccount, is_active: isActive };
            if (editingAccount) await updateBankAccount(editingAccount.id, payload);
            else await createBankAccount(payload);
            setIsAccountModalOpen(false);
            loadData();
        } catch (err: any) { setErrorMsg(err.response?.data?.detail || JSON.stringify(err.response?.data) || 'Failed to save'); }
    };

    // --- CHEQUE HANDLERS ---
    const handleCreateCheque = () => {
        setChqNumber(''); setChqBankAccount(''); setChqVoucher(''); setChqIssueDate(''); setChqAmount(''); setChqPayee('');
        setErrorMsg(''); setIsChequeModalOpen(true);
    };

    const submitCheque = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMsg('');
        try {
            const payload = { 
                cheque_number: chqNumber, bank_account: chqBankAccount, voucher: chqVoucher, 
                issue_date: chqIssueDate, amount: chqAmount, payee_name: chqPayee 
            };
            await createCheque(payload);
            setIsChequeModalOpen(false);
            loadData();
        } catch (err: any) { setErrorMsg(err.response?.data?.detail || JSON.stringify(err.response?.data) || 'Failed to save'); }
    };

    const handleClearCheque = async (id: string) => {
        if (!window.confirm("Mark cheque as cleared?")) return;
        try {
            await clearCheque(id);
            loadData();
        } catch (err: any) { alert(err.response?.data?.detail || "Failed to clear cheque"); }
    };

    // --- STATEMENT HANDLERS ---
    const handleCreateStatement = () => {
        setStmtBankAccount(''); setStmtDate(''); setStmtStartDate(''); setStmtEndDate(''); setStmtOpenBal('0'); setStmtCloseBal('0');
        setErrorMsg(''); setIsStatementModalOpen(true);
    };

    const submitStatement = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMsg('');
        try {
            const payload = { 
                bank_account: stmtBankAccount, statement_date: stmtDate, 
                start_date: stmtStartDate, end_date: stmtEndDate, 
                opening_balance: stmtOpenBal, closing_balance: stmtCloseBal 
            };
            await createBankStatement(payload);
            setIsStatementModalOpen(false);
            loadData();
        } catch (err: any) { setErrorMsg(err.response?.data?.detail || JSON.stringify(err.response?.data) || 'Failed to save'); }
    };

    return (
        <div>
            <Toolbar>
                <div style={{ fontWeight: 600 }}>Cash & Bank</div>
                <div style={{ flex: 1 }} />
                {activeTab === 'ACCOUNTS' && <Button variant="primary" onClick={handleCreateAccount}>+ New Account</Button>}
                {activeTab === 'CHEQUES' && <Button variant="primary" onClick={handleCreateCheque}>+ Issue Cheque</Button>}
                {activeTab === 'STATEMENTS' && <Button variant="primary" onClick={handleCreateStatement}>+ Import Statement</Button>}
            </Toolbar>

            <div className="flex border-b mb-6 mt-4">
                {['ACCOUNTS', 'CHEQUES', 'STATEMENTS', 'RECONCILIATION'].map(tab => (
                    <button 
                        key={tab} 
                        className={`px-4 py-2 font-medium ${activeTab === tab ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
                        onClick={() => setActiveTab(tab as any)}
                    >
                        {tab.charAt(0) + tab.slice(1).toLowerCase().replace('_', ' ')}
                    </button>
                ))}
            </div>

            {loading ? <p className="text-gray-500">Loading...</p> : (
                <>
                    {/* BANK ACCOUNTS */}
                    {activeTab === 'ACCOUNTS' && (
                        <Card>
                            <div className="p-4">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead>
                                        <tr>
                                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Bank</th>
                                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Account No</th>
                                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">GL Account</th>
                                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                        {bankAccounts.map((b) => (
                                            <tr key={b.id}>
                                                <td className="px-4 py-2 font-medium">{b.name}</td>
                                                <td className="px-4 py-2">{b.bank_name}</td>
                                                <td className="px-4 py-2">{b.account_number}</td>
                                                <td className="px-4 py-2">{chartOfAccounts.find(a => a.id === b.account)?.account_name || b.account}</td>
                                                <td className="px-4 py-2">
                                                    <span className={`text-xs px-2 rounded ${b.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                                        {b.is_active ? 'Active' : 'Inactive'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-2">
                                                    <Button variant="ghost" onClick={() => handleEditAccount(b)}>Edit</Button>
                                                </td>
                                            </tr>
                                        ))}
                                        {bankAccounts.length === 0 && (
                                            <tr>
                                                <td colSpan={6} className="px-4 py-2 text-gray-500 text-center">No bank accounts found.</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </Card>
                    )}

                    {/* CHEQUES */}
                    {activeTab === 'CHEQUES' && (
                        <Card>
                            <div className="p-4">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead>
                                        <tr>
                                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Number</th>
                                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Bank Account</th>
                                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Issue Date</th>
                                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Payee</th>
                                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                        {cheques.map((c) => (
                                            <tr key={c.id}>
                                                <td className="px-4 py-2 font-medium">{c.cheque_number}</td>
                                                <td className="px-4 py-2">{bankAccounts.find(b => b.id === c.bank_account)?.name}</td>
                                                <td className="px-4 py-2">{c.issue_date}</td>
                                                <td className="px-4 py-2">{c.payee_name}</td>
                                                <td className="px-4 py-2">{c.amount}</td>
                                                <td className="px-4 py-2">{c.status}</td>
                                                <td className="px-4 py-2 flex gap-2">
                                                    {c.status === 'ISSUED' && (
                                                        <Button variant="ghost" onClick={() => handleClearCheque(c.id)}>Clear</Button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </Card>
                    )}

                    {/* STATEMENTS */}
                    {activeTab === 'STATEMENTS' && (
                        <Card>
                            <div className="p-4">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead>
                                        <tr>
                                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Account</th>
                                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Statement Date</th>
                                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Period</th>
                                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Opening Bal</th>
                                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Closing Bal</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                        {statements.map((s) => (
                                            <tr key={s.id}>
                                                <td className="px-4 py-2">{bankAccounts.find(b => b.id === s.bank_account)?.name}</td>
                                                <td className="px-4 py-2">{s.statement_date}</td>
                                                <td className="px-4 py-2">{s.start_date} to {s.end_date}</td>
                                                <td className="px-4 py-2">{s.opening_balance}</td>
                                                <td className="px-4 py-2">{s.closing_balance}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </Card>
                    )}

                    {/* RECONCILIATION */}
                    {activeTab === 'RECONCILIATION' && (
                        <Card title="Bank Reconciliation">
                            <div className="p-4 text-gray-600">
                                <p className="mb-4">
                                    The backend reconciliation engine supports storing BankStatementLines with matching statuses (`UNMATCHED`, `MATCHED`, `RECONCILED`), but the automatic/manual matching workflow endpoints and frontend UI are currently <span className="font-bold text-orange-600">PARTIAL / DEFERRED</span> as per Phase guidelines. 
                                </p>
                                <p>
                                    Only basic creation of Bank Statements is supported. Full line-item matching against Journal Entries requires additional backend services.
                                </p>
                            </div>
                        </Card>
                    )}
                </>
            )}

            {/* MODALS */}
            {isAccountModalOpen && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white p-6 rounded-md shadow-lg w-full max-w-lg">
                        <h2 className="text-lg font-medium mb-4">{editingAccount ? 'Edit Account' : 'New Account'}</h2>
                        {errorMsg && <div className="text-red-600 mb-4">{errorMsg}</div>}
                        <form onSubmit={submitAccount} className="space-y-4">
                            <input required type="text" placeholder="Name" className="w-full border p-2" value={accName} onChange={e => setAccName(e.target.value)} />
                            <select required className="w-full border p-2" value={glAccount} onChange={e => setGlAccount(e.target.value)}>
                                <option value="">Select GL Account</option>
                                {chartOfAccounts.map(a => <option key={a.id} value={a.id}>{a.account_name}</option>)}
                            </select>
                            <input required type="text" placeholder="Bank Name" className="w-full border p-2" value={bankName} onChange={e => setBankName(e.target.value)} />
                            <input required type="text" placeholder="Account Number" className="w-full border p-2" value={accountNumber} onChange={e => setAccountNumber(e.target.value)} />
                            <input type="text" placeholder="Branch" className="w-full border p-2" value={branch} onChange={e => setBranch(e.target.value)} />
                            <div className="flex justify-end gap-2 pt-4">
                                <Button type="button" variant="ghost" onClick={() => setIsAccountModalOpen(false)}>Cancel</Button>
                                <Button type="submit" variant="primary">Save</Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {isChequeModalOpen && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white p-6 rounded-md shadow-lg w-full max-w-lg">
                        <h2 className="text-lg font-medium mb-4">Issue Cheque</h2>
                        {errorMsg && <div className="text-red-600 mb-4">{errorMsg}</div>}
                        <form onSubmit={submitCheque} className="space-y-4">
                            <input required type="text" placeholder="Cheque Number" className="w-full border p-2" value={chqNumber} onChange={e => setChqNumber(e.target.value)} />
                            <select required className="w-full border p-2" value={chqBankAccount} onChange={e => setChqBankAccount(e.target.value)}>
                                <option value="">Select Bank Account</option>
                                {bankAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                            </select>
                            <select required className="w-full border p-2" value={chqVoucher} onChange={e => setChqVoucher(e.target.value)}>
                                <option value="">Select Linked Voucher</option>
                                {vouchers.map(v => <option key={v.id} value={v.id}>{v.voucher_number}</option>)}
                            </select>
                            <input required type="date" className="w-full border p-2" value={chqIssueDate} onChange={e => setChqIssueDate(e.target.value)} />
                            <input required type="text" placeholder="Payee Name" className="w-full border p-2" value={chqPayee} onChange={e => setChqPayee(e.target.value)} />
                            <input required type="number" step="0.01" placeholder="Amount" className="w-full border p-2" value={chqAmount} onChange={e => setChqAmount(e.target.value)} />
                            
                            <div className="flex justify-end gap-2 pt-4">
                                <Button type="button" variant="ghost" onClick={() => setIsChequeModalOpen(false)}>Cancel</Button>
                                <Button type="submit" variant="primary">Save</Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {isStatementModalOpen && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white p-6 rounded-md shadow-lg w-full max-w-lg">
                        <h2 className="text-lg font-medium mb-4">Import Statement Header</h2>
                        {errorMsg && <div className="text-red-600 mb-4">{errorMsg}</div>}
                        <form onSubmit={submitStatement} className="space-y-4">
                            <select required className="w-full border p-2" value={stmtBankAccount} onChange={e => setStmtBankAccount(e.target.value)}>
                                <option value="">Select Bank Account</option>
                                {bankAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                            </select>
                            <div className="flex gap-2">
                                <label className="flex-1 text-sm text-gray-500">Statement Date
                                    <input required type="date" className="w-full border p-2 mt-1 text-black" value={stmtDate} onChange={e => setStmtDate(e.target.value)} />
                                </label>
                            </div>
                            <div className="flex gap-2">
                                <label className="flex-1 text-sm text-gray-500">Start Date
                                    <input required type="date" className="w-full border p-2 mt-1 text-black" value={stmtStartDate} onChange={e => setStmtStartDate(e.target.value)} />
                                </label>
                                <label className="flex-1 text-sm text-gray-500">End Date
                                    <input required type="date" className="w-full border p-2 mt-1 text-black" value={stmtEndDate} onChange={e => setStmtEndDate(e.target.value)} />
                                </label>
                            </div>
                            <div className="flex gap-2">
                                <input required type="number" step="0.01" placeholder="Opening Balance" className="w-full border p-2" value={stmtOpenBal} onChange={e => setStmtOpenBal(e.target.value)} />
                                <input required type="number" step="0.01" placeholder="Closing Balance" className="w-full border p-2" value={stmtCloseBal} onChange={e => setStmtCloseBal(e.target.value)} />
                            </div>
                            <div className="flex justify-end gap-2 pt-4">
                                <Button type="button" variant="ghost" onClick={() => setIsStatementModalOpen(false)}>Cancel</Button>
                                <Button type="submit" variant="primary">Save</Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
