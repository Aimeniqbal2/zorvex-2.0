import { useState, useEffect } from 'react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Toolbar } from '../../../layouts/PageLayout';
import { fetchAccountGroups, createAccountGroup, updateAccountGroup } from '../api';
import type { AccountGroup } from '../types';

export default function AccountGroupsView() {
    const [groups, setGroups] = useState<AccountGroup[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingGroup, setEditingGroup] = useState<AccountGroup | null>(null);

    // Form states
    const [name, setName] = useState('');
    const [groupType, setGroupType] = useState('ASSET');
    const [parent, setParent] = useState('');
    const [description, setDescription] = useState('');
    const [errorMsg, setErrorMsg] = useState('');

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const data = await fetchAccountGroups();
            setGroups(data.results || data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateNew = () => {
        setEditingGroup(null);
        setName('');
        setGroupType('ASSET');
        setParent('');
        setDescription('');
        setErrorMsg('');
        setIsModalOpen(true);
    };

    const handleEdit = (group: AccountGroup) => {
        setEditingGroup(group);
        setName(group.name);
        setGroupType(group.group_type);
        setParent(group.parent || '');
        setDescription(group.description || '');
        setErrorMsg('');
        setIsModalOpen(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMsg('');
        
        try {
            const payload = {
                name,
                group_type: groupType,
                parent: parent || null,
                description
            };
            
            if (editingGroup) {
                await updateAccountGroup(editingGroup.id, payload);
                alert('Account Group updated successfully');
            } else {
                await createAccountGroup(payload);
                alert('Account Group created successfully');
            }
            setIsModalOpen(false);
            loadData();
        } catch (err: any) {
            console.error(err);
            setErrorMsg(err.response?.data?.detail || JSON.stringify(err.response?.data) || 'Failed to save account group');
        }
    };

    return (
        <div>
            <Toolbar>
                <div style={{ fontWeight: 600 }}>Account Groups</div>
                <div style={{ flex: 1 }} />
                <Button variant="primary" onClick={handleCreateNew}>
                    + New Group
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
                            {editingGroup ? 'Edit Account Group' : 'Create Account Group'}
                        </h2>
                        
                        {errorMsg && (
                            <div style={{ backgroundColor: '#fee2e2', color: '#b91c1c', padding: '12px', borderRadius: '4px', marginBottom: '16px' }}>
                                {errorMsg}
                            </div>
                        )}

                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 600 }}>Name *</label>
                                <input required type="text" value={name} onChange={e => setName(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid var(--color-border)', borderRadius: '4px' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 600 }}>Type *</label>
                                <select required value={groupType} onChange={e => setGroupType(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid var(--color-border)', borderRadius: '4px' }}>
                                    <option value="ASSET">Asset</option>
                                    <option value="LIABILITY">Liability</option>
                                    <option value="EQUITY">Equity</option>
                                    <option value="REVENUE">Revenue</option>
                                    <option value="EXPENSE">Expense</option>
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 600 }}>Parent Group</label>
                                <select value={parent} onChange={e => setParent(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid var(--color-border)', borderRadius: '4px' }}>
                                    <option value="">None</option>
                                    {groups.filter(g => g.id !== editingGroup?.id).map(g => (
                                        <option key={g.id} value={g.id}>{g.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 600 }}>Description</label>
                                <textarea rows={2} value={description} onChange={e => setDescription(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid var(--color-border)', borderRadius: '4px' }} />
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '16px', borderTop: '1px solid var(--color-border)', paddingTop: '16px' }}>
                                <Button variant="ghost" type="button" onClick={() => setIsModalOpen(false)}>Cancel</Button>
                                <Button variant="primary" type="submit">Save</Button>
                            </div>
                        </form>
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
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Parent</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {groups.map((group) => (
                                    <tr key={group.id}>
                                        <td className="px-4 py-2 font-medium">{group.name}</td>
                                        <td className="px-4 py-2">{group.group_type}</td>
                                        <td className="px-4 py-2 text-gray-500">
                                            {group.parent ? groups.find(g => g.id === group.parent)?.name : '-'}
                                        </td>
                                        <td className="px-4 py-2">
                                            <Button variant="ghost" onClick={() => handleEdit(group)}>Edit</Button>
                                        </td>
                                    </tr>
                                ))}
                                {groups.length === 0 && (
                                    <tr>
                                        <td colSpan={4} className="px-4 py-2 text-gray-500 text-center">No account groups found.</td>
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
