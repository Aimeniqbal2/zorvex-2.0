import React, { useEffect, useState } from 'react';
import { Modal } from '../../../../components/ui/Modal';
import { Button } from '../../../../components/ui/Button';
import { useToastStore } from '../../../../stores/toastStore';
import {
  fetchFinancePaymentModes,
  createFinancePaymentMode,
  updateFinancePaymentMode,
  deleteFinancePaymentMode,
  FinancePaymentMode,
} from '../api';

interface PaymentModesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpdated?: (modes: FinancePaymentMode[]) => void;
}

export const PaymentModesModal: React.FC<PaymentModesModalProps> = ({
  isOpen,
  onClose,
  onUpdated,
}) => {
  const [modes, setModes] = useState<FinancePaymentMode[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [isDefault, setIsDefault] = useState(false);

  const loadModes = async () => {
    setLoading(true);
    try {
      const list = await fetchFinancePaymentModes();
      setModes(list);
      if (onUpdated) onUpdated(list);
    } catch (err: any) {
      useToastStore.getState().error(err?.response?.data?.detail || 'Failed to load payment modes.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadModes();
    }
  }, [isOpen]);

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setCode('');
    setDescription('');
    setIsDefault(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      useToastStore.getState().error('Payment mode name is required.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        code: code.trim(),
        description: description.trim(),
        is_default: isDefault,
        is_active: true,
      };
      if (editingId) {
        await updateFinancePaymentMode(editingId, payload);
        useToastStore.getState().success('Payment mode updated.');
      } else {
        await createFinancePaymentMode(payload);
        useToastStore.getState().success('Payment mode created.');
      }
      resetForm();
      await loadModes();
    } catch (err: any) {
      useToastStore.getState().error(
        err?.response?.data?.detail || err?.response?.data?.name?.[0] || 'Failed to save payment mode.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (mode: FinancePaymentMode) => {
    setEditingId(mode.id);
    setName(mode.name);
    setCode(mode.code || '');
    setDescription(mode.description || '');
    setIsDefault(!!mode.is_default);
  };

  const handleDelete = async (mode: FinancePaymentMode) => {
    if (!window.confirm(`Delete payment mode "${mode.name}"?`)) return;
    try {
      await deleteFinancePaymentMode(mode.id);
      useToastStore.getState().success('Payment mode removed.');
      await loadModes();
    } catch (err: any) {
      useToastStore.getState().error(err?.response?.data?.detail || 'Failed to delete payment mode.');
    }
  };

  const handleSetDefault = async (mode: FinancePaymentMode) => {
    try {
      await updateFinancePaymentMode(mode.id, { is_default: true });
      useToastStore.getState().success(`"${mode.name}" set as default mode.`);
      await loadModes();
    } catch (err: any) {
      useToastStore.getState().error('Failed to update default mode.');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Manage Salary Payment Modes">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '680px' }}>
        <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--color-text-muted)' }}>
          Configure payment modes (e.g., <strong>MB</strong>, <strong>DB</strong>, <strong>JS</strong>, <strong>Cash</strong>, <strong>Cheque</strong>). Once selected for an employee in the Salary Sheet, that employee&apos;s mode stays remembered across future months until changed.
        </p>

        <form
          onSubmit={handleSave}
          style={{
            padding: '14px',
            borderRadius: '8px',
            border: '1px solid var(--color-border)',
            background: 'var(--color-surface-secondary)',
            display: 'grid',
            gridTemplateColumns: '1fr 120px auto',
            gap: '10px',
            alignItems: 'end',
          }}
        >
          <div>
            <label style={{ fontSize: '11px', fontWeight: 700, display: 'block', marginBottom: '4px' }}>
              Mode Name *
            </label>
            <input
              type="text"
              className="input-base"
              placeholder="e.g. MB, DB, JS, Cash Counter"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div>
            <label style={{ fontSize: '11px', fontWeight: 700, display: 'block', marginBottom: '4px' }}>
              Short Code
            </label>
            <input
              type="text"
              className="input-base"
              placeholder="e.g. MB"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <Button type="submit" variant="primary" size="sm" loading={saving}>
              {editingId ? 'Update' : '+ Add Mode'}
            </Button>
            {editingId && (
              <Button type="button" variant="secondary" size="sm" onClick={resetForm}>
                Cancel
              </Button>
            )}
          </div>
          <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
            <input
              type="text"
              className="input-base"
              placeholder="Optional description (e.g. Meezan Bank Online Transfer)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{ flex: 1 }}
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
              />
              Set as default
            </label>
          </div>
        </form>

        <div style={{ border: '1px solid var(--color-border)', borderRadius: '8px', overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-muted)' }}>Loading payment modes...</div>
          ) : modes.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '13px' }}>
              No payment modes added yet. Add modes like MB, DB, JS, or Cash above.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'var(--color-surface-secondary)', borderBottom: '1px solid var(--color-border)' }}>
                  <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, fontSize: '11px' }}>MODE NAME</th>
                  <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, fontSize: '11px' }}>CODE</th>
                  <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, fontSize: '11px' }}>DESCRIPTION</th>
                  <th style={{ padding: '9px 12px', textAlign: 'center', fontWeight: 700, fontSize: '11px' }}>DEFAULT</th>
                  <th style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, fontSize: '11px' }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {modes.map((m) => (
                  <tr key={m.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '9px 12px', fontWeight: 700 }}>{m.name}</td>
                    <td style={{ padding: '9px 12px', fontFamily: 'monospace' }}>{m.code || '—'}</td>
                    <td style={{ padding: '9px 12px', color: 'var(--color-text-muted)', fontSize: '12px' }}>{m.description || '—'}</td>
                    <td style={{ padding: '9px 12px', textAlign: 'center' }}>
                      {m.is_default ? (
                        <span style={{ background: '#dcfce7', color: '#15803d', fontSize: '10.5px', fontWeight: 700, padding: '2px 8px', borderRadius: '99px' }}>
                          DEFAULT
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleSetDefault(m)}
                          style={{ background: 'transparent', border: '1px solid var(--color-border)', borderRadius: '4px', padding: '2px 8px', fontSize: '11px', cursor: 'pointer', color: 'var(--color-text-muted)' }}
                        >
                          Make Default
                        </button>
                      )}
                    </td>
                    <td style={{ padding: '9px 12px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '6px' }}>
                        <Button size="sm" variant="secondary" onClick={() => handleEdit(m)}>
                          Edit
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => handleDelete(m)}>
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button variant="secondary" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Modal>
  );
};
