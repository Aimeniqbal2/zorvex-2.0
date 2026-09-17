/**
 * frontend/src/industries/security/finance/api.ts
 * API Client & Type Definitions for Security Finance Foundation (Phase S-4A)
 */
import axios from 'axios';
import { getApiBaseUrl } from '../../../api/client';

const API_BASE = getApiBaseUrl() + '/api/finance';

function getAuthHeaders() {
  const token = localStorage.getItem('token') || localStorage.getItem('access_token');
  const companyId = localStorage.getItem('current_company_id');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (companyId) {
    headers['X-Company-ID'] = companyId;
  }
  return { headers };
}

// ----------------------------------------------------------------------
// Interfaces
// ----------------------------------------------------------------------

export type AccountType =
  | 'ASSET'
  | 'LIABILITY'
  | 'EQUITY'
  | 'REVENUE'
  | 'COST_OF_SERVICE'
  | 'EXPENSE'
  | 'OTHER_INCOME'
  | 'OTHER_EXPENSE';

export type NormalBalance = 'DEBIT' | 'CREDIT';

export type PeriodStatus = 'OPEN' | 'SOFT_CLOSED' | 'CLOSED' | 'LOCKED';

export type BankAccountType = 'BANK' | 'CASH' | 'PETTY_CASH' | 'WALLET';

export interface ChartOfAccount {
  id: string;
  account_code: string;
  account_name: string;
  account_type: AccountType;
  normal_balance: NormalBalance;
  parent: string | null;
  parent_code?: string;
  parent_name?: string;
  currency?: string | null;
  opening_balance: string;
  current_balance: string;
  is_header: boolean;
  allow_posting: boolean;
  is_control_account: boolean;
  is_system_controlled: boolean;
  allow_manual_entries: boolean;
  is_active: boolean;
  description: string;
  children_count?: number;
  children?: ChartOfAccount[];
}

export interface FiscalYear {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
  is_closed: boolean;
  periods_count?: number;
}

export interface AccountingPeriod {
  id: string;
  fiscal_year: string;
  fiscal_year_name?: string;
  month: number;
  period_number: number;
  start_date: string;
  end_date: string;
  status: PeriodStatus;
}

export interface CostCenter {
  id: string;
  code: string;
  name: string;
  parent: string | null;
  parent_code?: string;
  parent_name?: string;
  description: string;
  is_active: boolean;
  children_count?: number;
  children?: CostCenter[];
}

export interface ProfitCenter {
  id: string;
  code: string;
  name: string;
  parent: string | null;
  parent_code?: string;
  parent_name?: string;
  description: string;
  is_active: boolean;
  children_count?: number;
  children?: ProfitCenter[];
}

export interface BankAccount {
  id: string;
  account_type: BankAccountType;
  account_type_display?: string;
  bank_name: string;
  account_title: string;
  account_number: string;
  iban: string;
  branch_name: string;
  currency: string | null;
  currency_code?: string;
  chart_of_account: string;
  chart_of_account_code?: string;
  chart_of_account_name?: string;
  opening_balance: string;
  current_balance: string;
  is_active: boolean;
}

export interface SecurityFinanceConfiguration {
  id?: string;
  accounts_receivable_account: string | null;
  accounts_receivable_account_name?: string;
  accounts_payable_account: string | null;
  accounts_payable_account_name?: string;
  payroll_payable_account: string | null;
  payroll_payable_account_name?: string;
  tax_payable_account: string | null;
  tax_payable_account_name?: string;
  security_service_revenue_account: string | null;
  security_service_revenue_account_name?: string;
  overtime_revenue_account: string | null;
  overtime_revenue_account_name?: string;
  extra_duty_revenue_account: string | null;
  extra_duty_revenue_account_name?: string;
  salary_cost_account: string | null;
  salary_cost_account_name?: string;
  overtime_cost_account: string | null;
  overtime_cost_account_name?: string;
  inventory_equipment_account: string | null;
  inventory_equipment_account_name?: string;
  default_bank_account: string | null;
  default_bank_account_title?: string;
  default_currency: string | null;
  default_currency_code?: string;
  is_active: boolean;
}

export interface PeriodCheckResult {
  can_post: boolean;
  message: string;
  period: AccountingPeriod | null;
}

export interface ProvisionCOAResult {
  status: string;
  message: string;
  created_counts: {
    accounts: number;
    fiscal_years: number;
    periods: number;
    cost_centers: number;
    profit_centers: number;
    bank_accounts: number;
  };
  total_accounts: number;
}

// ----------------------------------------------------------------------
// API Methods
// ----------------------------------------------------------------------

export async function fetchChartOfAccounts(params?: Record<string, any>): Promise<ChartOfAccount[]> {
  const resp = await axios.get(`${API_BASE}/chart-of-accounts/`, {
    ...getAuthHeaders(),
    params
  });
  return resp.data.results || resp.data;
}

export async function fetchCOATree(): Promise<ChartOfAccount[]> {
  const resp = await axios.get(`${API_BASE}/chart-of-accounts/tree/`, getAuthHeaders());
  return resp.data;
}

export async function createAccount(data: Partial<ChartOfAccount>): Promise<ChartOfAccount> {
  const resp = await axios.post(`${API_BASE}/chart-of-accounts/`, data, getAuthHeaders());
  return resp.data;
}

export async function updateAccount(id: string, data: Partial<ChartOfAccount>): Promise<ChartOfAccount> {
  const resp = await axios.patch(`${API_BASE}/chart-of-accounts/${id}/`, data, getAuthHeaders());
  return resp.data;
}

export async function deleteAccount(id: string): Promise<void> {
  await axios.delete(`${API_BASE}/chart-of-accounts/${id}/`, getAuthHeaders());
}

export async function provisionSecurityCOA(): Promise<ProvisionCOAResult> {
  const resp = await axios.post(`${API_BASE}/chart-of-accounts/provision-security-template/`, {}, getAuthHeaders());
  return resp.data;
}

export async function fetchFiscalYears(): Promise<FiscalYear[]> {
  const resp = await axios.get(`${API_BASE}/fiscal-years/`, getAuthHeaders());
  return resp.data.results || resp.data;
}

export async function createFiscalYear(data: Partial<FiscalYear>): Promise<FiscalYear> {
  const resp = await axios.post(`${API_BASE}/fiscal-years/`, data, getAuthHeaders());
  return resp.data;
}

export async function fetchAccountingPeriods(params?: Record<string, any>): Promise<AccountingPeriod[]> {
  const resp = await axios.get(`${API_BASE}/accounting-periods/`, {
    ...getAuthHeaders(),
    params
  });
  return resp.data.results || resp.data;
}

export async function setPeriodStatus(id: string, status: PeriodStatus): Promise<AccountingPeriod> {
  const resp = await axios.post(`${API_BASE}/accounting-periods/${id}/set-status/`, { status }, getAuthHeaders());
  return resp.data;
}

export async function checkDatePeriod(date: string, isAdjustment: boolean = false): Promise<PeriodCheckResult> {
  const resp = await axios.get(`${API_BASE}/accounting-periods/check-date/`, {
    ...getAuthHeaders(),
    params: { date, is_adjustment: isAdjustment }
  });
  return resp.data;
}

export async function fetchCostCenters(params?: Record<string, any>): Promise<CostCenter[]> {
  const resp = await axios.get(`${API_BASE}/cost-centers/`, {
    ...getAuthHeaders(),
    params
  });
  return resp.data.results || resp.data;
}

export async function fetchCostCenterTree(): Promise<CostCenter[]> {
  const resp = await axios.get(`${API_BASE}/cost-centers/tree/`, getAuthHeaders());
  return resp.data;
}

export async function createCostCenter(data: Partial<CostCenter>): Promise<CostCenter> {
  const resp = await axios.post(`${API_BASE}/cost-centers/`, data, getAuthHeaders());
  return resp.data;
}

export async function updateCostCenter(id: string, data: Partial<CostCenter>): Promise<CostCenter> {
  const resp = await axios.patch(`${API_BASE}/cost-centers/${id}/`, data, getAuthHeaders());
  return resp.data;
}

export async function fetchProfitCenters(params?: Record<string, any>): Promise<ProfitCenter[]> {
  const resp = await axios.get(`${API_BASE}/profit-centers/`, {
    ...getAuthHeaders(),
    params
  });
  return resp.data.results || resp.data;
}

export async function fetchProfitCenterTree(): Promise<ProfitCenter[]> {
  const resp = await axios.get(`${API_BASE}/profit-centers/tree/`, getAuthHeaders());
  return resp.data;
}

export async function createProfitCenter(data: Partial<ProfitCenter>): Promise<ProfitCenter> {
  const resp = await axios.post(`${API_BASE}/profit-centers/`, data, getAuthHeaders());
  return resp.data;
}

export async function updateProfitCenter(id: string, data: Partial<ProfitCenter>): Promise<ProfitCenter> {
  const resp = await axios.patch(`${API_BASE}/profit-centers/${id}/`, data, getAuthHeaders());
  return resp.data;
}

export async function fetchBankAccounts(params?: Record<string, any>): Promise<BankAccount[]> {
  const resp = await axios.get(`${API_BASE}/bank-accounts/`, {
    ...getAuthHeaders(),
    params
  });
  return resp.data.results || resp.data;
}

export async function createBankAccount(data: Partial<BankAccount>): Promise<BankAccount> {
  const resp = await axios.post(`${API_BASE}/bank-accounts/`, data, getAuthHeaders());
  return resp.data;
}

export async function updateBankAccount(id: string, data: Partial<BankAccount>): Promise<BankAccount> {
  const resp = await axios.patch(`${API_BASE}/bank-accounts/${id}/`, data, getAuthHeaders());
  return resp.data;
}

export async function fetchSecurityFinanceConfig(): Promise<SecurityFinanceConfiguration> {
  const resp = await axios.get(`${API_BASE}/security-finance-config/current/`, getAuthHeaders());
  return resp.data;
}

export async function updateSecurityFinanceConfig(data: Partial<SecurityFinanceConfiguration>): Promise<SecurityFinanceConfiguration> {
  const resp = await axios.post(`${API_BASE}/security-finance-config/current/`, data, getAuthHeaders());
  return resp.data;
}

// ----------------------------------------------------------------------
// Phase S-4B Client Billing & Security Invoicing
// ----------------------------------------------------------------------

const BILLING_API_BASE = getApiBaseUrl() + '/api/billing';
const OPERATIONS_API_BASE = getApiBaseUrl() + '/api/operations';
const CRM_API_BASE = getApiBaseUrl() + '/api/crm';

export type BillingSheetStatus = 'DRAFT' | 'UNDER_REVIEW' | 'APPROVED' | 'INVOICED' | 'CANCELLED';
export type BillingPeriodStatus = 'OPEN' | 'PROCESSING' | 'FINALIZED' | 'CLOSED';
export type BillingLineType =
  | 'REGULAR_SERVICE'
  | 'SUPERVISOR'
  | 'GUARD'
  | 'SINGLE_OT'
  | 'DOUBLE_OT'
  | 'EXTRA_DUTY'
  | 'TEMPORARY_SERVICE'
  | 'VIP_ESCORT'
  | 'EQUIPMENT_RENTAL'
  | 'ADDITIONAL_CHARGE'
  | 'DISCOUNT_ADJUSTMENT'
  | 'OTHER';

export type AdjustmentType = 'ADDITIONAL_CHARGE' | 'DEDUCTION' | 'DISCOUNT' | 'CORRECTION';

export type ClientInvoiceStatus =
  | 'DRAFT'
  | 'ISSUED'
  | 'SENT'
  | 'PARTIALLY_PAID'
  | 'PAID'
  | 'CANCELLED'
  | 'CREDITED';

export interface BillingSheetLine {
  id: string;
  line_type: BillingLineType;
  description: string;
  site?: string | null;
  site_name?: string;
  designation?: string | null;
  designation_name?: string;
  billing_unit: string;
  contract_quantity: string;
  actual_quantity: string;
  billable_quantity: string;
  unit_rate: string;
  ot_rate: string;
  line_subtotal: string;
  tax_rate: string;
  tax_amount: string;
  total_amount: string;
  source: 'CONTRACT' | 'OPERATIONS' | 'MANUAL_ADJUSTMENT';
  source_reference?: string;
  profit_center?: string | null;
  profit_center_name?: string;
  cost_center?: string | null;
  cost_center_name?: string;
}

export interface BillingAdjustment {
  id: string;
  adjustment_type: AdjustmentType;
  reason: string;
  amount: string;
  tax_rate: string;
  tax_amount: string;
  site?: string | null;
  site_name?: string;
  created_by_name?: string;
  created_at: string;
}

export interface BillingSheet {
  id: string;
  sheet_number: string;
  client: string;
  client_name?: string;
  contract: string;
  contract_code?: string;
  billing_period?: string | null;
  period_start: string;
  period_end: string;
  billing_month: string;
  currency?: string | null;
  exchange_rate: string;
  status: BillingSheetStatus;
  base_amount: string;
  ot_amount: string;
  extra_duty_amount: string;
  equipment_amount: string;
  adjustment_amount: string;
  discount_amount: string;
  subtotal: string;
  tax_rate: string;
  tax_amount: string;
  total_amount: string;
  notes: string;
  prepared_by_name?: string;
  prepared_at?: string;
  reviewed_by_name?: string;
  reviewed_at?: string;
  approved_by_name?: string;
  approved_at?: string;
  lines: BillingSheetLine[];
  adjustments: BillingAdjustment[];
  generated_invoice_id?: string;
  generated_invoice_number?: string;
  created_at: string;
  updated_at: string;
}

export interface ClientInvoiceLine {
  id: string;
  line_type: BillingLineType;
  description: string;
  site?: string | null;
  site_name?: string;
  designation?: string | null;
  designation_name?: string;
  quantity: string;
  unit_rate: string;
  line_subtotal: string;
  tax_rate: string;
  tax_amount: string;
  total_amount: string;
  profit_center_name?: string;
  cost_center_name?: string;
}

export interface ClientInvoice {
  id: string;
  invoice_number: string;
  client: string;
  client_name?: string;
  contract: string;
  contract_code?: string;
  billing_sheet?: string | null;
  billing_sheet_number?: string;
  period_start: string;
  period_end: string;
  billing_month: string;
  invoice_date: string;
  due_date: string;
  currency?: string | null;
  exchange_rate: string;
  payment_terms: string;
  subtotal: string;
  tax_amount: string;
  grand_total: string;
  paid_amount: string;
  status: ClientInvoiceStatus;
  issued_at?: string;
  issued_by_name?: string;
  sent_at?: string;
  sent_by_name?: string;
  notes: string;
  terms_and_conditions: string;
  lines: ClientInvoiceLine[];
  created_at: string;
  updated_at: string;
}

export interface InvoicePreviewContext {
  company: {
    id: string;
    name: string;
    email: string;
    phone: string;
    address: string;
    logo_url?: string | null;
    ntn?: string;
    strn?: string;
  };
  client: {
    id: string;
    name: string;
    billing_address: string;
    email: string;
    phone: string;
  };
  invoice: {
    id: string;
    invoice_number: string;
    contract_code: string;
    billing_sheet_number: string;
    period_start: string;
    period_end: string;
    billing_month: string;
    invoice_date: string;
    due_date: string;
    payment_terms: string;
    subtotal: number;
    tax_amount: number;
    grand_total: number;
    paid_amount: number;
    status: string;
    notes: string;
    terms_and_conditions: string;
  };
  lines: Array<{
    id: string;
    line_type: string;
    description: string;
    site_name: string;
    quantity: number;
    unit_rate: number;
    line_subtotal: number;
    tax_rate: number;
    tax_amount: number;
    total_amount: number;
  }>;
  bank_details: {
    bank_name: string;
    account_title: string;
    account_number: string;
    iban: string;
    branch: string;
  };
}

export async function fetchBillingSheets(params?: Record<string, any>): Promise<BillingSheet[]> {
  const resp = await axios.get(`${BILLING_API_BASE}/billing-sheets/`, {
    ...getAuthHeaders(),
    params
  });
  return resp.data.results || resp.data;
}

export async function fetchBillingSheetById(id: string): Promise<BillingSheet> {
  const resp = await axios.get(`${BILLING_API_BASE}/billing-sheets/${id}/`, getAuthHeaders());
  return resp.data;
}

export async function buildBillingSheetFromContract(data: {
  contract_id: string;
  period_start: string;
  period_end: string;
  currency_id?: string;
  notes?: string;
}): Promise<BillingSheet> {
  const resp = await axios.post(`${BILLING_API_BASE}/billing-sheets/build-from-contract/`, data, getAuthHeaders());
  return resp.data;
}

export async function addBillingSheetAdjustment(
  sheetId: string,
  data: {
    adjustment_type: AdjustmentType;
    reason: string;
    amount: string | number;
    site_id?: string;
    tax_rate?: string | number;
  }
): Promise<BillingSheet> {
  const resp = await axios.post(`${BILLING_API_BASE}/billing-sheets/${sheetId}/add-adjustment/`, data, getAuthHeaders());
  return resp.data;
}

export async function submitBillingSheetForReview(sheetId: string): Promise<BillingSheet> {
  const resp = await axios.post(`${BILLING_API_BASE}/billing-sheets/${sheetId}/submit-for-review/`, {}, getAuthHeaders());
  return resp.data;
}

export async function approveBillingSheet(sheetId: string): Promise<BillingSheet> {
  const resp = await axios.post(`${BILLING_API_BASE}/billing-sheets/${sheetId}/approve/`, {}, getAuthHeaders());
  return resp.data;
}

export async function cancelBillingSheet(sheetId: string, reason?: string): Promise<BillingSheet> {
  const resp = await axios.post(`${BILLING_API_BASE}/billing-sheets/${sheetId}/cancel/`, { reason }, getAuthHeaders());
  return resp.data;
}

export async function generateClientInvoiceFromSheet(
  sheetId: string,
  data?: {
    invoice_date?: string;
    due_date?: string;
    payment_terms?: string;
  }
): Promise<ClientInvoice> {
  const resp = await axios.post(`${BILLING_API_BASE}/billing-sheets/${sheetId}/generate-invoice/`, data || {}, getAuthHeaders());
  return resp.data;
}

export async function fetchClientInvoices(params?: Record<string, any>): Promise<ClientInvoice[]> {
  const resp = await axios.get(`${BILLING_API_BASE}/client-invoices/`, {
    ...getAuthHeaders(),
    params
  });
  return resp.data.results || resp.data;
}

export async function fetchClientInvoiceById(id: string): Promise<ClientInvoice> {
  const resp = await axios.get(`${BILLING_API_BASE}/client-invoices/${id}/`, getAuthHeaders());
  return resp.data;
}

export async function issueClientInvoice(id: string): Promise<ClientInvoice> {
  const resp = await axios.post(`${BILLING_API_BASE}/client-invoices/${id}/issue/`, {}, getAuthHeaders());
  return resp.data;
}

export async function sendClientInvoiceEmail(
  id: string,
  data?: {
    sender_identity_id?: string;
    to_email?: string;
    subject?: string;
    body_html?: string;
  }
): Promise<{ success: boolean; email_id?: string; error?: string; invoice_status?: string }> {
  const resp = await axios.post(`${BILLING_API_BASE}/client-invoices/${id}/send-email/`, data || {}, getAuthHeaders());
  return resp.data;
}

export async function fetchClientInvoicePreviewContext(id: string): Promise<InvoicePreviewContext> {
  const resp = await axios.get(`${BILLING_API_BASE}/client-invoices/${id}/preview-context/`, getAuthHeaders());
  return resp.data;
}

export async function fetchServiceContracts(params?: Record<string, any>): Promise<any[]> {
  const resp = await axios.get(`${OPERATIONS_API_BASE}/contracts/`, {
    ...getAuthHeaders(),
    params
  });
  return resp.data.results || resp.data;
}

export async function fetchCRMEntities(params?: Record<string, any>): Promise<any[]> {
  const resp = await axios.get(`${CRM_API_BASE}/entities/`, {
    ...getAuthHeaders(),
    params
  });
  return resp.data.results || resp.data;
}

// ----------------------------------------------------------------------
// Phase S-4D: Cash, Bank, Treasury & Financial Vouchers
// ----------------------------------------------------------------------

export type FinancialVoucherType =
  | 'RECEIPT_VOUCHER'
  | 'PAYMENT_VOUCHER'
  | 'BANK_RECEIPT'
  | 'BANK_PAYMENT'
  | 'CASH_RECEIPT'
  | 'CASH_PAYMENT'
  | 'CONTRA_VOUCHER'
  | 'JOURNAL_VOUCHER'
  | 'PETTY_CASH_VOUCHER'
  | 'RECEIPT'
  | 'PAYMENT'
  | 'CONTRA'
  | 'JOURNAL';

export type FinancialVoucherStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'POSTED'
  | 'REVERSED'
  | 'CANCELLED';

export type VoucherPaymentMethod =
  | 'CASH'
  | 'BANK_TRANSFER'
  | 'CHEQUE'
  | 'ONLINE_TRANSFER'
  | 'DIRECT_DEPOSIT'
  | 'WALLET'
  | 'OTHER';

export type ChequeStatus =
  | 'ISSUED'
  | 'RECEIVED'
  | 'DEPOSITED'
  | 'CLEARED'
  | 'BOUNCED'
  | 'CANCELLED';

export interface FinancialVoucherLineItem {
  id?: string;
  account: string;
  account_name?: string;
  account_code?: string;
  amount: string | number;
  description: string;
  cost_center?: string | null;
  cost_center_name?: string;
  profit_center?: string | null;
  profit_center_name?: string;
}

export interface FinancialVoucher {
  id: string;
  voucher_number: string;
  voucher_type: FinancialVoucherType;
  voucher_type_display?: string;
  date: string;
  amount: string;
  total_amount: string;
  bank_account?: string | null;
  bank_account_title?: string;
  destination_bank_account?: string | null;
  destination_bank_account_title?: string;
  payment_account?: string | null;
  payment_account_name?: string;
  payment_method: VoucherPaymentMethod;
  reference: string;
  description: string;
  counterparty_name: string;
  payee_name?: string;
  customer?: string | null;
  customer_name?: string;
  currency?: string | null;
  currency_code?: string;
  status: FinancialVoucherStatus;
  status_display?: string;
  source_module?: string;
  source_document_type?: string;
  source_document_id?: string;
  reversal_reason?: string;
  reversal_voucher?: string | null;
  created_by_email?: string;
  approved_by_email?: string;
  approved_at?: string | null;
  posted_by_email?: string;
  posted_at?: string | null;
  reversed_by_email?: string;
  reversed_at?: string | null;
  lines?: FinancialVoucherLineItem[];
  cheques?: ChequeItem[];
  created_at?: string;
}

export interface ChequeItem {
  id: string;
  cheque_number: string;
  bank_account?: string | null;
  bank_account_title?: string;
  voucher?: string | null;
  voucher_number?: string;
  issue_date: string;
  due_date?: string | null;
  clearing_date?: string | null;
  amount: string;
  payee_name: string;
  payer_name: string;
  drawer_bank: string;
  status: ChequeStatus;
  status_display?: string;
  bounce_reason?: string;
  notes?: string;
  created_by_email?: string;
  cleared_by_email?: string;
  bounced_by_email?: string;
  created_at?: string;
}

export interface TreasuryTransactionItem {
  id: string;
  transaction_date: string;
  bank_account: string;
  bank_account_title?: string;
  bank_account_type?: string;
  voucher?: string | null;
  voucher_number?: string;
  voucher_type?: string;
  transaction_type: string;
  transaction_type_display?: string;
  reference: string;
  description: string;
  money_in: string | number;
  money_out: string | number;
  running_balance: string | number;
  status: string;
  is_reversal: boolean;
  created_by_email?: string;
  created_at?: string;
}

export interface TreasuryDashboardData {
  total_liquidity: number;
  bank_total: number;
  cash_total: number;
  petty_cash_total: number;
  wallet_total: number;
  period_receipts_amount: number;
  period_payments_amount: number;
  period_transfers_amount: number;
  uncleared_cheques_count: number;
  uncleared_cheques_amount: number;
  accounts: Array<{
    id: string;
    account_title: string;
    account_type: string;
    account_type_display: string;
    bank_name: string;
    account_number: string;
    current_balance: number;
    currency: string;
    is_opening_balance_locked: boolean;
  }>;
  recent_transactions: Array<{
    id: string;
    date: string;
    account_title: string;
    transaction_type: string;
    transaction_type_display: string;
    reference: string;
    description: string;
    money_in: number;
    money_out: number;
    running_balance: number;
    status: string;
    voucher_number?: string;
  }>;
}

export interface AccountStatementLedger {
  bank_account: {
    id: string;
    account_title: string;
    account_type: string;
    account_type_display: string;
    account_number: string;
    bank_name: string;
    current_balance: number;
    currency: string;
  };
  start_date: string | null;
  end_date: string | null;
  opening_balance: number;
  closing_balance: number;
  period_money_in: number;
  period_money_out: number;
  transactions: Array<{
    id: string;
    date: string;
    transaction_type: string;
    transaction_type_display: string;
    reference: string;
    description: string;
    money_in: number;
    money_out: number;
    running_balance: number;
    status: string;
    is_reversal: boolean;
    voucher_id: string | null;
    voucher_number: string | null;
    voucher_type: string | null;
  }>;
  total_transactions: number;
}

// ----------------------------------------------------------------------
// Phase S-4D API Client Calls
// ----------------------------------------------------------------------

export async function fetchTreasuryDashboard(): Promise<TreasuryDashboardData> {
  const resp = await axios.get(`${API_BASE}/bank-accounts/treasury_dashboard/`, getAuthHeaders());
  return resp.data;
}

export async function fetchAccountStatementLedger(
  accountId: string,
  params?: { start_date?: string; end_date?: string }
): Promise<AccountStatementLedger> {
  const resp = await axios.get(`${API_BASE}/bank-accounts/${accountId}/statement_history/`, {
    ...getAuthHeaders(),
    params
  });
  return resp.data;
}

export async function setAccountOpeningBalance(
  accountId: string,
  data: { amount: string | number; opening_date?: string; reference?: string }
): Promise<{ status: string; current_balance: number; transaction_id: string }> {
  const resp = await axios.post(`${API_BASE}/bank-accounts/${accountId}/set_opening_balance/`, data, getAuthHeaders());
  return resp.data;
}

export async function fetchFinancialVouchers(params?: Record<string, any>): Promise<FinancialVoucher[]> {
  const resp = await axios.get(`${API_BASE}/vouchers/`, {
    ...getAuthHeaders(),
    params
  });
  return resp.data.results || resp.data;
}

export async function fetchFinancialVoucherById(id: string): Promise<FinancialVoucher> {
  const resp = await axios.get(`${API_BASE}/vouchers/${id}/`, getAuthHeaders());
  return resp.data;
}

export async function createFinancialVoucher(data: Record<string, any>): Promise<FinancialVoucher> {
  const resp = await axios.post(`${API_BASE}/vouchers/`, data, getAuthHeaders());
  return resp.data;
}

export async function submitVoucherForApproval(id: string): Promise<{ status: string; voucher: FinancialVoucher }> {
  const resp = await axios.post(`${API_BASE}/vouchers/${id}/submit_for_approval/`, {}, getAuthHeaders());
  return resp.data;
}

export async function approveVoucher(id: string): Promise<{ status: string; voucher: FinancialVoucher }> {
  const resp = await axios.post(`${API_BASE}/vouchers/${id}/approve/`, {}, getAuthHeaders());
  return resp.data;
}

export async function postFinancialVoucher(id: string): Promise<{ status: string; voucher: FinancialVoucher }> {
  const resp = await axios.post(`${API_BASE}/vouchers/${id}/post_voucher/`, {}, getAuthHeaders());
  return resp.data;
}

export async function reverseFinancialVoucher(id: string, reversal_reason: string): Promise<{ status: string; voucher: FinancialVoucher }> {
  const resp = await axios.post(`${API_BASE}/vouchers/${id}/reverse_voucher/`, { reversal_reason }, getAuthHeaders());
  return resp.data;
}

export async function cancelFinancialVoucher(id: string): Promise<{ status: string; voucher: FinancialVoucher }> {
  const resp = await axios.post(`${API_BASE}/vouchers/${id}/cancel_voucher/`, {}, getAuthHeaders());
  return resp.data;
}

export async function createContraTransfer(data: {
  from_account: string;
  to_account: string;
  amount: string | number;
  date?: string;
  reference?: string;
  description?: string;
  auto_post?: boolean;
}): Promise<FinancialVoucher> {
  const resp = await axios.post(`${API_BASE}/vouchers/create_contra/`, data, getAuthHeaders());
  return resp.data;
}

export async function fetchCheques(params?: Record<string, any>): Promise<ChequeItem[]> {
  const resp = await axios.get(`${API_BASE}/cheques/`, {
    ...getAuthHeaders(),
    params
  });
  return resp.data.results || resp.data;
}

export async function createCheque(data: Partial<ChequeItem>): Promise<ChequeItem> {
  const resp = await axios.post(`${API_BASE}/cheques/`, data, getAuthHeaders());
  return resp.data;
}

export async function depositCheque(id: string, bank_account: string): Promise<{ status: string; cheque: ChequeItem }> {
  const resp = await axios.post(`${API_BASE}/cheques/${id}/deposit/`, { bank_account }, getAuthHeaders());
  return resp.data;
}

export async function clearCheque(id: string, clearing_date?: string): Promise<{ status: string; cheque: ChequeItem }> {
  const resp = await axios.post(`${API_BASE}/cheques/${id}/clear_cheque/`, { clearing_date }, getAuthHeaders());
  return resp.data;
}

export async function bounceCheque(id: string, bounce_reason: string): Promise<{ status: string; cheque: ChequeItem }> {
  const resp = await axios.post(`${API_BASE}/cheques/${id}/bounce/`, { bounce_reason }, getAuthHeaders());
  return resp.data;
}

export async function cancelCheque(id: string): Promise<{ status: string; cheque: ChequeItem }> {
  const resp = await axios.post(`${API_BASE}/cheques/${id}/cancel/`, {}, getAuthHeaders());
  return resp.data;
}

export async function fetchTreasuryTransactions(params?: Record<string, any>): Promise<TreasuryTransactionItem[]> {
  const resp = await axios.get(`${API_BASE}/treasury-transactions/`, {
    ...getAuthHeaders(),
    params
  });
  return resp.data.results || resp.data;
}

// ----------------------------------------------------------------------
// Phase S-4E: Expenses, Petty Cash, Claims & Employee Advances
// ----------------------------------------------------------------------

export type ExpenseType =
  | 'DIRECT_EXPENSE'
  | 'EMPLOYEE_CLAIM'
  | 'PETTY_CASH_EXPENSE'
  | 'ADVANCE_SETTLEMENT'
  | 'REIMBURSEMENT';

export type ExpenseStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'PAID'
  | 'REJECTED'
  | 'CANCELLED'
  | 'REVERSED';

export type ExpensePaymentStatus =
  | 'UNPAID'
  | 'PARTIALLY_PAID'
  | 'PAID';

export type EmployeeAdvanceType =
  | 'SALARY_ADVANCE'
  | 'TRAVEL_ADVANCE'
  | 'SITE_ADVANCE'
  | 'EMERGENCY_ADVANCE'
  | 'OPERATIONAL_ADVANCE'
  | 'OTHER';

export type AdvanceStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'PAID'
  | 'SETTLED'
  | 'REJECTED'
  | 'CANCELLED';

export type AdvanceRecoveryMethod =
  | 'EXPENSE_SETTLEMENT'
  | 'PAYROLL_DEDUCTION'
  | 'CASH_RETURN'
  | 'MIXED';

export interface ExpenseCategory {
  id: string;
  name: string;
  code?: string;
  description?: string;
  default_expense_account?: string | null;
  default_expense_account_name?: string;
  default_expense_account_code?: string;
  is_active: boolean;
}

export interface ExpenseAllocationItem {
  id?: string;
  amount: string | number;
  percentage?: string | number;
  cost_center?: string | null;
  cost_center_name?: string;
  profit_center?: string | null;
  profit_center_name?: string;
  client?: string | null;
  client_name?: string;
  contract?: string | null;
  contract_code?: string;
  site?: string | null;
  site_name?: string;
  department?: string | null;
  department_name?: string;
  description?: string;
}

export interface ExpenseItem {
  id: string;
  expense_number: string;
  expense_date: string;
  expense_type: ExpenseType;
  category?: string | null;
  category_name?: string;
  category_code?: string;
  title: string;
  description?: string;
  payee?: string;
  vendor?: string | null;
  vendor_name?: string;
  employee?: string | null;
  employee_name?: string;
  amount: string;
  tax_amount: string;
  total_amount: string;
  currency?: string | null;
  payment_method: VoucherPaymentMethod;
  bank_account?: string | null;
  bank_account_title?: string;
  bank_account_type?: string;
  expense_account?: string | null;
  expense_account_name?: string;
  expense_account_code?: string;
  cost_center?: string | null;
  cost_center_name?: string;
  profit_center?: string | null;
  profit_center_name?: string;
  client?: string | null;
  client_name?: string;
  contract?: string | null;
  contract_code?: string;
  site?: string | null;
  site_name?: string;
  status: ExpenseStatus;
  payment_status: ExpensePaymentStatus;
  paid_amount: string;
  voucher?: string | null;
  voucher_number?: string;
  advance?: string | null;
  is_split_allocation: boolean;
  receipt_reference?: string;
  receipt_url?: string;
  notes?: string;
  rejection_reason?: string;
  reversal_reason?: string;
  created_by_name?: string;
  allocations?: ExpenseAllocationItem[];
  created_at?: string;
}

export interface EmployeeAdvanceItem {
  id: string;
  advance_number: string;
  employee: string;
  employee_name?: string;
  employee_code?: string;
  advance_type: EmployeeAdvanceType;
  amount: string;
  settled_amount: string;
  returned_amount: string;
  outstanding_balance: string;
  advance_date: string;
  expected_settlement_date?: string | null;
  recovery_method: AdvanceRecoveryMethod;
  purpose?: string;
  status: AdvanceStatus;
  bank_account?: string | null;
  bank_account_title?: string;
  voucher?: string | null;
  voucher_number?: string;
  payroll_deduction_ready: boolean;
  created_by_name?: string;
  approved_by_name?: string;
  rejection_reason?: string;
  created_at?: string;
}

export interface PettyCashSummaryAccount {
  id: string;
  account_title: string;
  account_number: string;
  operational_balance: number;
  float_limit: number;
  replenishment_threshold: number;
  needs_replenishment: boolean;
  custodian_name: string;
  recent_expenses_count: number;
  recent_expenses: Array<{
    id: string;
    expense_number: string;
    title: string;
    amount: number;
    date: string;
    payee: string;
  }>;
}

export interface ExpenseSummaryMetrics {
  total_spent: number;
  pending_approval: number;
  approved_unpaid: number;
  pending_claims_count: number;
  petty_cash_spent: number;
}

export async function fetchExpenseCategories(params?: Record<string, any>): Promise<ExpenseCategory[]> {
  const resp = await axios.get(`${API_BASE}/expense-categories/`, {
    ...getAuthHeaders(),
    params
  });
  return resp.data.results || resp.data;
}

export async function createExpenseCategory(data: Partial<ExpenseCategory>): Promise<ExpenseCategory> {
  const resp = await axios.post(`${API_BASE}/expense-categories/`, data, getAuthHeaders());
  return resp.data;
}

export async function fetchExpenses(params?: Record<string, any>): Promise<ExpenseItem[]> {
  const resp = await axios.get(`${API_BASE}/expenses/`, {
    ...getAuthHeaders(),
    params
  });
  return resp.data.results || resp.data;
}

export async function fetchExpenseById(id: string): Promise<ExpenseItem> {
  const resp = await axios.get(`${API_BASE}/expenses/${id}/`, getAuthHeaders());
  return resp.data;
}

export async function createExpense(data: Record<string, any>): Promise<ExpenseItem> {
  const resp = await axios.post(`${API_BASE}/expenses/`, data, getAuthHeaders());
  return resp.data;
}

export async function submitExpense(id: string): Promise<{ status: string; expense: ExpenseItem }> {
  const resp = await axios.post(`${API_BASE}/expenses/${id}/submit/`, {}, getAuthHeaders());
  return resp.data;
}

export async function approveExpense(id: string): Promise<{ status: string; expense: ExpenseItem }> {
  const resp = await axios.post(`${API_BASE}/expenses/${id}/approve/`, {}, getAuthHeaders());
  return resp.data;
}

export async function rejectExpense(id: string, rejection_reason: string): Promise<{ status: string; expense: ExpenseItem }> {
  const resp = await axios.post(`${API_BASE}/expenses/${id}/reject/`, { rejection_reason }, getAuthHeaders());
  return resp.data;
}

export async function payExpense(
  id: string,
  data: {
    bank_account: string;
    payment_method?: string;
    payment_date?: string;
    reference?: string;
  }
): Promise<{ status: string; voucher_id: string; voucher_number: string; expense: ExpenseItem }> {
  const resp = await axios.post(`${API_BASE}/expenses/${id}/pay_expense/`, data, getAuthHeaders());
  return resp.data;
}

export async function reverseExpense(id: string, reversal_reason: string): Promise<{ status: string; expense: ExpenseItem }> {
  const resp = await axios.post(`${API_BASE}/expenses/${id}/reverse_expense/`, { reversal_reason }, getAuthHeaders());
  return resp.data;
}

export async function cancelExpense(id: string): Promise<{ status: string; expense: ExpenseItem }> {
  const resp = await axios.post(`${API_BASE}/expenses/${id}/cancel_expense/`, {}, getAuthHeaders());
  return resp.data;
}

export async function setExpenseAllocations(
  id: string,
  allocations: ExpenseAllocationItem[]
): Promise<{ status: string; allocations: ExpenseAllocationItem[]; expense: ExpenseItem }> {
  const resp = await axios.post(`${API_BASE}/expenses/${id}/set_allocations/`, { allocations }, getAuthHeaders());
  return resp.data;
}

export async function fetchExpenseSummaryMetrics(): Promise<ExpenseSummaryMetrics> {
  const resp = await axios.get(`${API_BASE}/expenses/summary_metrics/`, getAuthHeaders());
  return resp.data;
}

export async function fetchEmployeeAdvances(params?: Record<string, any>): Promise<EmployeeAdvanceItem[]> {
  const resp = await axios.get(`${API_BASE}/employee-advances/`, {
    ...getAuthHeaders(),
    params
  });
  return resp.data.results || resp.data;
}

export async function createEmployeeAdvance(data: Record<string, any>): Promise<EmployeeAdvanceItem> {
  const resp = await axios.post(`${API_BASE}/employee-advances/`, data, getAuthHeaders());
  return resp.data;
}

export async function submitEmployeeAdvance(id: string): Promise<{ status: string; advance: EmployeeAdvanceItem }> {
  const resp = await axios.post(`${API_BASE}/employee-advances/${id}/submit/`, {}, getAuthHeaders());
  return resp.data;
}

export async function approveEmployeeAdvance(id: string): Promise<{ status: string; advance: EmployeeAdvanceItem }> {
  const resp = await axios.post(`${API_BASE}/employee-advances/${id}/approve/`, {}, getAuthHeaders());
  return resp.data;
}

export async function rejectEmployeeAdvance(id: string, rejection_reason: string): Promise<{ status: string; advance: EmployeeAdvanceItem }> {
  const resp = await axios.post(`${API_BASE}/employee-advances/${id}/reject/`, { rejection_reason }, getAuthHeaders());
  return resp.data;
}

export async function payEmployeeAdvance(
  id: string,
  data: {
    bank_account: string;
    payment_method?: string;
    payment_date?: string;
    reference?: string;
  }
): Promise<{ status: string; voucher_id: string; voucher_number: string; advance: EmployeeAdvanceItem }> {
  const resp = await axios.post(`${API_BASE}/employee-advances/${id}/pay_advance/`, data, getAuthHeaders());
  return resp.data;
}

export async function settleEmployeeAdvance(
  id: string,
  data: {
    expense_ids: string[];
    cash_returned?: number | string;
    cash_return_bank_account?: string;
  }
): Promise<{ status: string; summary: any }> {
  const resp = await axios.post(`${API_BASE}/employee-advances/${id}/settle/`, data, getAuthHeaders());
  return resp.data;
}

export async function recordAdvanceCashReturn(
  id: string,
  data: {
    return_amount: number | string;
    bank_account: string;
    reference?: string;
  }
): Promise<{ status: string; voucher_id: string; voucher_number: string; advance: EmployeeAdvanceItem }> {
  const resp = await axios.post(`${API_BASE}/employee-advances/${id}/record_cash_return/`, data, getAuthHeaders());
  return resp.data;
}

export async function fetchPettyCashSummary(): Promise<PettyCashSummaryAccount[]> {
  const resp = await axios.get(`${API_BASE}/petty-cash/summary/`, getAuthHeaders());
  return resp.data;
}

export async function fundPettyCash(data: {
  from_account: string;
  to_account: string;
  amount: string | number;
  date?: string;
  reference?: string;
}): Promise<{ status: string; voucher_id: string; voucher_number: string }> {
  const resp = await axios.post(`${API_BASE}/petty-cash/fund/`, data, getAuthHeaders());
  return resp.data;
}

export async function recordPettyCashExpense(data: {
  petty_cash_account: string;
  title: string;
  amount: string | number;
  category?: string;
  payee?: string;
  description?: string;
  cost_center?: string;
  site?: string;
  receipt_reference?: string;
}): Promise<{ status: string; expense: ExpenseItem }> {
  const resp = await axios.post(`${API_BASE}/petty-cash/record_expense/`, data, getAuthHeaders());
  return resp.data;
}

export async function configurePettyCashCustodian(data: {
  bank_account: string;
  custodian?: string;
  float_limit?: number | string;
  replenishment_threshold?: number | string;
  max_single_expense_limit?: number | string;
}): Promise<any> {
  const resp = await axios.post(`${API_BASE}/petty-cash/configure_custodian/`, data, getAuthHeaders());
  return resp.data;
}

export async function fetchEmployees(): Promise<any[]> {
  const resp = await axios.get('/api/hrm/employees/', getAuthHeaders());
  return resp.data.results || resp.data;
}

export async function fetchOperationalSites(): Promise<any[]> {
  const resp = await axios.get('/api/operations/sites/', getAuthHeaders());
  return resp.data.results || resp.data;
}

// ----------------------------------------------------------------------
// Phase S-4F: Purchasing -> Finance Accounting Integration
// ----------------------------------------------------------------------

export type PurchasingIntegrationSourceType =
  | 'VENDOR_BILL'
  | 'VENDOR_PAYMENT'
  | 'PURCHASE_RETURN'
  | 'VENDOR_CREDIT_NOTE';

export type PurchasingAccountingStatus =
  | 'PENDING_CLASSIFICATION'
  | 'READY'
  | 'BLOCKED'
  | 'POSTED_LATER'
  | 'REVERSED';

export interface PurchasingItemAccountMappingItem {
  id: string;
  item?: string | null;
  item_name?: string;
  item_sku?: string;
  item_category?: string | null;
  item_category_name?: string;
  expense_category?: string | null;
  expense_category_name?: string;
  account_classification: string;
  debit_account: string;
  debit_account_code?: string;
  debit_account_name?: string;
  is_active: boolean;
  notes?: string;
  created_at: string;
}

export interface PurchasingAccountingLinePreviewItem {
  id: string;
  line_number: number;
  source_line_id?: string;
  item_name?: string;
  description?: string;
  amount: string;
  debit_account?: string | null;
  debit_account_code?: string;
  debit_account_name?: string;
  credit_account?: string | null;
  credit_account_code?: string;
  credit_account_name?: string;
  cost_center?: string | null;
  cost_center_name?: string;
  profit_center?: string | null;
  profit_center_name?: string;
  site?: string | null;
  site_name?: string;
  contract?: string | null;
  department?: string | null;
  warehouse?: string | null;
  warehouse_name?: string;
  is_tax_line: boolean;
  is_unresolved: boolean;
  unresolved_reason?: string;
}

export interface PurchasingAccountingIntegrationItem {
  id: string;
  source_type: PurchasingIntegrationSourceType;
  source_id: string;
  source_number: string;
  transaction_date: string;
  status: PurchasingAccountingStatus;
  blocking_reason?: string;
  amount: string;
  currency: string;
  vendor?: string | null;
  vendor_name?: string;
  purchase_order_id?: string | null;
  purchase_order_number?: string;
  grn_id?: string | null;
  grn_number?: string;
  ap_control_account?: string | null;
  ap_control_account_code?: string;
  ap_control_account_name?: string;
  voucher?: string | null;
  voucher_number?: string;
  lines_count: number;
  unresolved_lines_count: number;
  lines?: PurchasingAccountingLinePreviewItem[];
  created_at: string;
  updated_at: string;
}

export interface PurchasingSummaryMetrics {
  total_bills_ready: number;
  total_bills_blocked: number;
  ready_amount: number;
  blocked_amount: number;
  payments_integrated: number;
  returns_integrated: number;
  unallocated_credits: number;
}

export async function fetchPurchasingIntegrations(params?: {
  source_type?: string;
  status?: string;
  search?: string;
}): Promise<PurchasingAccountingIntegrationItem[]> {
  const resp = await axios.get(`${API_BASE}/purchasing-integrations/`, {
    ...getAuthHeaders(),
    params,
  });
  return resp.data.results || resp.data;
}

export async function fetchPurchasingSummaryMetrics(): Promise<PurchasingSummaryMetrics> {
  const resp = await axios.get(`${API_BASE}/purchasing-integrations/summary_metrics/`, getAuthHeaders());
  return resp.data;
}

export async function syncPurchasingIntegrations(): Promise<{
  status: string;
  vendor_bills_synced: number;
  vendor_payments_synced: number;
  purchase_returns_synced: number;
  credit_notes_synced: number;
  total_synced: number;
}> {
  const resp = await axios.post(`${API_BASE}/purchasing-integrations/sync_all/`, {}, getAuthHeaders());
  return resp.data;
}

export async function previewPurchasingAccounting(
  sourceType: string,
  sourceId: string
): Promise<{
  exists: boolean;
  status?: string;
  blocking_reason?: string;
  source_number?: string;
  total_debits?: number;
  total_credits?: number;
  is_balanced?: boolean;
  lines?: PurchasingAccountingLinePreviewItem[];
  error?: string;
}> {
  const resp = await axios.get(`${API_BASE}/purchasing-integrations/preview/`, {
    ...getAuthHeaders(),
    params: { source_type: sourceType, source_id: sourceId },
  });
  return resp.data;
}

export async function reclassifyIntegrationLine(
  lineId: string,
  data: {
    debit_account_id?: string;
    credit_account_id?: string;
    cost_center_id?: string;
    profit_center_id?: string;
  }
): Promise<{ status: string; line: PurchasingAccountingLinePreviewItem; integration_status: string }> {
  const resp = await axios.post(`${API_BASE}/purchasing-integrations/reclassify_line/`, {
    line_id: lineId,
    ...data,
  }, getAuthHeaders());
  return resp.data;
}

export async function refreshPurchasingIntegration(
  integrationId: string
): Promise<{ status: string; integration: PurchasingAccountingIntegrationItem }> {
  const resp = await axios.post(`${API_BASE}/purchasing-integrations/refresh_integration/`, {
    integration_id: integrationId,
  }, getAuthHeaders());
  return resp.data;
}

export async function fetchPurchasingMappings(): Promise<PurchasingItemAccountMappingItem[]> {
  const resp = await axios.get(`${API_BASE}/purchasing-mappings/`, getAuthHeaders());
  return resp.data.results || resp.data;
}

export async function createPurchasingMapping(
  data: Partial<PurchasingItemAccountMappingItem>
): Promise<PurchasingItemAccountMappingItem> {
  const resp = await axios.post(`${API_BASE}/purchasing-mappings/`, data, getAuthHeaders());
  return resp.data;
}

export async function updatePurchasingMapping(
  id: string,
  data: Partial<PurchasingItemAccountMappingItem>
): Promise<PurchasingItemAccountMappingItem> {
  const resp = await axios.patch(`${API_BASE}/purchasing-mappings/${id}/`, data, getAuthHeaders());
  return resp.data;
}

export async function deletePurchasingMapping(id: string): Promise<void> {
  await axios.delete(`${API_BASE}/purchasing-mappings/${id}/`, getAuthHeaders());
}

export async function fetchInventoryCategories(): Promise<any[]> {
  const resp = await axios.get('/api/inventory/categories/', getAuthHeaders());
  return resp.data.results || resp.data;
}

export async function fetchInventoryItems(): Promise<any[]> {
  const resp = await axios.get('/api/inventory/items/', getAuthHeaders());
  return resp.data.results || resp.data;
}

// ============================================================================
// PHASE S-4G: PAYROLL -> FINANCE INTEGRATION & SALARY DISBURSEMENT
// ============================================================================

export type PayrollAccountingStatus =
  | 'PENDING_CLASSIFICATION'
  | 'READY'
  | 'BLOCKED'
  | 'PARTIALLY_DISBURSED'
  | 'SETTLED'
  | 'CANCELLED';

export type PayrollEmployeePaymentStatus =
  | 'UNPAID'
  | 'IN_BATCH'
  | 'PAID'
  | 'FAILED'
  | 'REVERSED';

export type SalaryPaymentBatchStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'READY_FOR_PAYMENT'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'PARTIALLY_COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'REVERSED';

export type SalaryPaymentLineStatus =
  | 'PENDING'
  | 'VALIDATED'
  | 'PROCESSING'
  | 'SUCCESS'
  | 'FAILED'
  | 'SKIPPED'
  | 'REVERSED';

export interface PayrollEmployeeFinanceSnapshotItem {
  id: string;
  employee: string;
  employee_name?: string;
  employee_code?: string;
  payslip: string;
  payslip_number?: string;
  gross_earnings: string;
  allowances: string;
  overtime_pay: string;
  deductions: string;
  advance_recovery: string;
  tax_amount: string;
  net_salary: string;
  salary_expense_account?: string | null;
  salary_expense_account_code?: string;
  salary_expense_account_name?: string;
  overtime_expense_account?: string | null;
  overtime_expense_account_code?: string;
  overtime_expense_account_name?: string;
  cost_center?: string | null;
  cost_center_name?: string;
  department?: string | null;
  department_name?: string;
  site?: string | null;
  site_name?: string;
  payment_status: PayrollEmployeePaymentStatus;
  is_unresolved: boolean;
  unresolved_reason?: string;
}

export interface PayrollAccountingIntegrationItem {
  id: string;
  payroll_run: string;
  payroll_run_number?: string;
  payroll_period_name: string;
  transaction_date: string;
  gross_payroll: string;
  total_allowances: string;
  total_overtime: string;
  total_deductions: string;
  total_tax: string;
  total_advance_recovery: string;
  net_payroll_payable: string;
  total_paid: string;
  remaining_liability: string;
  status: PayrollAccountingStatus;
  blocking_reason?: string;
  payroll_payable_account?: string | null;
  payroll_payable_account_code?: string;
  payroll_payable_account_name?: string;
  tax_payable_account?: string | null;
  advance_clearing_account?: string | null;
  total_employees: number;
  unresolved_employees_count: number;
  employee_snapshots?: PayrollEmployeeFinanceSnapshotItem[];
}

export interface SalaryPaymentBatchLineItem {
  id: string;
  batch: string;
  employee: string;
  employee_name?: string;
  employee_code?: string;
  payslip: string;
  payslip_number?: string;
  employee_snapshot: string;
  net_salary: string;
  payment_method: string;
  destination_details: Record<string, any>;
  payment_reference: string;
  status: SalaryPaymentLineStatus;
  failure_code: string;
  failure_reason: string;
  processed_at?: string | null;
  reversed_at?: string | null;
  reversed_by_name?: string | null;
  reversal_reason?: string;
}

export interface SalaryPaymentBatchItem {
  id: string;
  batch_number: string;
  payroll_integration: string;
  payroll_run_number?: string;
  payroll_period_name?: string;
  payment_date: string;
  payment_mode: 'MANUAL' | 'BANK_FILE' | 'API' | 'HOST_TO_HOST';
  payment_provider: 'MANUAL' | 'HBL' | 'JS_BANK' | 'DUBAI_ISLAMIC_BANK' | 'EASYPAISA' | 'JAZZCASH' | 'OTHER';
  treasury_account: string;
  treasury_account_title?: string;
  treasury_account_type?: string;
  voucher?: string | null;
  voucher_number?: string;
  total_employees: number;
  total_amount: string;
  successful_amount: string;
  failed_amount: string;
  status: SalaryPaymentBatchStatus;
  prepared_by_name?: string;
  approved_by_name?: string;
  completed_at?: string | null;
  reference: string;
  notes: string;
  lines?: SalaryPaymentBatchLineItem[];
}

export interface PayrollAccountMappingItem {
  id: string;
  employee?: string | null;
  employee_name?: string;
  employee_code?: string;
  designation?: string | null;
  designation_name?: string;
  department?: string | null;
  department_name?: string;
  employment_type?: string;
  classification_type: 'COST_OF_SERVICE' | 'OPERATING_EXPENSE' | 'DIRECT_COST';
  salary_expense_account: string;
  salary_expense_account_code?: string;
  salary_expense_account_name?: string;
  overtime_expense_account?: string | null;
  overtime_expense_account_code?: string;
  overtime_expense_account_name?: string;
  cost_center?: string | null;
  cost_center_name?: string;
  profit_center?: string | null;
  profit_center_name?: string;
  is_active: boolean;
  notes: string;
}

export interface EmployeePaymentDestinationItem {
  id: string;
  employee: string;
  employee_name?: string;
  employee_code?: string;
  payment_method: 'BANK_TRANSFER' | 'WALLET' | 'CASH' | 'CHEQUE';
  bank_name: string;
  account_title: string;
  account_number: string;
  iban: string;
  wallet_provider?: 'EASYPAISA' | 'JAZZCASH' | 'NAYAPAY' | 'SADAPAY' | 'OTHER' | '';
  wallet_number: string;
  is_preferred: boolean;
  is_active: boolean;
}

export interface PayrollAccountingPreviewItem {
  exists: boolean;
  error?: string;
  payroll_run_number?: string;
  payroll_period?: string;
  status?: string;
  blocking_reason?: string;
  total_debits: number;
  total_credits: number;
  is_balanced: boolean;
  lines: Array<{
    line_number: number;
    type: 'DEBIT' | 'CREDIT';
    description: string;
    amount: number;
    account_id?: string;
    account_code: string;
    account_name: string;
    cost_center_name?: string;
  }>;
}

export interface PayrollFinanceSummaryMetrics {
  total_payroll_runs: number;
  total_net_payable: number;
  total_salary_paid: number;
  outstanding_payroll_liability: number;
  active_batches: number;
  completed_batches: number;
}

export async function fetchPayrollFinanceSummaryMetrics(): Promise<PayrollFinanceSummaryMetrics> {
  const resp = await axios.get(`${API_BASE}/payroll-integrations/summary_metrics/`, getAuthHeaders());
  return resp.data;
}

export async function fetchPayrollIntegrations(params?: any): Promise<PayrollAccountingIntegrationItem[]> {
  const resp = await axios.get(`${API_BASE}/payroll-integrations/`, { ...getAuthHeaders(), params });
  return resp.data.results || resp.data;
}

export async function syncPayrollRun(payrollRunId?: string): Promise<any> {
  const resp = await axios.post(`${API_BASE}/payroll-integrations/sync_from_payroll_run/`, {
    payroll_run_id: payrollRunId,
  }, getAuthHeaders());
  return resp.data;
}

export async function fetchPayrollIntegrationPreview(integrationId: string): Promise<PayrollAccountingPreviewItem> {
  const resp = await axios.get(`${API_BASE}/payroll-integrations/${integrationId}/preview/`, getAuthHeaders());
  return resp.data;
}

export async function refreshPayrollIntegration(integrationId: string): Promise<PayrollAccountingIntegrationItem> {
  const resp = await axios.post(`${API_BASE}/payroll-integrations/${integrationId}/refresh/`, {}, getAuthHeaders());
  return resp.data;
}

export async function fetchSalaryBatches(params?: any): Promise<SalaryPaymentBatchItem[]> {
  const resp = await axios.get(`${API_BASE}/salary-payment-batches/`, { ...getAuthHeaders(), params });
  return resp.data.results || resp.data;
}

export async function createSalaryBatch(data: {
  payroll_integration: string;
  treasury_account: string;
  payment_date?: string;
  payment_mode?: string;
  payment_provider?: string;
  selected_snapshot_ids?: string[];
  notes?: string;
}): Promise<SalaryPaymentBatchItem> {
  const resp = await axios.post(`${API_BASE}/salary-payment-batches/create_batch/`, data, getAuthHeaders());
  return resp.data;
}

export async function validateSalaryBatch(batchId: string): Promise<any> {
  const resp = await axios.post(`${API_BASE}/salary-payment-batches/${batchId}/validate_batch/`, {}, getAuthHeaders());
  return resp.data;
}

export async function approveSalaryBatch(batchId: string): Promise<SalaryPaymentBatchItem> {
  const resp = await axios.post(`${API_BASE}/salary-payment-batches/${batchId}/approve/`, {}, getAuthHeaders());
  return resp.data;
}

export async function exportSalaryBatchFile(batchId: string, adapter: string = 'GENERIC_CSV'): Promise<Blob> {
  const resp = await axios.get(`${API_BASE}/salary-payment-batches/${batchId}/export_file/`, {
    ...getAuthHeaders(),
    params: { adapter },
    responseType: 'blob'
  });
  return resp.data;
}

export async function confirmSalaryBatchPayments(batchId: string, lineResults: Array<{
  line_id: string;
  status: 'SUCCESS' | 'FAILED';
  payment_reference?: string;
  failure_code?: string;
  failure_reason?: string;
}>): Promise<SalaryPaymentBatchItem> {
  const resp = await axios.post(`${API_BASE}/salary-payment-batches/${batchId}/confirm_payments/`, {
    line_results: lineResults,
  }, getAuthHeaders());
  return resp.data;
}

export async function reverseSalaryBatchLine(batchId: string, lineId: string, reason: string): Promise<SalaryPaymentBatchItem> {
  const resp = await axios.post(`${API_BASE}/salary-payment-batches/${batchId}/reverse_line/`, {
    line_id: lineId,
    reason,
  }, getAuthHeaders());
  return resp.data;
}

export async function fetchPayrollMappings(): Promise<PayrollAccountMappingItem[]> {
  const resp = await axios.get(`${API_BASE}/payroll-account-mappings/`, getAuthHeaders());
  return resp.data.results || resp.data;
}

export async function createPayrollMapping(data: Partial<PayrollAccountMappingItem>): Promise<PayrollAccountMappingItem> {
  const resp = await axios.post(`${API_BASE}/payroll-account-mappings/`, data, getAuthHeaders());
  return resp.data;
}

export async function updatePayrollMapping(id: string, data: Partial<PayrollAccountMappingItem>): Promise<PayrollAccountMappingItem> {
  const resp = await axios.patch(`${API_BASE}/payroll-account-mappings/${id}/`, data, getAuthHeaders());
  return resp.data;
}

export async function deletePayrollMapping(id: string): Promise<void> {
  await axios.delete(`${API_BASE}/payroll-account-mappings/${id}/`, getAuthHeaders());
}

export async function fetchEmployeeDestinations(employeeId?: string): Promise<EmployeePaymentDestinationItem[]> {
  const resp = await axios.get(`${API_BASE}/employee-payment-destinations/`, {
    ...getAuthHeaders(),
    params: employeeId ? { employee: employeeId } : {}
  });
  return resp.data.results || resp.data;
}

export async function createEmployeeDestination(data: Partial<EmployeePaymentDestinationItem>): Promise<EmployeePaymentDestinationItem> {
  const resp = await axios.post(`${API_BASE}/employee-payment-destinations/`, data, getAuthHeaders());
  return resp.data;
}

export async function updateEmployeeDestination(id: string, data: Partial<EmployeePaymentDestinationItem>): Promise<EmployeePaymentDestinationItem> {
  const resp = await axios.patch(`${API_BASE}/employee-payment-destinations/${id}/`, data, getAuthHeaders());
  return resp.data;
}


// ============================================================================
// PHASE S-4H: TAX MANAGEMENT, TAX INVOICES, WITHHOLDING & TAX VOUCHERS
// ============================================================================

export type TaxCategoryType = 'OUTPUT_TAX' | 'INPUT_TAX' | 'WITHHOLDING_RECEIVABLE' | 'WITHHOLDING_PAYABLE' | 'PAYROLL_TAX' | 'OTHER_TAX';
export type TaxRecoverabilityType = 'RECOVERABLE' | 'NON_RECOVERABLE' | 'PARTIALLY_RECOVERABLE';
export type TaxDirectionType = 'OUTPUT' | 'INPUT' | 'WITHHOLDING_IN' | 'WITHHOLDING_OUT';
export type TaxTransactionStatusType = 'CALCULATED' | 'POSTED_SOURCE' | 'PAYABLE' | 'PAID' | 'FILED' | 'CANCELLED' | 'REVERSED';
export type TaxPeriodStatusType = 'OPEN' | 'FILED' | 'CLOSED';
export type TaxVoucherStatusType = 'DRAFT' | 'APPROVED' | 'PAID' | 'FILED' | 'CANCELLED';
export type TaxPaymentTypeEnum = 'SALES_TAX' | 'WITHHOLDING_TAX' | 'PAYROLL_TAX' | 'INCOME_TAX' | 'OTHER';
export type WithholdingVerificationStatusType = 'PENDING_VERIFICATION' | 'VERIFIED' | 'REJECTED' | 'EXPIRED';
export type VendorWithholdingStatusType = 'DEDUCTED' | 'DEPOSITED' | 'CERTIFICATE_ISSUED' | 'CANCELLED';

export interface TaxAuthorityItem {
  id: string;
  name: string;
  code: string;
  jurisdiction: string;
  registration_number: string;
  portal_reference: string;
  description: string;
  is_active: boolean;
  created_at: string;
}

export interface CompanyTaxProfileItem {
  id: string;
  ntn_number: string;
  strn_number: string;
  tax_status: string;
  default_jurisdiction: string;
  default_sales_tax_code?: string | null;
  default_sales_tax_code_title?: string;
  default_purchase_tax_code?: string | null;
  default_purchase_tax_code_title?: string;
  default_client_wht_code?: string | null;
  default_client_wht_code_title?: string;
  default_vendor_wht_code?: string | null;
  default_vendor_wht_code_title?: string;
  is_active: boolean;
}

export interface TaxPeriodItem {
  id: string;
  name: string;
  period_type: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'CUSTOM';
  period_start: string;
  period_end: string;
  tax_authority?: string | null;
  tax_authority_name?: string;
  tax_category: TaxCategoryType;
  due_date?: string | null;
  status: TaxPeriodStatusType;
  filed_at?: string | null;
  filed_by_name?: string | null;
  acknowledgement_reference: string;
  notes: string;
  created_at: string;
}

export interface TaxTransactionItem {
  id: string;
  tax_code: string;
  tax_code_code?: string;
  tax_code_name?: string;
  tax_category: TaxCategoryType;
  source_type: string;
  source_id: string;
  source_number: string;
  tax_date: string;
  tax_period?: string | null;
  tax_period_name?: string;
  counterparty_name: string;
  counterparty_tax_id: string;
  taxable_amount: string;
  tax_rate: string;
  tax_amount: string;
  is_recoverable: boolean;
  direction: TaxDirectionType;
  gl_account?: string | null;
  gl_account_code?: string;
  gl_account_name?: string;
  status: TaxTransactionStatusType;
  notes: string;
  created_at: string;
}

export interface ClientWithholdingCertificateItem {
  id: string;
  certificate_number: string;
  client: string;
  client_name?: string;
  client_invoice?: string | null;
  invoice_number?: string;
  tax_code: string;
  tax_code_name?: string;
  tax_period?: string | null;
  withheld_amount: string;
  gross_taxable_amount: string;
  certificate_date: string;
  cpr_challan_no: string;
  verification_status: WithholdingVerificationStatusType;
  verified_by_name?: string | null;
  verified_at?: string | null;
  attachment?: string | null;
  notes: string;
  created_at: string;
}

export interface VendorWithholdingRecordItem {
  id: string;
  vendor: string;
  vendor_name?: string;
  vendor_bill?: string | null;
  vendor_bill_number?: string;
  tax_code: string;
  tax_code_name?: string;
  tax_period?: string | null;
  taxable_amount: string;
  tax_rate: string;
  withheld_amount: string;
  withheld_date: string;
  status: VendorWithholdingStatusType;
  cpr_number: string;
  challan_reference: string;
  certificate_issued_date?: string | null;
  certificate_number: string;
  notes: string;
  created_at: string;
}

export interface TaxPaymentVoucherItem {
  id: string;
  voucher_number: string;
  tax_period?: string | null;
  tax_type: TaxPaymentTypeEnum;
  tax_authority: string;
  tax_authority_name?: string;
  amount: string;
  payment_date: string;
  treasury_account: string;
  treasury_account_title?: string;
  voucher?: string | null;
  voucher_reference?: string;
  psid_number: string;
  challan_number: string;
  cpr_number: string;
  status: TaxVoucherStatusType;
  prepared_by_name?: string | null;
  approved_by_name?: string | null;
  paid_at?: string | null;
  filed_at?: string | null;
  notes: string;
  attachment?: string | null;
  created_at: string;
}

export interface TaxAdjustmentItem {
  id: string;
  adjustment_number: string;
  tax_code: string;
  tax_code_name?: string;
  tax_period?: string | null;
  adjustment_type: string;
  amount: string;
  tax_date: string;
  reason: string;
  created_by_name?: string | null;
  approved_by_name?: string | null;
  status: string;
  created_at: string;
}

export interface TaxSummaryMetrics {
  total_output_tax: number;
  total_input_recoverable_tax: number;
  net_tax_payable: number;
  net_tax_credit: number;
  total_withholding_payable: number;
  total_withholding_receivable: number;
  total_payroll_tax: number;
  total_tax_paid: number;
  total_tax_outstanding: number;
  active_tax_codes_count: number;
  open_periods_count: number;
}

export async function fetchTaxSummaryMetrics(): Promise<TaxSummaryMetrics> {
  const resp = await axios.get(`${API_BASE}/tax-transactions/summary_metrics/`, getAuthHeaders());
  return resp.data;
}

export async function syncAllTaxSources(): Promise<{ status: string; counts: Record<string, number>; summary: TaxSummaryMetrics }> {
  const resp = await axios.post(`${API_BASE}/tax-transactions/sync_all_sources/`, {}, getAuthHeaders());
  return resp.data;
}

export async function fetchTaxTransactions(params?: Record<string, any>): Promise<TaxTransactionItem[]> {
  const resp = await axios.get(`${API_BASE}/tax-transactions/`, { ...getAuthHeaders(), params });
  return resp.data.results || resp.data;
}

export async function fetchTaxAuthorities(): Promise<TaxAuthorityItem[]> {
  const resp = await axios.get(`${API_BASE}/tax-authorities/`, getAuthHeaders());
  return resp.data.results || resp.data;
}

export async function createTaxAuthority(data: Partial<TaxAuthorityItem>): Promise<TaxAuthorityItem> {
  const resp = await axios.post(`${API_BASE}/tax-authorities/`, data, getAuthHeaders());
  return resp.data;
}

export async function fetchCompanyTaxProfile(): Promise<CompanyTaxProfileItem> {
  const resp = await axios.get(`${API_BASE}/company-tax-profile/current/`, getAuthHeaders());
  return resp.data;
}

export async function updateCompanyTaxProfile(id: string, data: Partial<CompanyTaxProfileItem>): Promise<CompanyTaxProfileItem> {
  const resp = await axios.patch(`${API_BASE}/company-tax-profile/${id}/`, data, getAuthHeaders());
  return resp.data;
}

export async function fetchTaxPeriods(params?: Record<string, any>): Promise<TaxPeriodItem[]> {
  const resp = await axios.get(`${API_BASE}/tax-periods/`, { ...getAuthHeaders(), params });
  return resp.data.results || resp.data;
}

export async function createTaxPeriod(data: Partial<TaxPeriodItem>): Promise<TaxPeriodItem> {
  const resp = await axios.post(`${API_BASE}/tax-periods/`, data, getAuthHeaders());
  return resp.data;
}

export async function fetchClientWithholdingCertificates(params?: Record<string, any>): Promise<ClientWithholdingCertificateItem[]> {
  const resp = await axios.get(`${API_BASE}/client-withholding-certificates/`, { ...getAuthHeaders(), params });
  return resp.data.results || resp.data;
}

export async function createClientWithholdingCertificate(data: Partial<ClientWithholdingCertificateItem>): Promise<ClientWithholdingCertificateItem> {
  const resp = await axios.post(`${API_BASE}/client-withholding-certificates/`, data, getAuthHeaders());
  return resp.data;
}

export async function verifyClientWithholdingCertificate(id: string, verification_status: WithholdingVerificationStatusType = 'VERIFIED'): Promise<ClientWithholdingCertificateItem> {
  const resp = await axios.post(`${API_BASE}/client-withholding-certificates/${id}/verify_certificate/`, { verification_status }, getAuthHeaders());
  return resp.data;
}

export async function fetchVendorWithholdingRecords(params?: Record<string, any>): Promise<VendorWithholdingRecordItem[]> {
  const resp = await axios.get(`${API_BASE}/vendor-withholding-records/`, { ...getAuthHeaders(), params });
  return resp.data.results || resp.data;
}

export async function fetchTaxPaymentVouchers(params?: Record<string, any>): Promise<TaxPaymentVoucherItem[]> {
  const resp = await axios.get(`${API_BASE}/tax-payment-vouchers/`, { ...getAuthHeaders(), params });
  return resp.data.results || resp.data;
}

export async function createTaxPaymentVoucher(data: {
  tax_authority: string;
  treasury_account: string;
  amount: number | string;
  payment_date: string;
  tax_type?: TaxPaymentTypeEnum;
  tax_period?: string | null;
  psid_number?: string;
  challan_number?: string;
  notes?: string;
}): Promise<TaxPaymentVoucherItem> {
  const resp = await axios.post(`${API_BASE}/tax-payment-vouchers/create_voucher/`, data, getAuthHeaders());
  return resp.data;
}

export async function approveTaxPaymentVoucher(id: string): Promise<TaxPaymentVoucherItem> {
  const resp = await axios.post(`${API_BASE}/tax-payment-vouchers/${id}/approve/`, {}, getAuthHeaders());
  return resp.data;
}

export async function payTaxPaymentVoucher(id: string, cpr_number?: string): Promise<TaxPaymentVoucherItem> {
  const resp = await axios.post(`${API_BASE}/tax-payment-vouchers/${id}/pay/`, { cpr_number: cpr_number || '' }, getAuthHeaders());
  return resp.data;
}

export async function fileTaxPaymentVoucher(id: string, cpr_number?: string): Promise<TaxPaymentVoucherItem> {
  const resp = await axios.post(`${API_BASE}/tax-payment-vouchers/${id}/mark_filed/`, { cpr_number: cpr_number || '' }, getAuthHeaders());
  return resp.data;
}

export async function fetchTaxAdjustments(): Promise<TaxAdjustmentItem[]> {
  const resp = await axios.get(`${API_BASE}/tax-adjustments/`, getAuthHeaders());
  return resp.data.results || resp.data;
}

export async function createTaxAdjustment(data: {
  tax_code: string;
  adjustment_type: string;
  amount: number | string;
  reason: string;
  tax_date?: string;
  tax_period?: string | null;
}): Promise<TaxAdjustmentItem> {
  const resp = await axios.post(`${API_BASE}/tax-adjustments/create_adjustment/`, data, getAuthHeaders());
  return resp.data;
}

export interface TaxCode {
  id: string;
  code: string;
  name: string;
  rate: string | number;
  tax_category?: TaxCategoryType;
  recoverability?: TaxRecoverabilityType;
  jurisdiction?: string;
  effective_from?: string;
  effective_to?: string | null;
  is_withholding?: boolean;
  output_tax_account?: string | null;
  input_tax_account?: string | null;
  withholding_payable_account?: string | null;
  withholding_receivable_account?: string | null;
  is_active: boolean;
  description?: string;
}

export type TaxCodeItem = TaxCode;
export type BankAccountItem = BankAccount;
export type COAItem = ChartOfAccount;

export async function fetchTaxCodes(params?: Record<string, any>): Promise<TaxCodeItem[]> {
  const resp = await axios.get(`${API_BASE}/tax-codes/`, { ...getAuthHeaders(), params });
  return resp.data.results || resp.data;
}

// =====================================================================
// GENERAL LEDGER — Phase S-4I API Methods
// =====================================================================

export interface GLLine {
  id: string;
  entry_number: string;
  posting_date: string;
  description: string;
  source_type: string;
  source_number: string;
  debit: string;
  credit: string;
  running_balance: string;
}

export interface AccountLedgerReport {
  account: {
    id: string;
    account_code: string;
    account_name: string;
    account_type: string;
    normal_balance: string;
  };
  period: { start: string; end: string };
  opening_balance: number;
  period_debit: number;
  period_credit: number;
  closing_balance: number;
  lines: GLLine[];
}

export interface TrialBalanceRow {
  account_id: string;
  account_code: string;
  account_name: string;
  account_type: string;
  opening_debit: number;
  opening_credit: number;
  period_debit: number;
  period_credit: number;
  closing_debit: number;
  closing_credit: number;
}

export interface TrialBalanceReport {
  period: { start: string | null; end: string | null };
  rows: TrialBalanceRow[];
  totals: {
    opening_debit: number;
    opening_credit: number;
    period_debit: number;
    period_credit: number;
    closing_debit: number;
    closing_credit: number;
  };
  is_balanced: boolean;
  generated_at: string;
}

export interface SubledgerReconciliation {
  module: string;
  control_account_code: string;
  control_account_name: string;
  gl_balance: number;
  subledger_balance: number;
  difference: number;
  is_reconciled: boolean;
  status: 'BALANCED' | 'VARIANCE';
}

export interface PostingQueueItem {
  id: string;
  source_type: string;
  source_number: string;
  transaction_date: string;
  counterparty: string;
  amount: number;
  description: string;
  is_posted: boolean;
  status: 'READY_TO_POST' | 'POSTED';
}

export interface JournalEntry {
  id: string;
  entry_number: string;
  journal: string;
  journal_type?: string;
  status: string;
  entry_date: string;
  posting_date: string;
  document_date?: string;
  reference: string;
  description: string;
  source_type?: string;
  source_number?: string;
  is_manual: boolean;
  lines: JournalEntryLine[];
  reversal_of?: string | null;
  reversed_by?: string | null;
}

export interface JournalEntryLine {
  id: string;
  account: string;
  account_code?: string;
  account_name?: string;
  description: string;
  debit: string;
  credit: string;
  base_amount?: string;
  cost_center?: string | null;
  profit_center?: string | null;
}

const GL_BASE = getApiBaseUrl() + '/api/finance/general-ledger';

export async function fetchAccountLedger(params: {
  account_id: string;
  start_date?: string;
  end_date?: string;
  cost_center_id?: string;
  profit_center_id?: string;
  source_type?: string;
}): Promise<AccountLedgerReport> {
  const resp = await axios.get(`${GL_BASE}/account_ledger/`, { ...getAuthHeaders(), params });
  return resp.data;
}

export async function fetchTrialBalance(params?: {
  start_date?: string;
  end_date?: string;
  as_of_date?: string;
  cost_center_id?: string;
  profit_center_id?: string;
}): Promise<TrialBalanceReport> {
  const resp = await axios.get(`${GL_BASE}/trial_balance/`, { ...getAuthHeaders(), params });
  return resp.data;
}

export async function fetchSubledgerReconciliations(): Promise<{ as_of_date: string; reconciliations: SubledgerReconciliation[] }> {
  const resp = await axios.get(`${GL_BASE}/subledger_reconciliations/`, getAuthHeaders());
  return resp.data;
}

export async function fetchPostingQueue(params?: {
  filter_status?: 'READY_TO_POST' | 'POSTED' | 'ALL';
  source_type?: string;
}): Promise<{ queue: PostingQueueItem[]; total_count: number }> {
  const resp = await axios.get(`${GL_BASE}/posting_queue/`, { ...getAuthHeaders(), params });
  return resp.data;
}

export async function postQueueItem(source_type: string, source_id: string): Promise<{ status: string; journal_entry: JournalEntry }> {
  const resp = await axios.post(`${GL_BASE}/post_queue_item/`, { source_type, source_id }, getAuthHeaders());
  return resp.data;
}

export async function postAllReady(): Promise<{ total_processed: number; total_errors: number; results: any[]; errors: any[] }> {
  const resp = await axios.post(`${GL_BASE}/post_all_ready/`, {}, getAuthHeaders());
  return resp.data;
}

export interface ManualJournalLine {
  account_id: string;
  debit?: number | string;
  credit?: number | string;
  description?: string;
  cost_center_id?: string;
  profit_center_id?: string;
}

export async function createManualJournal(data: {
  posting_date: string;
  document_date?: string;
  reference?: string;
  description: string;
  lines: ManualJournalLine[];
  journal_id?: string;
}): Promise<JournalEntry> {
  const resp = await axios.post(`${GL_BASE}/create_manual_journal/`, data, getAuthHeaders());
  return resp.data;
}

export async function reverseJournalEntry(entry_id: string, reversal_date: string, reason: string): Promise<{ status: string; reversal_entry: JournalEntry }> {
  const resp = await axios.post(`${API_BASE}/journal-entries/${entry_id}/reverse/`, { reversal_date, reason }, getAuthHeaders());
  return resp.data;
}

export async function fetchJournalEntries(params?: Record<string, any>): Promise<JournalEntry[]> {
  const resp = await axios.get(`${API_BASE}/journal-entries/`, { ...getAuthHeaders(), params });
  return resp.data.results || resp.data;
}

export async function fetchJournalEntryDetail(id: string): Promise<JournalEntry> {
  const resp = await axios.get(`${API_BASE}/journal-entries/${id}/`, getAuthHeaders());
  return resp.data;
}

// =====================================================================
// FINANCIAL STATEMENTS & PROFITABILITY — Phase S-4J API Methods
// =====================================================================

export const FS_BASE = `${API_BASE}/financial-statements`;
export const PROFITABILITY_BASE = `${API_BASE}/profitability`;

export interface ProfitAndLossReport {
  period: { start_date: string | null; end_date: string | null };
  totals: {
    total_revenue: number;
    total_cost_of_service: number;
    gross_profit: number;
    gross_margin_pct: number;
    total_operating_expenses: number;
    operating_profit: number;
    total_other_income: number;
    total_other_expenses: number;
    net_profit: number;
    net_margin_pct: number;
  };
  security_revenue_breakdown: {
    guarding_revenue: number;
    overtime_revenue: number;
    extra_duty_revenue: number;
    vip_escort_revenue: number;
    equipment_rental_revenue: number;
    other_service_revenue: number;
  };
  cost_of_service_breakdown: {
    guard_salaries: number;
    supervisor_salaries: number;
    employee_ot: number;
    uniform_gear: number;
    site_transport: number;
    operational_equipment: number;
    other_direct_costs: number;
  };
  lines: {
    revenue: Array<{ account_id: string; account_code: string; account_name: string; amount: number }>;
    cost_of_service: Array<{ account_id: string; account_code: string; account_name: string; amount: number }>;
    operating_expenses: Array<{ account_id: string; account_code: string; account_name: string; amount: number }>;
    other_income: Array<{ account_id: string; account_code: string; account_name: string; amount: number }>;
    other_expenses: Array<{ account_id: string; account_code: string; account_name: string; amount: number }>;
  };
  has_unposted_items: boolean;
  unposted_warning: string;
}

export interface BalanceSheetReport {
  as_of_date: string;
  is_balanced: boolean;
  balance_difference: number;
  is_management_view: boolean;
  management_notice: string;
  assets: {
    total_assets: number;
    cash_and_bank: { total: number; lines: any[] };
    accounts_receivable: { total: number; lines: any[] };
    employee_advances: { total: number; lines: any[] };
    tax_recoverable: { total: number; lines: any[] };
    inventory: { total: number; lines: any[] };
    other_assets: { total: number; lines: any[] };
  };
  liabilities: {
    total_liabilities: number;
    accounts_payable: { total: number; lines: any[] };
    payroll_payable: { total: number; lines: any[] };
    tax_payable: { total: number; lines: any[] };
    other_liabilities: { total: number; lines: any[] };
  };
  equity: {
    total_equity: number;
    capital: { total: number; lines: any[] };
    retained_earnings: { total: number; lines: any[] };
    current_period_profit: number;
  };
  totals: {
    total_assets: number;
    total_liabilities: number;
    total_equity: number;
    total_liabilities_and_equity: number;
  };
}

export interface CashFlowReport {
  period: { start_date: string | null; end_date: string };
  opening_cash: number;
  operating_activities: { total: number; lines: any[] };
  investing_activities: { total: number; lines: any[] };
  financing_activities: { total: number; lines: any[] };
  net_cash_movement: number;
  closing_cash: number;
  actual_closing_cash: number;
  is_reconciled: boolean;
}

export interface StatementValidationReport {
  as_of_date: string;
  all_valid: boolean;
  checks: Array<{ name: string; passed: boolean; details: string }>;
}

export interface ClientProfitabilityRow {
  client_id: string;
  client_name: string;
  revenue: number;
  direct_costs: number;
  allocated_overhead: number;
  direct_profit: number;
  net_profit: number;
  margin_pct: number;
  management_status: 'PROFITABLE' | 'LOW_MARGIN' | 'LOSS_MAKING' | 'NO_REVENUE' | 'INCOMPLETE_ALLOCATION';
}

export interface ContractProfitabilityRow {
  contract_id: string;
  contract_number: string;
  title: string;
  client_name: string;
  revenue: number;
  guard_payroll_cost: number;
  supervisor_cost: number;
  ot_cost: number;
  equipment_cost: number;
  transport_cost: number;
  site_expenses: number;
  other_direct_cost: number;
  total_direct_cost: number;
  allocated_overhead: number;
  direct_profit: number;
  net_profit: number;
  margin_pct: number;
  management_status: string;
}

export interface SiteProfitabilityRow {
  site_id: string;
  site_name: string;
  city: string;
  client_name: string;
  revenue: number;
  guard_salaries: number;
  supervisor_salaries: number;
  employee_ot: number;
  transport: number;
  equipment: number;
  site_expenses: number;
  other_direct: number;
  total_direct_costs: number;
  direct_profit: number;
  allocated_ho_overhead: number;
  net_site_contribution: number;
  margin_pct: number;
  management_status: string;
}

export interface UnattributedLineException {
  line_id: string;
  entry_number: string;
  posting_date: string;
  account_code: string;
  account_name: string;
  exception_type: 'UNASSIGNED_REVENUE' | 'UNASSIGNED_DIRECT_COST' | 'UNASSIGNED_SITE_EXPENSE';
  amount: number;
  narration: string;
  source_type: string;
  source_number: string;
}

export interface AllocationProfileItem {
  id: string;
  name: string;
  method: 'BY_REVENUE' | 'BY_HEADCOUNT' | 'BY_SITE' | 'BY_FIXED_PERCENTAGE' | 'MANUAL';
  method_display: string;
  source_cost_center?: string | null;
  source_cost_center_name?: string;
  target_type: 'CONTRACT' | 'SITE' | 'PROFIT_CENTER';
  target_site?: string | null;
  target_site_name?: string;
  target_contract?: string | null;
  target_contract_number?: string;
  target_profit_center?: string | null;
  target_profit_center_name?: string;
  percentage_or_weight: number | string;
  effective_from?: string | null;
  effective_to?: string | null;
  is_active: boolean;
  description?: string;
}

export async function fetchProfitAndLoss(params?: Record<string, any>): Promise<ProfitAndLossReport> {
  const resp = await axios.get(`${FS_BASE}/profit_and_loss/`, { ...getAuthHeaders(), params });
  return resp.data;
}

export async function fetchBalanceSheet(params?: Record<string, any>): Promise<BalanceSheetReport> {
  const resp = await axios.get(`${FS_BASE}/balance_sheet/`, { ...getAuthHeaders(), params });
  return resp.data;
}

export async function fetchCashFlow(params?: Record<string, any>): Promise<CashFlowReport> {
  const resp = await axios.get(`${FS_BASE}/cash_flow/`, { ...getAuthHeaders(), params });
  return resp.data;
}

export async function fetchStatementValidation(as_of_date?: string): Promise<StatementValidationReport> {
  const resp = await axios.get(`${FS_BASE}/statement_validation/`, { ...getAuthHeaders(), params: { as_of_date } });
  return resp.data;
}

export async function fetchClientProfitability(params?: Record<string, any>): Promise<ClientProfitabilityRow[]> {
  const resp = await axios.get(`${PROFITABILITY_BASE}/clients/`, { ...getAuthHeaders(), params });
  return resp.data;
}

export async function fetchContractProfitability(params?: Record<string, any>): Promise<ContractProfitabilityRow[]> {
  const resp = await axios.get(`${PROFITABILITY_BASE}/contracts/`, { ...getAuthHeaders(), params });
  return resp.data;
}

export async function fetchSiteProfitability(params?: Record<string, any>): Promise<SiteProfitabilityRow[]> {
  const resp = await axios.get(`${PROFITABILITY_BASE}/sites/`, { ...getAuthHeaders(), params });
  return resp.data;
}

export async function fetchUnattributedLines(params?: Record<string, any>): Promise<UnattributedLineException[]> {
  const resp = await axios.get(`${PROFITABILITY_BASE}/unattributed_lines/`, { ...getAuthHeaders(), params });
  return resp.data;
}

export async function fetchProfitabilityDrilldown(params?: Record<string, any>): Promise<any[]> {
  const resp = await axios.get(`${PROFITABILITY_BASE}/drilldown/`, { ...getAuthHeaders(), params });
  return resp.data;
}

export async function fetchAllocationProfiles(): Promise<AllocationProfileItem[]> {
  const resp = await axios.get(`${API_BASE}/allocation-profiles/`, getAuthHeaders());
  return resp.data.results || resp.data;
}

export async function createAllocationProfile(data: Partial<AllocationProfileItem>): Promise<AllocationProfileItem> {
  const resp = await axios.post(`${API_BASE}/allocation-profiles/`, data, getAuthHeaders());
  return resp.data;
}

export async function deleteAllocationProfile(id: string): Promise<void> {
  await axios.delete(`${API_BASE}/allocation-profiles/${id}/`, getAuthHeaders());
}

// ==========================================
// S-4L Executive Finance Dashboard APIs
// ==========================================
const EXEC_BASE = `${API_BASE}/executive-dashboard`;

export interface ExecutiveDashboardData {
  period: {
    start_date: string;
    end_date: string;
    current_period_name: string;
    period_close_status: string;
  };
  kpis: {
    revenue_this_period: number;
    gross_profit: number;
    net_profit: number;
    gross_margin_percentage: number;
    net_margin_percentage: number;
    operating_expenses: number;
    accounts_receivable: number;
    overdue_receivables: number;
    collections_this_period: number;
    accounts_payable: number;
    overdue_payables: number;
    vendor_payments_this_period: number;
    payroll_payable: number;
    salary_disbursed_period: number;
    outstanding_payroll_liability: number;
    cash_bank_balance: number;
    cash_in: number;
    cash_out: number;
    tax_payable: number;
    tax_recoverable: number;
    tax_paid_period: number;
    unposted_accounting_items: number;
    reconciliation_exceptions: number;
  };
}

export interface HealthItem {
  status: 'HEALTHY' | 'ATTENTION' | 'CRITICAL';
  [key: string]: any;
}

export interface FinancialHealthSummary {
  liquidity: HealthItem;
  receivables_health: HealthItem;
  payables_health: HealthItem;
  payroll_status: HealthItem;
  tax_compliance: HealthItem;
  gl_posting_status: HealthItem;
  bank_reconciliation: HealthItem;
  period_close_status: HealthItem;
}

export interface FinanceActionItem {
  id: string;
  title: string;
  count: number;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  category: string;
  target_tab: string;
  description: string;
}

export async function fetchExecutiveOverview(startDate?: string, endDate?: string): Promise<ExecutiveDashboardData> {
  const resp = await axios.get(`${EXEC_BASE}/overview/`, {
    ...getAuthHeaders(),
    params: { start_date: startDate, end_date: endDate }
  });
  return resp.data;
}

export async function fetchFinancialHealth(): Promise<FinancialHealthSummary> {
  const resp = await axios.get(`${EXEC_BASE}/financial-health/`, getAuthHeaders());
  return resp.data;
}

export async function fetchRevenueExpenseTrends(): Promise<any[]> {
  const resp = await axios.get(`${EXEC_BASE}/trends/`, getAuthHeaders());
  return resp.data;
}

export async function fetchReceivablesSnapshot(): Promise<any> {
  const resp = await axios.get(`${EXEC_BASE}/receivables-snapshot/`, getAuthHeaders());
  return resp.data;
}

export async function fetchPayablesSnapshot(): Promise<any> {
  const resp = await axios.get(`${EXEC_BASE}/payables-snapshot/`, getAuthHeaders());
  return resp.data;
}

export async function fetchPayrollSnapshot(): Promise<any> {
  const resp = await axios.get(`${EXEC_BASE}/payroll-snapshot/`, getAuthHeaders());
  return resp.data;
}

export async function fetchTaxSnapshot(): Promise<any> {
  const resp = await axios.get(`${EXEC_BASE}/tax-snapshot/`, getAuthHeaders());
  return resp.data;
}

export async function fetchTreasurySnapshot(): Promise<any> {
  const resp = await axios.get(`${EXEC_BASE}/treasury-snapshot/`, getAuthHeaders());
  return resp.data;
}

export async function fetchProfitabilitySnapshot(): Promise<any> {
  const resp = await axios.get(`${EXEC_BASE}/profitability-snapshot/`, getAuthHeaders());
  return resp.data;
}

export async function fetchAccountingHealth(): Promise<any> {
  const resp = await axios.get(`${EXEC_BASE}/accounting-health/`, getAuthHeaders());
  return resp.data;
}

export async function fetchFinanceActionCenter(): Promise<FinanceActionItem[]> {
  const resp = await axios.get(`${EXEC_BASE}/action-center/`, getAuthHeaders());
  return resp.data;
}



