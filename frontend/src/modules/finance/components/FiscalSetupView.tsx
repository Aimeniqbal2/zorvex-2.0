import { useState, useEffect } from 'react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Toolbar } from '../../../layouts/PageLayout';
import { fetchFiscalYears, fetchAccountingPeriods, createFiscalYear, updateFiscalYear, createAccountingPeriod, updateAccountingPeriod } from '../api';
import type { FiscalYear, AccountingPeriod } from '../types';

export default function FiscalSetupView() {
    const [fiscalYears, setFiscalYears] = useState<FiscalYear[]>([]);
    const [accountingPeriods, setAccountingPeriods] = useState<AccountingPeriod[]>([]);
    const [loading, setLoading] = useState(true);

    // Fiscal Year Modal State
    const [isFyModalOpen, setIsFyModalOpen] = useState(false);
    const [editingFy, setEditingFy] = useState<FiscalYear | null>(null);
    const [fyName, setFyName] = useState('');
    const [fyStartDate, setFyStartDate] = useState('');
    const [fyEndDate, setFyEndDate] = useState('');
    const [fyIsCurrent, setFyIsCurrent] = useState(false);
    const [fyIsClosed, setFyIsClosed] = useState(false);
    
    // Accounting Period Modal State
    const [isApModalOpen, setIsApModalOpen] = useState(false);
    const [editingAp, setEditingAp] = useState<AccountingPeriod | null>(null);
    const [apMonth, setApMonth] = useState(1);
    const [apFiscalYear, setApFiscalYear] = useState('');
    const [apStartDate, setApStartDate] = useState('');
    const [apEndDate, setApEndDate] = useState('');
    const [apStatus, setApStatus] = useState('OPEN');
    
    const [errorMsg, setErrorMsg] = useState('');

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const fyData = await fetchFiscalYears();
            setFiscalYears(fyData.results || fyData);
            const apData = await fetchAccountingPeriods();
            setAccountingPeriods(apData.results || apData);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    // Fiscal Year Handlers
    const handleNewFy = () => {
        setEditingFy(null);
        setFyName('');
        setFyStartDate('');
        setFyEndDate('');
        setFyIsCurrent(false);
        setFyIsClosed(false);
        setErrorMsg('');
        setIsFyModalOpen(true);
    };

    const handleEditFy = (fy: FiscalYear) => {
        setEditingFy(fy);
        setFyName(fy.name);
        setFyStartDate(fy.start_date);
        setFyEndDate(fy.end_date);
        setFyIsCurrent(fy.is_current);
        setFyIsClosed(fy.is_closed);
        setErrorMsg('');
        setIsFyModalOpen(true);
    };

    const submitFy = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const payload = {
                name: fyName,
                start_date: fyStartDate,
                end_date: fyEndDate,
                is_current: fyIsCurrent,
                is_closed: fyIsClosed
            };
            if (editingFy) {
                await updateFiscalYear(editingFy.id, payload);
            } else {
                await createFiscalYear(payload);
            }
            setIsFyModalOpen(false);
            loadData();
        } catch (err: any) {
            setErrorMsg(err.response?.data?.detail || JSON.stringify(err.response?.data) || 'Failed to save');
        }
    };

    // Accounting Period Handlers
    const handleNewAp = () => {
        setEditingAp(null);
        setApMonth(1);
        setApFiscalYear(fiscalYears.length > 0 ? fiscalYears[0].id : '');
        setApStartDate('');
        setApEndDate('');
        setApStatus('OPEN');
        setErrorMsg('');
        setIsApModalOpen(true);
    };

    const handleEditAp = (ap: AccountingPeriod) => {
        setEditingAp(ap);
        setApMonth(ap.month);
        setApFiscalYear(ap.fiscal_year);
        setApStartDate(ap.start_date);
        setApEndDate(ap.end_date);
        setApStatus(ap.status);
        setErrorMsg('');
        setIsApModalOpen(true);
    };

    const submitAp = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const payload = {
                month: apMonth,
                fiscal_year: apFiscalYear,
                start_date: apStartDate,
                end_date: apEndDate,
                status: apStatus
            };
            if (editingAp) {
                await updateAccountingPeriod(editingAp.id, payload);
            } else {
                await createAccountingPeriod(payload);
            }
            setIsApModalOpen(false);
            loadData();
        } catch (err: any) {
            setErrorMsg(err.response?.data?.detail || JSON.stringify(err.response?.data) || 'Failed to save');
        }
    };

    return (
        <div className="space-y-6">
            <Toolbar>
                <div style={{ fontWeight: 600 }}>Fiscal Setup</div>
            </Toolbar>

            {/* FISCAL YEAR MODAL */}
            {isFyModalOpen && (
                <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, overflowY: 'auto' }}>
                    <div style={{ backgroundColor: 'var(--color-surface)', padding: '24px', borderRadius: '8px', width: '500px', maxWidth: '95vw' }}>
                        <h2 style={{ marginTop: 0, marginBottom: '24px', borderBottom: '1px solid var(--color-border)', paddingBottom: '12px' }}>
                            {editingFy ? 'Edit Fiscal Year' : 'Create Fiscal Year'}
                        </h2>
                        {errorMsg && <div style={{ backgroundColor: '#fee2e2', color: '#b91c1c', padding: '12px', borderRadius: '4px', marginBottom: '16px' }}>{errorMsg}</div>}
                        <form onSubmit={submitFy} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 600 }}>Name *</label>
                                <input required type="text" value={fyName} onChange={e => setFyName(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid var(--color-border)', borderRadius: '4px' }} placeholder="e.g. FY-2026" />
                            </div>
                            <div style={{ display: 'flex', gap: '16px' }}>
                                <div style={{ flex: 1 }}>
                                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 600 }}>Start Date *</label>
                                    <input required type="date" value={fyStartDate} onChange={e => setFyStartDate(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid var(--color-border)', borderRadius: '4px' }} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 600 }}>End Date *</label>
                                    <input required type="date" value={fyEndDate} onChange={e => setFyEndDate(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid var(--color-border)', borderRadius: '4px' }} />
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '16px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', fontWeight: 600 }}>
                                    <input type="checkbox" checked={fyIsCurrent} onChange={e => setFyIsCurrent(e.target.checked)} /> Current Year
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', fontWeight: 600 }}>
                                    <input type="checkbox" checked={fyIsClosed} onChange={e => setFyIsClosed(e.target.checked)} /> Closed
                                </label>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '16px', borderTop: '1px solid var(--color-border)', paddingTop: '16px' }}>
                                <Button variant="ghost" type="button" onClick={() => setIsFyModalOpen(false)}>Cancel</Button>
                                <Button variant="primary" type="submit">Save</Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ACCOUNTING PERIOD MODAL */}
            {isApModalOpen && (
                <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, overflowY: 'auto' }}>
                    <div style={{ backgroundColor: 'var(--color-surface)', padding: '24px', borderRadius: '8px', width: '500px', maxWidth: '95vw' }}>
                        <h2 style={{ marginTop: 0, marginBottom: '24px', borderBottom: '1px solid var(--color-border)', paddingBottom: '12px' }}>
                            {editingAp ? 'Edit Accounting Period' : 'Create Accounting Period'}
                        </h2>
                        {errorMsg && <div style={{ backgroundColor: '#fee2e2', color: '#b91c1c', padding: '12px', borderRadius: '4px', marginBottom: '16px' }}>{errorMsg}</div>}
                        <form onSubmit={submitAp} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 600 }}>Fiscal Year *</label>
                                <select required value={apFiscalYear} onChange={e => setApFiscalYear(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid var(--color-border)', borderRadius: '4px' }}>
                                    <option value="">-- Select --</option>
                                    {fiscalYears.map(fy => <option key={fy.id} value={fy.id}>{fy.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 600 }}>Month (1-12) *</label>
                                <input required type="number" min="1" max="12" value={apMonth} onChange={e => setApMonth(parseInt(e.target.value))} style={{ width: '100%', padding: '8px', border: '1px solid var(--color-border)', borderRadius: '4px' }} />
                            </div>
                            <div style={{ display: 'flex', gap: '16px' }}>
                                <div style={{ flex: 1 }}>
                                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 600 }}>Start Date *</label>
                                    <input required type="date" value={apStartDate} onChange={e => setApStartDate(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid var(--color-border)', borderRadius: '4px' }} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 600 }}>End Date *</label>
                                    <input required type="date" value={apEndDate} onChange={e => setApEndDate(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid var(--color-border)', borderRadius: '4px' }} />
                                </div>
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 600 }}>Status *</label>
                                <select required value={apStatus} onChange={e => setApStatus(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid var(--color-border)', borderRadius: '4px' }}>
                                    <option value="OPEN">Open</option>
                                    <option value="LOCKED">Locked</option>
                                    <option value="CLOSED">Closed</option>
                                </select>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '16px', borderTop: '1px solid var(--color-border)', paddingTop: '16px' }}>
                                <Button variant="ghost" type="button" onClick={() => setIsApModalOpen(false)}>Cancel</Button>
                                <Button variant="primary" type="submit">Save</Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <Card title={
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Fiscal Years</span>
                    <Button variant="secondary" onClick={handleNewFy}>+ New</Button>
                </div>
            }>
                <div className="p-4">
                    {loading ? (
                        <p className="text-gray-500">Loading...</p>
                    ) : (
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead>
                                <tr>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Start Date</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">End Date</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {fiscalYears.map((fy) => (
                                    <tr key={fy.id}>
                                        <td className="px-4 py-2">{fy.name} {fy.is_current && <span className="text-xs bg-indigo-100 text-indigo-800 px-2 rounded">Current</span>}</td>
                                        <td className="px-4 py-2">{fy.start_date}</td>
                                        <td className="px-4 py-2">{fy.end_date}</td>
                                        <td className="px-4 py-2">{fy.is_closed ? 'Closed' : 'Open'}</td>
                                        <td className="px-4 py-2"><Button variant="ghost" onClick={() => handleEditFy(fy)}>Edit</Button></td>
                                    </tr>
                                ))}
                                {fiscalYears.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="px-4 py-2 text-gray-500 text-center">No fiscal years found.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    )}
                </div>
            </Card>

            <Card title={
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Accounting Periods</span>
                    <Button variant="secondary" onClick={handleNewAp}>+ New</Button>
                </div>
            }>
                <div className="p-4">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead>
                            <tr>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Period / Month</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Fiscal Year</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Start Date</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">End Date</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {accountingPeriods.map((ap) => (
                                <tr key={ap.id}>
                                    <td className="px-4 py-2">Month {ap.month}</td>
                                    <td className="px-4 py-2">{fiscalYears.find(fy => fy.id === ap.fiscal_year)?.name || ap.fiscal_year}</td>
                                    <td className="px-4 py-2">{ap.start_date}</td>
                                    <td className="px-4 py-2">{ap.end_date}</td>
                                    <td className="px-4 py-2">
                                        <span className={`text-xs px-2 rounded ${ap.status === 'OPEN' ? 'bg-green-100 text-green-800' : ap.status === 'CLOSED' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                            {ap.status}
                                        </span>
                                    </td>
                                    <td className="px-4 py-2"><Button variant="ghost" onClick={() => handleEditAp(ap)}>Edit</Button></td>
                                </tr>
                            ))}
                            {accountingPeriods.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-4 py-2 text-gray-500 text-center">No accounting periods found.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
}
