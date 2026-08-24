import { useState, useEffect } from 'react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Toolbar } from '../../../layouts/PageLayout';
import { fetchBudgets, createBudget, updateBudget, fetchFiscalYears, fetchAccountingPeriods, fetchChartOfAccounts, fetchCostCenters, fetchBudgetLines, createBudgetLine, deleteBudgetLine } from '../api';
import type { Budget, FiscalYear, ChartOfAccount, AccountingPeriod } from '../types';

export default function BudgetsView() {
    const [budgets, setBudgets] = useState<Budget[]>([]);
    const [fiscalYears, setFiscalYears] = useState<FiscalYear[]>([]);
    const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
    const [periods, setPeriods] = useState<AccountingPeriod[]>([]);
    const [costCenters, setCostCenters] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
    const [budgetLines, setBudgetLines] = useState<any[]>([]);
    const [loadingLines, setLoadingLines] = useState(false);

    // Form states
    const [name, setName] = useState('');
    const [fiscalYear, setFiscalYear] = useState('');
    const [status, setStatus] = useState('DRAFT');
    const [description, setDescription] = useState('');
    const [errorMsg, setErrorMsg] = useState('');

    // Line form states
    const [newLineAccount, setNewLineAccount] = useState('');
    const [newLinePeriod, setNewLinePeriod] = useState('');
    const [newLineAmount, setNewLineAmount] = useState('');
    const [newLineCostCenter, setNewLineCostCenter] = useState('');

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [bData, fyData, accData, pData, ccData] = await Promise.all([
                fetchBudgets(),
                fetchFiscalYears(),
                fetchChartOfAccounts(),
                fetchAccountingPeriods(),
                fetchCostCenters()
            ]);
            setBudgets(bData.results || bData);
            setFiscalYears(fyData.results || fyData);
            setAccounts(accData.results || accData);
            setPeriods(pData.results || pData);
            setCostCenters(ccData.results || ccData);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const loadLines = async (budgetId: string) => {
        setLoadingLines(true);
        try {
            const data = await fetchBudgetLines(budgetId);
            setBudgetLines(data.results || data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoadingLines(false);
        }
    };

    const handleCreateNew = () => {
        setEditingBudget(null);
        setName('');
        setFiscalYear(fiscalYears.length > 0 ? fiscalYears[0].id : '');
        setStatus('DRAFT');
        setDescription('');
        setBudgetLines([]);
        setErrorMsg('');
        setIsModalOpen(true);
    };

    const handleEdit = (budget: Budget) => {
        setEditingBudget(budget);
        setName(budget.name);
        setFiscalYear(budget.fiscal_year);
        setStatus(budget.status);
        setDescription(budget.description || '');
        setErrorMsg('');
        loadLines(budget.id);
        setIsModalOpen(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMsg('');
        
        try {
            const payload = {
                name,
                fiscal_year: fiscalYear,
                status,
                description
            };
            
            if (editingBudget) {
                await updateBudget(editingBudget.id, payload);
                alert('Budget updated successfully');
            } else {
                await createBudget(payload);
                alert('Budget created successfully');
            }
            setIsModalOpen(false);
            loadData();
        } catch (err: any) {
            console.error(err);
            setErrorMsg(err.response?.data?.detail || JSON.stringify(err.response?.data) || 'Failed to save budget');
        }
    };

    const handleAddLine = async () => {
        if (!editingBudget) return;
        if (!newLineAccount || !newLineAmount) {
            alert('Account and Amount are required.');
            return;
        }
        try {
            await createBudgetLine({
                budget: editingBudget.id,
                account: newLineAccount,
                period: newLinePeriod || null,
                amount: newLineAmount,
                cost_center: newLineCostCenter || null
            });
            setNewLineAccount('');
            setNewLinePeriod('');
            setNewLineAmount('');
            setNewLineCostCenter('');
            loadLines(editingBudget.id);
        } catch (err: any) {
            alert(err.response?.data?.detail || JSON.stringify(err.response?.data) || 'Failed to add line');
        }
    };

    const handleDeleteLine = async (lineId: string) => {
        if (!editingBudget) return;
        if (!window.confirm('Delete line?')) return;
        try {
            await deleteBudgetLine(lineId);
            loadLines(editingBudget.id);
        } catch (err: any) {
            alert('Failed to delete line');
        }
    };

    return (
        <div>
            <Toolbar>
                <div style={{ fontWeight: 600 }}>Budgets</div>
                <div style={{ flex: 1 }} />
                <Button variant="primary" onClick={handleCreateNew}>
                    + New Budget
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
                            {editingBudget ? 'Edit Budget' : 'Create Budget'}
                        </h2>
                        
                        {errorMsg && (
                            <div style={{ backgroundColor: '#fee2e2', color: '#b91c1c', padding: '12px', borderRadius: '4px', marginBottom: '16px' }}>
                                {errorMsg}
                            </div>
                        )}

                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 600 }}>Name *</label>
                                    <input required type="text" value={name} onChange={e => setName(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid var(--color-border)', borderRadius: '4px' }} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 600 }}>Fiscal Year *</label>
                                    <select required value={fiscalYear} onChange={e => setFiscalYear(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid var(--color-border)', borderRadius: '4px' }}>
                                        <option value="">-- Select --</option>
                                        {fiscalYears.map(fy => (
                                            <option key={fy.id} value={fy.id}>{fy.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 600 }}>Status *</label>
                                    <select required value={status} onChange={e => setStatus(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid var(--color-border)', borderRadius: '4px' }}>
                                        <option value="DRAFT">Draft</option>
                                        <option value="ACTIVE">Active</option>
                                        <option value="CLOSED">Closed</option>
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 600 }}>Description</label>
                                    <textarea rows={1} value={description} onChange={e => setDescription(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid var(--color-border)', borderRadius: '4px' }} />
                                </div>
                            </div>
                            
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '16px', borderTop: '1px solid var(--color-border)', paddingTop: '16px' }}>
                                <Button variant="ghost" type="button" onClick={() => setIsModalOpen(false)}>Cancel</Button>
                                <Button variant="primary" type="submit">Save Header</Button>
                            </div>
                        </form>

                        {editingBudget && (
                            <div style={{ marginTop: '32px' }}>
                                <h3 style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '8px', marginBottom: '16px' }}>Budget Lines</h3>
                                
                                {loadingLines ? <p>Loading lines...</p> : (
                                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', marginBottom: '16px' }}>
                                        <thead>
                                            <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                                                <th style={{ padding: '8px' }}>Account</th>
                                                <th style={{ padding: '8px' }}>Period</th>
                                                <th style={{ padding: '8px' }}>Cost Center</th>
                                                <th style={{ padding: '8px' }}>Amount</th>
                                                <th style={{ padding: '8px' }}></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {budgetLines.map(line => (
                                                <tr key={line.id} style={{ borderBottom: '1px solid #eee' }}>
                                                    <td style={{ padding: '8px' }}>{accounts.find(a => a.id === line.account)?.account_name || line.account}</td>
                                                    <td style={{ padding: '8px' }}>{periods.find(p => p.id === line.period)?.month ? `Month ${periods.find(p => p.id === line.period)?.month}` : 'Yearly'}</td>
                                                    <td style={{ padding: '8px' }}>{costCenters.find(c => c.id === line.cost_center)?.name || '-'}</td>
                                                    <td style={{ padding: '8px' }}>{line.amount}</td>
                                                    <td style={{ padding: '8px' }}>
                                                        <Button variant="danger" onClick={() => handleDeleteLine(line.id)}>✕</Button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                                
                                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: '8px', alignItems: 'end' }}>
                                    <div>
                                        <select value={newLineAccount} onChange={e => setNewLineAccount(e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid var(--color-border)', borderRadius: '4px' }}>
                                            <option value="">Select Account</option>
                                            {accounts.map(a => <option key={a.id} value={a.id}>{a.account_code} - {a.account_name}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <select value={newLinePeriod} onChange={e => setNewLinePeriod(e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid var(--color-border)', borderRadius: '4px' }}>
                                            <option value="">Full Year</option>
                                            {periods.filter(p => p.fiscal_year === fiscalYear).map(p => <option key={p.id} value={p.id}>Month {p.month}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <select value={newLineCostCenter} onChange={e => setNewLineCostCenter(e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid var(--color-border)', borderRadius: '4px' }}>
                                            <option value="">No Cost Center</option>
                                            {costCenters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                        </select>
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
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Fiscal Year</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {budgets.map((b) => (
                                    <tr key={b.id}>
                                        <td className="px-4 py-2 font-medium">{b.name}</td>
                                        <td className="px-4 py-2">{fiscalYears.find(fy => fy.id === b.fiscal_year)?.name || b.fiscal_year}</td>
                                        <td className="px-4 py-2">{b.status}</td>
                                        <td className="px-4 py-2">
                                            <Button variant="ghost" onClick={() => handleEdit(b)}>Edit</Button>
                                        </td>
                                    </tr>
                                ))}
                                {budgets.length === 0 && (
                                    <tr>
                                        <td colSpan={4} className="px-4 py-2 text-gray-500 text-center">No budgets found.</td>
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
