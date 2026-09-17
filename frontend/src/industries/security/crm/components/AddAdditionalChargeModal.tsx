import React, { useState } from 'react';
import type { ProposalAdditionalCharge } from '../api';

interface AddAdditionalChargeModalProps {
    isOpen: boolean;
    onClose: () => void;
    proposalVersionId: string;
    editingCharge?: ProposalAdditionalCharge | null;
    onSave: (payload: Partial<ProposalAdditionalCharge>) => Promise<void>;
}

export const AddAdditionalChargeModal: React.FC<AddAdditionalChargeModalProps> = ({
    isOpen,
    onClose,
    proposalVersionId,
    editingCharge,
    onSave
}) => {
    const [chargeName, setChargeName] = useState(editingCharge?.charge_name || '');
    const [chargeType, setChargeType] = useState<'ONE_TIME' | 'MONTHLY'>(editingCharge?.charge_type || 'ONE_TIME');
    const [quantity, setQuantity] = useState<number>(editingCharge?.quantity || 1);
    const [amount, setAmount] = useState<number | string>(editingCharge?.amount || 0);
    const [notes, setNotes] = useState(editingCharge?.notes || '');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!isOpen) return null;

    const lineTotal = (Number(quantity) || 0) * (Number(amount) || 0);

    const presetCharges = [
        'Mobilization & Deployment',
        'System Installation & Testing',
        'Guard Uniforms & Kits',
        'Site Training & Orientation',
        'Transportation / Patrol Vehicle',
        'Equipment Rental',
        'Control Room Supervision Fee',
        'Documentation & Compliance'
    ];

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            await onSave({
                proposal_version: proposalVersionId,
                charge_name: chargeName,
                charge_type: chargeType,
                quantity: Number(quantity) || 1,
                amount: Number(amount) || 0,
                notes
            });
            onClose();
        } catch (err: any) {
            setError(err?.response?.data?.error || err?.response?.data?.detail || err?.message || 'Failed to save additional charge.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
                            💼
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-white">
                                {editingCharge ? 'Edit Commercial Charge' : 'Add Additional Commercial Charge'}
                            </h3>
                            <p className="text-xs text-slate-400">Mobilization, installation, equipment rental, transport, or training</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
                    >
                        ✕
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {error && (
                        <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-sm">
                            {error}
                        </div>
                    )}

                    <div>
                        <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                            Charge Name / Service *
                        </label>
                        <input
                            type="text"
                            value={chargeName}
                            onChange={(e) => setChargeName(e.target.value)}
                            placeholder="e.g. Mobilization Fee / Site Installation"
                            required
                            className="w-full px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-amber-500 mb-2"
                        />
                        <div className="flex flex-wrap gap-1.5">
                            {presetCharges.map(preset => (
                                <button
                                    type="button"
                                    key={preset}
                                    onClick={() => setChargeName(preset)}
                                    className="text-[11px] px-2 py-0.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700/60 transition-colors"
                                >
                                    + {preset}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                                Schedule
                            </label>
                            <select
                                value={chargeType}
                                onChange={(e) => setChargeType(e.target.value as any)}
                                className="w-full px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-amber-500"
                            >
                                <option value="ONE_TIME">One-Time</option>
                                <option value="MONTHLY">Monthly</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                                Quantity *
                            </label>
                            <input
                                type="number"
                                min="1"
                                value={quantity}
                                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                                required
                                className="w-full px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-amber-500"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                                Amount (PKR) *
                            </label>
                            <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                required
                                className="w-full px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-amber-500 font-mono"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                            Description / Terms for this charge
                        </label>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            rows={2}
                            placeholder="e.g. Payable upon signing prior to guard mobilization."
                            className="w-full px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-amber-500 resize-none"
                        />
                    </div>

                    {/* Calculated Line Total Banner */}
                    <div className="flex items-center justify-between p-3.5 bg-amber-950/40 border border-amber-500/20 rounded-xl">
                        <span className="text-xs text-amber-300 font-medium">Line Total ({chargeType === 'MONTHLY' ? 'Monthly' : 'One-Time'}):</span>
                        <span className="text-base font-bold text-amber-400 font-mono">
                            PKR {lineTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                    </div>

                    <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 rounded-xl text-sm font-medium text-slate-300 hover:bg-slate-800 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading || !chargeName}
                            className="px-5 py-2 rounded-xl text-sm font-medium bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-500/20 disabled:opacity-50 transition-all flex items-center gap-2"
                        >
                            {loading ? 'Saving...' : (editingCharge ? 'Update Charge' : 'Add Charge')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
