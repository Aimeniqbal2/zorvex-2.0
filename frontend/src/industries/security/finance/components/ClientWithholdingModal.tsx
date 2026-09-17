import React, { useState } from 'react';
import type {
  TaxCodeItem,
  ClientWithholdingCertificateItem
} from '../api';
import {
  createClientWithholdingCertificate,
  verifyClientWithholdingCertificate
} from '../api';

interface Props {
  clients: Array<{ id: string; name: string }>;
  taxCodes: TaxCodeItem[];
  certificate?: ClientWithholdingCertificateItem | null;
  onClose: () => void;
  onSaved: () => void;
}

export const ClientWithholdingModal: React.FC<Props> = ({
  clients,
  taxCodes,
  certificate,
  onClose,
  onSaved
}) => {
  const [clientId, setClientId] = useState(certificate?.client || clients[0]?.id || '');
  const [certNumber, setCertNumber] = useState(certificate?.certificate_number || '');
  const [taxCodeId, setTaxCodeId] = useState(certificate?.tax_code || taxCodes[0]?.id || '');
  const [withheldAmount, setWithheldAmount] = useState(certificate?.withheld_amount || '');
  const [grossAmount, setGrossAmount] = useState(certificate?.gross_taxable_amount || '');
  const [certDate, setCertDate] = useState(certificate?.certificate_date || new Date().toISOString().split('T')[0]);
  const [cprNumber, setCprNumber] = useState(certificate?.cpr_challan_no || '');
  const [notes, setNotes] = useState(certificate?.notes || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isVerifying = !!certificate;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId || !certNumber || !withheldAmount || !taxCodeId) {
      setError('Please fill in all mandatory fields.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      if (isVerifying && certificate) {
        await verifyClientWithholdingCertificate(certificate.id, 'VERIFIED');
      } else {
        await createClientWithholdingCertificate({
          client: clientId,
          certificate_number: certNumber,
          tax_code: taxCodeId,
          withheld_amount: withheldAmount,
          gross_taxable_amount: grossAmount || '0',
          certificate_date: certDate,
          cpr_challan_no: cprNumber,
          notes
        });
      }
      onSaved();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to save certificate.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.65)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      padding: '20px'
    }}>
      <div style={{
        background: 'var(--color-surface, #1e293b)',
        border: '1px solid var(--color-border, #334155)',
        borderRadius: '12px',
        width: '100%',
        maxWidth: '540px',
        maxHeight: '90vh',
        overflowY: 'auto',
        color: 'var(--color-text, #f8fafc)',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
      }}>
        <div style={{
          padding: '18px 24px',
          borderBottom: '1px solid var(--color-border, #334155)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '22px' }}>📜</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 600 }}>
                {isVerifying ? 'Verify Client WHT Certificate' : 'Record Client WHT Certificate'}
              </h3>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--color-text-secondary, #94a3b8)' }}>
                {isVerifying ? 'Confirm authenticity with Tax Authority' : 'Record Tax Deducted at Source by client'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', color: 'var(--color-text-secondary, #94a3b8)',
              fontSize: '20px', cursor: 'pointer'
            }}
          >×</button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {error && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.4)',
              borderRadius: '8px', padding: '12px', color: '#f87171', fontSize: '13px'
            }}>
              {error}
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '6px' }}>Client / Counterparty *</label>
            <select
              value={clientId}
              onChange={e => setClientId(e.target.value)}
              disabled={isVerifying}
              required
              style={{
                width: '100%', padding: '10px', borderRadius: '8px',
                background: 'var(--color-bg, #0f172a)', border: '1px solid var(--color-border, #334155)',
                color: '#fff', fontSize: '13px'
              }}
            >
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '6px' }}>Certificate Number *</label>
              <input
                type="text"
                placeholder="e.g. WHT-2026-0049"
                value={certNumber}
                onChange={e => setCertNumber(e.target.value)}
                disabled={isVerifying}
                required
                style={{
                  width: '100%', padding: '10px', borderRadius: '8px',
                  background: 'var(--color-bg, #0f172a)', border: '1px solid var(--color-border, #334155)',
                  color: '#fff', fontSize: '13px'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '6px' }}>Certificate Date *</label>
              <input
                type="date"
                value={certDate}
                onChange={e => setCertDate(e.target.value)}
                disabled={isVerifying}
                required
                style={{
                  width: '100%', padding: '10px', borderRadius: '8px',
                  background: 'var(--color-bg, #0f172a)', border: '1px solid var(--color-border, #334155)',
                  color: '#fff', fontSize: '13px'
                }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '6px' }}>Tax Rate / Rule *</label>
              <select
                value={taxCodeId}
                onChange={e => setTaxCodeId(e.target.value)}
                disabled={isVerifying}
                required
                style={{
                  width: '100%', padding: '10px', borderRadius: '8px',
                  background: 'var(--color-bg, #0f172a)', border: '1px solid var(--color-border, #334155)',
                  color: '#fff', fontSize: '13px'
                }}
              >
                {taxCodes.map(t => (
                  <option key={t.id} value={t.id}>{t.code} ({t.rate}%) - {t.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '6px' }}>Withheld Amount (PKR) *</label>
              <input
                type="number"
                step="0.01"
                placeholder="e.g. 40000"
                value={withheldAmount}
                onChange={e => setWithheldAmount(e.target.value)}
                disabled={isVerifying}
                required
                style={{
                  width: '100%', padding: '10px', borderRadius: '8px',
                  background: 'var(--color-bg, #0f172a)', border: '1px solid var(--color-border, #334155)',
                  color: '#fff', fontSize: '13px', fontWeight: 600
                }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '6px' }}>Gross Invoiced Amount (PKR)</label>
              <input
                type="number"
                step="0.01"
                placeholder="e.g. 1000000"
                value={grossAmount}
                onChange={e => setGrossAmount(e.target.value)}
                disabled={isVerifying}
                style={{
                  width: '100%', padding: '10px', borderRadius: '8px',
                  background: 'var(--color-bg, #0f172a)', border: '1px solid var(--color-border, #334155)',
                  color: '#fff', fontSize: '13px'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '6px' }}>CPR / Challan Number</label>
              <input
                type="text"
                placeholder="e.g. CPR-2026-88390"
                value={cprNumber}
                onChange={e => setCprNumber(e.target.value)}
                style={{
                  width: '100%', padding: '10px', borderRadius: '8px',
                  background: 'var(--color-bg, #0f172a)', border: '1px solid var(--color-border, #334155)',
                  color: '#fff', fontSize: '13px'
                }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '6px' }}>Verification Notes</label>
            <textarea
              rows={2}
              placeholder="e.g. Certificate verified on FBR Iris Portal."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              style={{
                width: '100%', padding: '10px', borderRadius: '8px',
                background: 'var(--color-bg, #0f172a)', border: '1px solid var(--color-border, #334155)',
                color: '#fff', fontSize: '13px', resize: 'vertical'
              }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '12px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '9px 16px', borderRadius: '8px',
                background: 'transparent', border: '1px solid var(--color-border, #334155)',
                color: 'var(--color-text-secondary, #94a3b8)', fontSize: '13px', cursor: 'pointer'
              }}
            >Cancel</button>
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '9px 20px', borderRadius: '8px',
                background: isVerifying ? '#10b981' : 'var(--color-primary, #3b82f6)', border: 'none',
                color: '#fff', fontSize: '13px', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1
              }}
            >
              {loading ? 'Processing...' : isVerifying ? '✓ Confirm & Verify Certificate' : 'Record Certificate'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
