import { apiClient as api } from '../../api/client';
import type { JournalEntry } from './types';

export const fetchChartOfAccounts = async () => {
    const res = await api.get('/api/finance/chart-of-accounts/');
    return res.data;
};

export const fetchJournals = async () => {
    const res = await api.get('/api/finance/journals/');
    return res.data;
};

export const fetchJournalEntries = async () => {
    const res = await api.get('/api/finance/journal-entries/');
    return res.data;
};

export const createJournalEntry = async (data: Partial<JournalEntry>) => {
    const res = await api.post('/api/finance/journal-entries/', data);
    return res.data;
};

export const postJournalEntry = async (id: string) => {
    const res = await api.post(`/api/finance/journal-entries/${id}/post_entry/`);
    return res.data;
};

export const getCustomerStatement = async (customerId: string) => {
    const res = await api.get(`/api/reports/customer-statement/?customer_id=${customerId}`);
    return res.data;
};

export const getTrialBalance = async () => {
    const res = await api.get('/api/reports/trial-balance/');
    return res.data;
};

export const fetchAccountGroups = async () => {
    const res = await api.get('/api/finance/account-groups/');
    return res.data;
};

export const createAccountGroup = async (data: any) => {
    const res = await api.post('/api/finance/account-groups/', data);
    return res.data;
};

export const updateAccountGroup = async (id: string, data: any) => {
    const res = await api.patch(`/api/finance/account-groups/${id}/`, data);
    return res.data;
};

export const fetchFiscalYears = async () => {
    const res = await api.get('/api/finance/fiscal-years/');
    return res.data;
};

export const createFiscalYear = async (data: any) => {
    const res = await api.post('/api/finance/fiscal-years/', data);
    return res.data;
};

export const updateFiscalYear = async (id: string, data: any) => {
    const res = await api.patch(`/api/finance/fiscal-years/${id}/`, data);
    return res.data;
};

export const fetchAccountingPeriods = async (fiscalYearId?: string) => {
    const url = fiscalYearId ? `/finance/accounting-periods/?fiscal_year=${fiscalYearId}` : '/finance/accounting-periods/';
    const res = await api.get(url);
    return res.data;
};

export const createAccountingPeriod = async (data: any) => {
    const res = await api.post('/api/finance/accounting-periods/', data);
    return res.data;
};

export const updateAccountingPeriod = async (id: string, data: any) => {
    const res = await api.patch(`/api/finance/accounting-periods/${id}/`, data);
    return res.data;
};

export const fetchServiceInvoices = async () => {
    const res = await api.get('/api/billing/service-invoices/');
    return res.data;
};

export const recordServiceInvoicePayment = async (id: string, data: any) => {
    const res = await api.post(`/api/billing/service-invoices/${id}/record-payment/`, data);
    return res.data;
};

export const fetchTaxGroups = async () => {
    const res = await api.get('/api/finance/tax-groups/');
    return res.data;
};

export const createTaxGroup = async (data: any) => {
    const res = await api.post('/api/finance/tax-groups/', data);
    return res.data;
};

export const updateTaxGroup = async (id: string, data: any) => {
    const res = await api.patch(`/api/finance/tax-groups/${id}/`, data);
    return res.data;
};

export const fetchTaxCodes = async () => {
    const res = await api.get('/api/finance/tax-codes/');
    return res.data;
};

export const createTaxCode = async (data: any) => {
    const res = await api.post('/api/finance/tax-codes/', data);
    return res.data;
};

export const updateTaxCode = async (id: string, data: any) => {
    const res = await api.patch(`/api/finance/tax-codes/${id}/`, data);
    return res.data;
};

export const fetchCostCenters = async () => {
    const res = await api.get('/api/finance/cost-centers/');
    return res.data;
};

export const createCostCenter = async (data: any) => {
    const res = await api.post('/api/finance/cost-centers/', data);
    return res.data;
};

export const updateCostCenter = async (id: string, data: any) => {
    const res = await api.patch(`/api/finance/cost-centers/${id}/`, data);
    return res.data;
};

export const fetchProfitCenters = async () => {
    const res = await api.get('/api/finance/profit-centers/');
    return res.data;
};

export const createProfitCenter = async (data: any) => {
    const res = await api.post('/api/finance/profit-centers/', data);
    return res.data;
};

export const updateProfitCenter = async (id: string, data: any) => {
    const res = await api.patch(`/api/finance/profit-centers/${id}/`, data);
    return res.data;
};

export const fetchBudgets = async () => {
    const res = await api.get('/api/finance/budgets/');
    return res.data;
};

export const fetchGeneralLedger = async (params: Record<string, any> = {}) => {
    const query = new URLSearchParams(params).toString();
    const res = await api.get(`/api/reports/finance/general-ledger/?${query}`);
    return res.data;
};

export const fetchProfitAndLoss = async () => {
    const res = await api.get('/api/reports/finance/pnl/');
    return res.data;
};

export const fetchBalanceSheet = async () => {
    const res = await api.get('/api/reports/finance/balance-sheet/');
    return res.data;
};

export const fetchARAging = async () => {
    const res = await api.get('/api/reports/finance/ar-aging/');
    return res.data;
};

export const createChartOfAccount = async (data: any) => {
    const res = await api.post('/api/finance/chart-of-accounts/', data);
    return res.data;
};

export const updateChartOfAccount = async (id: string, data: any) => {
    const res = await api.patch(`/api/finance/chart-of-accounts/${id}/`, data);
    return res.data;
};

export const createBudget = async (data: any) => {
    const res = await api.post('/api/finance/budgets/', data);
    return res.data;
};

export const updateBudget = async (id: string, data: any) => {
    const res = await api.patch(`/api/finance/budgets/${id}/`, data);
    return res.data;
};

export const fetchBudgetLines = async (budgetId: string) => {
    const res = await api.get(`/api/finance/budget-lines/?budget=${budgetId}`);
    return res.data;
};

export const createBudgetLine = async (data: any) => {
    const res = await api.post('/api/finance/budget-lines/', data);
    return res.data;
};

export const deleteBudgetLine = async (id: string) => {
    const res = await api.delete(`/api/finance/budget-lines/${id}/`);
    return res.data;
};

export const fetchBankAccounts = async () => {
    const res = await api.get('/api/finance/bank-accounts/');
    return res.data;
};

export const createBankAccount = async (data: any) => {
    const res = await api.post('/api/finance/bank-accounts/', data);
    return res.data;
};

export const updateBankAccount = async (id: string, data: any) => {
    const res = await api.patch(`/api/finance/bank-accounts/${id}/`, data);
    return res.data;
};

export const fetchCheques = async () => {
    const res = await api.get('/api/finance/cheques/');
    return res.data;
};

export const createCheque = async (data: any) => {
    const res = await api.post('/api/finance/cheques/', data);
    return res.data;
};

export const updateCheque = async (id: string, data: any) => {
    const res = await api.patch(`/api/finance/cheques/${id}/`, data);
    return res.data;
};

export const clearCheque = async (id: string) => {
    const res = await api.post(`/api/finance/cheques/${id}/clear_cheque/`);
    return res.data;
};

export const fetchBankStatements = async () => {
    const res = await api.get('/api/finance/bank-statements/');
    return res.data;
};

export const createBankStatement = async (data: any) => {
    const res = await api.post('/api/finance/bank-statements/', data);
    return res.data;
};

export const fetchVouchers = async () => {
    const res = await api.get('/api/finance/vouchers/');
    return res.data;
};

export const createVoucher = async (data: any) => {
    const res = await api.post('/api/finance/vouchers/', data);
    return res.data;
};

export const postVoucher = async (id: string) => {
    const res = await api.post(`/api/finance/vouchers/${id}/post_voucher/`);
    return res.data;
};

export const fetchVoucherLines = async (voucherId: string) => {
    const res = await api.get(`/api/finance/voucher-lines/?voucher=${voucherId}`);
    return res.data;
};

export const createVoucherLine = async (data: any) => {
    const res = await api.post('/api/finance/voucher-lines/', data);
    return res.data;
};

export const deleteVoucherLine = async (id: string) => {
    const res = await api.delete(`/api/finance/voucher-lines/${id}/`);
    return res.data;
};

export const reverseJournalEntry = async (id: string, data: any = {}) => {
    const res = await api.post(`/api/finance/journal-entries/${id}/reverse_entry/`, data);
    return res.data;
};
