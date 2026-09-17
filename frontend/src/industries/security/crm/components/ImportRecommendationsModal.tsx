import React, { useState } from 'react';
import type { SecurityAssessment } from '../api';

interface ImportRecommendationsModalProps {
    isOpen: boolean;
    onClose: () => void;
    assessments: SecurityAssessment[];
    onImport: (selectedAssessmentIds?: string[]) => Promise<void>;
}

export const ImportRecommendationsModal: React.FC<ImportRecommendationsModalProps> = ({
    isOpen,
    onClose,
    assessments,
    onImport
}) => {
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [importAll, setImportAll] = useState(true);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!isOpen) return null;

    const handleToggle = (id: string) => {
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
        );
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            const ids = importAll ? undefined : (selectedIds.length > 0 ? selectedIds : undefined);
            await onImport(ids);
            onClose();
        } catch (err: any) {
            setError(err?.response?.data?.error || err?.message || 'Failed to import recommendations.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold">
                            📥
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-white">Import Assessment Recommendations</h3>
                            <p className="text-xs text-slate-400">Convert surveyed staffing posts and equipment into commercial lines</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
                    >
                        ✕
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-5">
                    {error && (
                        <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-sm">
                            {error}
                        </div>
                    )}

                    <div className="bg-indigo-950/30 border border-indigo-500/20 rounded-xl p-4 text-xs text-indigo-200 leading-relaxed">
                        <span className="font-semibold text-indigo-300">Note:</span> Importing recommendations creates editable proposal service lines and equipment requirements with $0 rates ready for commercial pricing. Original assessment survey data remains untouched.
                    </div>

                    <div className="space-y-3">
                        <div className="flex items-center gap-3 p-3 bg-slate-800/60 rounded-xl border border-slate-700/60 cursor-pointer" onClick={() => setImportAll(!importAll)}>
                            <input
                                type="checkbox"
                                checked={importAll}
                                onChange={(e) => setImportAll(e.target.checked)}
                                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-slate-900 border-slate-700"
                            />
                            <div>
                                <div className="text-sm font-semibold text-white">Import from All Site Assessments</div>
                                <div className="text-xs text-slate-400">Includes all {assessments.length} location assessments for this proposal</div>
                            </div>
                        </div>

                        {!importAll && (
                            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Select Specific Locations</label>
                                {assessments.map(a => (
                                    <div
                                        key={a.id}
                                        onClick={() => handleToggle(a.id)}
                                        className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                                            selectedIds.includes(a.id)
                                                ? 'bg-indigo-600/10 border-indigo-500/40 text-white'
                                                : 'bg-slate-800/40 border-slate-700/40 text-slate-300 hover:bg-slate-800/70'
                                        }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.includes(a.id)}
                                                onChange={() => {}}
                                                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-slate-900 border-slate-700"
                                            />
                                            <div>
                                                <div className="text-sm font-medium">{a.client_location_name}</div>
                                                <div className="text-xs text-slate-400">Status: {a.status}</div>
                                            </div>
                                        </div>
                                        <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                                            {a.staffing_recommendations?.length || 0} Staff / {a.equipment_recommendations?.length || 0} Equip
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
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
                            disabled={loading || (!importAll && selectedIds.length === 0)}
                            className="px-5 py-2 rounded-xl text-sm font-medium bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white shadow-lg shadow-indigo-500/20 disabled:opacity-50 transition-all flex items-center gap-2"
                        >
                            {loading ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    Importing...
                                </>
                            ) : (
                                'Import to Final Proposal'
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
