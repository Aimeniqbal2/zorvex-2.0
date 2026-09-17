import React, { useState } from 'react';
import type { SecurityProposal, ProposalVersion } from '../api';
import { startSigningStage, completeSigning, deleteSignedDocument, activateClient } from '../api';
import { UploadSignedDocumentModal } from './UploadSignedDocumentModal';
import { useToastStore } from '../../../../stores/toastStore';

interface Props {
    proposal: SecurityProposal;
    versions: ProposalVersion[];
    onRefresh: () => void;
    onUpdateProposal: (updated: SecurityProposal) => void;
}

export const SigningAndActiveWorkspaceTab: React.FC<Props> = ({
    proposal,
    versions,
    onRefresh,
    onUpdateProposal
}) => {
    // Find approved version or latest frozen version
    const approvedVersion = versions.find(v => v.id === proposal.approved_version) 
        || versions.find(v => v.is_frozen) 
        || versions[0];

    const [showUploadModal, setShowUploadModal] = useState(false);
    const [loading, setLoading] = useState(false);

    // Signing form state
    const [contractStartDate, setContractStartDate] = useState<string>(
        proposal.contract_start_date || approvedVersion?.expected_start_date || new Date().toISOString().split('T')[0]
    );
    const [contractEndDate, setContractEndDate] = useState<string>(
        proposal.contract_end_date || ''
    );
    const [billingCycle, setBillingCycle] = useState<string>(
        proposal.billing_cycle || approvedVersion?.billing_cycle || 'MONTHLY'
    );
    const [paymentTerms, setPaymentTerms] = useState<string>(
        proposal.payment_terms || approvedVersion?.payment_terms || 'NET_30'
    );
    const [expectedMobilizationDate, setExpectedMobilizationDate] = useState<string>(
        proposal.expected_mobilization_date || ''
    );
    const [contractReference, setContractReference] = useState<string>(
        proposal.contract_reference || `SC-${proposal.proposal_number}`
    );
    const [signedByClient, setSignedByClient] = useState<string>(
        proposal.signed_by_client || proposal.approved_by_name || ''
    );
    const [signedByCompany, setSignedByCompany] = useState<string>(
        proposal.signed_by_company || ''
    );
    const [signingDate, setSigningDate] = useState<string>(
        proposal.signing_date || new Date().toISOString().split('T')[0]
    );
    const [signingNotes, setSigningNotes] = useState<string>(
        proposal.signing_notes || ''
    );

    // Handlers
    const handleStartSigning = async () => {
        setLoading(true);
        try {
            const updated = await startSigningStage(proposal.id, {
                contract_start_date: contractStartDate,
                contract_end_date: contractEndDate || undefined,
                billing_cycle: billingCycle,
                payment_terms: paymentTerms,
                expected_mobilization_date: expectedMobilizationDate || undefined,
                contract_reference: contractReference,
                signing_notes: signingNotes
            });
            useToastStore.getState().success('Signing stage initialized!');
            onUpdateProposal(updated);
        } catch (err: any) {
            console.error('Failed to start signing', err);
            const msg = err.response?.data?.error || err.message || 'Failed to start signing stage';
            useToastStore.getState().error(msg);
        } finally {
            setLoading(false);
        }
    };

    const handleCompleteSigning = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!signedByClient.trim()) {
            useToastStore.getState().error('Please enter Client Signatory Name.');
            return;
        }
        if (!signedByCompany.trim()) {
            useToastStore.getState().error('Please enter Company Signatory Name.');
            return;
        }

        setLoading(true);
        try {
            const updated = await completeSigning(proposal.id, {
                signed_by_client: signedByClient.trim(),
                signed_by_company: signedByCompany.trim(),
                signing_date: signingDate,
                contract_start_date: contractStartDate,
                contract_end_date: contractEndDate || undefined,
                billing_cycle: billingCycle,
                payment_terms: paymentTerms,
                expected_mobilization_date: expectedMobilizationDate || undefined,
                contract_reference: contractReference,
                signing_notes: signingNotes
            });
            useToastStore.getState().success(`Proposal ${proposal.proposal_number} marked as SIGNED!`);
            onUpdateProposal(updated);
        } catch (err: any) {
            console.error('Failed to complete signing', err);
            const msg = err.response?.data?.error || err.message || 'Failed to complete signing';
            useToastStore.getState().error(msg);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteDoc = async (docId: string) => {
        if (!confirm('Are you sure you want to remove this signed document?')) return;
        try {
            await deleteSignedDocument(docId);
            useToastStore.getState().success('Document removed.');
            onRefresh();
        } catch (err: any) {
            useToastStore.getState().error('Failed to delete document');
        }
    };

    const handleActivateClient = async () => {
        if (!confirm(`Activate ${proposal.customer_name || 'Client'} and link operational ServiceContract? This converts the CRM entity to an Active Customer and links operational sites.`)) {
            return;
        }

        setLoading(true);
        try {
            const res = await activateClient(proposal.id);
            useToastStore.getState().success(`Client activated! ServiceContract [${res.contract_code || 'Created'}] linked.`);
            onUpdateProposal(res.proposal);
        } catch (err: any) {
            console.error('Failed to activate client', err);
            const msg = err.response?.data?.error || err.message || 'Failed to activate client';
            useToastStore.getState().error(msg);
        } finally {
            setLoading(false);
        }
    };

    const signedDocs = proposal.signed_documents || [];

    return (
        <div className="space-y-6">
            {/* Header Stage Guidance */}
            <div className="bg-slate-900/60 backdrop-blur-md border border-slate-800 rounded-2xl p-6 shadow-xl">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl font-bold ${
                            proposal.status === 'ACTIVE' 
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : proposal.status === 'SIGNED'
                                ? 'bg-teal-500/20 text-teal-400 border border-teal-500/30'
                                : proposal.status === 'SIGNING'
                                ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                                : 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                        }`}>
                            <i className={`bx ${
                                proposal.status === 'ACTIVE' ? 'bx-badge-check' :
                                proposal.status === 'SIGNED' ? 'bx-file-blank' :
                                proposal.status === 'SIGNING' ? 'bx-pen' : 'bx-check-double'
                            }`}></i>
                        </div>
                        <div>
                            <div className="flex items-center gap-3">
                                <h2 className="text-xl font-extrabold text-white">
                                    {proposal.status === 'ACTIVE' && 'Active Client & Operational Contract Workspace'}
                                    {proposal.status === 'SIGNED' && 'Contract Signed — Ready for Client Activation'}
                                    {proposal.status === 'SIGNING' && 'Contract Signing Workspace'}
                                    {proposal.status === 'APPROVED' && 'Client Approved Proposal — Ready for Signing'}
                                    {proposal.status === 'AWAITING_APPROVAL' && 'Awaiting Client Approval'}
                                    {proposal.status === 'ON_HOLD' && 'Proposal On Hold'}
                                    {proposal.status === 'REJECTED' && 'Proposal Rejected'}
                                </h2>
                                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                                    proposal.status === 'ACTIVE' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                                    proposal.status === 'SIGNED' ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30' :
                                    proposal.status === 'SIGNING' ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' :
                                    proposal.status === 'APPROVED' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' :
                                    'bg-slate-700 text-slate-300'
                                }`}>
                                    {proposal.status}
                                </span>
                            </div>
                            <p className="text-xs text-slate-400 mt-1">
                                Proposal Ref: <strong className="text-slate-200">{proposal.proposal_number}</strong> • Client: <strong className="text-slate-200">{proposal.customer_name}</strong>
                                {approvedVersion && ` • Approved Offer: v${approvedVersion.version_number} (PKR ${Number(approvedVersion.grand_total || 0).toLocaleString()})`}
                            </p>
                        </div>
                    </div>

                    {/* Stage Actions */}
                    <div className="flex items-center gap-3">
                        {proposal.status === 'APPROVED' && (
                            <button
                                onClick={handleStartSigning}
                                disabled={loading}
                                className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-sm rounded-xl shadow-lg shadow-indigo-600/30 flex items-center gap-2 transition-all transform hover:-translate-y-0.5"
                            >
                                {loading ? <i className="bx bx-loader-alt animate-spin"></i> : <i className="bx bx-pen"></i>}
                                Start Contract Signing Stage
                            </button>
                        )}

                        {proposal.status === 'SIGNED' && (
                            <button
                                onClick={handleActivateClient}
                                disabled={loading}
                                className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-sm rounded-xl shadow-lg shadow-emerald-600/30 flex items-center gap-2 transition-all transform hover:-translate-y-0.5 animate-pulse"
                            >
                                {loading ? <i className="bx bx-loader-alt animate-spin"></i> : <i className="bx bx-check-circle"></i>}
                                Activate Client & Link ServiceContract
                            </button>
                        )}

                        {proposal.status === 'ACTIVE' && (
                            <div className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-xl text-xs font-bold">
                                <i className="bx bx-check-circle text-base"></i>
                                Active Customer & Service Contract Linked
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Approval Metadata Card (if proposal was approved) */}
            {(proposal.approved_date || proposal.approved_version_number) && (
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                        <div className="flex items-center gap-2 text-cyan-400 font-bold text-sm">
                            <i className="bx bx-check-double text-lg"></i>
                            Client Approval Snapshot
                        </div>
                        <span className="text-xs text-slate-400">
                            Approved on {proposal.approved_date || 'N/A'} via {proposal.approval_method || 'EMAIL'}
                        </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
                        <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/50">
                            <span className="text-slate-400 block mb-1">Approved Version</span>
                            <span className="text-white font-bold text-sm">
                                Version {proposal.approved_version_number || approvedVersion?.version_number || 1}
                            </span>
                        </div>
                        <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/50">
                            <span className="text-slate-400 block mb-1">Approved By</span>
                            <span className="text-white font-bold text-sm">
                                {proposal.approved_by_name || proposal.approved_by_contact_name || 'Client Representative'}
                            </span>
                        </div>
                        <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/50">
                            <span className="text-slate-400 block mb-1">Commercial Grand Total</span>
                            <span className="text-emerald-400 font-bold text-sm">
                                PKR {Number(approvedVersion?.grand_total || 0).toLocaleString()}
                            </span>
                        </div>
                        <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/50">
                            <span className="text-slate-400 block mb-1">Monthly Recurring</span>
                            <span className="text-teal-400 font-bold text-sm">
                                PKR {Number(approvedVersion?.total_monthly_recurring || 0).toLocaleString()} / mo
                            </span>
                        </div>
                    </div>
                    {proposal.approval_notes && (
                        <div className="mt-3 text-xs text-slate-300 bg-slate-800/40 p-2.5 rounded-xl border border-slate-800">
                            <strong className="text-slate-400">Approval Notes:</strong> {proposal.approval_notes}
                        </div>
                    )}
                </div>
            )}

            {/* Active Contract Link Card (if ACTIVE) */}
            {proposal.status === 'ACTIVE' && proposal.contract_code && (
                <div className="bg-gradient-to-br from-slate-900 to-emerald-950/40 border border-emerald-500/30 rounded-2xl p-6 shadow-2xl">
                    <div className="flex items-center justify-between pb-4 border-b border-emerald-500/20">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xl">
                                <i className="bx bx-building"></i>
                            </div>
                            <div>
                                <h3 className="text-base font-bold text-white">Operations Service Contract Live</h3>
                                <p className="text-xs text-slate-400">Single operational source of truth established in Zorvex Operations</p>
                            </div>
                        </div>
                        <span className="px-3 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full text-xs font-bold">
                            {proposal.contract_status || 'ACTIVE'}
                        </span>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 text-xs">
                        <div className="bg-slate-800/80 p-3.5 rounded-xl border border-slate-700">
                            <span className="text-slate-400 block mb-1">Contract Code</span>
                            <span className="text-emerald-400 font-mono font-bold text-sm">{proposal.contract_code}</span>
                        </div>
                        <div className="bg-slate-800/80 p-3.5 rounded-xl border border-slate-700">
                            <span className="text-slate-400 block mb-1">Effective Start Date</span>
                            <span className="text-white font-bold text-sm">{proposal.contract_start_date || 'Immediate'}</span>
                        </div>
                        <div className="bg-slate-800/80 p-3.5 rounded-xl border border-slate-700">
                            <span className="text-slate-400 block mb-1">Contract End Date</span>
                            <span className="text-white font-bold text-sm">{proposal.contract_end_date || 'Open-ended'}</span>
                        </div>
                        <div className="bg-slate-800/80 p-3.5 rounded-xl border border-slate-700">
                            <span className="text-slate-400 block mb-1">Billing & Payment</span>
                            <span className="text-white font-bold text-sm">{proposal.billing_cycle} ({proposal.payment_terms})</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Signing Form & Signatures Section */}
            {(proposal.status === 'SIGNING' || proposal.status === 'SIGNED' || proposal.status === 'ACTIVE') && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Contract Terms */}
                    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
                        <div className="flex items-center gap-2 text-indigo-400 font-bold text-sm border-b border-slate-800 pb-3">
                            <i className="bx bx-calendar-check text-lg"></i>
                            Contract Parameters & Timeline
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                                    Contract Start Date
                                </label>
                                <input
                                    type="date"
                                    value={contractStartDate}
                                    onChange={(e) => setContractStartDate(e.target.value)}
                                    disabled={proposal.status === 'ACTIVE' || proposal.status === 'SIGNED'}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 disabled:opacity-60"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                                    Contract End Date
                                </label>
                                <input
                                    type="date"
                                    value={contractEndDate}
                                    onChange={(e) => setContractEndDate(e.target.value)}
                                    disabled={proposal.status === 'ACTIVE' || proposal.status === 'SIGNED'}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 disabled:opacity-60"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                                    Billing Cycle
                                </label>
                                <select
                                    value={billingCycle}
                                    onChange={(e) => setBillingCycle(e.target.value)}
                                    disabled={proposal.status === 'ACTIVE' || proposal.status === 'SIGNED'}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 disabled:opacity-60"
                                >
                                    <option value="MONTHLY">Monthly in Advance</option>
                                    <option value="BI_WEEKLY">Bi-Weekly</option>
                                    <option value="CUSTOM">Custom Cycle</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                                    Payment Terms
                                </label>
                                <select
                                    value={paymentTerms}
                                    onChange={(e) => setPaymentTerms(e.target.value)}
                                    disabled={proposal.status === 'ACTIVE' || proposal.status === 'SIGNED'}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 disabled:opacity-60"
                                >
                                    <option value="NET_30">Net 30 Days</option>
                                    <option value="NET_15">Net 15 Days</option>
                                    <option value="DUE_ON_RECEIPT">Due on Receipt</option>
                                    <option value="ADVANCE">100% Advance</option>
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                                    Expected Mobilization Date
                                </label>
                                <input
                                    type="date"
                                    value={expectedMobilizationDate}
                                    onChange={(e) => setExpectedMobilizationDate(e.target.value)}
                                    disabled={proposal.status === 'ACTIVE' || proposal.status === 'SIGNED'}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 disabled:opacity-60"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                                    Contract Reference
                                </label>
                                <input
                                    type="text"
                                    value={contractReference}
                                    onChange={(e) => setContractReference(e.target.value)}
                                    disabled={proposal.status === 'ACTIVE' || proposal.status === 'SIGNED'}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 disabled:opacity-60"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Signatures & Execution */}
                    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
                        <div className="flex items-center gap-2 text-purple-400 font-bold text-sm border-b border-slate-800 pb-3">
                            <i className="bx bx-pen text-lg"></i>
                            Signatories & Legal Execution
                        </div>

                        <form onSubmit={handleCompleteSigning} className="space-y-3">
                            <div>
                                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                                    Client Signatory (Name & Title)
                                </label>
                                <input
                                    type="text"
                                    placeholder="e.g. John Doe, Director Security"
                                    value={signedByClient}
                                    onChange={(e) => setSignedByClient(e.target.value)}
                                    disabled={proposal.status === 'ACTIVE' || proposal.status === 'SIGNED'}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500 disabled:opacity-60"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                                    Company Signatory (Authorized Representative)
                                </label>
                                <input
                                    type="text"
                                    placeholder="e.g. Jane Smith, VP Operations"
                                    value={signedByCompany}
                                    onChange={(e) => setSignedByCompany(e.target.value)}
                                    disabled={proposal.status === 'ACTIVE' || proposal.status === 'SIGNED'}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500 disabled:opacity-60"
                                    required
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                                        Signing Date
                                    </label>
                                    <input
                                        type="date"
                                        value={signingDate}
                                        onChange={(e) => setSigningDate(e.target.value)}
                                        disabled={proposal.status === 'ACTIVE' || proposal.status === 'SIGNED'}
                                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500 disabled:opacity-60"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                                        Signing Notes
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="Add execution remarks..."
                                        value={signingNotes}
                                        onChange={(e) => setSigningNotes(e.target.value)}
                                        disabled={proposal.status === 'ACTIVE' || proposal.status === 'SIGNED'}
                                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500 disabled:opacity-60"
                                    />
                                </div>
                            </div>

                            {proposal.status === 'SIGNING' && (
                                <div className="pt-2">
                                    <button
                                        type="submit"
                                        disabled={loading}
                                        className="w-full py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-sm rounded-xl shadow-lg shadow-purple-600/30 transition-all flex items-center justify-center gap-2"
                                    >
                                        {loading ? <i className="bx bx-loader-alt animate-spin"></i> : <i className="bx bx-check"></i>}
                                        Complete Signing & Mark Contract SIGNED
                                    </button>
                                </div>
                            )}
                        </form>
                    </div>
                </div>
            )}

            {/* Signed Documents Repository Card */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2 text-indigo-400 font-bold text-sm">
                        <i className="bx bx-folder-open text-lg"></i>
                        Signed Commercial & Contract Documents ({signedDocs.length})
                    </div>
                    <button
                        onClick={() => setShowUploadModal(true)}
                        className="px-3.5 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400 border border-indigo-500/30 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                    >
                        <i className="bx bx-upload"></i>
                        Upload Signed Document
                    </button>
                </div>

                {signedDocs.length === 0 ? (
                    <div className="text-center py-8 bg-slate-800/20 rounded-xl border border-dashed border-slate-800 text-slate-400 text-xs">
                        <i className="bx bx-cloud-upload text-3xl mb-2 text-slate-500 block"></i>
                        No signed documents uploaded yet.
                        <p className="text-slate-500 mt-1">Upload executed contract copies, POs, or client award letters.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {signedDocs.map(doc => (
                            <div key={doc.id} className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3.5 flex flex-col justify-between hover:border-slate-600 transition-colors">
                                <div className="space-y-1">
                                    <div className="flex items-start justify-between gap-2">
                                        <h4 className="text-white font-bold text-xs line-clamp-1">{doc.title}</h4>
                                        <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 text-[10px] font-semibold whitespace-nowrap">
                                            {doc.document_type_display || doc.document_type}
                                        </span>
                                    </div>
                                    {doc.notes && <p className="text-slate-400 text-[11px] line-clamp-2">{doc.notes}</p>}
                                    <p className="text-[10px] text-slate-500 pt-1">
                                        Uploaded {new Date(doc.created_at).toLocaleDateString()} {doc.uploaded_by_name && `by ${doc.uploaded_by_name}`}
                                    </p>
                                </div>

                                <div className="flex items-center justify-between pt-3 mt-2 border-t border-slate-700/40">
                                    {doc.file || doc.file_url ? (
                                        <a
                                            href={doc.file_url || doc.file || '#'}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1"
                                        >
                                            <i className="bx bx-download"></i> View / Download
                                        </a>
                                    ) : (
                                        <span className="text-[10px] text-slate-500">No file attachment</span>
                                    )}
                                    <button
                                        onClick={() => handleDeleteDoc(doc.id)}
                                        className="text-slate-500 hover:text-red-400 text-xs"
                                        title="Delete document"
                                    >
                                        <i className="bx bx-trash"></i>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Approved Service Lines & Locations Snapshot Card */}
            {approvedVersion && (
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                        <div className="flex items-center gap-2 text-teal-400 font-bold text-sm">
                            <i className="bx bx-map-pin text-lg"></i>
                            Contracted Operational Locations & Staffing Posts
                        </div>
                        <span className="text-xs text-slate-400">
                            Version {approvedVersion.version_number} Frozen Commercial Snapshot
                        </span>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead>
                                <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px] tracking-wider">
                                    <th className="py-2 px-3">Location / Post</th>
                                    <th className="py-2 px-3">Service Role</th>
                                    <th className="py-2 px-3 text-center">Headcount</th>
                                    <th className="py-2 px-3 text-right">Client Rate</th>
                                    <th className="py-2 px-3 text-right">Single OT Rate</th>
                                    <th className="py-2 px-3 text-right">Double OT Rate</th>
                                    <th className="py-2 px-3 text-right">Monthly Subtotal</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/60">
                                {approvedVersion.service_lines?.map(line => (
                                    <tr key={line.id} className="hover:bg-slate-800/30 text-slate-300">
                                        <td className="py-2.5 px-3 font-semibold text-white">
                                            {line.location_name || 'Standard Site'}
                                        </td>
                                        <td className="py-2.5 px-3">{line.service_type_name || 'Guard'}</td>
                                        <td className="py-2.5 px-3 text-center font-bold text-slate-200">{line.quantity}</td>
                                        <td className="py-2.5 px-3 text-right font-mono text-slate-200">
                                            PKR {Number(line.client_rate || 0).toLocaleString()}
                                        </td>
                                        <td className="py-2.5 px-3 text-right font-mono text-slate-400">
                                            {line.single_ot_billing_rate || line.single_ot_rate ? `PKR ${Number(line.single_ot_billing_rate || line.single_ot_rate).toLocaleString()}/hr` : '—'}
                                        </td>
                                        <td className="py-2.5 px-3 text-right font-mono text-slate-400">
                                            {line.double_ot_billing_rate || line.double_ot_rate ? `PKR ${Number(line.double_ot_billing_rate || line.double_ot_rate).toLocaleString()}/hr` : '—'}
                                        </td>
                                        <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-400">
                                            PKR {Number(line.line_total || line.total || (Number(line.client_rate || 0) * line.quantity)).toLocaleString()}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Upload Modal */}
            {showUploadModal && (
                <UploadSignedDocumentModal
                    proposal={proposal}
                    onClose={() => setShowUploadModal(false)}
                    onSuccess={() => {
                        onRefresh();
                    }}
                />
            )}
        </div>
    );
};
