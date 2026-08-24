import { useEffect, useState } from 'react';
import { DataTable } from '../../../components/tables/DataTable';
import type { Column } from '../../../components/tables/DataTable';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Toolbar } from '../../../layouts/PageLayout';
import type { ChartOfAccount, AccountGroup } from '../types';
import { fetchChartOfAccounts, createChartOfAccount, updateChartOfAccount, fetchAccountGroups } from '../api';

export default function ChartOfAccountsView() {
    const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
    const [accountGroups, setAccountGroups] = useState<AccountGroup[]>([]);
    const [loading, setLoading] = useState(true);
    
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingAccount, setEditingAccount] = useState<ChartOfAccount | null>(null);

    // Form states
    const [accountCode, setAccountCode] = useState('');
    const [accountName, setAccountName] = useState('');
    const [accountType, setAccountType] = useState('Asset');
    const [accountGroup, setAccountGroup] = useState('');
    const [isActive, setIsActive] = useState(true);
    const [errorMsg, setErrorMsg] = useState('');

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [accData, groupData] = await Promise.all([
                fetchChartOfAccounts(),
                fetchAccountGroups()
            ]);
            setAccounts(accData.results || accData);
            setAccountGroups(groupData.results || groupData);
        } catch (error) {
            console.error('Failed to load data', error);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateNew = () => {
        setEditingAccount(null);
        setAccountCode('');
        setAccountName('');
        setAccountType('Asset');
        setAccountGroup(accountGroups.length > 0 ? accountGroups[0].id : '');
        setIsActive(true);
        setErrorMsg('');
        setIsModalOpen(true);
    };

    const handleEdit = (acc: ChartOfAccount) => {
        setEditingAccount(acc);
        setAccountCode(acc.account_code);
        setAccountName(acc.account_name);
        setAccountType(acc.account_type);
        setAccountGroup(acc.account_group);
        setIsActive(acc.is_active !== false); // Default to true if undefined
        setErrorMsg('');
        setIsModalOpen(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMsg('');
        
        try {
            const payload = {
                account_code: accountCode,
                account_name: accountName,
                account_type: accountType,
                account_group: accountGroup,
                is_active: isActive
            };
            
            if (editingAccount) {
                await updateChartOfAccount(editingAccount.id, payload);
                alert('Account updated successfully');
            } else {
                await createChartOfAccount(payload);
                alert('Account created successfully');
            }
            setIsModalOpen(false);
            loadData();
        } catch (err: any) {
            console.error(err);
            setErrorMsg(err.response?.data?.detail || JSON.stringify(err.response?.data) || 'Failed to save account');
        }
    };

    const columns: Column<ChartOfAccount>[] = [
        {
            key: 'account_code',
            header: 'Code',
            render: (acc) => <span style={{ fontWeight: 500 }}>{acc.account_code}</span>
        },
        {
            key: 'account_name',
            header: 'Name',
            render: (acc) => acc.account_name
        },
        {
            key: 'account_type',
            header: 'Type',
            render: (acc) => acc.account_type
        },
        {
            key: 'account_group',
            header: 'Group',
            render: (acc) => {
                const grp = accountGroups.find(g => g.id === acc.account_group);
                return grp ? grp.name : acc.account_group;
            }
        },
        {
            key: 'current_balance',
            header: 'Balance',
            render: (acc) => acc.current_balance || '0.00'
        },
        {
            key: 'status',
            header: 'Status',
            render: (acc) => (
                <Badge variant={acc.is_active ? 'success' : 'danger'}>
                    {acc.is_active ? 'Active' : 'Inactive'}
                </Badge>
            )
        },
        {
            key: 'actions',
            header: 'Actions',
            render: (acc) => (
                <Button variant="ghost" onClick={() => handleEdit(acc)}>Edit</Button>
            )
        }
    ];

    return (
        <div>
            <Toolbar>
                <div style={{ fontWeight: 600 }}>Chart of Accounts</div>
                <div style={{ flex: 1 }} />
                <Button variant="primary" onClick={handleCreateNew}>
                    + New Account
                </Button>
            </Toolbar>
            
            {isModalOpen && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
                    backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center',
                    alignItems: 'center', zIndex: 1000, overflowY: 'auto'
                }}>
                    <div style={{ backgroundColor: 'var(--color-surface)', padding: '24px', borderRadius: '8px', width: '500px', maxWidth: '95vw' }}>
                        <h2 style={{ marginTop: 0, marginBottom: '24px', borderBottom: '1px solid var(--color-border)', paddingBottom: '12px' }}>
                            {editingAccount ? 'Edit Account' : 'Create Account'}
                        </h2>
                        
                        {errorMsg && (
                            <div style={{ backgroundColor: '#fee2e2', color: '#b91c1c', padding: '12px', borderRadius: '4px', marginBottom: '16px' }}>
                                {errorMsg}
                            </div>
                        )}

                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 600 }}>Account Code *</label>
                                <input required type="text" value={accountCode} onChange={e => setAccountCode(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid var(--color-border)', borderRadius: '4px' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 600 }}>Account Name *</label>
                                <input required type="text" value={accountName} onChange={e => setAccountName(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid var(--color-border)', borderRadius: '4px' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 600 }}>Account Type *</label>
                                <select required value={accountType} onChange={e => setAccountType(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid var(--color-border)', borderRadius: '4px' }}>
                                    <option value="Asset">Asset</option>
                                    <option value="Liability">Liability</option>
                                    <option value="Equity">Equity</option>
                                    <option value="Revenue">Revenue</option>
                                    <option value="Expense">Expense</option>
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 600 }}>Account Group *</label>
                                <select required value={accountGroup} onChange={e => setAccountGroup(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid var(--color-border)', borderRadius: '4px' }}>
                                    <option value="">-- Select Group --</option>
                                    {accountGroups.map(g => (
                                        <option key={g.id} value={g.id}>{g.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', fontWeight: 600 }}>
                                    <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
                                    Active Account
                                </label>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '16px', borderTop: '1px solid var(--color-border)', paddingTop: '16px' }}>
                                <Button variant="ghost" type="button" onClick={() => setIsModalOpen(false)}>Cancel</Button>
                                <Button variant="primary" type="submit">Save</Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            
            <DataTable 
                data={accounts}
                columns={columns}
                isLoading={loading}
                keyExtractor={(row) => row.id}
            />
        </div>
    );
}
