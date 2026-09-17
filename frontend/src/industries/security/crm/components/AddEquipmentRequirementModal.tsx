import React, { useState } from 'react';
import type { ClientLocation, ContractEquipmentRequirement } from '../api';

interface AddEquipmentRequirementModalProps {
    isOpen: boolean;
    onClose: () => void;
    proposalVersionId: string;
    locations: ClientLocation[];
    editingEquipment?: ContractEquipmentRequirement | null;
    onSave: (payload: Partial<ContractEquipmentRequirement>) => Promise<void>;
}

export const AddEquipmentRequirementModal: React.FC<AddEquipmentRequirementModalProps> = ({
    isOpen,
    onClose,
    proposalVersionId,
    locations,
    editingEquipment,
    onSave
}) => {
    const [location, setLocation] = useState(editingEquipment?.location || (locations[0]?.id || ''));
    const [itemName, setItemName] = useState(editingEquipment?.item_name || editingEquipment?.description || '');
    const [quantity, setQuantity] = useState<number>(editingEquipment?.quantity || 1);
    const [unitRate, setUnitRate] = useState<number | string>(editingEquipment?.unit_rate || 0);
    const [chargeType, setChargeType] = useState<'ONE_TIME' | 'MONTHLY'>(editingEquipment?.charge_type || 'ONE_TIME');
    const [notes, setNotes] = useState(editingEquipment?.notes || '');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!isOpen) return null;

    const lineTotal = (Number(quantity) || 0) * (Number(unitRate) || 0);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            await onSave({
                proposal_version: proposalVersionId,
                location: location || locations[0]?.id,
                item_name: itemName,
                description: itemName,
                quantity: Number(quantity) || 1,
                unit_rate: Number(unitRate) || 0,
                charge_type: chargeType,
                notes
            });
            onClose();
        } catch (err: any) {
            setError(err?.response?.data?.error || err?.response?.data?.detail || err?.message || 'Failed to save equipment.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                            📡
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-white">
                                {editingEquipment ? 'Edit Equipment Requirement' : 'Add Equipment Requirement'}
                            </h3>
                            <p className="text-xs text-slate-400">Security hardware, devices, radios, CCTV, and turnstiles</p>
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
                                Client Location *
                            </label>
                            <select
                                value={location}
                                onChange={(e) => setLocation(e.target.value)}
                                required
                                className="w-full px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-emerald-500"
                            >
                                <option value="">Select Location</option>
                                {locations.map(loc => (
                                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                                Charge Schedule
                            </label>
                            <select
                                value={chargeType}
                                onChange={(e) => setChargeType(e.target.value as any)}
                                className="w-full px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-emerald-500"
                            >
                                <option value="ONE_TIME">One-Time (Purchase / Installation)</option>
                                <option value="MONTHLY">Monthly (Rental / Maintenance)</option>
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                            Equipment Item / Description *
                        </label>
                        <input
                            type="text"
                            value={itemName}
                            onChange={(e) => setItemName(e.target.value)}
                            placeholder="e.g. PTZ Night-Vision IP Camera / VHF Two-Way Radio"
                            required
                            className="w-full px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-emerald-500"
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                                className="w-full px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-emerald-500"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                                Unit Commercial Rate (PKR) *
                            </label>
                            <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={unitRate}
                                onChange={(e) => setUnitRate(e.target.value)}
                                required
                                className="w-full px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-emerald-500 font-mono"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                            Notes / Location Area / Purpose
                        </label>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            rows={2}
                            placeholder="e.g. Installed at Perimeter North Fence for automated intruder detection."
                            className="w-full px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-emerald-500 resize-none"
                        />
                    </div>

                    {/* Calculated Line Total Banner */}
                    <div className="flex items-center justify-between p-3.5 bg-emerald-950/40 border border-emerald-500/20 rounded-xl">
                        <span className="text-xs text-emerald-300 font-medium">Line Total ({chargeType === 'MONTHLY' ? 'Monthly' : 'One-Time'}):</span>
                        <span className="text-base font-bold text-emerald-400 font-mono">
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
                            disabled={loading || !itemName || !location}
                            className="px-5 py-2 rounded-xl text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 disabled:opacity-50 transition-all flex items-center gap-2"
                        >
                            {loading ? 'Saving...' : (editingEquipment ? 'Update Equipment' : 'Add Equipment')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
