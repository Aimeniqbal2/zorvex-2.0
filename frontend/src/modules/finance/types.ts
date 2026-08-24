export interface ChartOfAccount {
    id: string;
    account_code: string;
    account_name: string;
    account_type: string;
    account_group: string;
    currency: string | null;
    opening_balance: string;
    current_balance: string;
    is_control_account: boolean;
    allow_manual_entries: boolean;
    is_active: boolean;
    description: string;
}

export interface Journal {
    id: string;
    code: string;
    name: string;
    journal_type: string;
}

export interface JournalEntryLine {
    id?: string;
    account: string;
    description?: string;
    debit: string | number;
    credit: string | number;
    cost_center?: string | null;
    profit_center?: string | null;
}

export interface JournalEntry {
    id: string;
    journal: string;
    entry_number: string;
    entry_date: string;
    status: 'DRAFT' | 'POSTED' | 'CANCELLED' | 'REVERSED';
    reference: string;
    description: string;
    lines: JournalEntryLine[];
}

export interface CustomerStatementRow {
    date: string;
    description: string;
    reference: string;
    debit: string;
    credit: string;
    balance: string;
}

export interface TrialBalanceRow {
    account_code: string;
    account_name: string;
    debit: string;
    credit: string;
    balance: string;
}

export interface AccountGroup {
    id: string;
    name: string;
    parent: string | null;
    group_type: string;
    description?: string;
}

export interface FiscalYear {
    id: string;
    name: string;
    start_date: string;
    end_date: string;
    is_closed: boolean;
    is_current: boolean;
}

export interface AccountingPeriod {
    id: string;
    fiscal_year: string;
    month: number;
    start_date: string;
    end_date: string;
    status: 'OPEN' | 'LOCKED' | 'CLOSED';
}

export interface TaxGroup {
    id: string;
    name: string;
    description: string;
}

export interface TaxCode {
    id: string;
    code: string;
    name: string;
    rate: string;
    tax_type: string;
    tax_group: string | null;
}

export interface CostCenter {
    id: string;
    name: string;
    code: string;
    parent: string | null;
}

export interface ProfitCenter {
    id: string;
    name: string;
    code: string;
    parent: string | null;
}

export interface Budget {
    id: string;
    name: string;
    fiscal_year: string;
    currency: string;
    status: string;
    description: string;
}

export interface ServiceInvoice {
    id: string;
    invoice_number: string;
    customer_name: string;
    total_amount: string;
    payment_status: string;
    issue_date: string;
    due_date: string;
}

export interface Cheque {
    id: string;
    cheque_number: string;
    bank_account: string;
    voucher: string;
    issue_date: string;
    due_date: string | null;
    amount: string;
    payee_name: string;
    status: string;
    clearing_date: string | null;
}

export interface BankStatement {
    id: string;
    bank_account: string;
    statement_date: string;
    start_date: string;
    end_date: string;
    opening_balance: string;
    closing_balance: string;
    lines?: any[];
}

export interface BankAccount {
    id: string;
    name: string;
    bank_name: string;
    account_number: string;
    branch: string | null;
    account: string;
    is_active: boolean;
}
