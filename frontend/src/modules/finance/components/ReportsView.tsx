import { useState } from 'react';
import { Card } from '../../../components/ui/Card';
import { 
    getTrialBalance, getCustomerStatement, 
    fetchGeneralLedger, fetchProfitAndLoss, fetchBalanceSheet, fetchARAging 
} from '../api';
import type { CustomerStatementRow } from '../types';

export default function ReportsView() {
    const [activeReport, setActiveReport] = useState<string | null>(null);
    const [reportData, setReportData] = useState<any>(null);
    const [customerId, setCustomerId] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleFetchReport = async (reportType: string, fetchFn: () => Promise<any>) => {
        setLoading(true);
        setError(null);
        try {
            const data = await fetchFn();
            setReportData(data);
            setActiveReport(reportType);
        } catch (err: any) {
            console.error(err);
            setError(err.message || 'Failed to load report.');
        } finally {
            setLoading(false);
        }
    };

    const loadCustomerStatement = async () => {
        if (!customerId) return;
        setLoading(true);
        setError(null);
        try {
            const data = await getCustomerStatement(customerId);
            setReportData(data.transactions || data);
            setActiveReport('customer_statement');
        } catch (err: any) {
            console.error(err);
            setError(err.message || 'Failed to load statement.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="md:col-span-1 space-y-4">
                <Card title="Financial Statements">
                    <div className="card-content space-y-2">
                        <button 
                            className={`w-full text-left px-4 py-2 hover:bg-gray-100 rounded-md ${activeReport === 'general_ledger' ? 'bg-indigo-50 text-indigo-700' : ''}`}
                            onClick={() => handleFetchReport('general_ledger', () => fetchGeneralLedger({}))}
                        >
                            General Ledger
                        </button>
                        <button 
                            className={`w-full text-left px-4 py-2 hover:bg-gray-100 rounded-md ${activeReport === 'trial_balance' ? 'bg-indigo-50 text-indigo-700' : ''}`}
                            onClick={() => handleFetchReport('trial_balance', getTrialBalance)}
                        >
                            Trial Balance
                        </button>
                        <button 
                            className={`w-full text-left px-4 py-2 hover:bg-gray-100 rounded-md ${activeReport === 'pnl' ? 'bg-indigo-50 text-indigo-700' : ''}`}
                            onClick={() => handleFetchReport('pnl', fetchProfitAndLoss)}
                        >
                            Profit & Loss
                        </button>
                        <button 
                            className={`w-full text-left px-4 py-2 hover:bg-gray-100 rounded-md ${activeReport === 'balance_sheet' ? 'bg-indigo-50 text-indigo-700' : ''}`}
                            onClick={() => handleFetchReport('balance_sheet', fetchBalanceSheet)}
                        >
                            Balance Sheet
                        </button>
                    </div>
                </Card>

                <Card title="Receivables Reports">
                    <div className="card-content space-y-2">
                        <button 
                            className={`w-full text-left px-4 py-2 hover:bg-gray-100 rounded-md ${activeReport === 'ar_aging' ? 'bg-indigo-50 text-indigo-700' : ''}`}
                            onClick={() => handleFetchReport('ar_aging', fetchARAging)}
                        >
                            AR Aging
                        </button>
                        <div className="border-t my-2 pt-2">
                            <label className="block text-sm text-gray-600 mb-1">Customer Statement</label>
                            <input 
                                type="text" 
                                placeholder="Customer ID..." 
                                className="w-full border px-3 py-2 rounded-md text-sm mb-2"
                                value={customerId}
                                onChange={(e) => setCustomerId(e.target.value)}
                            />
                            <button 
                                className="w-full bg-indigo-50 text-indigo-700 px-4 py-2 rounded-md text-sm"
                                onClick={loadCustomerStatement}
                            >
                                Generate Statement
                            </button>
                        </div>
                    </div>
                </Card>
            </div>
            
            <div className="md:col-span-3">
                {loading ? <div className="text-gray-500">Generating report...</div> : error ? <div className="text-red-500">{error}</div> : (
                    <>
                        {activeReport === 'trial_balance' && reportData && (
                            <Card title="Trial Balance">
                                <div className="card-content">
                                    <table className="min-w-full divide-y divide-gray-200">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Account</th>
                                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Debit</th>
                                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Credit</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200">
                                            {reportData.accounts && reportData.accounts.map((row: any, i: number) => (
                                                <tr key={i}>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{row.account_code} - {row.account_name}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">{row.debit}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">{row.credit}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        {reportData.total_debit !== undefined && (
                                            <tfoot className="bg-gray-50 font-bold">
                                                <tr>
                                                    <td className="px-6 py-4 text-right">Totals:</td>
                                                    <td className="px-6 py-4 text-right">{reportData.total_debit}</td>
                                                    <td className="px-6 py-4 text-right">{reportData.total_credit}</td>
                                                </tr>
                                                <tr>
                                                    <td colSpan={3} className={`px-6 py-2 text-center text-sm ${reportData.is_balanced ? 'text-green-600' : 'text-red-600'}`}>
                                                        {reportData.is_balanced ? 'Balanced' : 'Out of Balance'}
                                                    </td>
                                                </tr>
                                            </tfoot>
                                        )}
                                    </table>
                                </div>
                            </Card>
                        )}

                        {activeReport === 'customer_statement' && reportData && (
                            <Card title="Customer Statement">
                                <div className="card-content">
                                    <table className="min-w-full divide-y divide-gray-200">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ref</th>
                                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Debit</th>
                                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Credit</th>
                                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Balance</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200">
                                            {reportData.map((row: CustomerStatementRow, i: number) => (
                                                <tr key={i}>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{row.date}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{row.description}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{row.reference}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">{row.debit}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">{row.credit}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right font-medium">{row.balance}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </Card>
                        )}

                        {activeReport === 'general_ledger' && reportData && (
                            <Card title="General Ledger">
                                <div className="card-content">
                                    <table className="min-w-full divide-y divide-gray-200">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ref</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Account</th>
                                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Debit</th>
                                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Credit</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200">
                                            {(reportData.results || reportData).map((row: any, i: number) => (
                                                <tr key={i}>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{row.entry_date}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{row.journal_number}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{row.account_code} - {row.account_name}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">{row.debit}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">{row.credit}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </Card>
                        )}

                        {activeReport === 'pnl' && reportData && (
                            <Card title="Profit & Loss">
                                <div className="card-content">
                                    <table className="min-w-full divide-y divide-gray-200">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category / Account</th>
                                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200">
                                            {['REVENUE', 'COGS', 'EXPENSE'].map(category => (
                                                <tr key={category} className="bg-gray-50">
                                                    <td className="px-6 py-4 font-bold text-sm text-gray-900" colSpan={2}>{category}</td>
                                                </tr>
                                            ))}
                                            {/* Note: In a real implementation we would iterate through actual items if structured. We render the raw structure for now since PnL might return hierarchical data. */}
                                            <tr>
                                                <td colSpan={2} className="px-6 py-4">
                                                    <pre className="text-sm overflow-x-auto">{JSON.stringify(reportData, null, 2)}</pre>
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </Card>
                        )}

                        {activeReport === 'balance_sheet' && reportData && (
                            <Card title="Balance Sheet">
                                <div className="card-content">
                                    <table className="min-w-full divide-y divide-gray-200">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category / Account</th>
                                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200">
                                            {/* Note: Balance Sheet is often hierarchical. Render raw structure for now until exact schema is parsed. */}
                                            <tr>
                                                <td colSpan={2} className="px-6 py-4">
                                                    <pre className="text-sm overflow-x-auto">{JSON.stringify(reportData, null, 2)}</pre>
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </Card>
                        )}

                        {activeReport === 'ar_aging' && reportData && (
                            <Card title="AR Aging">
                                <div className="card-content">
                                    <table className="min-w-full divide-y divide-gray-200">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Current</th>
                                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">1-30 Days</th>
                                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">31-60 Days</th>
                                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">61-90 Days</th>
                                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">90+ Days</th>
                                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200">
                                            {(reportData.results || reportData).map((row: any, i: number) => (
                                                <tr key={i}>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{row.customer_name || row.customer}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">{row.current}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">{row.days_1_30}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">{row.days_31_60}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">{row.days_61_90}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">{row.days_90_plus}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right font-medium">{row.total}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </Card>
                        )}

                        {!activeReport && (
                            <Card title="Report Viewer">
                                <div className="p-6 text-gray-500">
                                    Select a report from the sidebar to view details.
                                </div>
                            </Card>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
