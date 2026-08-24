import React, { useEffect, useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { DataTable } from '../../../components/tables/DataTable';
import type { Column } from '../../../components/tables/DataTable';
import { Badge } from '../../../components/ui/Badge';
import { Toolbar } from '../../../layouts/PageLayout';
import type { JournalEntry } from '../types';
import { fetchJournalEntries, postJournalEntry, reverseJournalEntry, createJournalEntry, fetchChartOfAccounts, fetchJournals, fetchCostCenters } from '../api';

interface Props {
    canWrite: boolean;
}

export default function JournalsView({ canWrite }: Props) {
    const [entries, setEntries] = useState<JournalEntry[]>([]);
    const [loading, setLoading] = useState(true);

    const [accounts, setAccounts] = useState<any[]>([]);
    const [journals, setJournals] = useState<any[]>([]);
    const [costCenters, setCostCenters] = useState<any[]>([]);

    useEffect(() => {
        loadEntries();
        loadRelatedData();
    }, []);

    const loadEntries = async () => {
        setLoading(true);
        try {
            const data = await fetchJournalEntries();
            setEntries(data.results || data);
        } catch (error) {
            console.error('Failed to load journal entries', error);
        } finally {
            setLoading(false);
        }
    };

    const loadRelatedData = async () => {
        try {
            const [accData, jourData, ccData] = await Promise.all([
                fetchChartOfAccounts(),
                fetchJournals(),
                fetchCostCenters()
            ]);
            setAccounts(accData.results || accData);
            setJournals(jourData.results || jourData);
            setCostCenters(ccData.results || ccData);
        } catch (error) {
            console.error('Failed to load related data', error);
        }
    };

    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null);
    
    // Header state
    const [journal, setJournal] = useState('');
    const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0]);
    const [reference, setReference] = useState('');
    const [description, setDescription] = useState('');
    
    // Lines state
    const [lines, setLines] = useState<any[]>([]);
    const [errorMsg, setErrorMsg] = useState('');

    const handleCreateNew = () => {
        setJournal(journals.length > 0 ? journals[0].id : '');
        setEntryDate(new Date().toISOString().split('T')[0]);
        setReference('');
        setDescription('');
        setLines([
            { id: Date.now().toString() + '1', account: '', description: '', debit: 0, credit: 0, cost_center: '' },
            { id: Date.now().toString() + '2', account: '', description: '', debit: 0, credit: 0, cost_center: '' }
        ]);
        setErrorMsg('');
        setIsCreateModalOpen(true);
    };

    const handleAddLine = () => {
        setLines([...lines, { id: Date.now().toString(), account: '', description: '', debit: 0, credit: 0, cost_center: '' }]);
    };

    const handleRemoveLine = (id: string) => {
        setLines(lines.filter(l => l.id !== id));
    };

    const updateLine = (id: string, field: string, value: any) => {
        setLines(lines.map(l => l.id === id ? { ...l, [field]: value } : l));
    };

    const totalDebit = lines.reduce((sum, l) => sum + (parseFloat(l.debit) || 0), 0);
    const totalCredit = lines.reduce((sum, l) => sum + (parseFloat(l.credit) || 0), 0);
    const diff = Math.abs(totalDebit - totalCredit);

    const handleCreateSubmit = async (e: React.FormEvent, postImmediate: boolean = false) => {
        e.preventDefault();
        setErrorMsg('');

        // Basic validation
        if (lines.length < 2) {
            setErrorMsg("At least two lines are required.");
            return;
        }
        for (const l of lines) {
            if (!l.account) {
                setErrorMsg("Account is required on all lines.");
                return;
            }
            if ((parseFloat(l.debit) || 0) === 0 && (parseFloat(l.credit) || 0) === 0) {
                setErrorMsg("Either debit or credit must be positive on all lines.");
                return;
            }
        }
        if (totalDebit !== totalCredit) {
            setErrorMsg(`Debits and credits must balance. Difference: ${diff.toFixed(4)}`);
            return;
        }

        try {
            const payload = {
                journal: journal || undefined,
                entry_date: entryDate,
                reference,
                description,
                lines: lines.map(l => ({
                    account: l.account,
                    description: l.description,
                    debit: l.debit || 0,
                    credit: l.credit || 0,
                    cost_center: l.cost_center || null
                }))
            };
            
            const newEntry = await createJournalEntry(payload);
            
            if (postImmediate) {
                await postJournalEntry(newEntry.id);
                alert('Journal Entry created and posted successfully!');
            } else {
                alert('Journal Entry created successfully!');
            }
            
            setIsCreateModalOpen(false);
            loadEntries();
        } catch (err: any) {
            console.error(err);
            if (err.response?.data) {
                setErrorMsg(JSON.stringify(err.response.data));
            } else {
                setErrorMsg('Failed to create journal entry.');
            }
        }
    };

    const handlePost = async (id: string) => {
        if (!window.confirm("Are you sure you want to post this entry?")) return;
        try {
            await postJournalEntry(id);
            alert("Entry posted successfully!");
            loadEntries();
        } catch (error: any) {
            alert(error.response?.data?.detail || JSON.stringify(error.response?.data) || "Failed to post entry.");
        }
    };

    const handleReverse = async (id: string) => {
        if (!window.confirm("Are you sure you want to reverse this posted entry?")) return;
        try {
            await reverseJournalEntry(id);
            alert("Entry reversed successfully!");
            loadEntries();
        } catch (error: any) {
            alert(error.response?.data?.detail || JSON.stringify(error.response?.data) || "Failed to reverse entry.");
        }
    };

    const columns: Column<JournalEntry>[] = [
        {
            key: 'entry_number',
            header: 'Number',
            render: (entry) => <span style={{ fontWeight: 500 }}>{entry.entry_number}</span>
        },
        {
            key: 'entry_date',
            header: 'Date',
            render: (entry) => entry.entry_date
        },
        {
            key: 'description',
            header: 'Description',
            render: (entry) => entry.description || '-'
        },
        {
            key: 'status',
            header: 'Status',
            render: (entry) => (
                <Badge variant={entry.status === 'POSTED' ? 'success' : 'warning'}>
                    {entry.status}
                </Badge>
            )
        },
        {
            key: 'actions',
            header: 'Actions',
            render: (entry) => (
                <div style={{ display: 'flex', gap: '8px' }}>
                    <Button variant="ghost" onClick={() => setSelectedEntry(entry)}>
                        View Detail
                    </Button>
                    {canWrite && entry.status === 'DRAFT' && (
                        <Button variant="primary" onClick={() => handlePost(entry.id)}>
                            Post
                        </Button>
                    )}
                    {canWrite && entry.status === 'POSTED' && (
                        <Button variant="warning" onClick={() => handleReverse(entry.id)}>
                            Reverse
                        </Button>
                    )}
                </div>
            )
        }
    ];

    return (
        <div>
            <Toolbar>
                <div style={{ fontWeight: 600 }}>Journal Entries</div>
                <div style={{ flex: 1 }} />
                {canWrite && (
                    <Button variant="primary" onClick={handleCreateNew}>
                        + New Entry
                    </Button>
                )}
            </Toolbar>
            
            {isCreateModalOpen && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
                    backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center',
                    alignItems: 'center', zIndex: 1000, overflowY: 'auto'
                }}>
                    <div style={{ backgroundColor: 'var(--color-surface)', padding: '24px', borderRadius: '8px', width: '900px', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto' }}>
                        <h2 style={{ marginTop: 0, marginBottom: '24px', borderBottom: '1px solid var(--color-border)', paddingBottom: '12px' }}>Create Journal Entry</h2>
                        
                        {errorMsg && (
                            <div style={{ backgroundColor: '#fee2e2', color: '#b91c1c', padding: '12px', borderRadius: '4px', marginBottom: '16px' }}>
                                {errorMsg}
                            </div>
                        )}

                        <form onSubmit={(e) => handleCreateSubmit(e, false)} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                            {/* HEADER */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 600 }}>Journal</label>
                                    <select value={journal} onChange={e => setJournal(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid var(--color-border)', borderRadius: '4px' }}>
                                        <option value="">-- Auto/Default --</option>
                                        {journals.map(j => (
                                            <option key={j.id} value={j.id}>{j.code} - {j.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 600 }}>Entry Date *</label>
                                    <input type="date" required value={entryDate} onChange={e => setEntryDate(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid var(--color-border)', borderRadius: '4px' }} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 600 }}>Reference</label>
                                    <input type="text" value={reference} onChange={e => setReference(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid var(--color-border)', borderRadius: '4px' }} placeholder="External ref..." />
                                </div>
                                <div style={{ gridColumn: 'span 3' }}>
                                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 600 }}>Description *</label>
                                    <textarea required rows={2} value={description} onChange={e => setDescription(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid var(--color-border)', borderRadius: '4px' }} />
                                </div>
                            </div>

                            {/* LINES */}
                            <div>
                                <h4 style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '8px', marginBottom: '16px' }}>Lines</h4>
                                
                                <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1fr 1fr 40px', gap: '8px', fontWeight: 600, fontSize: '0.85rem', marginBottom: '8px' }}>
                                    <div>Account</div>
                                    <div>Description</div>
                                    <div>Debit</div>
                                    <div>Credit</div>
                                    <div>Cost Center</div>
                                    <div></div>
                                </div>
                                
                                {lines.map((line) => (
                                    <div key={line.id} style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1fr 1fr 40px', gap: '8px', marginBottom: '8px' }}>
                                        <select value={line.account} onChange={e => updateLine(line.id, 'account', e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid var(--color-border)', borderRadius: '4px' }} required>
                                            <option value="">Select Account</option>
                                            {accounts.map(acc => (
                                                <option key={acc.id} value={acc.id}>{acc.account_code} - {acc.name}</option>
                                            ))}
                                        </select>
                                        <input type="text" value={line.description} onChange={e => updateLine(line.id, 'description', e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid var(--color-border)', borderRadius: '4px' }} placeholder="Line desc..." />
                                        <input type="number" min="0" step="0.01" value={line.debit} onChange={e => updateLine(line.id, 'debit', e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid var(--color-border)', borderRadius: '4px' }} />
                                        <input type="number" min="0" step="0.01" value={line.credit} onChange={e => updateLine(line.id, 'credit', e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid var(--color-border)', borderRadius: '4px' }} />
                                        <select value={line.cost_center} onChange={e => updateLine(line.id, 'cost_center', e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid var(--color-border)', borderRadius: '4px' }}>
                                            <option value="">None</option>
                                            {costCenters.map(cc => (
                                                <option key={cc.id} value={cc.id}>{cc.code} - {cc.name}</option>
                                            ))}
                                        </select>
                                        <Button variant="danger" type="button" onClick={() => handleRemoveLine(line.id)} disabled={lines.length <= 2}>✕</Button>
                                    </div>
                                ))}

                                <div style={{ marginTop: '16px' }}>
                                    <Button variant="ghost" type="button" onClick={handleAddLine}>+ Add Line</Button>
                                </div>
                            </div>

                            {/* TOTALS */}
                            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '16px', backgroundColor: 'var(--color-background)', borderRadius: '4px' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '150px 150px', gap: '8px', textAlign: 'right', fontWeight: 600 }}>
                                    <div>Total Debit:</div>
                                    <div>{totalDebit.toFixed(2)}</div>
                                    <div>Total Credit:</div>
                                    <div>{totalCredit.toFixed(2)}</div>
                                    <div style={{ color: diff === 0 ? 'green' : 'red' }}>Difference:</div>
                                    <div style={{ color: diff === 0 ? 'green' : 'red' }}>{diff.toFixed(2)}</div>
                                </div>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '16px', borderTop: '1px solid var(--color-border)', paddingTop: '16px' }}>
                                <Button variant="ghost" type="button" onClick={() => setIsCreateModalOpen(false)}>Cancel</Button>
                                <Button variant="secondary" type="submit">Save Draft</Button>
                                <Button variant="primary" type="button" onClick={(e) => handleCreateSubmit(e, true)}>Post Immediately</Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            
            <DataTable 
                data={entries}
                columns={columns}
                isLoading={loading}
                keyExtractor={(row) => row.id}
            />

            {selectedEntry && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
                    backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center',
                    alignItems: 'center', zIndex: 1000, overflowY: 'auto'
                }}>
                    <div style={{ backgroundColor: 'var(--color-surface)', padding: '24px', borderRadius: '8px', width: '800px', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto' }}>
                        <h2 style={{ marginTop: 0, marginBottom: '24px', borderBottom: '1px solid var(--color-border)', paddingBottom: '12px' }}>
                            Journal Entry: {selectedEntry.entry_number}
                        </h2>
                        
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                            <div><strong>Date:</strong> {selectedEntry.entry_date}</div>
                            <div><strong>Status:</strong> {selectedEntry.status}</div>
                            <div><strong>Reference:</strong> {selectedEntry.reference || '-'}</div>
                            <div style={{ gridColumn: 'span 3' }}><strong>Description:</strong> {selectedEntry.description}</div>
                        </div>

                        <h4 style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '8px', marginBottom: '16px' }}>Lines</h4>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                                    <th style={{ padding: '8px' }}>Account</th>
                                    <th style={{ padding: '8px' }}>Description</th>
                                    <th style={{ padding: '8px' }}>Debit</th>
                                    <th style={{ padding: '8px' }}>Credit</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(selectedEntry as any).lines?.map((line: any) => (
                                    <tr key={line.id} style={{ borderBottom: '1px solid #eee' }}>
                                        <td style={{ padding: '8px' }}>{accounts.find(a => a.id === line.account)?.account_code || line.account}</td>
                                        <td style={{ padding: '8px' }}>{line.description}</td>
                                        <td style={{ padding: '8px' }}>{line.debit}</td>
                                        <td style={{ padding: '8px' }}>{line.credit}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px' }}>
                            <Button variant="ghost" onClick={() => setSelectedEntry(null)}>Close</Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
