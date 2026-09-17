/**
 * GeneralLedgerTab.tsx — Phase S-4I
 * Authoritative Double-Entry General Ledger Workspace
 * Sub-views: Posting Queue | Journals | Account Ledger | Trial Balance | Subledger Reconciliations
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  fetchPostingQueue,
  fetchTrialBalance,
  fetchSubledgerReconciliations,
  fetchJournalEntries,
  fetchAccountLedger,
  postQueueItem,
  postAllReady,
  createManualJournal,
  reverseJournalEntry,
  fetchChartOfAccounts,
  type PostingQueueItem,
  type TrialBalanceReport,
  type SubledgerReconciliation,
  type JournalEntry,
  type AccountLedgerReport,
  type ChartOfAccount,
  type ManualJournalLine,
} from '../api';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number | string | undefined, decimals = 2) =>
  Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

const fmtDate = (d: string | undefined) => (d ? new Date(d).toLocaleDateString('en-GB') : '—');

function Badge({ color, text }: { color: string; text: string }) {
  const palette: Record<string, { bg: string; fg: string; border: string }> = {
    green: { bg: 'rgba(34,197,94,0.12)', fg: '#22c55e', border: 'rgba(34,197,94,0.3)' },
    red: { bg: 'rgba(239,68,68,0.12)', fg: '#ef4444', border: 'rgba(239,68,68,0.3)' },
    amber: { bg: 'rgba(245,158,11,0.12)', fg: '#f59e0b', border: 'rgba(245,158,11,0.3)' },
    blue: { bg: 'rgba(59,130,246,0.12)', fg: '#60a5fa', border: 'rgba(59,130,246,0.3)' },
    purple: { bg: 'rgba(168,85,247,0.12)', fg: '#c084fc', border: 'rgba(168,85,247,0.3)' },
    gray: { bg: 'rgba(148,163,184,0.1)', fg: '#94a3b8', border: 'rgba(148,163,184,0.2)' },
  };
  const p = palette[color] || palette.gray;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
      background: p.bg, color: p.fg, border: `1px solid ${p.border}`,
    }}>{text}</span>
  );
}

function SectionCard({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: '12px', padding: '20px', backdropFilter: 'blur(8px)', ...style,
    }}>{children}</div>
  );
}

// ─── Sub-view: POSTING QUEUE ──────────────────────────────────────────────────
function PostingQueueView() {
  const [items, setItems] = useState<PostingQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState<string | null>(null);
  const [bulkPosting, setBulkPosting] = useState(false);
  const [filter, setFilter] = useState<'READY_TO_POST' | 'POSTED' | 'ALL'>('ALL');
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const data = await fetchPostingQueue({ filter_status: filter }); setItems(data.queue); }
    catch { setItems([]); } finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg }); setTimeout(() => setToast(null), 3500);
  };

  const handlePost = async (item: PostingQueueItem) => {
    setPosting(item.id);
    try {
      await postQueueItem(item.source_type, item.id);
      showToast('success', `✅ Posted: ${item.source_number}`); load();
    } catch (e: any) {
      showToast('error', e?.response?.data?.detail || 'Posting failed');
    } finally { setPosting(null); }
  };

  const handlePostAll = async () => {
    setBulkPosting(true);
    try {
      const res = await postAllReady();
      showToast('success', `✅ Batch posted: ${res.total_processed} entries, ${res.total_errors} errors`); load();
    } catch { showToast('error', 'Batch posting failed'); } finally { setBulkPosting(false); }
  };

  const readyCount = items.filter(i => !i.is_posted).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {toast && (
        <div style={{
          position: 'fixed', top: '16px', right: '16px', zIndex: 9999,
          padding: '12px 20px', borderRadius: '10px', fontSize: '14px', fontWeight: 600,
          background: toast.type === 'success' ? 'rgba(34,197,94,0.18)' : 'rgba(239,68,68,0.18)',
          color: toast.type === 'success' ? '#22c55e' : '#ef4444',
          border: `1px solid ${toast.type === 'success' ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)'}`,
          backdropFilter: 'blur(12px)', boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
        }}>{toast.msg}</div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#f8fafc' }}>📥 Posting Queue</h3>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748b' }}>
            {readyCount} item{readyCount !== 1 ? 's' : ''} ready to post to General Ledger
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <select value={filter} onChange={e => setFilter(e.target.value as 'READY_TO_POST' | 'POSTED' | 'ALL')}
            style={{ background: 'rgba(30,41,59,0.8)', color: '#cbd5e1', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '7px 12px', fontSize: '13px' }}>
            <option value="ALL">All</option>
            <option value="READY_TO_POST">Ready to Post</option>
            <option value="POSTED">Posted</option>
          </select>
          <button onClick={load} style={{ background: 'rgba(30,41,59,0.8)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '7px 12px', fontSize: '13px', cursor: 'pointer' }}>↺ Refresh</button>
          {readyCount > 0 && (
            <button onClick={handlePostAll} disabled={bulkPosting}
              style={{ background: bulkPosting ? 'rgba(59,130,246,0.3)' : 'rgba(59,130,246,0.15)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.35)', borderRadius: '8px', padding: '7px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
              {bulkPosting ? '⏳ Posting...' : `⚡ Post All Ready (${readyCount})`}
            </button>
          )}
        </div>
      </div>

      <SectionCard style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#475569' }}>Loading posting queue…</div>
        ) : items.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#475569' }}>✅ No items in queue for selected filter.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  {['Source #', 'Type', 'Date', 'Counterparty', 'Amount', 'Description', 'Status', ''].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr key={item.id}
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)', transition: 'background 0.15s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(59,130,246,0.05)')}
                    onMouseLeave={e => (e.currentTarget.style.background = idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)')}>
                    <td style={{ padding: '10px 14px', color: '#60a5fa', fontWeight: 600 }}>{item.source_number}</td>
                    <td style={{ padding: '10px 14px' }}><Badge color="purple" text={item.source_type.replace(/_/g, ' ')} /></td>
                    <td style={{ padding: '10px 14px', color: '#94a3b8' }}>{fmtDate(item.transaction_date)}</td>
                    <td style={{ padding: '10px 14px', color: '#e2e8f0' }}>{item.counterparty}</td>
                    <td style={{ padding: '10px 14px', color: '#f8fafc', fontWeight: 600 }}>PKR {fmt(item.amount)}</td>
                    <td style={{ padding: '10px 14px', color: '#64748b', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.description}</td>
                    <td style={{ padding: '10px 14px' }}>{item.is_posted ? <Badge color="green" text="POSTED" /> : <Badge color="amber" text="READY" />}</td>
                    <td style={{ padding: '10px 14px' }}>
                      {!item.is_posted && (
                        <button onClick={() => handlePost(item)} disabled={posting === item.id}
                          style={{ background: 'rgba(59,130,246,0.12)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.3)', borderRadius: '6px', padding: '5px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                          {posting === item.id ? '⏳' : '⚡ Post'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ─── Sub-view: JOURNALS ───────────────────────────────────────────────────────
function JournalsView() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<JournalEntry | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [reversalEntry, setReversalEntry] = useState<JournalEntry | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setEntries(await fetchJournalEntries({ ordering: '-posting_date', page_size: 100 })); }
    catch { setEntries([]); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const statusColor = (s: string) => ({ POSTED: 'green', REVERSED: 'red', DRAFT: 'amber' }[s] || 'gray');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#f8fafc' }}>📓 Journal Entries</h3>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748b' }}>All double-entry journal entries — posted, reversed, and manual</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={load} style={{ background: 'rgba(30,41,59,0.8)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '7px 12px', fontSize: '13px', cursor: 'pointer' }}>↺ Refresh</button>
          <button onClick={() => setShowManual(true)}
            style={{ background: 'rgba(99,102,241,0.12)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.35)', borderRadius: '8px', padding: '7px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
            + New Manual Journal
          </button>
        </div>
      </div>

      <SectionCard style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#475569' }}>Loading journal entries…</div>
        ) : entries.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#475569' }}>No journal entries found.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  {['Entry #', 'Date', 'Status', 'Type', 'Source', 'Description', 'Manual', ''].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', color: '#64748b', fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, idx) => (
                  <tr key={entry.id}
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)', cursor: 'pointer' }}
                    onClick={() => setSelected(entry)}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(59,130,246,0.05)')}
                    onMouseLeave={e => (e.currentTarget.style.background = idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)')}>
                    <td style={{ padding: '10px 14px', color: '#60a5fa', fontWeight: 700 }}>{entry.entry_number}</td>
                    <td style={{ padding: '10px 14px', color: '#94a3b8' }}>{fmtDate(entry.posting_date)}</td>
                    <td style={{ padding: '10px 14px' }}><Badge color={statusColor(entry.status)} text={entry.status} /></td>
                    <td style={{ padding: '10px 14px', color: '#94a3b8' }}>{entry.journal_type || '—'}</td>
                    <td style={{ padding: '10px 14px' }}>{entry.source_type ? <Badge color="purple" text={entry.source_type} /> : <span style={{ color: '#334155' }}>—</span>}</td>
                    <td style={{ padding: '10px 14px', color: '#cbd5e1', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.description}</td>
                    <td style={{ padding: '10px 14px' }}>{entry.is_manual ? <Badge color="blue" text="Manual" /> : <span style={{ color: '#334155', fontSize: '12px' }}>Auto</span>}</td>
                    <td style={{ padding: '10px 14px' }}>
                      {entry.status === 'POSTED' && !entry.reversed_by && (
                        <button onClick={e => { e.stopPropagation(); setReversalEntry(entry); }}
                          style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', cursor: 'pointer' }}>
                          ⟲ Reverse
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {selected && <JournalDetailModal entry={selected} onClose={() => setSelected(null)} />}
      {showManual && <ManualJournalModal onClose={() => setShowManual(false)} onSaved={() => { setShowManual(false); load(); }} />}
      {reversalEntry && <ReversalModal entry={reversalEntry} onClose={() => setReversalEntry(null)} onSaved={() => { setReversalEntry(null); load(); }} />}
    </div>
  );
}

// ─── Journal Detail Modal ─────────────────────────────────────────────────────
function JournalDetailModal({ entry, onClose }: { entry: JournalEntry; onClose: () => void }) {
  const totalDebit = entry.lines?.reduce((s, l) => s + Number(l.debit || 0), 0) || 0;
  const totalCredit = entry.lines?.reduce((s, l) => s + Number(l.credit || 0), 0) || 0;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
      <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', width: '760px', maxHeight: '85vh', overflow: 'auto', padding: '28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
          <div>
            <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '18px', fontWeight: 700 }}>{entry.entry_number}</h3>
            <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '13px' }}>{entry.description}</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#475569', fontSize: '22px', cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
          {[['Status', entry.status], ['Posting Date', fmtDate(entry.posting_date)], ['Reference', entry.reference || '—'],
            ['Source Type', entry.source_type || 'Manual'], ['Source #', entry.source_number || '—'], ['Manual Entry', entry.is_manual ? 'Yes' : 'No']].map(([label, val]) => (
            <div key={String(label)} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '10px 14px' }}>
              <div style={{ fontSize: '11px', color: '#475569', fontWeight: 600, marginBottom: '4px' }}>{label}</div>
              <div style={{ fontSize: '13px', color: '#cbd5e1', fontWeight: 600 }}>{val}</div>
            </div>
          ))}
        </div>
        <h4 style={{ margin: '0 0 12px', color: '#94a3b8', fontSize: '13px', fontWeight: 600 }}>DOUBLE-ENTRY LINES</h4>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                {['Account Code', 'Account Name', 'Description', 'Debit', 'Credit'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: h === 'Debit' || h === 'Credit' ? 'right' : 'left', color: '#475569', fontSize: '11px', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(entry.lines || []).map((line, i) => (
                <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '8px 12px', color: '#60a5fa', fontWeight: 600 }}>{line.account_code || '—'}</td>
                  <td style={{ padding: '8px 12px', color: '#e2e8f0' }}>{line.account_name || line.account}</td>
                  <td style={{ padding: '8px 12px', color: '#64748b' }}>{line.description || '—'}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: '#22c55e', fontWeight: 600 }}>{Number(line.debit) > 0 ? fmt(line.debit) : ''}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: '#ef4444', fontWeight: 600 }}>{Number(line.credit) > 0 ? fmt(line.credit) : ''}</td>
                </tr>
              ))}
              <tr style={{ borderTop: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)' }}>
                <td colSpan={3} style={{ padding: '10px 12px', color: '#94a3b8', fontWeight: 700, fontSize: '12px' }}>TOTALS</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', color: '#22c55e', fontWeight: 700 }}>{fmt(totalDebit)}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', color: '#ef4444', fontWeight: 700 }}>{fmt(totalCredit)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: '12px', textAlign: 'right' }}>
          <Badge color={Math.abs(totalDebit - totalCredit) < 0.01 ? 'green' : 'red'} text={Math.abs(totalDebit - totalCredit) < 0.01 ? '✓ BALANCED' : '⚠ UNBALANCED'} />
        </div>
      </div>
    </div>
  );
}

// ─── Manual Journal Modal ─────────────────────────────────────────────────────
function ManualJournalModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const [description, setDescription] = useState('');
  const [reference, setReference] = useState('');
  const [postingDate, setPostingDate] = useState(new Date().toISOString().split('T')[0]);
  const [lines, setLines] = useState([
    { account_id: '', debit: '', credit: '', description: '' },
    { account_id: '', debit: '', credit: '', description: '' },
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchChartOfAccounts({ allow_posting: true, page_size: 500 } as Record<string, unknown>).then(setAccounts).catch(() => {});
  }, []);

  const totalDebit = lines.reduce((s, l) => s + Number(l.debit || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + Number(l.credit || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;

  const addLine = () => setLines(prev => [...prev, { account_id: '', debit: '', credit: '', description: '' }]);
  const removeLine = (i: number) => setLines(prev => prev.filter((_, idx) => idx !== i));
  const updateLine = (i: number, field: string, value: string) =>
    setLines(prev => prev.map((l, idx) => idx === i ? { ...l, [field]: value } : l));

  const handleSave = async () => {
    if (!description) { setError('Description is required.'); return; }
    if (!isBalanced) { setError('Journal entry must be balanced (Total Debit = Total Credit > 0).'); return; }
    const validLines: ManualJournalLine[] = lines.filter(l => l.account_id).map(l => ({
      account_id: l.account_id,
      debit: l.debit ? Number(l.debit) : undefined,
      credit: l.credit ? Number(l.credit) : undefined,
      description: l.description,
    }));
    if (validLines.length < 2) { setError('At least 2 valid lines required.'); return; }
    setSaving(true); setError('');
    try { await createManualJournal({ posting_date: postingDate, reference, description, lines: validLines }); onSaved(); }
    catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      setError(err?.response?.data?.detail || 'Failed to create manual journal.');
    } finally { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
      <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', width: '820px', maxHeight: '90vh', overflow: 'auto', padding: '28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '18px', fontWeight: 700 }}>✏️ New Manual Journal Entry</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#475569', fontSize: '22px', cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '20px' }}>
          <div>
            <label style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>Posting Date *</label>
            <input type="date" value={postingDate} onChange={e => setPostingDate(e.target.value)}
              style={{ width: '100%', marginTop: '4px', background: 'rgba(30,41,59,0.8)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>Reference</label>
            <input value={reference} onChange={e => setReference(e.target.value)} placeholder="JV-001"
              style={{ width: '100%', marginTop: '4px', background: 'rgba(30,41,59,0.8)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>Balance Check</label>
            <div style={{ marginTop: '8px' }}>
              <Badge color={isBalanced ? 'green' : totalDebit > 0 ? 'red' : 'gray'} text={isBalanced ? `✓ Balanced: ${fmt(totalDebit)}` : `Δ ${fmt(Math.abs(totalDebit - totalCredit))}`} />
            </div>
          </div>
          <div style={{ gridColumn: 'span 3' }}>
            <label style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>Description *</label>
            <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Journal entry narration…"
              style={{ width: '100%', marginTop: '4px', background: 'rgba(30,41,59,0.8)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', boxSizing: 'border-box' }} />
          </div>
        </div>
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#94a3b8' }}>JOURNAL LINES</span>
            <button onClick={addLine} style={{ background: 'rgba(99,102,241,0.1)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.25)', borderRadius: '6px', padding: '4px 12px', fontSize: '12px', cursor: 'pointer' }}>+ Add Line</button>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                {['Account', 'Description', 'Debit', 'Credit', ''].map(h => (
                  <th key={h} style={{ padding: '8px 10px', textAlign: 'left', color: '#475569', fontSize: '11px', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map((line, i) => (
                <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '6px 10px' }}>
                    <select value={line.account_id} onChange={e => updateLine(i, 'account_id', e.target.value)}
                      style={{ background: 'rgba(30,41,59,0.8)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', padding: '6px 8px', fontSize: '12px', width: '100%' }}>
                      <option value="">— Select —</option>
                      {accounts.map(a => <option key={a.id} value={a.id}>{a.account_code} — {a.account_name}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '6px 10px' }}>
                    <input value={line.description} onChange={e => updateLine(i, 'description', e.target.value)} placeholder="Narration…"
                      style={{ background: 'rgba(30,41,59,0.8)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', padding: '6px 8px', fontSize: '12px', width: '100%', boxSizing: 'border-box' }} />
                  </td>
                  <td style={{ padding: '6px 10px' }}>
                    <input type="number" value={line.debit} onChange={e => { updateLine(i, 'debit', e.target.value); if (e.target.value) updateLine(i, 'credit', ''); }}
                      placeholder="0.00" min="0"
                      style={{ background: 'rgba(30,41,59,0.8)', color: '#22c55e', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', padding: '6px 8px', fontSize: '12px', width: '100px', textAlign: 'right' }} />
                  </td>
                  <td style={{ padding: '6px 10px' }}>
                    <input type="number" value={line.credit} onChange={e => { updateLine(i, 'credit', e.target.value); if (e.target.value) updateLine(i, 'debit', ''); }}
                      placeholder="0.00" min="0"
                      style={{ background: 'rgba(30,41,59,0.8)', color: '#ef4444', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', padding: '6px 8px', fontSize: '12px', width: '100px', textAlign: 'right' }} />
                  </td>
                  <td style={{ padding: '6px 10px' }}>
                    {lines.length > 2 && (
                      <button onClick={() => removeLine(i)} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: '16px' }}>✕</button>
                    )}
                  </td>
                </tr>
              ))}
              <tr style={{ background: 'rgba(255,255,255,0.03)', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                <td colSpan={2} style={{ padding: '8px 10px', color: '#64748b', fontSize: '12px', fontWeight: 700 }}>TOTALS</td>
                <td style={{ padding: '8px 10px', color: '#22c55e', fontWeight: 700, textAlign: 'right' }}>{fmt(totalDebit)}</td>
                <td style={{ padding: '8px 10px', color: '#ef4444', fontWeight: 700, textAlign: 'right' }}>{fmt(totalCredit)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
        {error && <div style={{ color: '#f87171', fontSize: '13px', marginBottom: '12px', padding: '8px 12px', background: 'rgba(239,68,68,0.08)', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.2)' }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button onClick={onClose} style={{ background: 'rgba(30,41,59,0.8)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '9px 20px', fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving || !isBalanced}
            style={{ background: isBalanced ? 'rgba(59,130,246,0.15)' : 'rgba(59,130,246,0.05)', color: isBalanced ? '#60a5fa' : '#334155', border: `1px solid ${isBalanced ? 'rgba(59,130,246,0.4)' : 'rgba(59,130,246,0.15)'}`, borderRadius: '8px', padding: '9px 20px', fontSize: '13px', fontWeight: 600, cursor: isBalanced ? 'pointer' : 'not-allowed' }}>
            {saving ? '⏳ Posting…' : '⚡ Post Journal Entry'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Reversal Modal ───────────────────────────────────────────────────────────
function ReversalModal({ entry, onClose, onSaved }: { entry: JournalEntry; onClose: () => void; onSaved: () => void }) {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleReverse = async () => {
    if (!reason) { setError('Reversal reason is required.'); return; }
    setSaving(true); setError('');
    try { await reverseJournalEntry(entry.id, date, reason); onSaved(); }
    catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      setError(err?.response?.data?.detail || 'Reversal failed.');
    } finally { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
      <div style={{ background: '#0f172a', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '16px', width: '480px', padding: '28px' }}>
        <h3 style={{ margin: '0 0 8px', color: '#f8fafc', fontSize: '17px', fontWeight: 700 }}>⟲ Reverse Journal Entry</h3>
        <p style={{ margin: '0 0 20px', color: '#64748b', fontSize: '13px' }}>Reversing: <strong style={{ color: '#60a5fa' }}>{entry.entry_number}</strong></p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
          <div>
            <label style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>Reversal Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              style={{ width: '100%', marginTop: '4px', background: 'rgba(30,41,59,0.8)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>Reason *</label>
            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} placeholder="Reason for reversal…"
              style={{ width: '100%', marginTop: '4px', background: 'rgba(30,41,59,0.8)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', resize: 'vertical', boxSizing: 'border-box' }} />
          </div>
        </div>
        {error && <div style={{ color: '#f87171', fontSize: '13px', marginBottom: '12px' }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button onClick={onClose} style={{ background: 'rgba(30,41,59,0.8)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '9px 20px', fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
          <button onClick={handleReverse} disabled={saving}
            style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', padding: '9px 20px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
            {saving ? '⏳ Processing…' : '⟲ Confirm Reversal'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-view: ACCOUNT LEDGER ─────────────────────────────────────────────────
function AccountLedgerView() {
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [report, setReport] = useState<AccountLedgerReport | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchChartOfAccounts({ is_active: true, page_size: 500 } as Record<string, unknown>).then(setAccounts).catch(() => {});
  }, []);

  const handleFetch = async () => {
    if (!selectedAccount) return;
    setLoading(true);
    try { setReport(await fetchAccountLedger({ account_id: selectedAccount, start_date: startDate || undefined, end_date: endDate })); }
    catch { setReport(null); } finally { setLoading(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div>
        <h3 style={{ margin: '0 0 4px', fontSize: '16px', fontWeight: 700, color: '#f8fafc' }}>📒 Account Ledger</h3>
        <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>Line-by-line transaction history with running balance for any account</p>
      </div>
      <SectionCard>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 2, minWidth: '200px' }}>
            <label style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>Account *</label>
            <select value={selectedAccount} onChange={e => setSelectedAccount(e.target.value)}
              style={{ width: '100%', marginTop: '4px', background: 'rgba(30,41,59,0.8)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '8px 12px', fontSize: '13px' }}>
              <option value="">— Select Account —</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.account_code} — {a.account_name}</option>)}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: '140px' }}>
            <label style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>From Date</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              style={{ width: '100%', marginTop: '4px', background: 'rgba(30,41,59,0.8)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', boxSizing: 'border-box' }} />
          </div>
          <div style={{ flex: 1, minWidth: '140px' }}>
            <label style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>To Date</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              style={{ width: '100%', marginTop: '4px', background: 'rgba(30,41,59,0.8)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', boxSizing: 'border-box' }} />
          </div>
          <button onClick={handleFetch} disabled={!selectedAccount || loading}
            style={{ background: 'rgba(59,130,246,0.12)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.3)', borderRadius: '8px', padding: '8px 18px', fontSize: '13px', fontWeight: 600, cursor: selectedAccount ? 'pointer' : 'not-allowed' }}>
            {loading ? '⏳' : '🔍 Load Ledger'}
          </button>
        </div>
      </SectionCard>

      {report && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
            {[
              { label: 'Account', val: `${report.account.account_code} — ${report.account.account_name}`, color: '#60a5fa' },
              { label: 'Opening Balance', val: `PKR ${fmt(report.opening_balance)}`, color: '#94a3b8' },
              { label: 'Period Dr / Cr', val: `↑ ${fmt(report.period_debit)}  ↓ ${fmt(report.period_credit)}`, color: '#f59e0b' },
              { label: 'Closing Balance', val: `PKR ${fmt(report.closing_balance)}`, color: report.closing_balance >= 0 ? '#22c55e' : '#ef4444' },
            ].map(card => (
              <SectionCard key={card.label}>
                <div style={{ fontSize: '11px', color: '#475569', fontWeight: 600, marginBottom: '6px' }}>{card.label}</div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: card.color }}>{card.val}</div>
              </SectionCard>
            ))}
          </div>
          <SectionCard style={{ padding: 0, overflow: 'hidden' }}>
            {report.lines.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#475569' }}>No transactions in this period.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      {['Date', 'Entry #', 'Source', 'Description', 'Debit', 'Credit', 'Running Balance'].map(h => (
                        <th key={h} style={{ padding: '10px 14px', textAlign: ['Debit', 'Credit', 'Running Balance'].includes(h) ? 'right' : 'left', color: '#64748b', fontWeight: 600, fontSize: '12px' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.lines.map((line, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                        <td style={{ padding: '9px 14px', color: '#94a3b8' }}>{fmtDate(line.posting_date)}</td>
                        <td style={{ padding: '9px 14px', color: '#60a5fa', fontWeight: 600 }}>{line.entry_number}</td>
                        <td style={{ padding: '9px 14px' }}>{line.source_type ? <Badge color="purple" text={line.source_type} /> : <span style={{ color: '#334155' }}>—</span>}</td>
                        <td style={{ padding: '9px 14px', color: '#94a3b8', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{line.description}</td>
                        <td style={{ padding: '9px 14px', textAlign: 'right', color: '#22c55e', fontWeight: 600 }}>{Number(line.debit) > 0 ? fmt(line.debit) : ''}</td>
                        <td style={{ padding: '9px 14px', textAlign: 'right', color: '#ef4444', fontWeight: 600 }}>{Number(line.credit) > 0 ? fmt(line.credit) : ''}</td>
                        <td style={{ padding: '9px 14px', textAlign: 'right', color: Number(line.running_balance) >= 0 ? '#f8fafc' : '#f87171', fontWeight: 700 }}>{fmt(line.running_balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </>
      )}
    </div>
  );
}

// ─── Sub-view: TRIAL BALANCE ──────────────────────────────────────────────────
function TrialBalanceView() {
  const [report, setReport] = useState<TrialBalanceReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  const handleFetch = useCallback(async () => {
    setLoading(true);
    try { setReport(await fetchTrialBalance({ start_date: startDate || undefined, end_date: endDate })); }
    catch { setReport(null); } finally { setLoading(false); }
  }, [startDate, endDate]);

  useEffect(() => { handleFetch(); }, []);

  const accountTypeColor = (type: string) => ({
    ASSET: '#60a5fa', LIABILITY: '#f87171', EQUITY: '#c084fc',
    REVENUE: '#22c55e', EXPENSE: '#f59e0b', COST_OF_SERVICE: '#fb923c',
    OTHER_INCOME: '#34d399', OTHER_EXPENSE: '#fca5a5',
  }[type] || '#94a3b8');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h3 style={{ margin: '0 0 4px', fontSize: '16px', fontWeight: 700, color: '#f8fafc' }}>⚖️ Authoritative Trial Balance</h3>
          <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>Opening → Movement → Closing with guaranteed Σ Debit = Σ Credit verification</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
          <div>
            <label style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '4px' }}>From</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              style={{ background: 'rgba(30,41,59,0.8)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '7px 10px', fontSize: '13px' }} />
          </div>
          <div>
            <label style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '4px' }}>To</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              style={{ background: 'rgba(30,41,59,0.8)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '7px 10px', fontSize: '13px' }} />
          </div>
          <button onClick={handleFetch} disabled={loading}
            style={{ background: 'rgba(59,130,246,0.12)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.3)', borderRadius: '8px', padding: '7px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
            {loading ? '⏳' : '🔍 Refresh'}
          </button>
        </div>
      </div>

      {report && (
        <>
          <div style={{
            padding: '16px 20px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '16px',
            background: report.is_balanced ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
            border: `1px solid ${report.is_balanced ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
          }}>
            <span style={{ fontSize: '28px' }}>{report.is_balanced ? '✅' : '❌'}</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: '15px', color: report.is_balanced ? '#22c55e' : '#ef4444' }}>
                {report.is_balanced ? 'Trial Balance is BALANCED' : 'UNBALANCED — Investigate Immediately'}
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                Total Debit: PKR {fmt(report.totals?.closing_debit || 0)} &nbsp;|&nbsp; Total Credit: PKR {fmt(report.totals?.closing_credit || 0)}
              </div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
            {[
              { label: 'Opening Debit', val: report.totals?.opening_debit, color: '#22c55e' },
              { label: 'Period Debit', val: report.totals?.period_debit, color: '#22c55e' },
              { label: 'Closing Debit', val: report.totals?.closing_debit, color: '#22c55e' },
              { label: 'Opening Credit', val: report.totals?.opening_credit, color: '#ef4444' },
              { label: 'Period Credit', val: report.totals?.period_credit, color: '#ef4444' },
              { label: 'Closing Credit', val: report.totals?.closing_credit, color: '#ef4444' },
            ].map(card => (
              <SectionCard key={card.label} style={{ padding: '12px 16px' }}>
                <div style={{ fontSize: '11px', color: '#475569', fontWeight: 600 }}>{card.label}</div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: card.color, marginTop: '4px' }}>PKR {fmt(card.val || 0)}</div>
              </SectionCard>
            ))}
          </div>
          <SectionCard style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    {['Code', 'Account Name', 'Type', 'Opening Dr', 'Opening Cr', 'Period Dr', 'Period Cr', 'Closing Dr', 'Closing Cr'].map(h => (
                      <th key={h} style={{ padding: '10px 12px', textAlign: ['Code', 'Account Name', 'Type'].includes(h) ? 'left' : 'right', color: '#64748b', fontWeight: 600, fontSize: '11px', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(report.rows || []).map((row, i) => (
                    <tr key={row.account_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                      <td style={{ padding: '8px 12px', color: '#60a5fa', fontWeight: 700 }}>{row.account_code}</td>
                      <td style={{ padding: '8px 12px', color: '#e2e8f0' }}>{row.account_name}</td>
                      <td style={{ padding: '8px 12px' }}><span style={{ fontSize: '11px', fontWeight: 600, color: accountTypeColor(row.account_type) }}>{row.account_type}</span></td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: '#94a3b8' }}>{row.opening_debit > 0 ? fmt(row.opening_debit) : ''}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: '#94a3b8' }}>{row.opening_credit > 0 ? fmt(row.opening_credit) : ''}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: '#22c55e' }}>{row.period_debit > 0 ? fmt(row.period_debit) : ''}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: '#ef4444' }}>{row.period_credit > 0 ? fmt(row.period_credit) : ''}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: '#f8fafc', fontWeight: 600 }}>{row.closing_debit > 0 ? fmt(row.closing_debit) : ''}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: '#f8fafc', fontWeight: 600 }}>{row.closing_credit > 0 ? fmt(row.closing_credit) : ''}</td>
                    </tr>
                  ))}
                  <tr style={{ borderTop: '2px solid rgba(255,255,255,0.1)', background: 'rgba(59,130,246,0.05)' }}>
                    <td colSpan={3} style={{ padding: '10px 12px', color: '#94a3b8', fontWeight: 700, fontSize: '12px' }}>GRAND TOTALS</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#22c55e', fontWeight: 700 }}>{fmt(report.totals?.opening_debit || 0)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#ef4444', fontWeight: 700 }}>{fmt(report.totals?.opening_credit || 0)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#22c55e', fontWeight: 700 }}>{fmt(report.totals?.period_debit || 0)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#ef4444', fontWeight: 700 }}>{fmt(report.totals?.period_credit || 0)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#22c55e', fontWeight: 700 }}>{fmt(report.totals?.closing_debit || 0)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#ef4444', fontWeight: 700 }}>{fmt(report.totals?.closing_credit || 0)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </SectionCard>
        </>
      )}
    </div>
  );
}

// ─── Sub-view: SUBLEDGER RECONCILIATIONS ─────────────────────────────────────
function SubledgerReconciliationsView() {
  const [data, setData] = useState<{ as_of_date: string; reconciliations: SubledgerReconciliation[] } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await fetchSubledgerReconciliations()); }
    catch { setData(null); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const iconMap: Record<string, string> = { '1200': '👥', '2100': '🏢', '2200': '💼', '2300': '🏛️' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h3 style={{ margin: '0 0 4px', fontSize: '16px', fontWeight: 700, color: '#f8fafc' }}>🔗 Subledger Reconciliations</h3>
          <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
            Control account GL vs operational subledger totals — as of {data?.as_of_date || '…'}
          </p>
        </div>
        <button onClick={load} style={{ background: 'rgba(30,41,59,0.8)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '7px 14px', fontSize: '13px', cursor: 'pointer' }}>↺ Refresh</button>
      </div>
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#475569' }}>Loading reconciliations…</div>
      ) : !data ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#475569' }}>Failed to load reconciliation data.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
          {data.reconciliations.map(rec => (
            <SectionCard key={rec.control_account_code} style={{
              border: `1px solid ${rec.is_reconciled ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.25)'}`,
              background: rec.is_reconciled ? 'rgba(34,197,94,0.04)' : 'rgba(239,68,68,0.05)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '24px' }}>{iconMap[rec.control_account_code] || '📊'}</span>
                  <div>
                    <div style={{ fontWeight: 700, color: '#f8fafc', fontSize: '14px' }}>{rec.module}</div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>{rec.control_account_code} — {rec.control_account_name}</div>
                  </div>
                </div>
                <Badge color={rec.is_reconciled ? 'green' : 'red'} text={rec.status} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '8px', padding: '10px 12px' }}>
                  <div style={{ fontSize: '10px', color: '#475569', fontWeight: 600, marginBottom: '4px' }}>GL BALANCE</div>
                  <div style={{ fontWeight: 700, color: '#60a5fa', fontSize: '14px' }}>PKR {fmt(rec.gl_balance)}</div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '8px', padding: '10px 12px' }}>
                  <div style={{ fontSize: '10px', color: '#475569', fontWeight: 600, marginBottom: '4px' }}>SUBLEDGER</div>
                  <div style={{ fontWeight: 700, color: '#94a3b8', fontSize: '14px' }}>PKR {fmt(rec.subledger_balance)}</div>
                </div>
                <div style={{ background: rec.is_reconciled ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)', borderRadius: '8px', padding: '10px 12px' }}>
                  <div style={{ fontSize: '10px', color: '#475569', fontWeight: 600, marginBottom: '4px' }}>DIFFERENCE</div>
                  <div style={{ fontWeight: 700, color: rec.is_reconciled ? '#22c55e' : '#ef4444', fontSize: '14px' }}>
                    {rec.is_reconciled ? '✓ 0.00' : `Δ ${fmt(Math.abs(rec.difference))}`}
                  </div>
                </div>
              </div>
            </SectionCard>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Tab Component ───────────────────────────────────────────────────────
type GLSubView = 'queue' | 'journals' | 'ledger' | 'trial_balance' | 'reconciliations';

const GL_SUB_VIEWS: { id: GLSubView; label: string; icon: string }[] = [
  { id: 'queue', label: 'Posting Queue', icon: '📥' },
  { id: 'journals', label: 'Journal Entries', icon: '📓' },
  { id: 'ledger', label: 'Account Ledger', icon: '📒' },
  { id: 'trial_balance', label: 'Trial Balance', icon: '⚖️' },
  { id: 'reconciliations', label: 'Subledger Recon.', icon: '🔗' },
];

export const GeneralLedgerTab: React.FC = () => {
  const [activeView, setActiveView] = useState<GLSubView>('queue');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', paddingTop: '8px' }}>
      {/* Phase Banner */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(59,130,246,0.12) 0%, rgba(99,102,241,0.1) 100%)',
        border: '1px solid rgba(59,130,246,0.2)', borderRadius: '12px', padding: '14px 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '24px' }}>📖</span>
          <div>
            <div style={{ fontWeight: 700, color: '#f8fafc', fontSize: '15px' }}>General Ledger — Phase S-4I</div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
              Authoritative double-entry posting engine · Running balances · Trial Balance · Subledger reconciliation
            </div>
          </div>
        </div>
        <Badge color="blue" text="S-4I Active" />
      </div>

      {/* Sub-view Tabs */}
      <div style={{ display: 'flex', gap: '6px', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '2px' }}>
        {GL_SUB_VIEWS.map(view => {
          const isActive = activeView === view.id;
          return (
            <button key={view.id} onClick={() => setActiveView(view.id)} style={{
              padding: '8px 14px', border: 'none',
              background: isActive ? 'rgba(59,130,246,0.1)' : 'transparent',
              color: isActive ? '#60a5fa' : '#64748b',
              borderBottom: isActive ? '2px solid #3b82f6' : '2px solid transparent',
              borderRadius: '6px 6px 0 0', fontSize: '12px', fontWeight: isActive ? 600 : 500,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
              whiteSpace: 'nowrap', transition: 'all 0.15s ease',
            }}>
              <span>{view.icon}</span><span>{view.label}</span>
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div>
        {activeView === 'queue' && <PostingQueueView />}
        {activeView === 'journals' && <JournalsView />}
        {activeView === 'ledger' && <AccountLedgerView />}
        {activeView === 'trial_balance' && <TrialBalanceView />}
        {activeView === 'reconciliations' && <SubledgerReconciliationsView />}
      </div>
    </div>
  );
};
