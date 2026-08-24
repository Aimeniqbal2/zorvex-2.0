import { useState, useEffect } from 'react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { fetchTaxGroups, fetchTaxCodes, createTaxGroup, updateTaxGroup, createTaxCode, updateTaxCode } from '../api';
import type { TaxGroup, TaxCode } from '../types';

export default function TaxSetupView() {
    const [taxGroups, setTaxGroups] = useState<TaxGroup[]>([]);
    const [taxCodes, setTaxCodes] = useState<TaxCode[]>([]);
    const [loading, setLoading] = useState(true);

    // Group Modal
    const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
    const [editingGroup, setEditingGroup] = useState<TaxGroup | null>(null);
    const [groupName, setGroupName] = useState('');
    const [groupDesc, setGroupDesc] = useState('');

    // Code Modal
    const [isCodeModalOpen, setIsCodeModalOpen] = useState(false);
    const [editingCode, setEditingCode] = useState<TaxCode | null>(null);
    const [codeVal, setCodeVal] = useState('');
    const [codeName, setCodeName] = useState('');
    const [codeRate, setCodeRate] = useState('');
    const [codeType, setCodeType] = useState('SALES');
    const [codeGroup, setCodeGroup] = useState('');

    const [errorMsg, setErrorMsg] = useState('');

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const groups = await fetchTaxGroups();
            setTaxGroups(groups.results || groups);
            const codes = await fetchTaxCodes();
            setTaxCodes(codes.results || codes);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateGroup = () => {
        setEditingGroup(null);
        setGroupName('');
        setGroupDesc('');
        setErrorMsg('');
        setIsGroupModalOpen(true);
    };

    const handleEditGroup = (g: TaxGroup) => {
        setEditingGroup(g);
        setGroupName(g.name);
        setGroupDesc(g.description || '');
        setErrorMsg('');
        setIsGroupModalOpen(true);
    };

    const submitGroup = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMsg('');
        try {
            const payload = { name: groupName, description: groupDesc };
            if (editingGroup) {
                await updateTaxGroup(editingGroup.id, payload);
            } else {
                await createTaxGroup(payload);
            }
            setIsGroupModalOpen(false);
            loadData();
        } catch (err: any) {
            setErrorMsg(err.response?.data?.detail || JSON.stringify(err.response?.data) || 'Failed to save');
        }
    };

    const handleCreateCode = () => {
        setEditingCode(null);
        setCodeVal('');
        setCodeName('');
        setCodeRate('');
        setCodeType('SALES');
        setCodeGroup(taxGroups.length > 0 ? taxGroups[0].id : '');
        setErrorMsg('');
        setIsCodeModalOpen(true);
    };

    const handleEditCode = (c: TaxCode) => {
        setEditingCode(c);
        setCodeVal(c.code);
        setCodeName(c.name);
        setCodeRate(c.rate);
        setCodeType(c.tax_type);
        setCodeGroup(c.tax_group || '');
        setErrorMsg('');
        setIsCodeModalOpen(true);
    };

    const submitCode = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMsg('');
        try {
            const payload = {
                code: codeVal,
                name: codeName,
                rate: codeRate,
                tax_type: codeType,
                tax_group: codeGroup || null
            };
            if (editingCode) {
                await updateTaxCode(editingCode.id, payload);
            } else {
                await createTaxCode(payload);
            }
            setIsCodeModalOpen(false);
            loadData();
        } catch (err: any) {
            setErrorMsg(err.response?.data?.detail || JSON.stringify(err.response?.data) || 'Failed to save');
        }
    };

    return (
        <div className="space-y-6">
            <Card>
                <div className="p-4 flex justify-between items-center border-b">
                    <h3 className="text-lg font-medium">Tax Groups</h3>
                    <Button variant="primary" onClick={handleCreateGroup}>+ New Group</Button>
                </div>
                <div className="p-4">
                    {loading ? (
                        <p className="text-gray-500">Loading...</p>
                    ) : (
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead>
                                <tr>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {taxGroups.map((group) => (
                                    <tr key={group.id}>
                                        <td className="px-4 py-2">{group.name}</td>
                                        <td className="px-4 py-2">{group.description}</td>
                                        <td className="px-4 py-2">
                                            <Button variant="ghost" onClick={() => handleEditGroup(group)}>Edit</Button>
                                        </td>
                                    </tr>
                                ))}
                                {taxGroups.length === 0 && (
                                    <tr>
                                        <td colSpan={3} className="px-4 py-2 text-gray-500">No tax groups found.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    )}
                </div>
            </Card>

            <Card>
                <div className="p-4 flex justify-between items-center border-b">
                    <h3 className="text-lg font-medium">Tax Codes</h3>
                    <Button variant="primary" onClick={handleCreateCode}>+ New Code</Button>
                </div>
                <div className="p-4">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead>
                            <tr>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Rate (%)</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {taxCodes.map((code) => (
                                <tr key={code.id}>
                                    <td className="px-4 py-2">{code.code}</td>
                                    <td className="px-4 py-2">{code.name}</td>
                                    <td className="px-4 py-2">{code.tax_type}</td>
                                    <td className="px-4 py-2">{code.rate}</td>
                                    <td className="px-4 py-2">
                                        <Button variant="ghost" onClick={() => handleEditCode(code)}>Edit</Button>
                                    </td>
                                </tr>
                            ))}
                            {taxCodes.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-4 py-2 text-gray-500">No tax codes found.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            {/* Modals */}
            {isGroupModalOpen && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center">
                    <div className="bg-white p-6 rounded-md shadow-lg max-w-md w-full">
                        <h3 className="text-lg font-medium mb-4">{editingGroup ? 'Edit Group' : 'Create Group'}</h3>
                        {errorMsg && <div className="mb-4 text-red-600 bg-red-50 p-2 rounded">{errorMsg}</div>}
                        <form onSubmit={submitGroup}>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium">Name</label>
                                    <input required type="text" className="mt-1 block w-full border rounded p-2" value={groupName} onChange={e => setGroupName(e.target.value)} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium">Description</label>
                                    <textarea className="mt-1 block w-full border rounded p-2" value={groupDesc} onChange={e => setGroupDesc(e.target.value)} />
                                </div>
                            </div>
                            <div className="mt-6 flex justify-end gap-2">
                                <Button variant="ghost" type="button" onClick={() => setIsGroupModalOpen(false)}>Cancel</Button>
                                <Button variant="primary" type="submit">Save</Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {isCodeModalOpen && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center">
                    <div className="bg-white p-6 rounded-md shadow-lg max-w-md w-full">
                        <h3 className="text-lg font-medium mb-4">{editingCode ? 'Edit Code' : 'Create Code'}</h3>
                        {errorMsg && <div className="mb-4 text-red-600 bg-red-50 p-2 rounded">{errorMsg}</div>}
                        <form onSubmit={submitCode}>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium">Code</label>
                                    <input required type="text" className="mt-1 block w-full border rounded p-2" value={codeVal} onChange={e => setCodeVal(e.target.value)} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium">Name</label>
                                    <input required type="text" className="mt-1 block w-full border rounded p-2" value={codeName} onChange={e => setCodeName(e.target.value)} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium">Rate</label>
                                    <input required type="number" step="0.0001" className="mt-1 block w-full border rounded p-2" value={codeRate} onChange={e => setCodeRate(e.target.value)} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium">Type</label>
                                    <select required className="mt-1 block w-full border rounded p-2" value={codeType} onChange={e => setCodeType(e.target.value)}>
                                        <option value="SALES">Sales</option>
                                        <option value="PURCHASE">Purchase</option>
                                        <option value="VAT">VAT</option>
                                        <option value="GST">GST</option>
                                        <option value="SERVICE">Service</option>
                                        <option value="WITHHOLDING">Withholding</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium">Group</label>
                                    <select className="mt-1 block w-full border rounded p-2" value={codeGroup} onChange={e => setCodeGroup(e.target.value)}>
                                        <option value="">None</option>
                                        {taxGroups.map(g => (
                                            <option key={g.id} value={g.id}>{g.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div className="mt-6 flex justify-end gap-2">
                                <Button variant="ghost" type="button" onClick={() => setIsCodeModalOpen(false)}>Cancel</Button>
                                <Button variant="primary" type="submit">Save</Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
