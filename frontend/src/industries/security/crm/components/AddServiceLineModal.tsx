import React, { useState } from 'react';
import type { SecurityServiceType, ClientLocation, ProposalServiceLine } from '../api';

interface AddServiceLineModalProps {
    isOpen: boolean;
    onClose: () => void;
    proposalVersionId: string;
    locations: ClientLocation[];
    serviceTypes: SecurityServiceType[];
    editingLine?: ProposalServiceLine | null;
    onSave: (payload: Partial<ProposalServiceLine>) => Promise<void>;
}

export const AddServiceLineModal: React.FC<AddServiceLineModalProps> = ({
    isOpen,
    onClose,
    proposalVersionId,
    locations,
    serviceTypes,
    editingLine,
    onSave
}) => {
    const [location, setLocation] = useState(editingLine?.location || (locations[0]?.id || ''));
    const [serviceType, setServiceType] = useState(editingLine?.service_type || (serviceTypes[0]?.id || ''));
    const [quantity, setQuantity] = useState<number>(editingLine?.quantity || 1);
    const [billingUnit, setBillingUnit] = useState(editingLine?.billing_unit || 'MONTHLY');
    const [clientRate, setClientRate] = useState<number | string>(editingLine?.client_rate || 0);
    const [singleOtRate, setSingleOtRate] = useState<number | string>(editingLine?.single_ot_rate || 0);
    const [doubleOtRate, setDoubleOtRate] = useState<number | string>(editingLine?.double_ot_rate || 0);
    const [notes, setNotes] = useState(editingLine?.notes || '');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!isOpen) return null;

    const lineTotal = (Number(quantity) || 0) * (Number(clientRate) || 0);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            await onSave({
                proposal_version: proposalVersionId,
                location: location || undefined,
                service_type: serviceType,
                quantity: Number(quantity) || 1,
                billing_unit: billingUnit,
                client_rate: Number(clientRate) || 0,
                single_ot_rate: Number(singleOtRate) || 0,
                double_ot_rate: Number(doubleOtRate) || 0,
                notes
            });
            onClose();
        } catch (err: any) {
            setError(err?.response?.data?.error || err?.response?.data?.detail || err?.message || 'Failed to save service line.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold">
                            👮
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-white">
                                {editingLine ? 'Edit Service Requirement' : 'Add Service Requirement'}
                            </h3>
                            <p className="text-xs text-slate-400">Configure guard posts, client billing rates, and OT rates</p>
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

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                                Client Location
                            </label>
                            <select
                                value={location}
                                onChange={(e) => setLocation(e.target.value)}
                                className="w-full px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-blue-500"
                            >
                                <option value="">Select Location</option>
                                {locations.map(loc => (
                                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                                Security Service Type *
                            </label>
                            <select
                                value={serviceType}
                                onChange={(e) => setServiceType(e.target.value)}
                                required
                                className="w-full px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-blue-500"
                            >
                                <option value="">Select Service Type</option>
                                {serviceTypes.map(st => (
                                    <option key={st.id} value={st.id}>{st.name} ({st.code})</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                                Quantity (Guards) *
                            </label>
                            <input
                                type="number"
                                min="1"
                                value={quantity}
                                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                                required
                                className="w-full px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-blue-500"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                                Billing Unit
                            </label>
                            <select
                                value={billingUnit}
                                onChange={(e) => setBillingUnit(e.target.value)}
                                className="w-full px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-blue-500"
                            >
                                <option value="MONTHLY">Monthly</option>
                                <option value="PER_SHIFT">Per Shift</option>
                                <option value="PER_DAY">Per Day</option>
                                <option value="HOURLY">Hourly</option>
                                <option value="ONE_TIME">One-Time</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                                Client Rate (PKR) *
                            </label>
                            <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={clientRate}
                                onChange={(e) => setClientRate(e.target.value)}
                                required
                                className="w-full px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-blue-500 font-mono"
                            />
                        </div>
                    </div>

                    {/* Overtime Client Rates */}
                    <div className="bg-slate-800/40 p-4 rounded-xl border border-slate-700/60 space-y-3">
                        <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                            Client Overtime Billing Rates (Optional)
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs text-slate-400 mb-1">
                                    Single OT Rate / Hour (PKR)
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={singleOtRate}
                                    onChange={(e) => setSingleOtRate(e.target.value)}
                                    placeholder="0.00"
                                    className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white text-sm focus:outline-none focus:border-blue-500 font-mono"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-slate-400 mb-1">
                                    Double OT Rate / Hour (PKR)
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={doubleOtRate}
                                    onChange={(e) => setDoubleOtRate(e.target.value)}
                                    placeholder="0.00"
                                    className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white text-sm focus:outline-none focus:border-blue-500 font-mono"
                                />
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                            Post Coverage Notes / Instructions
                        </label>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            rows={2}
                            placeholder="e.g. 24/7 Gate security (2 shifts of 12 hours), 1 guard per shift"
                            className="w-full px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-blue-500 resize-none"
                        />
                    </div>

                    {/* Calculated Line Total Banner */}
                    <div className="flex items-center justify-between p-3.5 bg-blue-950/40 border border-blue-500/20 rounded-xl">
                        <span className="text-xs text-blue-300 font-medium">Calculated Line Total ({billingUnit}):</span>
                        <span className="text-base font-bold text-blue-400 font-mono">
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
                            disabled={loading || !serviceType}
                            className="px-5 py-2 rounded-xl text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20 disabled:opacity-50 transition-all flex items-center gap-2"
                        >
                            {loading ? 'Saving...' : (editingLine ? 'Update Line' : 'Add Service Line')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
