import { useState, useEffect } from 'react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { fetchCostCenters, createCostCenter, updateCostCenter, fetchProfitCenters, createProfitCenter, updateProfitCenter } from '../api';
import type { CostCenter, ProfitCenter } from '../types';

export default function CostCentersView() {
    const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
    const [profitCenters, setProfitCenters] = useState<ProfitCenter[]>([]);
    const [loading, setLoading] = useState(true);

    const [isCcModalOpen, setIsCcModalOpen] = useState(false);
    const [editingCc, setEditingCc] = useState<CostCenter | null>(null);
    const [ccName, setCcName] = useState('');
    const [ccCode, setCcCode] = useState('');
    const [ccParent, setCcParent] = useState('');

    const [isPcModalOpen, setIsPcModalOpen] = useState(false);
    const [editingPc, setEditingPc] = useState<ProfitCenter | null>(null);
    const [pcName, setPcName] = useState('');
    const [pcCode, setPcCode] = useState('');
    const [pcParent, setPcParent] = useState('');

    const [errorMsg, setErrorMsg] = useState('');

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const ccData = await fetchCostCenters();
            setCostCenters(ccData.results || ccData);
            const pcData = await fetchProfitCenters();
            setProfitCenters(pcData.results || pcData);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateCc = () => {
        setEditingCc(null);
        setCcName('');
        setCcCode('');
        setCcParent('');
        setErrorMsg('');
        setIsCcModalOpen(true);
    };

    const handleEditCc = (cc: CostCenter) => {
        setEditingCc(cc);
        setCcName(cc.name);
        setCcCode(cc.code);
        setCcParent(cc.parent || '');
        setErrorMsg('');
        setIsCcModalOpen(true);
    };

    const submitCc = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMsg('');
        try {
            const payload = { name: ccName, code: ccCode, parent: ccParent || null };
            if (editingCc) {
                await updateCostCenter(editingCc.id, payload);
            } else {
                await createCostCenter(payload);
            }
            setIsCcModalOpen(false);
            loadData();
        } catch (err: any) {
            setErrorMsg(err.response?.data?.detail || JSON.stringify(err.response?.data) || 'Failed to save');
        }
    };

    const handleCreatePc = () => {
        setEditingPc(null);
        setPcName('');
        setPcCode('');
        setPcParent('');
        setErrorMsg('');
        setIsPcModalOpen(true);
    };

    const handleEditPc = (pc: ProfitCenter) => {
        setEditingPc(pc);
        setPcName(pc.name);
        setPcCode(pc.code);
        setPcParent(pc.parent || '');
        setErrorMsg('');
        setIsPcModalOpen(true);
    };

    const submitPc = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMsg('');
        try {
            const payload = { name: pcName, code: pcCode, parent: pcParent || null };
            if (editingPc) {
                await updateProfitCenter(editingPc.id, payload);
            } else {
                await createProfitCenter(payload);
            }
            setIsPcModalOpen(false);
            loadData();
        } catch (err: any) {
            setErrorMsg(err.response?.data?.detail || JSON.stringify(err.response?.data) || 'Failed to save');
        }
    };

    return (
        <div className="space-y-6">
            <Card>
                <div className="p-4 flex justify-between items-center border-b">
                    <h3 className="text-lg font-medium">Cost Centers</h3>
                    <Button variant="primary" onClick={handleCreateCc}>+ New Cost Center</Button>
                </div>
                <div className="p-4">
                    {loading ? (
                        <p className="text-gray-500">Loading...</p>
                    ) : (
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead>
                                <tr>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Parent</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {costCenters.map((cc) => (
                                    <tr key={cc.id}>
                                        <td className="px-4 py-2">{cc.code}</td>
                                        <td className="px-4 py-2">{cc.name}</td>
                                        <td className="px-4 py-2">{cc.parent ? costCenters.find(c => c.id === cc.parent)?.name : '-'}</td>
                                        <td className="px-4 py-2">
                                            <Button variant="ghost" onClick={() => handleEditCc(cc)}>Edit</Button>
                                        </td>
                                    </tr>
                                ))}
                                {costCenters.length === 0 && (
                                    <tr>
                                        <td colSpan={4} className="px-4 py-2 text-gray-500">No cost centers found.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    )}
                </div>
            </Card>

            <Card>
                <div className="p-4 flex justify-between items-center border-b">
                    <h3 className="text-lg font-medium">Profit Centers</h3>
                    <Button variant="primary" onClick={handleCreatePc}>+ New Profit Center</Button>
                </div>
                <div className="p-4">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead>
                            <tr>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Parent</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {profitCenters.map((pc) => (
                                <tr key={pc.id}>
                                    <td className="px-4 py-2">{pc.code}</td>
                                    <td className="px-4 py-2">{pc.name}</td>
                                    <td className="px-4 py-2">{pc.parent ? profitCenters.find(p => p.id === pc.parent)?.name : '-'}</td>
                                    <td className="px-4 py-2">
                                        <Button variant="ghost" onClick={() => handleEditPc(pc)}>Edit</Button>
                                    </td>
                                </tr>
                            ))}
                            {profitCenters.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="px-4 py-2 text-gray-500">No profit centers found.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            {/* CC Modal */}
            {isCcModalOpen && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center">
                    <div className="bg-white p-6 rounded-md shadow-lg max-w-md w-full">
                        <h3 className="text-lg font-medium mb-4">{editingCc ? 'Edit Cost Center' : 'Create Cost Center'}</h3>
                        {errorMsg && <div className="mb-4 text-red-600 bg-red-50 p-2 rounded">{errorMsg}</div>}
                        <form onSubmit={submitCc}>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium">Code</label>
                                    <input required type="text" className="mt-1 block w-full border rounded p-2" value={ccCode} onChange={e => setCcCode(e.target.value)} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium">Name</label>
                                    <input required type="text" className="mt-1 block w-full border rounded p-2" value={ccName} onChange={e => setCcName(e.target.value)} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium">Parent</label>
                                    <select className="mt-1 block w-full border rounded p-2" value={ccParent} onChange={e => setCcParent(e.target.value)}>
                                        <option value="">None</option>
                                        {costCenters.filter(c => c.id !== editingCc?.id).map(c => (
                                            <option key={c.id} value={c.id}>{c.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div className="mt-6 flex justify-end gap-2">
                                <Button variant="ghost" type="button" onClick={() => setIsCcModalOpen(false)}>Cancel</Button>
                                <Button variant="primary" type="submit">Save</Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* PC Modal */}
            {isPcModalOpen && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center">
                    <div className="bg-white p-6 rounded-md shadow-lg max-w-md w-full">
                        <h3 className="text-lg font-medium mb-4">{editingPc ? 'Edit Profit Center' : 'Create Profit Center'}</h3>
                        {errorMsg && <div className="mb-4 text-red-600 bg-red-50 p-2 rounded">{errorMsg}</div>}
                        <form onSubmit={submitPc}>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium">Code</label>
                                    <input required type="text" className="mt-1 block w-full border rounded p-2" value={pcCode} onChange={e => setPcCode(e.target.value)} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium">Name</label>
                                    <input required type="text" className="mt-1 block w-full border rounded p-2" value={pcName} onChange={e => setPcName(e.target.value)} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium">Parent</label>
                                    <select className="mt-1 block w-full border rounded p-2" value={pcParent} onChange={e => setPcParent(e.target.value)}>
                                        <option value="">None</option>
                                        {profitCenters.filter(p => p.id !== editingPc?.id).map(p => (
                                            <option key={p.id} value={p.id}>{p.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div className="mt-6 flex justify-end gap-2">
                                <Button variant="ghost" type="button" onClick={() => setIsPcModalOpen(false)}>Cancel</Button>
                                <Button variant="primary" type="submit">Save</Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
